package com.mark1light.app;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.database.Cursor;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.os.Build;
import android.provider.DocumentsContract;
import android.provider.OpenableColumns;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowManager;
import android.widget.*;
import java.util.ArrayList;
import java.util.ArrayDeque;
import java.util.List;
import java.util.Locale;
import android.webkit.*;
import androidx.webkit.WebViewAssetLoader;
import org.json.JSONObject;
import org.json.JSONArray;
import java.lang.ref.WeakReference;
import java.util.LinkedHashSet;
import java.util.Set;
import java.util.UUID;
import android.content.pm.PackageManager;
import android.os.Environment;
import android.os.Process;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Offline editor with system document access; no broad storage permissions. */
public class MainActivity extends Activity {
    private static final String ORIGIN = "https://appassets.androidplatform.net";
    private static final int OPEN = 10, SAVE = 11, OPEN_FOLDER = 12, MAX_BYTES = 20 * 1024 * 1024;
    // Process-wide queue survives an Activity recreation until the frontend drains it.
    private static final Object OPEN_QUEUE_LOCK = new Object();
    private static final ArrayDeque<JSONObject> OPEN_QUEUE = new ArrayDeque<>();
    private static final Set<String> SUBMITTED_INTENTS = new LinkedHashSet<>();
    private static final int MAX_PENDING_EXTERNAL_FILES = 8;
    // Java strings use up to two bytes per UTF-16 code unit: at most 40 MiB queued.
    private static final long MAX_QUEUED_EXTERNAL_CHARS = 20L * 1024 * 1024;
    private static int pendingExternalFiles;
    private static long queuedExternalChars;
    private static boolean overflowNoticeQueued;
    private static volatile WeakReference<MainActivity> currentActivity = new WeakReference<>(null);
    private static final String INTENT_TOKEN_STATE = "mark1-external-intent-token";
    private String externalIntentToken;
    private WebView web;
    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private String requestId, saveText, saveName;
    private boolean busy;
    private AlertDialog browserDialog;
    private Uri browserTree, browserDirectory;
    private final ArrayDeque<Uri> browserParents = new ArrayDeque<>();
    private final List<BrowserEntry> browserEntries = new ArrayList<>();
    private ListView browserList;
    private TextView browserStatus;
    private Button browserUp;
    private boolean mdOnly = true;
    private int browserGeneration;

