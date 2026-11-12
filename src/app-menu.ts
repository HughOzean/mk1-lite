import "./app-menu.css";

interface MenuOptions {
  container: HTMLElement;
  t: (key: string) => string;
  onAction: (action: string) => void;
}
interface Entry {
  action: string;
  label: string;
  document?: boolean;
  shortcut?: string;
}
interface MenuDefinition {
  key: string;
  action?: string;
  items?: (Entry | null)[];
}
const definitions: MenuDefinition[] = [
  {
    key: "menuFile",
    items: [
      { action: "new", label: "new", shortcut: "N" },
      { action: "open", label: "open", shortcut: "O" },
      null,
      { action: "save", label: "save", document: true, shortcut: "S" },
      { action: "save-as", label: "saveAs", document: true, shortcut: "⇧ S" },
      {
        action: "close-document",
        label: "closeDocument",
        document: true,
        shortcut: "W",
      },
    ],
  },
  {
    key: "menuEdit",
    items: [
      { action: "undo", label: "undo", document: true, shortcut: "Z" },
      { action: "redo", label: "redo", document: true, shortcut: "⇧ Z" },
      null,
      { action: "cut", label: "cut", document: true, shortcut: "X" },
      { action: "copy", label: "copy", document: true, shortcut: "C" },
      { action: "paste", label: "paste", document: true, shortcut: "V" },
      {
        action: "select-all",
        label: "selectAll",
        document: true,
        shortcut: "A",
      },
      null,
      { action: "find", label: "find", document: true, shortcut: "F" },
      { action: "replace", label: "replace", document: true, shortcut: "⇧ H" },
    ],
  },
  {
    key: "menuFormat",
    items: [
      ...[1, 2, 3, 4, 5].map((level) => ({
        action: `heading-${level}`,
        label: `H${level}`,
        document: true,
      })),
      null,
      { action: "bold", label: "bold", document: true, shortcut: "B" },
      { action: "italic", label: "italic", document: true, shortcut: "I" },
      { action: "link", label: "link", document: true },
      { action: "quote", label: "quote", document: true },
      { action: "code", label: "code", document: true },
      { action: "list", label: "list", document: true },
      { action: "table", label: "table", document: true },
    ],
  },
  {
    key: "menuView",
    items: [
      { action: "toggle-mode", label: "shortcutToggleMode", document: true },
      { action: "next-tab", label: "shortcutNextTab", document: true },
      { action: "previous-tab", label: "shortcutPreviousTab", document: true },
      null,
      { action: "view-editor", label: "editor" },
      { action: "view-split", label: "split" },
      { action: "view-preview", label: "preview" },
      null,
      { action: "focus", label: "focus" },
    ],
  },
  { key: "settings", action: "settings" },
  { key: "menuHelp", items: [{ action: "cheatsheet", label: "cheatsheet" }] },
];
let menuCounter = 0;

