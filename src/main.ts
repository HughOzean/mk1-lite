import { tags } from "@lezer/highlight";
import { EditorState, Compartment } from "@codemirror/state";
import {
  EditorView,
  keymap,
  lineNumbers,
  highlightActiveLine,
  drawSelection,
} from "@codemirror/view";
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
  undo,
  redo,
  selectAll,
} from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import {
  foldGutter,
  foldService,
  foldAll,
  unfoldAll,
  syntaxHighlighting,
  HighlightStyle,
} from "@codemirror/language";
import { search } from "@codemirror/search";
import { createSearchDialog } from "./search-dialog";
import { createFileTree } from "./file-tree";
import {
  languages,
  translate,
  editorPhrases,
  type Locale,
  type Key,
} from "./i18n";
import { headings, render, wordCount } from "./document";
import { createCheatsheet } from "./cheatsheet";
import { createAppMenu } from "./app-menu";
import { createShortcutSettings } from "./shortcuts";
import { createTabContextMenu } from "./tab-context-menu";
import "./style.css";
const icons: Record<string, string> = {
  file: "M6 3h8l4 4v14H6z M14 3v5h5",
  folder: "M3 6h6l2 2h10v12H3z",
  plus: "M12 5v14 M5 12h14",
  open: "M3 8V5h7l2 3h9l-3 12H3l3-9h15",
  save: "M5 3h13l3 3v15H3V3z M7 3v6h10V3 M7 21v-8h10v8",
  settings:
    "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1z",
  chevron: "m9 5 7 7-7 7",
  split: "M3 4h18v16H3z M12 4v16",
  eye: "M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6",
  edit: "m4 16 12-12 4 4L8 20H4z M13 7l4 4",
  focus: "M8 3H3v5 M16 3h5v5 M21 16v5h-5 M3 16v5h5",
  search: "M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14 M15 15l6 6",
  close: "m6 6 12 12 M6 18 18 6",
  link: "m10 14 4-4 M8 16l-2 2a4 4 0 0 1-6-6l5-5a4 4 0 0 1 6 0 M16 8l2-2a4 4 0 0 1 6 6l-5 5a4 4 0 0 1-6 0",
  code: "m8 6-6 6 6 6 M16 6l6 6-6 6",
  quote: "M4 6h6v8H4z M4 18l6-4 M14 6h6v8h-6z M14 18l6-4",
  list: "M8 6h13 M8 12h13 M8 18h13 M3 6h.1 M3 12h.1 M3 18h.1",
  check: "m5 12 4 4L19 6",
  globe:
    "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0 M3 12h18 M12 3c5 5 5 13 0 18-5-5-5-13 0-18",
  fold: "m8 3 4 4 4-4 M8 21l4-4 4 4 M4 12h16",
  unfold: "m8 7 4-4 4 4 M8 17l4 4 4-4 M4 12h16",
  menu: "M4 6h16 M4 12h16 M4 18h16",
  help: "M9 9a3 3 0 1 1 5 2.2c-1.3.8-2 1.3-2 3 M12 18h.01 M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0",
  table: "M3 4h18v16H3z M3 9h18 M9 4v16 M15 4v16",
  sun: "M12 3v2 M12 19v2 M3 12h2 M19 12h2 M5 5l2 2 M17 17l2 2 M5 19l2-2 M17 7l2-2 M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0",
};
const icon = (name: string) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${icons[name] || icons.file}"/></svg>`;
const escape = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
interface Prefs {
  locale: Locale;
  theme: "dark" | "light" | "system";
  size: number;
  lineHeight: number;
  width: number;
  style: string;
  numbers: boolean;
  wrap: boolean;
  breaks: boolean;
  mode: "split" | "editor" | "preview";
  side: "files" | "outline";
}
const defaults: Prefs = {
  locale: "zh",
  theme: "dark",
  size: 15,
  lineHeight: 1.85,
  width: 760,
  style: "standard",
  numbers: true,
  wrap: true,
  breaks: false,
  mode: "split",
  side: "files",
};
function read(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
let prefs: Prefs = { ...defaults };
try {
  const p = JSON.parse(read("m1-settings") || "{}");
  for (const key of Object.keys(defaults) as (keyof Prefs)[])
    if (typeof p[key] === typeof defaults[key]) (prefs as any)[key] = p[key];
} catch {}
if (!(prefs.locale in languages)) prefs.locale = "zh";
if (!["dark", "light", "system"].includes(prefs.theme)) prefs.theme = "dark";
if (!["split", "editor", "preview"].includes(prefs.mode)) prefs.mode = "split";
prefs.size = Math.max(12, Math.min(22, prefs.size));
prefs.lineHeight = Math.max(1.4, Math.min(2.4, prefs.lineHeight));
prefs.width = Math.max(480, Math.min(1000, prefs.width));

if (!["files", "outline"].includes(prefs.side)) prefs.side = "files";
const t = (key: Key) => translate(prefs.locale, key);
const button = (key: Key, ico: string, action: string, extra = "") =>
  `<button class="icon-button ${extra}" data-action="${action}" title="${t(key)}" aria-label="${t(key)}">${icon(ico)}</button>`;
const app = document.querySelector<HTMLDivElement>("#app")!;
app.innerHTML = `<aside class="sidebar"><a class="brand" href="#" aria-label="Mk.1 Lite"><img class="brand-icon" src="./favicon.svg" alt="Mk.1"><span>Mk.1 <span class="brand-light">Lite</span><small>轻型马克1</small></span></a><div class="sidebar-tabs" role="tablist"><button data-side="files" role="tab">${icon("folder")}<span data-i18n="files"></span></button><button data-side="outline" role="tab">${icon("list")}<span data-i18n="outline"></span></button></div><div id="file-tree"></div><section id="outline-panel"><div class="outline-head"><span data-i18n="outline"></span><div>${button("collapse", "fold", "fold")}${button("expand", "unfold", "unfold")}</div></div><nav class="outline" aria-label="Outline"></nav></section><div class="sidebar-footer">v0.2.4</div></aside><button class="sidebar-backdrop" data-action="sidebar" aria-label="Close sidebar"></button>
<div class="workspace"><header class="topbar"><div class="breadcrumb">${button("files", "menu", "sidebar", "mobile-menu")}</div><div class="component-bar" role="toolbar" aria-label="Components"><button class="component-icon cheatsheet-button" data-action="cheatsheet" aria-label="${t("cheatsheet")}" title="${t("cheatsheet")}">${icon("help")}</button><button class="component-icon settings-button" data-action="settings" aria-label="${t("settings")}" title="${t("settings")}">${icon("settings")}</button><button class="mode-toggle" data-action="toggle-mode" aria-pressed="false"><span></span></button></div></header>
<div class="document-tabs"><div id="tab-list" role="tablist"></div><div class="view-switch" role="group" hidden>${(["editor", "split", "preview"] as const).map((v, i) => `<button data-mode="${v}" title="${t(v)}">${icon(["edit", "split", "eye"][i])}<span data-i18n="${v}"></span></button>`).join("")}</div></div>
<div class="format-toolbar"><div class="format-tools"><select id="heading-level" aria-label="${t("heading")}">${[1, 2, 3, 4, 5].map((level) => `<option value="${level}">H${level}</option>`).join("")}</select><span class="divider"></span><button data-format="bold" title="${t("bold")}"><b>B</b></button><button data-format="italic" title="${t("italic")}"><i>I</i></button><button data-format="link" title="${t("link")}">${icon("link")}</button><span class="divider"></span><button data-format="quote" title="${t("quote")}">${icon("quote")}</button><button data-format="code" title="${t("code")}">${icon("code")}</button><button data-format="list" title="${t("list")}">${icon("list")}</button><span class="divider"></span><button data-format="table" title="${t("table")}">${icon("table")}</button></div></div>
<main class="panes"><section class="editor-pane"><div class="pane-label"><span data-i18n="editor"></span></div><div id="editor"></div></section><section class="preview-pane"><div class="pane-label"><span data-i18n="preview"></span></div><div class="preview-scroll"><article id="preview"></article></div></section></main><section id="empty-state"><span class="empty-mark">Mk.1</span><h1>Mk.1 Lite</h1><p data-i18n="emptyMenuHint"></p></section>
<footer class="statusbar"><div><span class="status-dot"></span><span id="save-status"></span><span class="status-separator">/</span><span id="stats"></span></div><div><span id="cursor">Ln 1, Col 1</span><span class="status-separator">|</span><span>UTF-8</span><span class="status-separator">|</span><span id="locale-label"></span></div></footer></div>
<dialog id="settings"><div class="settings-top"><div><h2 data-i18n="settings"></h2></div>${button("close", "close", "close-settings")}</div><div class="settings-body"><p class="settings-intro" data-i18n="renderHint"></p><h3 data-i18n="appearance"></h3><label class="setting-row"><span data-i18n="language"></span><select id="language">${Object.entries(
  languages,
)
  .map(([v, label]) => `<option value="${v}">${label}</option>`)
  .join(
    "",
  )}</select></label><label class="setting-row"><span data-i18n="theme"></span><select id="theme"><option value="dark" data-i18n="dark"></option><option value="light" data-i18n="light"></option><option value="system" data-i18n="system"></option></select></label><h3 data-i18n="rendering"></h3><label class="setting-row"><span data-i18n="style"></span><select id="style"><option value="standard" data-i18n="standard"></option><option value="serif" data-i18n="serif"></option><option value="mono" data-i18n="mono"></option></select></label>${[
  ["size", "fontSize", 12, 22, 1, "px"],
  ["lineHeight", "lineHeight", 1.4, 2.4, 0.05, ""],
  ["width", "width", 480, 1000, 20, "px"],
]
  .map(
    ([id, label, min, max, step, unit]) =>
      `<label class="range-row"><span><span data-i18n="${label}"></span><output id="${id}-value"></output></span><input id="${id}" type="range" min="${min}" max="${max}" step="${step}" data-unit="${unit}"></label>`,
  )
  .join(
    "",
  )}<h3 data-i18n="editor"></h3><label class="setting-row"><span data-i18n="lineNumbers"></span><span class="switch-control"><input id="numbers" type="checkbox" role="switch"><span class="switch-track" aria-hidden="true"></span></span></label><label class="setting-row"><span data-i18n="wrap"></span><span class="switch-control"><input id="wrap" type="checkbox" role="switch"><span class="switch-track" aria-hidden="true"></span></span></label><label class="setting-row"><span data-i18n="softBreaks"></span><span class="switch-control"><input id="breaks" type="checkbox" role="switch"><span class="switch-track" aria-hidden="true"></span></span></label><section id="file-associations" hidden><h3 data-i18n="fileAssociations"></h3><p class="settings-intro" data-i18n="defaultAppHint"></p><button class="association-button" data-action="set-default-app" data-i18n="setDefaultApp"></button><p id="association-status" role="status" aria-live="polite"></p></section><section id="shortcut-settings"></section><div class="shortcut-card"><span data-i18n="shortcuts"></span><div><span data-i18n="save"></span><kbd>⌘ / Ctrl S</kbd></div><div><span data-i18n="find"></span><kbd>⌘ / Ctrl F</kbd></div><div><span data-i18n="bold"></span><kbd>⌘ / Ctrl B</kbd></div></div></div><div class="settings-bottom"><button data-action="reset" data-i18n="reset"></button><button class="primary" data-action="close-settings" data-i18n="close"></button></div></dialog><input type="file" id="file-input" accept=".md,.markdown,.mdown,.txt,text/plain,text/markdown" multiple hidden><div id="toast" role="status"></div>`;
const menuContainer = document.createElement("nav");
menuContainer.id = "app-menu";
app.before(menuContainer);
function nativeDesktop() {
  return isNative() && !/Android|iPhone|iPad/i.test(navigator.userAgent);
}
menuContainer.hidden = nativeDesktop();
interface TabDocument {
  id: string;
  name: string;
  path: string | null;
  sourceKey?: string;
  file?: File;
  state: EditorState;
  dirty: boolean;
  revision: number;
  saving: boolean;
  scrollTop: number;
}
interface OpenedFile {
  path: string | null;
  name: string;
  text: string;
  file?: File;
  root?: string;
  error?: string;
}
const tabs: TabDocument[] = [];
let activeId: string | null = null;
let nextId = 0,
  titleGeneration = 0;
let lastNativeTitle: string | null = null;
let saving = false,
  filePickerActive = false;
let renderTimer: ReturnType<typeof setTimeout>,
  draftTimer: ReturnType<typeof setTimeout>,
  toastTimer: ReturnType<typeof setTimeout>;
const numberConfig = new Compartment(),
  wrapConfig = new Compartment(),
  phrasesConfig = new Compartment(),
  editableConfig = new Compartment();
function isNative() {
  return !!(window as any).__TAURI_INTERNALS__;
}
const current = () => tabs.find((doc) => doc.id === activeId);
const editorTheme = EditorView.theme({
  "&": {
    height: "100%",
    fontSize: "13px",
    backgroundColor: "var(--editor-bg)",
    color: "var(--text)",
  },
  ".cm-content": {
    fontFamily: "var(--font-mono)",
    padding: "22px 0",
    caretColor: "var(--highlight)",
  },
  ".cm-line": { padding: "0 22px 0 12px", lineHeight: "1.95" },
  ".cm-gutters": {
    backgroundColor: "var(--editor-bg)",
    color: "var(--muted)",
    border: "none",
  },
  ".cm-lineNumbers": { minWidth: "36px" },
  ".cm-gutterElement": { lineHeight: "1.95" },
  ".cm-activeLine": { backgroundColor: "var(--active-line)" },
  ".cm-selectionBackground": { backgroundColor: "#66cc6633 !important" },
  ".cm-cursor": { borderLeftColor: "var(--highlight)" },
  ".cm-foldGutter .cm-gutterElement": { cursor: "pointer" },
});
const foldCache = new WeakMap<EditorState, ReturnType<typeof headings>>();
const editorExtensions = [
  history(),
  drawSelection(),
  highlightActiveLine(),
  markdown(),
  syntaxHighlighting(
    HighlightStyle.define([
      { tag: tags.heading, color: "var(--text)", fontWeight: "600" },
      { tag: tags.strong, fontWeight: "700" },
      { tag: tags.emphasis, fontStyle: "italic" },
      { tag: tags.strikethrough, textDecoration: "line-through" },
      {
        tag: [tags.link, tags.url],
        color: "var(--accent)",
        textDecoration: "underline",
      },
      {
        tag: [tags.meta, tags.processingInstruction, tags.keyword],
        color: "var(--accent)",
      },
      { tag: [tags.comment, tags.contentSeparator], color: "var(--muted)" },
      { tag: [tags.string, tags.monospace], color: "var(--subtle)" },
    ]),
  ),
  foldGutter(),
  foldService.of((state, start) => {
    let hs = foldCache.get(state);
    if (!hs) {
      hs = headings(state.doc.toString());
      foldCache.set(state, hs);
    }
    const h = hs.find((h) => h.from === start);
    return h && h.end > h.to ? { from: h.to, to: h.end } : null;
  }),
  numberConfig.of(prefs.numbers ? lineNumbers() : []),
  wrapConfig.of(prefs.wrap ? EditorView.lineWrapping : []),
  phrasesConfig.of(EditorState.phrases.of(editorPhrases(prefs.locale))),
  editableConfig.of(EditorView.editable.of(true)),
  search(),
  keymap.of([
    ...(!nativeDesktop()
      ? [
          {
            key: "Mod-Shift-s",
            run: () => {
              void saveFile(activeId, true);
              return true;
            },
          },
          {
            key: "Mod-n",
            run: () => {
              newDocument();
              return true;
            },
          },
          {
            key: "Mod-w",
            run: () => {
              if (activeId) void closeDocument(activeId);
              return true;
            },
          },
          {
            key: "Mod-,",
            run: () => {
              void performAction("settings");
              return true;
            },
          },
          {
            key: "Mod-s",
            run: () => {
              void saveFile();
              return true;
            },
          },
          {
            key: "Mod-o",
            run: () => {
              void openFile();
              return true;
            },
          },
          {
            key: "Mod-f",
            run: () => {
              searchDialog.open();
              return true;
            },
          },
          {
            key: "Mod-h",
            mac: "Mod-Shift-h",
            run: () => {
              searchDialog.open(true);
              return true;
            },
          },
          {
            key: "Mod-Shift-h",
            run: () => {
              searchDialog.open(true);
              return true;
            },
          },
          {
            key: "Mod-b",
            run: () => {
              format("bold");
              return true;
            },
          },
          {
            key: "Mod-i",
            run: () => {
              format("italic");
              return true;
            },
          },
        ]
      : []),
    indentWithTab,
    ...defaultKeymap,
    ...historyKeymap,
  ]),
  editorTheme,
  EditorView.updateListener.of((update) => {
    const doc = current();
    if (!doc) return;
    doc.state = update.state;
    if (update.docChanged) {
      doc.revision++;
      const wasDirty = doc.dirty;
      doc.dirty = true;
      if (!wasDirty) updateTabs();
      clearTimeout(renderTimer);
      renderTimer = setTimeout(updatePreview, 100);
      clearTimeout(draftTimer);
      draftTimer = setTimeout(saveDraft, 250);
      searchDialog.documentChanged();
    }
    if (update.docChanged || update.selectionSet) updateStatus();
  }),
];
function createState(text: string) {
  return EditorState.create({ doc: text, extensions: editorExtensions });
}
const view = new EditorView({
  parent: document.querySelector("#editor")!,
  state: createState(""),
});
const searchDialog = createSearchDialog({
  getView: () => view,
  t: (key) => t(key as Key),
  onOpen: () => {
    if (prefs.mode === "preview") {
      prefs.mode = "editor";
      applyPrefs();
    }
  },
});
const fileTree = createFileTree({
  container: document.querySelector("#file-tree")!,
  t: (key) => t(key as Key),
  onOpenFile: (file) => {
    addDocument(file);
  },
  onError: () => toast(t("fileError")),
});
const cheatsheet = createCheatsheet({
  t: (key) => t(key as Key),
  getLocale: () => prefs.locale,
});
const appMenu = createAppMenu({
  container: menuContainer,
  t: (key) => t(key as Key),
  onAction: (action) => {
    void performAction(action);
  },
});
const shortcutSettings = createShortcutSettings({
  container: document.querySelector<HTMLElement>("#shortcut-settings")!,
  t: (key) => t(key as Key),
  onChange: () => {
    refreshMenus();
    updateComponentBar();
  },
});
function updateComponentBar() {
  const preview = prefs.mode === "preview";
  const modeButton = document.querySelector<HTMLButtonElement>(
    '[data-action="toggle-mode"]',
  )!;
  modeButton.dataset.state = preview ? "preview" : "editor";
  modeButton.setAttribute("aria-pressed", String(preview));
  modeButton.disabled = !current();
  modeButton.querySelector("span")!.textContent = t(
    preview ? "preview" : "editor",
  );
  modeButton.title = t("shortcutToggleMode");
  modeButton.setAttribute(
    "aria-label",
    `${t("shortcutToggleMode")}: ${t(preview ? "preview" : "editor")}`,
  );
  const help = document.querySelector<HTMLButtonElement>(
    '.component-bar [data-action="cheatsheet"]',
  )!;
  help.title = t("cheatsheet");
  help.setAttribute("aria-label", t("cheatsheet"));
}
let nativeMenuKey = "",
  nativeMenuGeneration = 0;
function refreshMenus() {
  appMenu.refresh({ hasDocument: !!current() });
  if (!nativeDesktop()) return;
  const shortcuts = shortcutSettings.getMenuAccelerators();
  const key = `${prefs.locale}:${!!current()}:${JSON.stringify(shortcuts)}`;
  if (key === nativeMenuKey) return;
  nativeMenuKey = key;
  const generation = ++nativeMenuGeneration;
  void import("@tauri-apps/api/core")
    .then(async ({ invoke }) => {
      if (generation === nativeMenuGeneration)
        await invoke("update_app_menu", {
          locale: prefs.locale,
          hasDocument: !!current(),
          shortcuts,
        });
    })
    .catch((error) => {
      nativeMenuKey = "";
      console.error("Application menu:", error);
      toast(t("shortcutApplyFailed"));
    });
}
function persist() {
  try {
    localStorage.setItem("m1-settings", JSON.stringify(prefs));
  } catch {
    toast(t("storageError"));
  }
}
function saveDraft() {
  try {
    localStorage.setItem(
      "m1-workspace-v2",
      JSON.stringify({
        documents: tabs.map((doc) => ({
          name: doc.name,
          text: doc.state.doc.toString(),
          dirty: doc.dirty,
          sourceKey:
            doc.path ||
            (doc.sourceKey?.startsWith("browser-tree:")
              ? undefined
              : doc.sourceKey),
        })),
        activeIndex: tabs.findIndex((doc) => doc.id === activeId),
      }),
    );
    localStorage.removeItem("m1-draft");
    document.querySelector("#save-status")!.textContent = t("draft");
  } catch {
    document.querySelector("#save-status")!.textContent = t("storageError");
  }
}
function restoreWorkspace() {
  try {
    const saved = JSON.parse(read("m1-workspace-v2") || "null");
    if (saved && Array.isArray(saved.documents)) {
      for (const item of saved.documents) {
        if (typeof item.name !== "string" || typeof item.text !== "string")
          continue;
        tabs.push({
          id: String(++nextId),
          name: item.name,
          path: null,
          sourceKey:
            typeof item.sourceKey === "string" ? item.sourceKey : undefined,
          state: createState(item.text),
          dirty: !!item.dirty,
          revision: 0,
          saving: false,
          scrollTop: 0,
        });
      }
      activeId =
        tabs[
          Math.max(0, Math.min(tabs.length - 1, Number(saved.activeIndex) || 0))
        ]?.id || null;
      return;
    }
    const legacy = JSON.parse(read("m1-draft") || "null");
    if (
      legacy &&
      typeof legacy.text === "string" &&
      typeof legacy.name === "string"
    ) {
      const doc: TabDocument = {
        id: String(++nextId),
        name: legacy.name,
        path: null,
        state: createState(legacy.text),
        dirty: !!legacy.dirty,
        revision: 0,
        saving: false,
        scrollTop: 0,
      };
      tabs.push(doc);
      activeId = doc.id;
    }
  } catch {}
}
function updateTabs() {
  const active = current();
  document.querySelector("#tab-list")!.innerHTML = tabs
    .map(
      (doc) =>
        `<div class="document-tab ${doc.id === activeId ? "selected" : ""}"><button class="tab-name" role="tab" aria-selected="${doc.id === activeId}" data-tab="${doc.id}" title="${escape(doc.path || doc.name)}">${icon("file")}<span>${escape(doc.name)}</span>${doc.dirty ? '<i class="tab-dirty"></i>' : ""}</button><button class="tab-close" data-close-tab="${doc.id}" aria-label="${escape(t("close"))}: ${escape(doc.name)}" ${doc.saving ? "disabled" : ""}>${icon("close")}</button></div>`,
    )
    .join("");
  document
    .querySelectorAll(".filename")
    .forEach((el) => (el.textContent = active?.name || "Mk.1 Lite"));
  document
    .querySelectorAll(".unsaved-indicator")
    .forEach((el) => el.classList.toggle("visible", !!active?.dirty));
  document.querySelector("#empty-state")!.toggleAttribute("hidden", !!active);
  (document.querySelector(".panes") as HTMLElement).hidden = !active;
  document
    .querySelectorAll<HTMLButtonElement>(
      '.format-tools button,.format-tools select,.save-button,[data-action="fold"],[data-action="unfold"],[data-action="find"]',
    )
    .forEach((el) => (el.disabled = !active));
  refreshMenus();
  updateComponentBar();
  tabContext.refresh();
  const title = active?.name || "Mk.1 Lite";
  document.title = title;
  if (lastNativeTitle === title) return;
  lastNativeTitle = title;
  const generation = ++titleGeneration;
  if (isNative())
    void import("@tauri-apps/api/window")
      .then(async ({ getCurrentWindow }) => {
        if (generation === titleGeneration)
          await getCurrentWindow().setTitle(title);
      })
      .catch((error) => console.error("Window title:", error));
}
function syncEditorSettings() {
  view.dispatch({
    effects: [
      numberConfig.reconfigure(prefs.numbers ? lineNumbers() : []),
      wrapConfig.reconfigure(prefs.wrap ? EditorView.lineWrapping : []),
      phrasesConfig.reconfigure(
        EditorState.phrases.of(editorPhrases(prefs.locale)),
      ),
      editableConfig.reconfigure(EditorView.editable.of(!!current())),
    ],
  });
  if (current()) current()!.state = view.state;
}
function activateDocument(id: string | null) {
  const previous = current();
  if (previous) {
    previous.state = view.state;
    previous.scrollTop = view.scrollDOM.scrollTop;
  }
  activeId = id;
  const doc = current();
  clearTimeout(renderTimer);
  view.setState(doc?.state || createState(""));
  syncEditorSettings();
  view.scrollDOM.scrollTop = doc?.scrollTop || 0;
  updateTabs();
  updatePreview();
  fileTree.setDocument(
    doc ? { id: doc.id, name: doc.name, path: doc.path, file: doc.file } : null,
  );
  searchDialog.documentChanged();
  saveDraft();
}
function addDocument(file: OpenedFile) {
  if (file.error) {
    toast(
      t(
        file.error === "file-too-large"
          ? "openedFileTooLarge"
          : file.error === "invalid-file"
            ? "openedFileInvalid"
            : "fileError",
      ),
    );
    return;
  }
  const sourceKey =
    file.path ||
    (file.root ? `browser-tree:${file.root}/${file.name}` : undefined);
  const active = current();
  const existing = sourceKey
    ? tabs.find(
        (doc) => doc.path === sourceKey || doc.sourceKey === sourceKey,
      ) ||
      (!file.path && file.root && active?.file && active.name === file.name
        ? active
        : undefined)
    : undefined;
  if (existing) {
    existing.sourceKey = sourceKey;
    if (file.file) existing.file = file.file;
    if (!existing.path) {
      existing.path = file.path;
      if (!existing.dirty && existing.state.doc.toString() !== file.text) {
        existing.state = createState(file.text);
        if (existing.id === activeId) view.setState(existing.state);
      }
    }
    activateDocument(existing.id);
    return;
  }
  const doc: TabDocument = {
    id: String(++nextId),
    name: file.name,
    path: file.path,
    file: file.file,
    sourceKey,
    state: createState(file.text),
    dirty: false,
    revision: 0,
    saving: false,
    scrollTop: 0,
  };
  tabs.push(doc);
  activateDocument(doc.id);
}
function newDocument() {
  const doc: TabDocument = {
    id: String(++nextId),
    name: t("newName"),
    path: null,
    state: createState(""),
    dirty: true,
    revision: 0,
    saving: false,
    scrollTop: 0,
  };
  tabs.push(doc);
  activateDocument(doc.id);
  view.focus();
}
function updateStatus() {
  const doc = current();
  const source = doc ? view.state.doc.toString() : "";
  document.querySelector("#stats")!.textContent = doc
    ? `${wordCount(source).toLocaleString(prefs.locale)} ${t("words")} · ${view.state.doc.lines} ${t("lines")}`
    : "";
  const pos = view.state.selection.main.head,
    line = view.state.doc.lineAt(pos);
  document.querySelector("#cursor")!.textContent = doc
    ? `Ln ${line.number}, Col ${pos - line.from + 1}`
    : "";
  const level = line.text.match(/^\s{0,3}(#{1,5})\s/)?.[1].length;
  (document.querySelector("#heading-level") as HTMLSelectElement).value = level
    ? String(level)
    : "";
}
function updatePreview() {
  const source = current() ? view.state.doc.toString() : "";
  document.querySelector("#preview")!.innerHTML = render(source, prefs.breaks);
  const hs = headings(source);
  document.querySelector(".outline")!.innerHTML = hs.length
    ? hs
        .map(
          (h, i) =>
            `<button data-heading="${i}" style="--depth:${h.level - 1}" title="${escape(h.text)}"><span class="outline-hash">${h.level === 1 ? "#" : "·"}</span>${escape(h.text)}</button>`,
        )
        .join("")
    : `<p class="empty-outline">${t("emptyOutline")}</p>`;
  updateStatus();
}
function applySidebar() {
  document.querySelector<HTMLElement>("#file-tree")!.hidden =
    prefs.side !== "files";
  document.querySelector<HTMLElement>("#outline-panel")!.hidden =
    prefs.side !== "outline";
  document.querySelectorAll<HTMLElement>("[data-side]").forEach((el) => {
    const selected = el.dataset.side === prefs.side;
    el.classList.toggle("selected", selected);
    el.setAttribute("aria-selected", String(selected));
  });
}
function applyPrefs() {
  document.documentElement.dataset.theme =
    prefs.theme === "dark" ||
    (prefs.theme === "system" &&
      matchMedia("(prefers-color-scheme: dark)").matches)
      ? "dark"
      : "light";
  document.documentElement.lang = prefs.locale;
  for (const [name, value] of [
    ["--preview-size", `${prefs.size}px`],
    ["--preview-line", String(prefs.lineHeight)],
    ["--preview-width", `${prefs.width}px`],
  ])
    document.documentElement.style.setProperty(name, value);
  document.querySelector("#preview")!.className = `type-${prefs.style}`;
  app.dataset.mode = prefs.mode;
  document
    .querySelectorAll<HTMLElement>("[data-i18n]")
    .forEach((el) => (el.textContent = t(el.dataset.i18n as Key)));
  document
    .querySelectorAll<HTMLElement>(".view-switch [data-mode]")
    .forEach((el) => {
      el.classList.toggle("selected", el.dataset.mode === prefs.mode);
      el.title = t(el.dataset.mode as Key);
      el.setAttribute("aria-label", el.title);
    });
  document.querySelectorAll<HTMLElement>("[data-format]").forEach((el) => {
    el.title = t(el.dataset.format as Key);
    el.setAttribute("aria-label", el.title);
  });
  document.querySelectorAll<HTMLElement>("[data-action]").forEach((el) => {
    const labels: Record<string, Key> = {
      new: "new",
      open: "open",
      save: "save",
      settings: "settings",
      find: "find",
      focus: "focus",
      fold: "collapse",
      unfold: "expand",
      sidebar: "files",
      "close-settings": "close",
    };
    if (labels[el.dataset.action!]) {
      el.title = t(labels[el.dataset.action!]);
      el.setAttribute("aria-label", el.title);
    }
  });
  for (const key of [
    "language",
    "theme",
    "style",
    "size",
    "lineHeight",
    "width",
    "numbers",
    "wrap",
    "breaks",
  ]) {
    const el = document.getElementById(key) as HTMLInputElement;
    const value = (prefs as any)[key === "language" ? "locale" : key];
    if (el.type === "checkbox") el.checked = value;
    else el.value = String(value);
    const output = document.getElementById(`${key}-value`);
    if (output) output.textContent = `${value}${el.dataset.unit || ""}`;
  }
  document.querySelector("#locale-label")!.textContent =
    prefs.locale.toUpperCase();
  document
    .querySelector("#heading-level")!
    .setAttribute("aria-label", t("heading"));
  syncEditorSettings();
  applySidebar();
  updateTabs();
  updatePreview();
  fileTree.refreshLabels();
  searchDialog.refresh();
  cheatsheet.refresh();
  shortcutSettings.refresh();
  persist();
}
function toast(message: string) {
  const el = document.querySelector("#toast")!;
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 4000);
}
async function openFile() {
  if (filePickerActive) return;
  filePickerActive = true;
  if (isNative()) {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const paths = await open({
        multiple: true,
        filters: [
          { name: "Markdown", extensions: ["md", "markdown", "mdown"] },
        ],
      });
      const selected = Array.isArray(paths)
        ? paths
        : typeof paths === "string"
          ? [paths]
          : [];
      const { readTextFile } = await import("@tauri-apps/plugin-fs");
      for (const path of selected) {
        const existing = tabs.find((doc) => doc.path === path);
        if (existing) {
          activateDocument(existing.id);
          continue;
        }
        try {
          addDocument({
            path,
            name: path.split(/[/\\]/).pop()!,
            text: await readTextFile(path),
          });
        } catch {
          toast(t("fileError"));
        }
      }
    } catch {
      toast(t("fileError"));
    } finally {
      filePickerActive = false;
    }
  } else (document.querySelector("#file-input") as HTMLInputElement).click();
}
async function saveFile(id = activeId, saveAs = false): Promise<boolean> {
  const doc = tabs.find((doc) => doc.id === id);
  if (!doc || saving) return false;
  saving = true;
  doc.saving = true;
  updateTabs();
  const text = doc.state.doc.toString(),
    revision = doc.revision;
  try {
    if (isNative()) {
      const { save } = await import("@tauri-apps/plugin-dialog");
      const path =
        (!saveAs && doc.path) ||
        (await save({
          defaultPath: doc.name,
          filters: [
            { name: "Markdown", extensions: ["md", "markdown", "mdown"] },
          ],
        }));
      if (!path) return false;
      if (
        tabs.some(
          (other) =>
            other.id !== doc.id &&
            (other.path === path || other.sourceKey === path),
        )
      ) {
        toast(t("saveConflict"));
        return false;
      }
      const { writeTextFile } = await import("@tauri-apps/plugin-fs");
      await writeTextFile(path, text);
      doc.path = path;
      doc.name = path.split(/[/\\]/).pop()!;
      doc.sourceKey = path;
      toast(t("savedFile"));
    } else {
      const url = URL.createObjectURL(
        new Blob([text], { type: "text/markdown;charset=utf-8" }),
      );
      const anchor = document.createElement("a");
      anchor.href = url;
      const name = saveAs ? window.prompt(t("saveAs"), doc.name) : doc.name;
      if (!name) {
        URL.revokeObjectURL(url);
        return false;
      }
      anchor.download = name;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast(t("downloaded"));
    }
    if (revision === doc.revision) doc.dirty = false;
    saveDraft();
    if (doc.id === activeId)
      fileTree.setDocument({
        id: doc.id,
        name: doc.name,
        path: doc.path,
        file: doc.file,
      });
    return !doc.dirty;
  } catch {
    toast(t("fileError"));
    return false;
  } finally {
    saving = false;
    doc.saving = false;
    updateTabs();
  }
}
const closeDialog = document.createElement("dialog");
closeDialog.id = "close-document";
closeDialog.innerHTML = `<h2 data-i18n="unsavedDocument"></h2><p class="close-document-name"></p><p data-i18n="closeUnsaved"></p><div><button data-close-choice="cancel" data-i18n="cancel"></button><button data-close-choice="discard" data-i18n="discardChanges"></button><button class="primary" data-close-choice="save" data-i18n="save"></button></div>`;
document.body.append(closeDialog);
let closePromptActive = false;
const tabContext = createTabContextMenu({
  container: document.querySelector<HTMLElement>("#tab-list")!,
  t: (key) => t(key as Key),
  getTabs: () => tabs.map((doc) => ({ id: doc.id, name: doc.name })),
  onClose: closeDocument,
  isBusy: () => closePromptActive || saving,
});
async function closeDocument(id: string): Promise<boolean> {
  const doc = tabs.find((doc) => doc.id === id);
  if (!doc) return true;
  if (doc.saving || closePromptActive) return false;
  if (doc.dirty) {
    closePromptActive = true;
    closeDialog.querySelector(".close-document-name")!.textContent = doc.name;
    closeDialog.showModal();
    const choice = await new Promise<string>((resolve) => {
      const finish = (choice: string) => {
        closeDialog.removeEventListener("click", click);
        closeDialog.removeEventListener("cancel", cancel);
        closeDialog.close();
        resolve(choice);
      };
      const click = (event: Event) => {
        const button = (event.target as HTMLElement).closest<HTMLElement>(
          "[data-close-choice]",
        );
        if (button) finish(button.dataset.closeChoice!);
      };
      const cancel = (event: Event) => {
        event.preventDefault();
        finish("cancel");
      };
      closeDialog.addEventListener("click", click);
      closeDialog.addEventListener("cancel", cancel);
    });
    closePromptActive = false;
    if (choice === "cancel") return false;
    if (choice === "save" && !(await saveFile(id))) return false;
  }
  const index = tabs.findIndex((tab) => tab.id === id);
  if (index < 0) return true;
  tabs.splice(index, 1);
  if (activeId === id) {
    activeId = null;
    activateDocument(tabs[Math.min(index, tabs.length - 1)]?.id || null);
  } else {
    updateTabs();
    saveDraft();
  }
  return true;
}
function format(kind: string, level = 1) {
  if (!current()) return;
  if (prefs.mode === "preview") {
    prefs.mode = "editor";
    applyPrefs();
  }
  const { from, to } = view.state.selection.main;
  if (["heading", "quote", "list"].includes(kind)) {
    const first = view.state.doc.lineAt(from).number,
      last = view.state.doc.lineAt(to > from ? to - 1 : to).number;
    const prefix =
      kind === "heading"
        ? `${"#".repeat(level)} `
        : kind === "quote"
          ? "> "
          : "- ";
    const pattern =
      kind === "heading"
        ? /^#{1,6}[ \t]+/
        : kind === "quote"
          ? /^>[ \t]?/
          : /^-[ \t]+/;
    const lines = Array.from({ length: last - first + 1 }, (_, i) =>
      view.state.doc.line(first + i),
    );
    const remove =
      kind !== "heading" && lines.every((line) => line.text.startsWith(prefix));
    const changes = view.state.changes(
      lines.map((line) => ({
        from: line.from,
        to: line.from + (line.text.match(pattern)?.[0].length || 0),
        insert: remove ? "" : prefix,
      })),
    );
    view.dispatch({ changes, selection: view.state.selection.map(changes) });
    view.focus();
    return;
  }
  if (kind === "table") {
    const line = view.state.doc.lineAt(from);
    const before = from > 0 ? "\n\n" : "";
    const text = `${before}| ${t("column")} 1 | ${t("column")} 2 | ${t("column")} 3 |\n| --- | --- | --- |\n|  |  |  |\n|  |  |  |\n`;
    view.dispatch({
      changes: { from, to, insert: text },
      selection: {
        anchor: from + before.length + 2,
        head: from + before.length + 2 + t("column").length + 2,
      },
    });
    view.focus();
    return;
  }
  const selected = view.state.sliceDoc(from, to);
  const formats: Record<string, [string, string, string]> = {
    bold: ["**", "**", "text"],
    italic: ["*", "*", "text"],
    link: ["[", "](https://example.com)", "link"],
    code: ["\n```\n", "\n```\n", "code"],
  };
  const [before, after, fallback] = formats[kind];
  const content = selected || fallback;
  view.dispatch({
    changes: { from, to, insert: before + content + after },
    selection: {
      anchor: from + before.length,
      head: from + before.length + content.length,
    },
  });
  view.focus();
}
app.addEventListener("click", async (event) => {
  const target = event.target as HTMLElement;
  const button = target.closest<HTMLElement>(
    "button[data-action],button[data-format],button[data-mode],button[data-heading],button[data-side],button[data-tab],button[data-close-tab]",
  );
  if (!button) return;
  if (button.dataset.tab) {
    activateDocument(button.dataset.tab);
    return;
  }
  if (button.dataset.closeTab) {
    void closeDocument(button.dataset.closeTab);
    return;
  }
  if (button.dataset.format) {
    format(button.dataset.format);
    return;
  }
  if (button.dataset.mode) {
    prefs.mode = button.dataset.mode as Prefs["mode"];
    applyPrefs();
    return;
  }
  if (button.dataset.side) {
    prefs.side = button.dataset.side as Prefs["side"];
    applySidebar();
    persist();
    return;
  }
  if (button.dataset.heading) {
    const index = Number(button.dataset.heading),
      h = headings(view.state.doc.toString())[index];
    if (h) {
      view.dispatch({
        selection: { anchor: h.from },
        effects: EditorView.scrollIntoView(h.from, { y: "start" }),
      });
      document
        .getElementById(`section-${index}`)
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
      app.classList.remove("sidebar-open");
    }
    return;
  }
  switch (button.dataset.action) {
    case "toggle-mode":
      void performAction("toggle-mode");
      break;
    case "cheatsheet":
      cheatsheet.open();
      break;
    case "new":
      newDocument();
      break;
    case "open":
      void openFile();
      break;
    case "save":
      void saveFile();
      break;
    case "settings":
      (document.querySelector("#settings") as HTMLDialogElement).showModal();
      break;
    case "close-settings":
      (document.querySelector("#settings") as HTMLDialogElement).close();
      break;
    case "set-default-app":
      await setDefaultApp(button as HTMLButtonElement);
      break;
    case "reset":
      prefs = { ...defaults, locale: prefs.locale, side: prefs.side };
      applyPrefs();
      break;
    case "find":
      if (current()) searchDialog.open(true);
      break;
    case "focus":
      app.classList.toggle("focus-mode");
      break;
    case "sidebar":
      app.classList.toggle("sidebar-open");
      break;
    case "fold":
      foldAll(view);
      break;
    case "unfold":
      unfoldAll(view);
      break;
  }
});
document
  .querySelector("#heading-level")!
  .addEventListener("change", (event) => {
    const value = Number((event.target as HTMLSelectElement).value);
    if (value >= 1 && value <= 5) format("heading", value);
  });
const updateSetting = (event: Event) => {
  const el = event.target as HTMLInputElement;
  const key = el.id === "language" ? "locale" : el.id;
  if (!(key in prefs)) return;
  if (event.type === "input" && el.type !== "range") return;
  (prefs as any)[key] =
    el.type === "checkbox"
      ? el.checked
      : el.type === "range"
        ? Number(el.value)
        : el.value;
  applyPrefs();
};
document.querySelector("#settings")!.addEventListener("input", updateSetting);
document.querySelector("#settings")!.addEventListener("change", updateSetting);
document
  .querySelector("#file-input")!
  .addEventListener("change", async (event) => {
    const input = event.target as HTMLInputElement,
      files = Array.from(input.files || []);
    input.value = "";
    filePickerActive = false;
    for (const file of files)
      try {
        addDocument({
          path: null,
          name: file.name,
          text: await file.text(),
          file,
        });
      } catch {
        toast(t("fileError"));
      }
  });
document.querySelector("#file-input")!.addEventListener("cancel", () => {
  filePickerActive = false;
});
document.querySelector("#preview")!.addEventListener("click", async (event) => {
  const anchor = (event.target as HTMLElement).closest("a");
  if (!anchor) return;
  const href = anchor.getAttribute("href") || "";
  if (href.startsWith("#")) {
    event.preventDefault();
    let id = "";
    try {
      id = decodeURIComponent(href.slice(1));
    } catch {
      return;
    }
    const hs = headings(view.state.doc.toString());
    const index = hs.findIndex(
      (h) => h.text.toLowerCase().replace(/\s+/g, "-") === id,
    );
    document
      .getElementById(index >= 0 ? `section-${index}` : id)
      ?.scrollIntoView({ behavior: "smooth" });
    return;
  }
  if (isNative()) {
    event.preventDefault();
    if (/^(https?:|mailto:)/i.test(href))
      try {
        const { openUrl } = await import("@tauri-apps/plugin-opener");
        await openUrl(href);
      } catch {
        toast(t("fileError"));
      }
  } else {
    anchor.target = "_blank";
    anchor.rel = "noopener noreferrer";
  }
});
window.addEventListener(
  "keydown",
  (event) => {
    if (nativeDesktop()) return;
    const action = shortcutSettings.handleKeydown(event);
    if (action) {
      event.preventDefault();
      event.stopImmediatePropagation();
      void performAction(action);
    }
  },
  true,
);
window.addEventListener("keydown", (event) => {
  if (event.defaultPrevented) return;
  if (nativeDesktop()) {
    if (event.key === "Escape")
      app.classList.remove("focus-mode", "sidebar-open");
    return;
  }
  const mod = event.metaKey || event.ctrlKey;
  if (mod) {
    const key = event.key.toLowerCase();
    const action =
      key === "s"
        ? event.shiftKey
          ? "save-as"
          : "save"
        : key === "o"
          ? "open"
          : key === "n"
            ? "new"
            : key === "w"
              ? "close-document"
              : key === "f"
                ? "find"
                : key === "h" && event.shiftKey
                  ? "replace"
                  : key === ","
                    ? "settings"
                    : null;
    if (action) {
      event.preventDefault();
      void performAction(action);
    }
  }
  if (event.key === "Escape")
    app.classList.remove("focus-mode", "sidebar-open");
});
window.addEventListener("beforeunload", (event) => {
  saveDraft();
  if (tabs.some((doc) => doc.dirty)) {
    event.preventDefault();
    event.returnValue = "";
  }
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden) saveDraft();
});
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
  if (prefs.theme === "system") applyPrefs();
});
async function setDefaultApp(button: HTMLButtonElement) {
  if (button.disabled) return;
  const status = document.querySelector<HTMLElement>("#association-status")!;
  button.disabled = true;
  button.textContent = t("defaultAppWorking");
  status.textContent = "";
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("set_default_markdown_app");
    status.textContent = t("defaultAppSuccess");
    status.dataset.result = "success";
  } catch (error) {
    const code = String(error);
    status.textContent = t(
      code.includes("install-first")
        ? "defaultAppInstallFirst"
        : code.includes("unsupported")
          ? "defaultAppUnsupported"
          : "defaultAppFailed",
    );
    status.dataset.result = "error";
  } finally {
    button.disabled = false;
    button.textContent = t("setDefaultApp");
  }
}
async function initializeNativeFiles() {
  try {
    const [{ listen }, { invoke }] = await Promise.all([
      import("@tauri-apps/api/event"),
      import("@tauri-apps/api/core"),
    ]);
    let draining = false,
      notified = false;
    const drain = async () => {
      notified = true;
      if (draining) return;
      draining = true;
      try {
        while (notified) {
          notified = false;
          const files = await invoke<OpenedFile[]>("take_opened_files");
          for (const file of files) addDocument(file);
        }
      } catch {
        toast(t("fileError"));
      } finally {
        draining = false;
      }
    };
    await listen<string>("app-menu", (event) => {
      void performAction(event.payload);
    });
    await listen("files-opened", () => {
      void drain();
    });
    await drain();
  } catch {
    toast(t("fileError"));
  }
}
restoreWorkspace();
const restoredActiveId = activeId;
activeId = null;
applyPrefs();
activateDocument(restoredActiveId);
if (isNative()) {
  if (/Mac/.test(navigator.platform))
    document.querySelector<HTMLElement>("#file-associations")!.hidden = false;
  void initializeNativeFiles();
}
async function performAction(action: string) {
  if (action === "toggle-mode") {
    if (current()) {
      prefs.mode = prefs.mode === "preview" ? "editor" : "preview";
      applyPrefs();
    }
    return;
  }
  if (action === "next-tab" || action === "previous-tab") {
    if (!tabs.length) return;
    const index = tabs.findIndex((doc) => doc.id === activeId);
    const delta = action === "next-tab" ? 1 : -1;
    activateDocument(tabs[(index + delta + tabs.length) % tabs.length].id);
    return;
  }
  if (action === "new") {
    newDocument();
    return;
  }
  if (action === "open") {
    await openFile();
    return;
  }
  if (action === "settings") {
    const dialog = document.querySelector<HTMLDialogElement>("#settings")!;
    if (!dialog.open) dialog.showModal();
    return;
  }
  if (action === "cheatsheet") {
    cheatsheet.open();
    return;
  }
  if (action === "focus") {
    app.classList.toggle("focus-mode");
    return;
  }
  if (action.startsWith("view-")) {
    const mode = action.slice(5);
    if (["editor", "split", "preview"].includes(mode)) {
      prefs.mode = mode as Prefs["mode"];
      applyPrefs();
    }
    return;
  }
  const doc = current();
  if (!doc) return;
  if (action === "save") {
    await saveFile();
    return;
  }
  if (action === "save-as") {
    await saveFile(activeId, true);
    return;
  }
  if (action === "close-document") {
    await closeDocument(doc.id);
    return;
  }
  if (action === "find" || action === "replace") {
    searchDialog.open(action === "replace");
    return;
  }
  if (action === "undo") {
    undo(view);
    view.focus();
    return;
  }
  if (action === "redo") {
    redo(view);
    view.focus();
    return;
  }
  if (action === "select-all") {
    selectAll(view);
    view.focus();
    return;
  }
  if (["cut", "copy", "paste"].includes(action)) {
    const { from, to } = view.state.selection.main,
      revision = doc.revision;
    try {
      if (action === "paste") {
        const text = await navigator.clipboard.readText();
        if (current() !== doc || doc.revision !== revision) return;
        view.dispatch({
          changes: { from, to, insert: text },
          selection: { anchor: from + text.length },
        });
      } else {
        await navigator.clipboard.writeText(view.state.sliceDoc(from, to));
        if (action === "cut" && current() === doc && doc.revision === revision)
          view.dispatch({
            changes: { from, to, insert: "" },
            selection: { anchor: from },
          });
      }
      view.focus();
    } catch {
      toast(t("clipboardUnavailable"));
    }
    return;
  }
  const heading = action.match(/^heading-([1-5])$/);
  if (heading) {
    format("heading", Number(heading[1]));
    return;
  }
  if (
    ["bold", "italic", "link", "quote", "code", "list", "table"].includes(
      action,
    )
  )
    format(action);
}
