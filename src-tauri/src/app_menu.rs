//! Desktop application menu. Custom commands cross the existing frontend event bridge.
#[cfg(desktop)]
use muda::accelerator::{Accelerator, Modifiers};
use std::collections::HashMap;
#[cfg(desktop)]
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem, Submenu},
    AppHandle, Wry,
};

const KEYS: &[&str] = &[
    "about",
    "settings",
    "hide",
    "hide-others",
    "show-all",
    "quit",
    "file",
    "new",
    "open",
    "save",
    "save-as",
    "close-document",
    "edit",
    "undo",
    "redo",
    "cut",
    "copy",
    "paste",
    "select-all",
    "find",
    "replace",
    "format",
    "bold",
    "italic",
    "link",
    "quote",
    "code",
    "list",
    "table",
    "view",
    "view-editor",
    "view-split",
    "view-preview",
    "focus",
    "window",
    "minimize",
    "fullscreen",
    "help",
    "cheatsheet",
    "toggle-mode",
    "next-tab",
    "previous-tab",
];
const LABELS: [&[&str]; 6] = [
    &[
        "关于 Mk.1 Lite",
        "设置…",
        "隐藏 Mk.1 Lite",
        "隐藏其他",
        "全部显示",
        "退出 Mk.1 Lite",
        "文件",
        "新建文档",
        "打开…",
        "保存",
        "另存为…",
        "关闭文档",
        "编辑",
        "撤销",
        "重做",
        "剪切",
        "复制",
        "粘贴",
        "全选",
        "搜索…",
        "替换…",
        "格式",
        "加粗",
        "斜体",
        "链接",
        "引用",
        "代码块",
        "列表",
        "表格",
        "视图",
        "编辑",
        "双栏",
        "预览",
        "专注模式",
        "窗口",
        "最小化",
        "进入全屏",
        "帮助",
        "Markdown语法表",
        "切换编辑 / 预览",
        "下一个文档",
        "上一个文档",
    ],
    &[
        "About Mk.1 Lite",
        "Settings…",
        "Hide Mk.1 Lite",
        "Hide Others",
        "Show All",
        "Quit Mk.1 Lite",
        "File",
        "New Document",
        "Open…",
        "Save",
        "Save As…",
        "Close Document",
        "Edit",
        "Undo",
        "Redo",
        "Cut",
        "Copy",
        "Paste",
        "Select All",
        "Find…",
        "Replace…",
        "Format",
        "Bold",
        "Italic",
        "Link",
        "Blockquote",
        "Code Block",
        "List",
        "Table",
        "View",
        "Editor",
        "Split View",
        "Preview",
        "Focus Mode",
        "Window",
        "Minimize",
        "Enter Full Screen",
        "Help",
        "Markdown cheatsheet",
        "Toggle Editor / Preview",
        "Next Document",
        "Previous Document",
    ],
    &[
        "Sobre Mk.1 Lite",
        "Configurações…",
        "Ocultar Mk.1 Lite",
        "Ocultar Outros",
        "Mostrar Tudo",
        "Sair do Mk.1 Lite",
        "Arquivo",
        "Novo Documento",
        "Abrir…",
        "Salvar",
        "Salvar Como…",
        "Fechar Documento",
        "Editar",
        "Desfazer",
        "Refazer",
        "Recortar",
        "Copiar",
        "Colar",
        "Selecionar Tudo",
        "Buscar…",
        "Substituir…",
        "Formato",
        "Negrito",
        "Itálico",
        "Link",
        "Citação",
        "Bloco de Código",
        "Lista",
        "Tabela",
        "Exibir",
        "Editor",
        "Dividir",
        "Prévia",
        "Modo Foco",
        "Janela",
        "Minimizar",
        "Tela Cheia",
        "Ajuda",
        "Markdown cheatsheet",
        "Alternar Editor / Prévia",
        "Próximo documento",
        "Documento anterior",
    ],
    &[
        "À propos de Mk.1 Lite",
        "Réglages…",
        "Masquer Mk.1 Lite",
        "Masquer les autres",
        "Tout afficher",
        "Quitter Mk.1 Lite",
        "Fichier",
        "Nouveau document",
        "Ouvrir…",
        "Enregistrer",
        "Enregistrer sous…",
        "Fermer le document",
        "Édition",
        "Annuler",
        "Rétablir",
        "Couper",
        "Copier",
        "Coller",
        "Tout sélectionner",
        "Rechercher…",
        "Remplacer…",
        "Format",
        "Gras",
        "Italique",
        "Lien",
        "Citation",
        "Bloc de code",
        "Liste",
        "Tableau",
        "Présentation",
        "Éditeur",
        "Vue partagée",
        "Aperçu",
        "Mode concentration",
        "Fenêtre",
        "Réduire",
        "Plein écran",
        "Aide",
        "Markdown cheatsheet",
        "Basculer Éditeur / Aperçu",
        "Document suivant",
        "Document précédent",
    ],
    &[
        "Über Mk.1 Lite",
        "Einstellungen…",
        "Mk.1 Lite ausblenden",
        "Andere ausblenden",
        "Alle einblenden",
        "Mk.1 Lite beenden",
        "Datei",
        "Neues Dokument",
        "Öffnen…",
        "Speichern",
        "Speichern unter…",
        "Dokument schließen",
        "Bearbeiten",
        "Rückgängig",
        "Wiederholen",
        "Ausschneiden",
        "Kopieren",
        "Einfügen",
        "Alles auswählen",
        "Suchen…",
        "Ersetzen…",
        "Format",
        "Fett",
        "Kursiv",
        "Link",
        "Zitat",
        "Codeblock",
        "Liste",
        "Tabelle",
        "Ansicht",
        "Editor",
        "Geteilte Ansicht",
        "Vorschau",
        "Fokusmodus",
        "Fenster",
        "Minimieren",
        "Vollbild",
        "Hilfe",
        "Markdown cheatsheet",
        "Editor / Vorschau umschalten",
        "Nächstes Dokument",
        "Vorheriges Dokument",
    ],
    &[
        "О Mk.1 Lite",
        "Настройки…",
        "Скрыть Mk.1 Lite",
        "Скрыть остальные",
        "Показать все",
        "Завершить Mk.1 Lite",
        "Файл",
        "Новый документ",
        "Открыть…",
        "Сохранить",
        "Сохранить как…",
        "Закрыть документ",
        "Правка",
        "Отменить",
        "Повторить",
        "Вырезать",
        "Копировать",
        "Вставить",
        "Выбрать всё",
        "Найти…",
        "Заменить…",
        "Формат",
        "Жирный",
        "Курсив",
        "Ссылка",
        "Цитата",
        "Блок кода",
        "Список",
        "Таблица",
        "Вид",
        "Редактор",
        "Две панели",
        "Просмотр",
        "Режим фокуса",
        "Окно",
        "Свернуть",
        "Полный экран",
        "Справка",
        "Markdown cheatsheet",
        "Переключить редактор / просмотр",
        "Следующий документ",
        "Предыдущий документ",
    ],
];
fn label<'a>(locale: &str, key: &'a str) -> &'a str {
    let index = match locale {
        "zh" => 0,
        "pt" => 2,
        "fr" => 3,
        "de" => 4,
        "ru" => 5,
        _ => 1,
    };
    KEYS.iter()
        .position(|candidate| *candidate == key)
        .map(|position| LABELS[index][position])
        .unwrap_or(key)
}