/** Fallback for platforms without the desktop app's native menubar. */
export function createAppMenu({ container, t, onAction }: MenuOptions) {
  const instance = ++menuCounter;
  const mac = /Mac|iPhone|iPad/.test(navigator.platform);
  const modifier = mac ? "⌘" : "Ctrl";
  container.classList.add("app-menu-bar");
  container.setAttribute("role", "menubar");
  let opened: number | null = null;
  let hasDocument = false;
  let signature = "";
  let topButtons: HTMLButtonElement[] = [];
  let panels: HTMLElement[] = [];

  function close() {
    for (const panel of panels) panel.hidden = true;
    for (const button of topButtons) {
      if (button.hasAttribute("aria-haspopup"))
        button.setAttribute("aria-expanded", "false");
    }
    opened = null;
  }
  function enabledItems(index: number) {
    return Array.from(
      panels[index]?.querySelectorAll<HTMLButtonElement>(
        'button[role="menuitem"]:not(:disabled)',
      ) || [],
    );
  }
  function position(index: number) {
    const panel = panels[index];
    const button = topButtons[index];
    if (!panel || !button) return;
    const bounds = button.getBoundingClientRect();
    const width = panel.getBoundingClientRect().width;
    panel.style.left = `${Math.max(6, Math.min(bounds.left, innerWidth - width - 6))}px`;
    panel.style.top = `${Math.min(bounds.bottom + 2, innerHeight - 50)}px`;
    panel.style.maxHeight = `${Math.max(40, innerHeight - bounds.bottom - 12)}px`;
  }
  function open(index: number, focus: "first" | "last" | false = false) {
    if (!definitions[index]?.items) return;
    close();
    opened = index;
    panels[index].hidden = false;
    topButtons[index].setAttribute("aria-expanded", "true");
    position(index);
    const items = enabledItems(index);
    if (focus) items[focus === "first" ? 0 : items.length - 1]?.focus();
  }
  function focusNeighbor(index: number, direction: number, reveal: boolean) {
    const next = (index + direction + topButtons.length) % topButtons.length;
    close();
    topButtons[next]?.focus();
    if (reveal && definitions[next].items) open(next, "first");
  }
  function label(key: string) {
    return /^H[1-5]$/.test(key) ? key : t(key);
  }
  function refresh(state: { hasDocument: boolean }) {
    hasDocument = state.hasDocument;
    const nextSignature = JSON.stringify([
      hasDocument,
      definitions.map((menu) => [
        label(menu.key),
        menu.items?.map((entry) => entry && label(entry.label)),
      ]),
    ]);
    if (nextSignature === signature) return;
    signature = nextSignature;
    close();
    container.replaceChildren();
    topButtons = [];
    panels = [];
    definitions.forEach((menu, index) => {
      const group = document.createElement("div");
      group.className = "app-menu-group";
      const button = document.createElement("button");
      button.type = "button";
      button.className = "app-menu-trigger";
      button.setAttribute("role", "menuitem");
      button.dataset.menu = menu.key;
      button.textContent = label(menu.key);
      group.append(button);
      topButtons.push(button);
      const panel = document.createElement("div");
      panel.className = "app-menu-dropdown";
      panel.hidden = true;
      panel.setAttribute("role", "menu");
      panel.id = `app-menu-${instance}-${index}`;
      panels.push(panel);
      if (menu.items) {
        button.setAttribute("aria-haspopup", "menu");
        button.setAttribute("aria-expanded", "false");
        button.setAttribute("aria-controls", panel.id);
        menu.items.forEach((entry) => {
          if (!entry) {
            const separator = document.createElement("div");
            separator.className = "app-menu-separator";
            separator.setAttribute("role", "separator");
            panel.append(separator);
            return;
          }
          const item = document.createElement("button");
          item.type = "button";
          item.setAttribute("role", "menuitem");
          item.dataset.menuAction = entry.action;
          item.disabled = !!entry.document && !hasDocument;
          const text = document.createElement("span");
          text.textContent = label(entry.label);
          item.append(text);
          if (entry.shortcut) {
            const shortcut = document.createElement("kbd");
            shortcut.textContent = `${modifier} ${entry.shortcut}`;
            shortcut.setAttribute("aria-hidden", "true");
            item.append(shortcut);
          }
          item.addEventListener("click", () => {
            close();
            onAction(entry.action);
          });
          panel.append(item);
        });
        group.append(panel);
      }
      button.addEventListener("click", () => {
        if (menu.action) {
          close();
          onAction(menu.action);
        } else if (opened === index) close();
        else open(index);
      });
      button.addEventListener("pointerenter", () => {
        if (opened !== null && opened !== index && menu.items) open(index);
      });
      button.addEventListener("keydown", (event) => {
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault();
          open(index, event.key === "ArrowDown" ? "first" : "last");
        } else if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
          event.preventDefault();
          focusNeighbor(
            index,
            event.key === "ArrowRight" ? 1 : -1,
            opened !== null,
          );
        } else if (event.key === "Escape") {
          event.preventDefault();
          close();
        }
      });
      panel.addEventListener("keydown", (event) => {
        const items = enabledItems(index);
        const active = items.indexOf(
          document.activeElement as HTMLButtonElement,
        );
        if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
          event.preventDefault();
          const next =
            event.key === "Home"
              ? 0
              : event.key === "End"
                ? items.length - 1
                : (active +
                    (event.key === "ArrowDown" ? 1 : -1) +
                    items.length) %
                  items.length;
          items[next]?.focus();
        } else if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
          event.preventDefault();
          focusNeighbor(index, event.key === "ArrowRight" ? 1 : -1, true);
        } else if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          close();
          button.focus();
        } else if (event.key === "Tab") close();
      });
      container.append(group);
    });
  }
  document.addEventListener("pointerdown", (event) => {
    if (event.target instanceof Node && !container.contains(event.target))
      close();
  });
  window.addEventListener("resize", () => {
    if (opened !== null) position(opened);
  });
  refresh({ hasDocument: false });
  return { refresh, close };
}