    private static class BrowserEntry {
        final Uri uri;
        final String name;
        final boolean directory;
        BrowserEntry(Uri uri, String name, boolean directory) {
            this.uri = uri; this.name = name; this.directory = directory;
        }
    }

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        currentActivity = new WeakReference<>(this);
        externalIntentToken = state == null ? UUID.randomUUID().toString() : state.getString(INTENT_TOKEN_STATE, UUID.randomUUID().toString());
        web = new WebView(this);
        web.setBackgroundColor(Color.rgb(32, 34, 33));
        FrameLayout content = new FrameLayout(this);
        content.setBackgroundColor(Color.rgb(32, 34, 33));
        content.addView(web, new FrameLayout.LayoutParams(-1, -1));
        setContentView(content);
        // Keep one owner for native safe areas. The WebView viewport is the safe
        // content rectangle; the frontend may add optional extra top spacing.
        if (Build.VERSION.SDK_INT >= 30) getWindow().setDecorFitsSystemWindows(false);
        else getWindow().getDecorView().setSystemUiVisibility(
            View.SYSTEM_UI_FLAG_LAYOUT_STABLE | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN |
            View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION);
        if (Build.VERSION.SDK_INT >= 28) {
            WindowManager.LayoutParams attributes = getWindow().getAttributes();
            attributes.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
            getWindow().setAttributes(attributes);
        }
        content.setOnApplyWindowInsetsListener((view, insets) -> {
            if (Build.VERSION.SDK_INT >= 30) {
                android.graphics.Insets safe = insets.getInsets(
                    WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout() | WindowInsets.Type.ime());
                view.setPadding(safe.left, safe.top, safe.right, safe.bottom);
                return WindowInsets.CONSUMED;
            }
            int left = insets.getSystemWindowInsetLeft(), top = insets.getSystemWindowInsetTop();
            int right = insets.getSystemWindowInsetRight(), bottom = insets.getSystemWindowInsetBottom();
            if (Build.VERSION.SDK_INT >= 28 && insets.getDisplayCutout() != null) {
                android.view.DisplayCutout cutout = insets.getDisplayCutout();
                left = Math.max(left, cutout.getSafeInsetLeft());
                top = Math.max(top, cutout.getSafeInsetTop());
                right = Math.max(right, cutout.getSafeInsetRight());
                bottom = Math.max(bottom, cutout.getSafeInsetBottom());
                insets = insets.consumeDisplayCutout();
            }
            view.setPadding(left, top, right, bottom);
            return insets.consumeSystemWindowInsets();
        });
        content.requestApplyInsets();
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        WebViewAssetLoader assets = new WebViewAssetLoader.Builder()
            .addPathHandler("/", new WebViewAssetLoader.AssetsPathHandler(this)).build();
        web.setWebViewClient(new WebViewClient() {
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                WebResourceResponse response = assets.shouldInterceptRequest(request.getUrl());
                if (response != null) return response;
                if (ORIGIN.equals(origin(request.getUrl())))
                    return new WebResourceResponse("text/plain", "UTF-8", 404, "Not Found", null, new ByteArrayInputStream(new byte[0]));
                return null;
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri url = request.getUrl();
                if ((ORIGIN + "/web/index.html").equals(url.toString())) return false;
                if (request.isForMainFrame() && ("https".equals(url.getScheme()) || "http".equals(url.getScheme()) || "mailto".equals(url.getScheme()))) {
                    try { startActivity(new Intent(Intent.ACTION_VIEW, url)); } catch (Exception ignored) {}
                }
                return true;
            }
        });
        web.addJavascriptInterface(new Documents(), "Mark1Android");
        web.loadUrl(ORIGIN + "/web/index.html");
        acceptExternalIntent(getIntent(), externalIntentToken);
    }
    private String origin(Uri uri) { return uri.getScheme() + "://" + uri.getAuthority(); }
    public class Documents {
        /** Called after workspace restoration; notification events are wakeups only. */
        @JavascriptInterface public String takeOpenedFiles() {
            JSONArray files = new JSONArray();
            synchronized (OPEN_QUEUE_LOCK) {
                while (!OPEN_QUEUE.isEmpty()) {
                    JSONObject file = OPEN_QUEUE.removeFirst();
                    if (file.optBoolean("_pendingSlot")) pendingExternalFiles--;
                    queuedExternalChars -= file.optString("text").length();
                    file.remove("_pendingSlot");
                    files.put(file);
                }
                overflowNoticeQueued = false;
            }
            return files.toString();
        }
        @JavascriptInterface public void openFile(String id) {
            runOnUiThread(() -> {
                if (!begin(id)) return;
                String remembered = getPreferences(MODE_PRIVATE).getString("markdown-folder", null);
                if (remembered != null) {
                    try {
                        Uri tree = Uri.parse(remembered);
                        showFolderBrowser(tree);
                    } catch (Exception e) { chooseFolder(); }
                } else {
                    showOpenChoice();
                }
            });
        }
        @JavascriptInterface public void saveFile(String id, String name, String text, String uri) {
            runOnUiThread(() -> {
                if (!begin(id)) return;
                if (text.getBytes(StandardCharsets.UTF_8).length > MAX_BYTES) { finishRequest(null, "文件超过 20 MB"); return; }
                saveName = name; saveText = text;
                if (uri.startsWith("content://") && hasWriteGrant(Uri.parse(uri))) {
                    write(Uri.parse(uri)); return;
                }
                // VIEW grants often permit reading only. Save a copy through SAF
                // rather than attempting to overwrite an ungranted document.
                Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT).setType("text/markdown")
                    .addCategory(Intent.CATEGORY_OPENABLE).putExtra(Intent.EXTRA_TITLE, name)
                    .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
                try { startActivityForResult(intent, SAVE); } catch (Exception e) { finishRequest(null, "无法打开系统文件选择器"); }
            });
        }
    }
    @Override protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        externalIntentToken = UUID.randomUUID().toString();
        acceptExternalIntent(intent, externalIntentToken);
    }
    @Override protected void onSaveInstanceState(Bundle state) {
        state.putString(INTENT_TOKEN_STATE, externalIntentToken);
        super.onSaveInstanceState(state);
    }
    @Override protected void onResume() {
        super.onResume();
        currentActivity = new WeakReference<>(this);
        wakeOpenedFiles();
    }
    private boolean hasWriteGrant(Uri uri) {
        return checkUriPermission(uri, Process.myPid(), Process.myUid(),
            Intent.FLAG_GRANT_WRITE_URI_PERMISSION) == PackageManager.PERMISSION_GRANTED;
    }
    private void acceptExternalIntent(Intent intent, String token) {
        if (intent == null || (!Intent.ACTION_VIEW.equals(intent.getAction()) && !Intent.ACTION_EDIT.equals(intent.getAction()))) return;
        final Uri uri = intent.getData();
        if (uri == null) return;
        synchronized (OPEN_QUEUE_LOCK) {
            if (!SUBMITTED_INTENTS.add(token)) return;
            if (SUBMITTED_INTENTS.size() > 256) SUBMITTED_INTENTS.remove(SUBMITTED_INTENTS.iterator().next());
            if (pendingExternalFiles >= MAX_PENDING_EXTERNAL_FILES) {
                if (!overflowNoticeQueued) {
                    try {
                        OPEN_QUEUE.addLast(new JSONObject().put("uri", "").put("name", "").put("text", "").put("error", "too-many-files"));
                        overflowNoticeQueued = true;
                    } catch (Exception ignored) {}
                }
                wakeOpenedFiles();
                return;
            }
            pendingExternalFiles++;
        }
        final int flags = intent.getFlags() & (Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
        if ("content".equals(uri.getScheme()) && (intent.getFlags() & Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION) != 0) {
            try { getContentResolver().takePersistableUriPermission(uri, flags); } catch (SecurityException ignored) {}
        }
        io.execute(() -> readExternalDocument(uri));
    }
    private void readExternalDocument(Uri uri) {
        JSONObject result = new JSONObject();
        String error = "open-failed";
        try {
            result.put("uri", uri.toString()).put("name", "").put("text", "");
            if (!"content".equals(uri.getScheme()) && !"file".equals(uri.getScheme())) {
                error = "invalid-file"; throw new IOException();
            }
            File diskFile = null;
            String name;
            if ("file".equals(uri.getScheme())) {
                // Older file managers can send file://. Never expose app-private
                // paths or load them in WebView; shared-storage access is still
                // subject to Android permissions and scoped storage.
                diskFile = new File(uri.getPath() == null ? "" : uri.getPath()).getCanonicalFile();
                String sharedRoot = Environment.getExternalStorageDirectory().getCanonicalPath() + File.separator;
                if (!diskFile.getPath().startsWith(sharedRoot) || !diskFile.isFile()) {
                    error = "invalid-file"; throw new IOException();
                }
                name = diskFile.getName();
            } else {
                name = displayName(uri, "");
            }
            if (name.isEmpty() || !name.toLowerCase(Locale.ROOT).matches(".*\\.(md|markdown|mdown)$")) {
                error = "invalid-file"; throw new IOException();
            }
            result.put("name", name);
            try (InputStream stream = diskFile == null ? getContentResolver().openInputStream(uri) : new FileInputStream(diskFile);
                 ByteArrayOutputStream output = new ByteArrayOutputStream()) {
                if (stream == null) throw new IOException();
                byte[] buffer = new byte[8192]; int count;
                while ((count = stream.read(buffer)) != -1) {
                    if (output.size() + count > MAX_BYTES) { error = "file-too-large"; throw new IOException(); }
                    output.write(buffer, 0, count);
                }
                String text = StandardCharsets.UTF_8.newDecoder().decode(java.nio.ByteBuffer.wrap(output.toByteArray())).toString();
                result.put("text", text.startsWith("\uFEFF") ? text.substring(1) : text);
                result.put("writable", diskFile == null && hasWriteGrant(uri));
            }
        } catch (Exception e) {
            try { result.put("error", error); } catch (Exception ignored) {}
        }
        synchronized (OPEN_QUEUE_LOCK) {
            try {
                int chars = result.optString("text").length();
                if (queuedExternalChars + chars > MAX_QUEUED_EXTERNAL_CHARS) {
                    result.put("text", "").put("error", "too-many-files");
                } else queuedExternalChars += chars;
                result.put("_pendingSlot", true);
                OPEN_QUEUE.addLast(result);
            } catch (Exception ignored) { pendingExternalFiles--; }
        }
        MainActivity activity = currentActivity.get();
        if (activity != null) activity.runOnUiThread(activity::wakeOpenedFiles);
    }
    private void wakeOpenedFiles() {
        if (web == null || isDestroyed()) return;
        synchronized (OPEN_QUEUE_LOCK) { if (OPEN_QUEUE.isEmpty()) return; }
        web.evaluateJavascript("window.dispatchEvent(new Event('mark1-android-opened'))", null);
    }
    private boolean begin(String id) {
        if (busy) { deliver(id, null, "另一个文件操作正在进行"); return false; }
        busy = true; requestId = id; return true;
    }
    @Override protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
        if (request != OPEN && request != SAVE && request != OPEN_FOLDER) return;
        if (!busy) return; // The process may have been recreated while the picker was open.
        if (result != RESULT_OK || data == null || data.getData() == null) { finishRequest(null, null); return; }
        Uri uri = data.getData();
        int flags = data.getFlags() & (Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
        try { getContentResolver().takePersistableUriPermission(uri, flags); } catch (SecurityException ignored) {}
        if (request == SAVE) { write(uri); return; }
        if (request == OPEN_FOLDER) {
            getPreferences(MODE_PRIVATE).edit().putString("markdown-folder", uri.toString()).apply();
            showFolderBrowser(uri);
            return;
        }
        readDocument(uri);
    }
    private void readDocument(Uri uri) {
        io.execute(() -> {
            try (InputStream stream = getContentResolver().openInputStream(uri); ByteArrayOutputStream output = new ByteArrayOutputStream()) {
                if (stream == null) throw new IOException();
                byte[] buffer = new byte[8192]; int read;
                while ((read = stream.read(buffer)) != -1) {
                    if (output.size() + read > MAX_BYTES) throw new IOException("文件超过 20 MB");
                    output.write(buffer, 0, read);
                }
                String name = displayName(uri, "文档.md");
                if (!name.toLowerCase(java.util.Locale.ROOT).matches(".*\\.(md|markdown|mdown|txt)$")) throw new IOException("请选择 Markdown 或文本文件");
                String text = StandardCharsets.UTF_8.newDecoder().decode(java.nio.ByteBuffer.wrap(output.toByteArray())).toString();
                finishRequest(file(uri, name, text.startsWith("\uFEFF") ? text.substring(1) : text), null);
            } catch (Exception e) { finishRequest(null, "无法读取文件，请选择 UTF-8 文本（不超过 20 MB）"); }
        });
    }
    private void showOpenChoice() {
        new AlertDialog.Builder(this).setTitle("打开文件")
            .setItems(new String[]{"浏览文件夹（可筛选 .md）", "系统文件选择器"}, (dialog, which) -> {
                if (which == 0) chooseFolder(); else openSystemPicker();
            })
            .setNegativeButton("取消", (dialog, which) -> finishRequest(null, null))
            .setOnCancelListener(dialog -> finishRequest(null, null)).show();
    }
    private void chooseFolder() {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE)
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION |
                Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION | Intent.FLAG_GRANT_PREFIX_URI_PERMISSION);
        String remembered = getPreferences(MODE_PRIVATE).getString("markdown-folder", null);
        if (remembered != null) intent.putExtra(DocumentsContract.EXTRA_INITIAL_URI, Uri.parse(remembered));
        try { startActivityForResult(intent, OPEN_FOLDER); }
        catch (Exception e) { openSystemPicker(); }
    }
    private void openSystemPicker() {
        // Providers frequently classify .md as application/octet-stream. Keep
        // this fallback broad and validate the extension after the user selects.
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT).setType("*/*")
            .addCategory(Intent.CATEGORY_OPENABLE)
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION |
                Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
        try { startActivityForResult(intent, OPEN); }
        catch (Exception e) { finishRequest(null, "无法打开系统文件选择器"); }
    }
    private int dp(int value) { return Math.round(value * getResources().getDisplayMetrics().density); }
    private void showFolderBrowser(Uri tree) {
        browserTree = tree;
        browserDirectory = DocumentsContract.buildDocumentUriUsingTree(tree, DocumentsContract.getTreeDocumentId(tree));
        browserParents.clear();
        LinearLayout layout = new LinearLayout(this);
        layout.setOrientation(LinearLayout.VERTICAL);
        layout.setPadding(dp(16), dp(8), dp(16), 0);
        CheckBox filter = new CheckBox(this);
        filter.setText("仅显示 .md 文件");
        filter.setChecked(mdOnly);
        filter.setMinHeight(dp(48));
        layout.addView(filter);
        browserUp = new Button(this);
        browserUp.setText("上一级文件夹");
        layout.addView(browserUp);
        browserStatus = new TextView(this);
        browserStatus.setPadding(dp(4), dp(8), dp(4), dp(8));
        layout.addView(browserStatus);
        browserList = new ListView(this);
        layout.addView(browserList, new LinearLayout.LayoutParams(-1,
            Math.max(dp(160), Math.min(dp(340), getResources().getDisplayMetrics().heightPixels / 3))));
        browserDialog = new AlertDialog.Builder(this).setTitle("浏览文件")
            .setView(layout)
            .setPositiveButton("系统选择器", (dialog, which) -> { closeBrowser(); openSystemPicker(); })
            .setNeutralButton("更换文件夹", (dialog, which) -> { closeBrowser(); chooseFolder(); })
            .setNegativeButton("取消", (dialog, which) -> { closeBrowser(); finishRequest(null, null); })
            .setOnCancelListener(dialog -> { closeBrowser(); finishRequest(null, null); }).create();
        filter.setOnCheckedChangeListener((button, checked) -> { mdOnly = checked; loadFolder(); });
        browserUp.setOnClickListener(view -> {
            if (!browserParents.isEmpty()) { browserDirectory = browserParents.pop(); loadFolder(); }
        });
        browserList.setOnItemClickListener((parent, view, position, id) -> {
            if (position < 0 || position >= browserEntries.size()) return;
            BrowserEntry entry = browserEntries.get(position);
            if (entry.directory) {
                browserParents.push(browserDirectory);
                browserDirectory = entry.uri;
                loadFolder();
            } else {
                closeBrowser();
                readDocument(entry.uri);
            }
        });
        browserDialog.show();
        loadFolder();
    }
    private void closeBrowser() {
        browserGeneration++;
        if (browserDialog != null) { browserDialog.dismiss(); browserDialog = null; }
    }
    private void loadFolder() {
        final int token = ++browserGeneration;
        final Uri tree = browserTree, directory = browserDirectory;
        final boolean onlyMd = mdOnly;
        browserUp.setEnabled(!browserParents.isEmpty());
        browserStatus.setText("加载中…");
        browserEntries.clear();
        browserList.setAdapter(new ArrayAdapter<String>(this, android.R.layout.simple_list_item_1, new ArrayList<>()));
        io.execute(() -> {
            List<BrowserEntry> entries = new ArrayList<>();
            String error = null;
            try {
                String documentId = DocumentsContract.getDocumentId(directory);
                Uri children = DocumentsContract.buildChildDocumentsUriUsingTree(tree, documentId);
                try (Cursor cursor = getContentResolver().query(children, new String[]{
                    DocumentsContract.Document.COLUMN_DOCUMENT_ID,
                    DocumentsContract.Document.COLUMN_DISPLAY_NAME,
                    DocumentsContract.Document.COLUMN_MIME_TYPE}, null, null, null)) {
                    if (cursor == null) throw new IOException();
                    while (cursor.moveToNext()) {
                        String name = cursor.getString(1);
                        if (name == null) continue;
                        boolean folder = DocumentsContract.Document.MIME_TYPE_DIR.equals(cursor.getString(2));
                        String lower = name.toLowerCase(Locale.ROOT);
                        boolean supported = onlyMd ? lower.endsWith(".md") : lower.matches(".*\\.(md|markdown|mdown|txt)$");
                        if (folder || supported) entries.add(new BrowserEntry(
                            DocumentsContract.buildDocumentUriUsingTree(tree, cursor.getString(0)), name, folder));
                    }
                }
                entries.sort((a, b) -> a.directory != b.directory ? (a.directory ? -1 : 1) : a.name.compareToIgnoreCase(b.name));
            } catch (Exception e) { error = "无法读取此文件夹，请更换文件夹或使用系统选择器"; }
            final String message = error;
            final String folderName = displayName(directory, "文件夹");
            runOnUiThread(() -> {
                if (token != browserGeneration || browserDialog == null || !busy || isFinishing()) return;
                browserEntries.clear(); browserEntries.addAll(entries);
                List<String> labels = new ArrayList<>();
                for (BrowserEntry entry : entries) labels.add((entry.directory ? "▸  " : "") + entry.name);
                browserList.setAdapter(new ArrayAdapter<>(this, android.R.layout.simple_list_item_1, labels));
                browserStatus.setText(message != null ? message : folderName + (entries.isEmpty() ? " · 没有匹配的文件" : " · " + entries.size() + " 项"));
            });
        });
    }
    private void write(Uri uri) {
        final String text = saveText, name = saveName;
        io.execute(() -> {
            try (OutputStream stream = getContentResolver().openOutputStream(uri, "wt")) {
                if (stream == null) throw new IOException();
                stream.write(text.getBytes(StandardCharsets.UTF_8)); stream.flush();
                finishRequest(file(uri, displayName(uri, name), ""), null);
            } catch (Exception e) { finishRequest(null, "保存失败，可尝试另存为或重新打开文件"); }
        });
    }
    private String displayName(Uri uri, String fallback) {
        try (Cursor cursor = getContentResolver().query(uri, new String[]{OpenableColumns.DISPLAY_NAME}, null, null, null)) {
            if (cursor != null && cursor.moveToFirst() && !cursor.isNull(0)) return cursor.getString(0);
        } catch (Exception ignored) {}
        return fallback;
    }
    private JSONObject file(Uri uri, String name, String text) throws Exception {
        return new JSONObject().put("uri", uri.toString()).put("name", name).put("text", text);
    }
    private void finishRequest(JSONObject result, String error) {
        runOnUiThread(() -> {
            String id = requestId;
            busy = false; requestId = null; saveText = null; saveName = null;
            if (id != null) deliver(id, result, error);
        });
    }
    private void deliver(String id, JSONObject result, String error) {
        try {
            JSONObject detail = new JSONObject().put("id", id).put("result", result == null ? JSONObject.NULL : result)
                .put("error", error == null ? JSONObject.NULL : error);
            web.evaluateJavascript("window.dispatchEvent(new CustomEvent('mark1-android-result',{detail:" + detail + "}))", null);
        } catch (Exception ignored) {}
    }
    @Override public void onBackPressed() {
        web.evaluateJavascript("(() => {const d=document.querySelector('dialog[open]');if(d){const e=new Event('cancel',{cancelable:true});if(d.dispatchEvent(e)&&d.open)d.close();return true;}const a=document.querySelector('#app');if(a.classList.contains('sidebar-open')||a.classList.contains('focus-mode')){a.classList.remove('sidebar-open','focus-mode');return true;}return false;})()", handled -> {
            if (!"true".equals(handled)) super.onBackPressed();
        });
    }
    @Override protected void onPause() {
        web.evaluateJavascript("window.dispatchEvent(new Event('pagehide'))", null);
        super.onPause();
    }
    @Override protected void onDestroy() {
        if (currentActivity.get() == this) currentActivity.clear();
        closeBrowser(); io.shutdown(); web.removeJavascriptInterface("Mark1Android"); web.destroy(); super.onDestroy();
    }
}