pub const ACTIONS: &[&str] = &[
    "new",
    "open",
    "save",
    "save-as",
    "close-document",
    "settings",
    "find",
    "replace",
    "heading-1",
    "heading-2",
    "heading-3",
    "heading-4",
    "heading-5",
    "bold",
    "italic",
    "link",
    "quote",
    "code",
    "list",
    "table",
    "view-editor",
    "view-split",
    "view-preview",
    "focus",
    "cheatsheet",
    "toggle-mode",
    "next-tab",
    "previous-tab",
];

const SHORTCUT_DEFAULTS: [(&str, &str); 3] = [
    ("toggle-mode", "CmdOrCtrl+Shift+P"),
    ("next-tab", "Ctrl+Tab"),
    ("previous-tab", "Ctrl+Shift+Tab"),
];

#[cfg(desktop)]
fn validated_shortcuts(
    requested: Option<&HashMap<String, String>>,
) -> Result<HashMap<String, String>, String> {
    let mut effective: HashMap<String, String> = SHORTCUT_DEFAULTS
        .into_iter()
        .map(|(id, key)| (id.to_owned(), key.to_owned()))
        .collect();
    if let Some(requested) = requested {
        for (id, key) in requested {
            if !effective.contains_key(id) {
                return Err("invalid-shortcut".into());
            }
            effective.insert(id.clone(), key.clone());
        }
    }
    // Keep app/menu accelerators and OS commands outside user-defined bindings.
    let mut protected = vec![
        "CmdOrCtrl+N",
        "CmdOrCtrl+O",
        "CmdOrCtrl+S",
        "CmdOrCtrl+Shift+S",
        "CmdOrCtrl+W",
        "CmdOrCtrl+,",
        "CmdOrCtrl+F",
        "CmdOrCtrl+Shift+H",
        "CmdOrCtrl+B",
        "CmdOrCtrl+I",
        "CmdOrCtrl+K",
        "CmdOrCtrl+Z",
        "CmdOrCtrl+Shift+Z",
        "CmdOrCtrl+X",
        "CmdOrCtrl+C",
        "CmdOrCtrl+V",
        "CmdOrCtrl+A",
        "CmdOrCtrl+M",
        "Ctrl+Cmd+F",
        "Alt+F4",
        "Alt+Tab",
        "Ctrl+Alt+Delete",
        "Ctrl+Space",
    ];
    #[cfg(target_os = "macos")]
    protected.extend([
        "Cmd+Q",
        "Cmd+H",
        "Cmd+Alt+H",
        "Cmd+Space",
        "Cmd+Alt+Space",
        "Cmd+Tab",
        "Cmd+Shift+Tab",
        "Ctrl+Cmd+Q",
    ]);
    #[cfg(not(target_os = "macos"))]
    protected.extend(["Super+L", "Super+Tab", "Super+Space"]);
    let protected = protected
        .into_iter()
        .map(|key| {
            key.parse::<Accelerator>()
                .expect("valid protected accelerator")
        })
        .collect::<std::collections::HashSet<_>>();
    let mut used = std::collections::HashSet::new();
    for value in effective.values() {
        // Empty explicitly disables a custom shortcut without removing its menu action.
        if value.is_empty() {
            continue;
        }
        let accelerator = value
            .parse::<Accelerator>()
            .map_err(|_| "invalid-shortcut")?;
        let key = format!("{:?}", accelerator.key());
        let function_key = key
            .strip_prefix('F')
            .and_then(|number| number.parse::<u8>().ok())
            .is_some_and(|number| (1..=24).contains(&number));
        if !function_key
            && !accelerator
                .modifiers()
                .intersects(Modifiers::CONTROL | Modifiers::ALT | Modifiers::META)
        {
            return Err("invalid-shortcut".into());
        }
        if protected.contains(&accelerator) {
            return Err("shortcut-reserved".into());
        }
        if !used.insert(accelerator) {
            return Err("shortcut-conflict".into());
        }
    }
    Ok(effective)
}

