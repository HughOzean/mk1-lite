mod app_menu;
mod folder_tree;

use serde::Serialize;
use std::{
    collections::VecDeque,
    fs::File,
    io::Read,
    path::{Path, PathBuf},
    sync::Mutex,
};
use tauri::{Emitter, Manager};
use tauri_plugin_fs::FsExt;

const MAX_OPEN_FILE_BYTES: u64 = 20 * 1024 * 1024;

#[derive(Default)]
struct OpenFileQueue(Mutex<VecDeque<PathBuf>>);

#[derive(Serialize)]
struct OpenedFile {
    path: String,
    name: String,
    text: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

fn is_markdown(path: &Path) -> bool {
    path.extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| {
            matches!(
                ext.to_ascii_lowercase().as_str(),
                "md" | "markdown" | "mdown"
            )
        })
        .unwrap_or(false)
}

// Explorer and the single-instance callback supply argv with the executable first.
// Keep this parser OS-independent in tests; authorization and UTF-8/size validation
// remain in the existing OS-open queue reader.
#[cfg(any(target_os = "windows", test))]
fn markdown_argument_paths(
    args: impl IntoIterator<Item = std::ffi::OsString>,
    cwd: &Path,
) -> Vec<PathBuf> {
    args.into_iter()
        .skip(1)
        .filter_map(|argument| {
            if argument.to_string_lossy().starts_with('-') {
                return None;
            }
            let path = PathBuf::from(argument);
            if !is_markdown(&path) {
                return None;
            }
            Some(if path.is_absolute() {
                path
            } else {
                cwd.join(path)
            })
        })
        .collect()
}

fn read_markdown(path: &Path) -> Result<(PathBuf, String), &'static str> {
    if !is_markdown(path) {
        return Err("invalid-file");
    }
    let path = path.canonicalize().map_err(|_| "open-failed")?;
    if !is_markdown(&path) {
        return Err("invalid-file");
    }
    let file = File::open(&path).map_err(|_| "open-failed")?;
    let metadata = file.metadata().map_err(|_| "open-failed")?;
    if !metadata.is_file() {
        return Err("invalid-file");
    }
    if metadata.len() > MAX_OPEN_FILE_BYTES {
        return Err("file-too-large");
    }
    let mut bytes = Vec::new();
    file.take(MAX_OPEN_FILE_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| "open-failed")?;
    if bytes.len() as u64 > MAX_OPEN_FILE_BYTES {
        return Err("file-too-large");
    }
    let text = String::from_utf8(bytes).map_err(|_| "open-failed")?;
    Ok((
        path,
        text.strip_prefix('\u{feff}').unwrap_or(&text).to_owned(),
    ))
}

fn queue_opened_files(app: &tauri::AppHandle, files: impl IntoIterator<Item = PathBuf>) {
    let state = app.state::<OpenFileQueue>();
    if let Ok(mut pending) = state.0.lock() {
        pending.extend(files);
    }
    // Notification is only a wake-up signal. The queue survives until the frontend drains it.
    let _ = app.emit("files-opened", ());
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
    }
}

#[tauri::command]
fn take_opened_files(
    app: tauri::AppHandle,
    state: tauri::State<'_, OpenFileQueue>,
) -> Vec<OpenedFile> {
    let files = match state.0.lock() {
        Ok(mut pending) => pending.drain(..).collect::<Vec<_>>(),
        Err(_) => return vec![],
    };
    files
        .into_iter()
        .map(|path| {
            let mut result = OpenedFile {
                path: path.to_string_lossy().into_owned(),
                name: path
                    .file_name()
                    .unwrap_or_default()
                    .to_string_lossy()
                    .into_owned(),
                text: String::new(),
                error: None,
            };
            match read_markdown(&path) {
                Ok((canonical, text)) => {
                    // Only the exact OS-opened file is authorized, so normal Save can write it back.
                    if app.fs_scope().allow_file(&canonical).is_err() {
                        result.error = Some("open-failed".into());
                    } else {
                        result.path = canonical.to_string_lossy().into_owned();
                        result.name = canonical
                            .file_name()
                            .unwrap_or_default()
                            .to_string_lossy()
                            .into_owned();
                        result.text = text;
                    }
                }
                Err(error) => result.error = Some(error.into()),
            }
            result
        })
        .collect()
}

#[tauri::command]
fn set_default_markdown_app(app: tauri::AppHandle) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        macos_default::set_default(&app.config().identifier)
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = app;
        Err("unsupported".into())
    }
}

