use crate::{is_markdown, read_markdown, OpenedFile};
use serde::Serialize;
use std::{
    collections::HashSet,
    fs,
    path::{Path, PathBuf},
    sync::Mutex,
};
#[cfg(desktop)]
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_fs::FsExt;

const MAX_DIRECTORY_ENTRIES: usize = 5000;

// Only a native user selection can add an arbitrary folder to the tree's roots.
// No broad filesystem read/write scope is added: opening a Markdown file still
// validates root containment and grants write permission to that exact file only.
#[tauri::command]
pub(crate) async fn choose_markdown_directory(
    app: tauri::AppHandle,
    state: tauri::State<'_, MarkdownDirectories>,
) -> Result<Option<String>, String> {
    #[cfg(desktop)]
    {
        let selected = tauri::async_runtime::spawn_blocking(move || {
            app.dialog().file().blocking_pick_folder()
        })
        .await
        .map_err(|_| "open-failed")?;
        let Some(selected) = selected else {
            return Ok(None);
        };
        let root = selected.into_path().map_err(|_| "invalid-directory")?;
        let root = root.canonicalize().map_err(|_| "invalid-directory")?;
        if !root.is_dir() {
            return Err("invalid-directory".into());
        }
        state
            .0
            .lock()
            .map_err(|_| "open-failed")?
            .insert(root.clone());
        Ok(Some(root.to_string_lossy().into_owned()))
    }
    #[cfg(not(desktop))]
    {
        let _ = (app, state);
        Err("unsupported".into())
    }
}

#[cfg(desktop)]
struct WatchedRoot {
    watcher: notify::RecommendedWatcher,
    paths: HashSet<PathBuf>,
}

#[derive(Default)]
pub(crate) struct DirectoryWatches {
    #[cfg(desktop)]
    roots: Mutex<std::collections::HashMap<PathBuf, WatchedRoot>>,
}

// Watch only the root and expanded directories, non-recursively. Authorization and
// canonical containment are checked for every path before it reaches the backend.
#[tauri::command]
pub(crate) fn watch_markdown_directories(
    app: tauri::AppHandle,
    state: tauri::State<'_, MarkdownDirectories>,
    watches: tauri::State<'_, DirectoryWatches>,
    root: String,
    paths: Vec<String>,
) -> Result<(), String> {
    #[cfg(desktop)]
    {
        use notify::{RecursiveMode, Watcher};
        use std::sync::mpsc::{channel, RecvTimeoutError};
        use std::time::{Duration, Instant};
        use tauri::Emitter;
        let requested_root = PathBuf::from(&root);
        // Exact previously-authorized identity allows stopping a removed root even
        // when its directory has since been deleted from disk.
        let roots = state.0.lock().map_err(|_| "open-failed")?;
        let canonical_root = if roots.contains(&requested_root) {
            requested_root
        } else {
            requested_root
                .canonicalize()
                .map_err(|_| "invalid-directory")?
        };
        if !roots.contains(&canonical_root) {
            return Err("directory-not-authorized".into());
        }
        if paths.len() > 512 {
            return Err("directory-too-large".into());
        }
        let mut desired = HashSet::new();
        for path in paths {
            let (_, path) = checked_directory(&roots, &canonical_root, Path::new(&path))?;
            if !path.is_dir() {
                return Err("invalid-directory".into());
            }
            desired.insert(path);
        }
        drop(roots);
        let mut watched = watches.roots.lock().map_err(|_| "open-failed")?;
        if desired.is_empty() {
            watched.remove(&canonical_root);
            return Ok(());
        }
        if !watched.contains_key(&canonical_root) {
            let (tx, rx) = channel::<()>();
            let watcher =
                notify::recommended_watcher(move |result: notify::Result<notify::Event>| {
                    if result
                        .map(|event| !matches!(event.kind, notify::EventKind::Access(_)))
                        .unwrap_or(true)
                    {
                        let _ = tx.send(());
                    }
                })
                .map_err(|_| "watch-failed")?;
            let event_root = canonical_root.to_string_lossy().into_owned();
            std::thread::spawn(move || {
                while rx.recv().is_ok() {
                    let started = Instant::now();
                    loop {
                        match rx.recv_timeout(Duration::from_millis(250)) {
                            Ok(_) if started.elapsed() < Duration::from_secs(1) => continue,
                            Err(RecvTimeoutError::Disconnected) => return,
                            _ => break,
                        }
                    }
                    let _ = app.emit(
                        "markdown-directory-changed",
                        serde_json::json!({"root": event_root}),
                    );
                }
            });
            watched.insert(
                canonical_root.clone(),
                WatchedRoot {
                    watcher,
                    paths: HashSet::new(),
                },
            );
        }
        let entry = watched.get_mut(&canonical_root).ok_or("watch-failed")?;
        let removed: Vec<_> = entry.paths.difference(&desired).cloned().collect();
        for path in removed {
            let _ = entry.watcher.unwatch(&path);
            entry.paths.remove(&path);
        }
        let added: Vec<_> = desired.difference(&entry.paths).cloned().collect();
        for path in added {
            entry
                .watcher
                .watch(&path, RecursiveMode::NonRecursive)
                .map_err(|_| "watch-failed")?;
            entry.paths.insert(path);
        }
        Ok(())
    }
    #[cfg(not(desktop))]
    {
        let _ = (app, state, watches, root, paths);
        Err("unsupported".into())
    }
}

