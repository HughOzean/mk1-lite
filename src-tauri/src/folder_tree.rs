use crate::{is_markdown, read_markdown, OpenedFile};
use serde::Serialize;
use std::{
    collections::HashSet,
    fs,
    path::{Path, PathBuf},
    sync::Mutex,
};
use tauri_plugin_fs::FsExt;

const MAX_DIRECTORY_ENTRIES: usize = 5000;

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