#[cfg(desktop)]
fn action(
    app: &AppHandle,
    menu: &Submenu<Wry>,
    locale: &str,
    id: &str,
    enabled: bool,
    shortcut: Option<&str>,
) -> tauri::Result<()> {
    menu.append(&MenuItem::with_id(
        app,
        id,
        label(locale, id),
        enabled,
        shortcut,
    )?)
}
#[cfg(desktop)]
fn separator(app: &AppHandle, menu: &Submenu<Wry>) -> tauri::Result<()> {
    menu.append(&PredefinedMenuItem::separator(app)?)
}

#[cfg(desktop)]
pub fn install(app: &AppHandle, locale: &str, has_document: bool) -> tauri::Result<()> {
    let defaults = validated_shortcuts(None).expect("valid shortcut defaults");
    install_with_shortcuts(app, locale, has_document, &defaults)
}

#[cfg(desktop)]
fn install_with_shortcuts(
    app: &AppHandle,
    locale: &str,
    has_document: bool,
    shortcuts: &HashMap<String, String>,
) -> tauri::Result<()> {
    let menu = Menu::new(app)?;
    let application = Submenu::new(app, "Mk.1 Lite", true)?;
    application.append(&PredefinedMenuItem::about(
        app,
        Some(label(locale, "about")),
        None,
    )?)?;
    separator(app, &application)?;
    action(
        app,
        &application,
        locale,
        "settings",
        true,
        Some("CmdOrCtrl+,"),
    )?;
    #[cfg(target_os = "macos")]
    {
        separator(app, &application)?;
        application.append(&PredefinedMenuItem::hide(app, Some(label(locale, "hide")))?)?;
        application.append(&PredefinedMenuItem::hide_others(
            app,
            Some(label(locale, "hide-others")),
        )?)?;
        application.append(&PredefinedMenuItem::show_all(
            app,
            Some(label(locale, "show-all")),
        )?)?;
    }
    separator(app, &application)?;
    application.append(&PredefinedMenuItem::quit(app, Some(label(locale, "quit")))?)?;
    menu.append(&application)?;

    let file = Submenu::new(app, label(locale, "file"), true)?;
    action(app, &file, locale, "new", true, Some("CmdOrCtrl+N"))?;
    action(app, &file, locale, "open", true, Some("CmdOrCtrl+O"))?;
    separator(app, &file)?;
    action(
        app,
        &file,
        locale,
        "save",
        has_document,
        Some("CmdOrCtrl+S"),
    )?;
    action(
        app,
        &file,
        locale,
        "save-as",
        has_document,
        Some("CmdOrCtrl+Shift+S"),
    )?;
    separator(app, &file)?;
    action(
        app,
        &file,
        locale,
        "close-document",
        has_document,
        Some("CmdOrCtrl+W"),
    )?;
    menu.append(&file)?;

    let edit = Submenu::new(app, label(locale, "edit"), true)?;
    edit.append(&PredefinedMenuItem::undo(app, Some(label(locale, "undo")))?)?;
    edit.append(&PredefinedMenuItem::redo(app, Some(label(locale, "redo")))?)?;
    separator(app, &edit)?;
    edit.append(&PredefinedMenuItem::cut(app, Some(label(locale, "cut")))?)?;
    edit.append(&PredefinedMenuItem::copy(app, Some(label(locale, "copy")))?)?;
    edit.append(&PredefinedMenuItem::paste(
        app,
        Some(label(locale, "paste")),
    )?)?;
    edit.append(&PredefinedMenuItem::select_all(
        app,
        Some(label(locale, "select-all")),
    )?)?;
    separator(app, &edit)?;
    action(
        app,
        &edit,
        locale,
        "find",
        has_document,
        Some("CmdOrCtrl+F"),
    )?;
    action(
        app,
        &edit,
        locale,
        "replace",
        has_document,
        Some("CmdOrCtrl+Shift+H"),
    )?;
    menu.append(&edit)?;

    let format = Submenu::new(app, label(locale, "format"), true)?;
    for level in 1..=5 {
        format.append(&MenuItem::with_id(
            app,
            format!("heading-{level}"),
            format!("H{level}"),
            has_document,
            None::<&str>,
        )?)?;
    }
    separator(app, &format)?;
    for (id, shortcut) in [
        ("bold", Some("CmdOrCtrl+B")),
        ("italic", Some("CmdOrCtrl+I")),
        ("link", Some("CmdOrCtrl+K")),
        ("quote", None),
        ("code", None),
        ("list", None),
        ("table", None),
    ] {
        action(app, &format, locale, id, has_document, shortcut)?;
    }
    menu.append(&format)?;

    let view = Submenu::new(app, label(locale, "view"), true)?;
    for id in ["view-editor", "view-split", "view-preview", "focus"] {
        action(app, &view, locale, id, has_document, None)?;
    }
    separator(app, &view)?;
    action(
        app,
        &view,
        locale,
        "toggle-mode",
        has_document,
        shortcuts
            .get("toggle-mode")
            .filter(|value| !value.is_empty())
            .map(String::as_str),
    )?;
    menu.append(&view)?;

    let window = Submenu::new(app, label(locale, "window"), true)?;
    for id in ["next-tab", "previous-tab"] {
        action(
            app,
            &window,
            locale,
            id,
            has_document,
            shortcuts
                .get(id)
                .filter(|value| !value.is_empty())
                .map(String::as_str),
        )?;
    }
    separator(app, &window)?;
    window.append(&PredefinedMenuItem::minimize(
        app,
        Some(label(locale, "minimize")),
    )?)?;
    window.append(&PredefinedMenuItem::fullscreen(
        app,
        Some(label(locale, "fullscreen")),
    )?)?;
    menu.append(&window)?;
    #[cfg(target_os = "macos")]
    window.set_as_windows_menu_for_nsapp()?;
    let help = Submenu::new(app, label(locale, "help"), true)?;
    action(app, &help, locale, "cheatsheet", true, None)?;
    menu.append(&help)?;
    #[cfg(target_os = "macos")]
    help.set_as_help_menu_for_nsapp()?;
    app.set_menu(menu)?;
    Ok(())
}