#[derive(Default)]
pub(crate) struct MarkdownDirectories(Mutex<HashSet<PathBuf>>);

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DirectoryEntry {
    name: String,
    path: String,
    is_directory: bool,
}

fn canonical_file_parent(path: &Path) -> Result<(PathBuf, PathBuf), &'static str> {
    if !is_markdown(path) {
        return Err("invalid-file");
    }
    let canonical = path.canonicalize().map_err(|_| "open-failed")?;
    if !canonical.is_file() || !is_markdown(&canonical) {
        return Err("invalid-file");
    }
    let parent = canonical.parent().ok_or("invalid-directory")?.to_path_buf();
    Ok((canonical, parent))
}

fn checked_directory(
    roots: &HashSet<PathBuf>,
    root: &Path,
    path: &Path,
) -> Result<(PathBuf, PathBuf), &'static str> {
    let root = root.canonicalize().map_err(|_| "invalid-directory")?;
    if !roots.contains(&root) {
        return Err("directory-not-authorized");
    }
    let path = path.canonicalize().map_err(|_| "invalid-directory")?;
    if !path.starts_with(&root) {
        return Err("outside-folder");
    }
    Ok((root, path))
}

fn directory_entries(root: &Path, directory: &Path) -> Result<Vec<DirectoryEntry>, &'static str> {
    if !directory.is_dir() || !directory.starts_with(root) {
        return Err("invalid-directory");
    }
    let mut result = Vec::new();
    let entries = fs::read_dir(directory).map_err(|_| "open-failed")?;
    for entry in entries {
        let entry = entry.map_err(|_| "open-failed")?;
        let name = entry.file_name().to_string_lossy().into_owned();
        // Hidden metadata folders and symlinks are not navigation roots.
        if name.starts_with('.') {
            continue;
        }
        let kind = entry.file_type().map_err(|_| "open-failed")?;
        if kind.is_symlink() {
            continue;
        }
        let is_directory = kind.is_dir();
        if !is_directory && (!kind.is_file() || !is_markdown(&entry.path())) {
            continue;
        }
        let path = entry.path().canonicalize().map_err(|_| "open-failed")?;
        if !path.starts_with(root) {
            continue;
        }
        result.push(DirectoryEntry {
            name,
            path: path.to_string_lossy().into_owned(),
            is_directory,
        });
        if result.len() > MAX_DIRECTORY_ENTRIES {
            return Err("directory-too-large");
        }
    }
    result.sort_by(|a, b| {
        b.is_directory
            .cmp(&a.is_directory)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
            .then_with(|| a.name.cmp(&b.name))
    });
    Ok(result)
}

#[tauri::command]
pub(crate) fn authorize_directory_for_file(
    app: tauri::AppHandle,
    state: tauri::State<'_, MarkdownDirectories>,
    path: String,
) -> Result<String, String> {
    let (canonical, root) = canonical_file_parent(Path::new(&path))?;
    // A file must already have been selected in a native dialog, saved via a dialog,
    // or delivered by an OS open event. Do not widen the plugin's filesystem scope.
    if !app.fs_scope().is_allowed(&canonical) {
        return Err("directory-not-authorized".into());
    }
    state
        .0
        .lock()
        .map_err(|_| "open-failed")?
        .insert(root.clone());
    Ok(root.to_string_lossy().into_owned())
}

#[tauri::command]
pub(crate) fn list_markdown_directory(
    state: tauri::State<'_, MarkdownDirectories>,
    root: String,
    path: Option<String>,
) -> Result<Vec<DirectoryEntry>, String> {
    let roots = state.0.lock().map_err(|_| "open-failed")?;
    let requested = path.as_deref().unwrap_or(&root);
    let (root, directory) = checked_directory(&roots, Path::new(&root), Path::new(requested))?;
    drop(roots);
    directory_entries(&root, &directory).map_err(str::to_owned)
}