#[cfg(target_os = "macos")]
mod macos_default {
    use core_foundation::{
        base::TCFType,
        string::{CFString, CFStringRef},
        url::{CFURLRef, CFURL},
    };
    use std::{
        collections::HashSet,
        path::{Path, PathBuf},
    };

    #[link(name = "CoreServices", kind = "framework")]
    extern "C" {
        fn LSRegisterURL(url: CFURLRef, update: u8) -> i32;
        fn LSSetDefaultRoleHandlerForContentType(
            content_type: CFStringRef,
            role: u32,
            handler: CFStringRef,
        ) -> i32;
        fn UTTypeCreatePreferredIdentifierForTag(
            tag_class: CFStringRef,
            tag: CFStringRef,
            conforms: CFStringRef,
        ) -> CFStringRef;
        fn LSCopyDefaultRoleHandlerForContentType(
            content_type: CFStringRef,
            role: u32,
        ) -> CFStringRef;
    }

    pub(super) fn installed_bundle(executable: &Path, home: Option<&Path>) -> Option<PathBuf> {
        let bundle = executable
            .ancestors()
            .find(|path| path.extension().is_some_and(|ext| ext == "app"))?;
        let user_apps = home.map(|path| path.join("Applications"));
        if bundle.starts_with("/Applications")
            || user_apps
                .as_ref()
                .is_some_and(|apps| bundle.starts_with(apps))
        {
            Some(bundle.to_owned())
        } else {
            None
        }
    }

    // Never set a broad public text/data type: that could take over unrelated file extensions.
    fn markdown_uti(identifier: &str) -> bool {
        identifier == "net.daringfireball.markdown"
            || (!identifier.starts_with("public.")
                && !identifier.starts_with("dyn.")
                && identifier.to_ascii_lowercase().contains("markdown"))
    }

    pub(super) fn set_default(identifier: &str) -> Result<(), String> {
        let executable = std::env::current_exe()
            .and_then(|path| path.canonicalize())
            .map_err(|_| "install-first")?;
        let home = std::env::var_os("HOME").map(PathBuf::from);
        let bundle = installed_bundle(&executable, home.as_deref()).ok_or("install-first")?;
        let url = CFURL::from_path(&bundle, true).ok_or("default-failed")?;
        let handler = CFString::new(identifier);
        let tag_class = CFString::new("public.filename-extension");
        let mut types = HashSet::from(["net.daringfireball.markdown".to_owned()]);
        // Registration must happen first so our imported Markdown declaration is visible to LaunchServices.
        if unsafe { LSRegisterURL(url.as_concrete_TypeRef(), 1) } != 0 {
            return Err("default-failed".into());
        }
        for extension in ["md", "markdown", "mdown"] {
            let tag = CFString::new(extension);
            let raw = unsafe {
                UTTypeCreatePreferredIdentifierForTag(
                    tag_class.as_concrete_TypeRef(),
                    tag.as_concrete_TypeRef(),
                    std::ptr::null(),
                )
            };
            if raw.is_null() {
                return Err("default-failed".into());
            }
            let uti: CFString = unsafe { TCFType::wrap_under_create_rule(raw) };
            let value = uti.to_string();
            if !markdown_uti(&value) {
                return Err("default-failed".into());
            }
            types.insert(value);
        }
        for value in types {
            let uti = CFString::new(&value);
            let status = unsafe {
                LSSetDefaultRoleHandlerForContentType(
                    uti.as_concrete_TypeRef(),
                    u32::MAX,
                    handler.as_concrete_TypeRef(),
                )
            };
            if status != 0 {
                return Err("default-failed".into());
            }
            let raw = unsafe {
                LSCopyDefaultRoleHandlerForContentType(uti.as_concrete_TypeRef(), u32::MAX)
            };
            if raw.is_null() {
                return Err("default-failed".into());
            }
            let actual: CFString = unsafe { TCFType::wrap_under_create_rule(raw) };
            if actual.to_string() != identifier {
                return Err("default-failed".into());
            }
        }
        Ok(())
    }