#[tauri::command]
pub fn update_app_menu(
    app: tauri::AppHandle,
    locale: String,
    has_document: bool,
    shortcuts: Option<HashMap<String, String>>,
) -> Result<(), String> {
    #[cfg(desktop)]
    {
        let shortcuts = validated_shortcuts(shortcuts.as_ref())?;
        install_with_shortcuts(&app, &locale, has_document, &shortcuts)
            .map_err(|error| error.to_string())
    }
    #[cfg(mobile)]
    {
        let _ = (app, locale, has_document, shortcuts);
        Err("unsupported".into())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn all_menu_labels_cover_the_same_keys() {
        for row in LABELS {
            assert_eq!(row.len(), KEYS.len());
            assert!(row.iter().all(|value| !value.is_empty()));
        }
        assert_eq!(label("zh", "save"), "保存");
        assert_eq!(label("unknown", "save"), "Save");
    }
    #[test]
    fn menu_action_ids_are_unique_and_close_is_document_scoped() {
        let unique = ACTIONS.iter().collect::<std::collections::HashSet<_>>();
        assert_eq!(unique.len(), ACTIONS.len());
        assert!(unique.contains(&"close-document"));
        assert!(!unique.contains(&"close-window"));
        for level in 1..=5 {
            assert!(ACTIONS.contains(&format!("heading-{level}").as_str()));
        }
    }
    #[cfg(desktop)]
    #[test]
    fn shortcut_defaults_and_overrides_are_validated_before_menu_installation() {
        let defaults = validated_shortcuts(None).unwrap();
        assert_eq!(defaults["next-tab"], "Ctrl+Tab");
        let requested = HashMap::from([
            ("toggle-mode".into(), "CmdOrCtrl+Shift+Y".into()),
            ("next-tab".into(), String::new()),
        ]);
        let configured = validated_shortcuts(Some(&requested)).unwrap();
        assert_eq!(configured["toggle-mode"], "CmdOrCtrl+Shift+Y");
        assert_eq!(configured["next-tab"], "");
        assert_eq!(configured["previous-tab"], "Ctrl+Shift+Tab");
    }
    #[cfg(desktop)]
    #[test]
    fn native_shortcuts_reject_reserved_duplicate_and_invalid_combinations() {
        for value in ["CmdOrCtrl+S", "CmdOrCtrl+Shift+S", "Ctrl+Cmd+F"] {
            assert_eq!(
                validated_shortcuts(Some(&HashMap::from([("toggle-mode".into(), value.into())])))
                    .unwrap_err(),
                "shortcut-reserved"
            );
        }
        for value in ["A", "Shift+A", "Bogus+Thing"] {
            assert_eq!(
                validated_shortcuts(Some(&HashMap::from([("toggle-mode".into(), value.into())])))
                    .unwrap_err(),
                "invalid-shortcut"
            );
        }
        assert_eq!(
            validated_shortcuts(Some(&HashMap::from([(
                "toggle-mode".into(),
                "Ctrl+Tab".into()
            )])))
            .unwrap_err(),
            "shortcut-conflict"
        );
        assert!(
            validated_shortcuts(Some(&HashMap::from([("unknown".into(), "Ctrl+P".into())])))
                .is_err()
        );
        #[cfg(target_os = "macos")]
        for value in ["Cmd+Q", "Cmd+H", "Cmd+Space", "Cmd+Tab"] {
            assert_eq!(
                validated_shortcuts(Some(&HashMap::from([("toggle-mode".into(), value.into())])))
                    .unwrap_err(),
                "shortcut-reserved"
            );
        }
        assert!(
            validated_shortcuts(Some(&HashMap::from([("toggle-mode".into(), "F5".into())])))
                .is_ok()
        );
    }
}