#[tauri::command]
pub(crate) fn read_markdown_tree_file(
    app: tauri::AppHandle,
    state: tauri::State<'_, MarkdownDirectories>,
    root: String,
    path: String,
) -> Result<OpenedFile, String> {
    let roots = state.0.lock().map_err(|_| "open-failed")?;
    let (root, canonical) = checked_directory(&roots, Path::new(&root), Path::new(&path))?;
    drop(roots);
    let mut result = OpenedFile {
        path: canonical.to_string_lossy().into_owned(),
        name: canonical
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .into_owned(),
        text: String::new(),
        error: None,
    };
    match read_markdown(&canonical) {
        Ok((actual, text)) if actual.starts_with(&root) => {
            if app.fs_scope().allow_file(&actual).is_err() {
                result.error = Some("open-failed".into());
            } else {
                result.path = actual.to_string_lossy().into_owned();
                result.text = text;
            }
        }
        Ok(_) => result.error = Some("outside-folder".into()),
        Err(error) => result.error = Some(error.into()),
    }
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;
    struct Fixture(PathBuf);
    impl Fixture {
        fn new() -> Self {
            let path = std::env::temp_dir().join(format!(
                "mark1light-folders-{}-{}",
                std::process::id(),
                std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap()
                    .as_nanos()
            ));
            fs::create_dir_all(&path).unwrap();
            Self(path.canonicalize().unwrap())
        }
    }
    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }
    #[cfg(desktop)]
    #[test]
    fn native_watcher_reports_file_create_rename_and_remove() {
        use notify::{RecursiveMode, Watcher};
        use std::sync::mpsc;
        use std::time::{Duration, Instant};
        let fixture = Fixture::new();
        let (tx, rx) = mpsc::channel();
        let mut watcher =
            notify::recommended_watcher(move |event: notify::Result<notify::Event>| {
                if let Ok(event) = event {
                    let _ = tx.send(event);
                }
            })
            .unwrap();
        watcher
            .watch(&fixture.0, RecursiveMode::NonRecursive)
            .unwrap();
        let wait_for = |expected: &Path| {
            let deadline = Instant::now() + Duration::from_secs(8);
            while Instant::now() < deadline {
                if let Ok(event) = rx.recv_timeout(Duration::from_millis(250)) {
                    if event.paths.iter().any(|path| path == expected) {
                        return;
                    }
                }
            }
            panic!("No native filesystem event for {}", expected.display());
        };
        let first = fixture.0.join("created.md");
        fs::write(&first, "# created").unwrap();
        wait_for(&first);
        let renamed = fixture.0.join("renamed.md");
        fs::rename(&first, &renamed).unwrap();
        wait_for(&renamed);
        // Drain rename notifications before validating deletion.
        while rx.try_recv().is_ok() {}
        fs::remove_file(&renamed).unwrap();
        wait_for(&renamed);
        watcher.unwatch(&fixture.0).unwrap();
    }

    #[test]
    fn lists_only_markdown_files_and_directories_in_sorted_order() {
        let fixture = Fixture::new();
        for name in ["z.md", "A.markdown", "b.MDOWN", "ignored.txt", ".hidden.md"] {
            fs::write(fixture.0.join(name), "# content").unwrap();
        }
        fs::create_dir(fixture.0.join("notes")).unwrap();
        let entries = directory_entries(&fixture.0, &fixture.0).unwrap();
        assert_eq!(
            entries.iter().map(|e| e.name.as_str()).collect::<Vec<_>>(),
            vec!["notes", "A.markdown", "b.MDOWN", "z.md"]
        );
        assert!(entries[0].is_directory);
    }
    #[test]
    fn cannot_access_unregistered_roots_or_parent_traversal() {
        let fixture = Fixture::new();
        let outside = Fixture::new();
        let roots = HashSet::from([fixture.0.clone()]);
        assert!(checked_directory(&roots, &fixture.0, &fixture.0).is_ok());
        assert!(checked_directory(&roots, &outside.0, &outside.0).is_err());
        assert!(checked_directory(&roots, &fixture.0, &outside.0).is_err());
        assert!(checked_directory(&roots, &fixture.0, &fixture.0.join("..")).is_err());
    }
    #[test]
    fn only_existing_markdown_files_can_authorize_their_parent() {
        let fixture = Fixture::new();
        fs::write(fixture.0.join("note.md"), "# note").unwrap();
        fs::write(fixture.0.join("note.txt"), "note").unwrap();
        assert_eq!(
            canonical_file_parent(&fixture.0.join("note.md")).unwrap().1,
            fixture.0
        );
        assert!(canonical_file_parent(&fixture.0.join("note.txt")).is_err());
        assert!(canonical_file_parent(&fixture.0.join("missing.md")).is_err());
        assert!(canonical_file_parent(&fixture.0).is_err());
    }
    #[cfg(unix)]
    #[test]
    fn symlinks_cannot_escape_the_authorized_tree() {
        use std::os::unix::fs::symlink;
        let fixture = Fixture::new();
        let outside = Fixture::new();
        fs::write(outside.0.join("private.md"), "private").unwrap();
        symlink(&outside.0, fixture.0.join("outside")).unwrap();
        symlink(outside.0.join("private.md"), fixture.0.join("link.md")).unwrap();
        let roots = HashSet::from([fixture.0.clone()]);
        assert!(directory_entries(&fixture.0, &fixture.0)
            .unwrap()
            .is_empty());
        assert!(
            checked_directory(&roots, &fixture.0, &fixture.0.join("outside/private.md")).is_err()
        );
        assert!(checked_directory(&roots, &fixture.0, &fixture.0.join("link.md")).is_err());
    }
}