    #[cfg(test)]
    mod tests {
        use super::*;
        #[test]
        fn only_installed_bundles_can_become_default() {
            assert!(installed_bundle(
                Path::new("/Applications/Mark1Light.app/Contents/MacOS/mark1light"),
                None
            )
            .is_some());
            assert!(installed_bundle(
                Path::new("/Users/me/Applications/Mark1Light.app/Contents/MacOS/mark1light"),
                Some(Path::new("/Users/me"))
            )
            .is_some());
            for path in [
                "/Volumes/Mark1Light/Mark1Light.app/Contents/MacOS/mark1light",
                "/tmp/build/Mark1Light.app/Contents/MacOS/mark1light",
                "/ApplicationsFake/Mark1Light.app/Contents/MacOS/mark1light",
            ] {
                assert!(installed_bundle(Path::new(path), None).is_none());
            }
        }
        #[test]
        fn generic_types_cannot_become_markdown_defaults() {
            for identifier in [
                "public.text",
                "public.plain-text",
                "public.data",
                "public.item",
                "public.source-code",
                "dyn.fake",
                "com.example.text",
            ] {
                assert!(!markdown_uti(identifier));
            }
            assert!(markdown_uti("net.daringfireball.markdown"));
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default();
    // Register this before other plugins so a second Windows process forwards its
    // Explorer arguments to the existing instance instead of creating a new session.
    #[cfg(target_os = "windows")]
    let builder = builder.plugin(tauri_plugin_single_instance::init(|app, args, cwd| {
        let files = markdown_argument_paths(
            args.into_iter().map(std::ffi::OsString::from),
            Path::new(&cwd),
        );
        queue_opened_files(app, files);
    }));
    let builder = builder
        .manage(OpenFileQueue::default())
        .manage(folder_tree::MarkdownDirectories::default())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            take_opened_files,
            set_default_markdown_app,
            folder_tree::authorize_directory_for_file,
            folder_tree::list_markdown_directory,
            folder_tree::read_markdown_tree_file,
            app_menu::update_app_menu
        ]);
    #[cfg(desktop)]
    let builder = builder
        .setup(|app| {
            app_menu::install(app.handle(), "zh", false)?;
            #[cfg(target_os = "windows")]
            {
                let cwd = std::env::current_dir()?;
                queue_opened_files(
                    app.handle(),
                    markdown_argument_paths(std::env::args_os(), &cwd),
                );
            }
            Ok(())
        })
        .on_menu_event(|app, event| {
            let action = event.id().as_ref();
            if app_menu::ACTIONS.contains(&action) {
                let _ = app.emit("app-menu", action);
            }
        });
    let app = builder
        .build(tauri::generate_context!())
        .expect("Failed to start Mk.1 Lite");
    app.run(|app, event| {
        #[cfg(any(target_os = "macos", target_os = "ios", target_os = "android"))]
        if let tauri::RunEvent::Opened { urls } = event {
            queue_opened_files(
                app,
                urls.into_iter().filter_map(|url| url.to_file_path().ok()),
            );
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn markdown_extensions_are_narrow_and_case_insensitive() {
        for name in ["hello.md", "hello.MD", "hello.markdown", "hello.mdown"] {
            assert!(is_markdown(Path::new(name)));
        }
        for name in [
            "hello.txt",
            "hello.html",
            "hello.md.exe",
            "README",
            "markdown",
        ] {
            assert!(!is_markdown(Path::new(name)));
        }
    }
    #[test]
    fn explorer_arguments_keep_only_markdown_and_resolve_callback_cwd() {
        let cwd = std::env::temp_dir().join("mk1-lite-argument-test");
        let absolute = cwd.join("absolute.MD");
        let args = vec![
            std::ffi::OsString::from("mark1light.exe"),
            std::ffi::OsString::from("relative notes.md"),
            absolute.clone().into_os_string(),
            std::ffi::OsString::from("子目录/中文.markdown"),
            std::ffi::OsString::from("--ignored.md"),
            std::ffi::OsString::from("other.txt"),
            std::ffi::OsString::from("binary.md.exe"),
        ];
        assert_eq!(
            markdown_argument_paths(args, &cwd),
            vec![
                cwd.join("relative notes.md"),
                absolute,
                cwd.join("子目录/中文.markdown")
            ]
        );
    }
    #[test]
    fn explorer_parser_ignores_the_executable_and_empty_launches() {
        let cwd = std::env::temp_dir();
        assert!(markdown_argument_paths(
            [std::ffi::OsString::from("accidental-program-name.md")],
            &cwd
        )
        .is_empty());
        assert!(markdown_argument_paths(Vec::<std::ffi::OsString>::new(), &cwd).is_empty());
    }
    #[test]
    fn queued_requests_survive_until_drained() {
        let queue = OpenFileQueue::default();
        queue
            .0
            .lock()
            .unwrap()
            .extend([PathBuf::from("one.md"), PathBuf::from("two.md")]);
        assert_eq!(queue.0.lock().unwrap().len(), 2);
        let files = queue.0.lock().unwrap().drain(..).collect::<Vec<_>>();
        assert_eq!(
            files,
            vec![PathBuf::from("one.md"), PathBuf::from("two.md")]
        );
        assert!(queue.0.lock().unwrap().is_empty());
    }
}
