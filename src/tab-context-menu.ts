import "./tab-context-menu.css";

interface ContextTab {
  id: string;
  name: string;
}
interface TabContextOptions {
  container: HTMLElement;
  t: (key: string) => string;
  onClose: (id: string) => Promise<boolean>;
  getTabs: () => ContextTab[];
  isBusy?: () => boolean;
}
type ContextAction = "close" | "close-all" | "close-right";
const definitions: { action: ContextAction; label: string }[] = [
  { action: "close", label: "closeDocument" },
  { action: "close-all", label: "closeAllTabs" },
  { action: "close-right", label: "closeTabsRight" },
];

/** Only requests closes; ownership, unsaved confirmation and persistence remain with the workspace. */
export function createTabContextMenu({
  container,
  t,
  onClose,
  getTabs,
  isBusy,
}: TabContextOptions) {
  const menu = document.createElement("div");
  menu.id = "tab-context-menu";
  menu.className = "tab-context-menu";
  menu.setAttribute("role", "menu");
  menu.hidden = true;
  document.body.append(menu);
  let targetId: string | null = null;
  let running = false;
  let point = { x: 0, y: 0 };

  function tabs() {
    return getTabs().slice();
  }
  function tabButton(id: string | null) {
    return Array.from(
      container.querySelectorAll<HTMLElement>("[data-tab]"),
    ).find((button) => button.dataset.tab === id);
  }
  function close(restoreFocus = false) {
    menu.hidden = true;
    if (restoreFocus) tabButton(targetId)?.focus({ preventScroll: true });
  }
  function enabled() {
    return Array.from(
      menu.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"),
    );
  }
  function position() {
    const bounds = menu.getBoundingClientRect();
    menu.style.left = `${Math.max(6, Math.min(point.x, innerWidth - bounds.width - 6))}px`;
    menu.style.top = `${Math.max(6, Math.min(point.y, innerHeight - bounds.height - 6))}px`;
    menu.style.maxHeight = `${Math.max(40, innerHeight - 12)}px`;
  }
  function refresh() {
    const items = tabs(),
      index = items.findIndex((tab) => tab.id === targetId);
    if (index < 0) {
      close();
      return;
    }
    const busy = running || !!isBusy?.();
    for (const definition of definitions) {
      let button = menu.querySelector<HTMLButtonElement>(
        `[data-tab-context-action="${definition.action}"]`,
      );
      if (!button) {
        button = document.createElement("button");
        button.type = "button";
        button.setAttribute("role", "menuitem");
        button.dataset.tabContextAction = definition.action;
        menu.append(button);
      }
      button.textContent = t(definition.label);
      button.disabled =
        busy ||
        (definition.action === "close-right" && index === items.length - 1);
    }
    menu.setAttribute("aria-label", items[index].name);
    if (!menu.hidden) position();
  }
  function open(id: string, x: number, y: number) {
    if (running || isBusy?.() || !tabs().some((tab) => tab.id === id)) return;
    targetId = id;
    point = { x, y };
    refresh();
    menu.hidden = false;
    position();
    enabled()[0]?.focus({ preventScroll: true });
  }
  function targetFrom(element: EventTarget | null) {
    if (!(element instanceof Element)) return;
    const wrapper = element.closest(".document-tab");
    if (!wrapper || !container.contains(wrapper)) return;
    return wrapper.querySelector<HTMLElement>("[data-tab]")?.dataset.tab;
  }
  container.addEventListener("contextmenu", (event) => {
    const id = targetFrom(event.target);
    if (!id) return;
    event.preventDefault();
    open(id, event.clientX, event.clientY);
  });
  container.addEventListener("keydown", (event) => {
    if (event.key !== "ContextMenu" && !(event.shiftKey && event.key === "F10"))
      return;
    const id = targetFrom(event.target);
    if (!id) return;
    event.preventDefault();
    event.stopPropagation();
    const bounds = tabButton(id)?.getBoundingClientRect();
    if (bounds) open(id, bounds.left + 5, bounds.bottom + 3);
  });
  menu.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close(true);
      return;
    }
    const items = enabled();
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    let next = index;
    if (event.key === "ArrowDown") next = (index + 1) % items.length;
    else if (event.key === "ArrowUp")
      next = (index + items.length - 1) % items.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = items.length - 1;
    else if (event.key === "Tab") {
      close();
      return;
    } else return;
    event.preventDefault();
    event.stopPropagation();
    items[next]?.focus();
  });
  menu.addEventListener("click", async (event) => {
    const button = (event.target as Element).closest<HTMLButtonElement>(
      "[data-tab-context-action]",
    );
    if (!button || button.disabled || running || isBusy?.() || !targetId)
      return;
    const action = button.dataset.tabContextAction as ContextAction;
    const snapshot = tabs();
    const index = snapshot.findIndex((tab) => tab.id === targetId);
    if (index < 0) {
      close();
      return;
    }
    // Freeze membership before any await; newly opened tabs are never part of this operation.
    const ids =
      action === "close"
        ? [targetId]
        : action === "close-right"
          ? snapshot.slice(index + 1).map((tab) => tab.id)
          : snapshot.map((tab) => tab.id);
    close();
    running = true;
    try {
      for (const id of ids) {
        if (isBusy?.()) break;
        if (!tabs().some((tab) => tab.id === id)) continue;
        if (!(await onClose(id))) break;
      }
    } catch (error) {
      // Treat a rejected save/close exactly like cancellation; leave remaining documents alone.
      console.error("Tab close:", error);
    } finally {
      running = false;
      tabButton(targetId)?.focus({ preventScroll: true });
    }
  });
  document.addEventListener(
    "pointerdown",
    (event) => {
      if (!menu.hidden && !menu.contains(event.target as Node)) close();
    },
    true,
  );
  document.addEventListener("keydown", (event) => {
    if (!menu.hidden && event.key === "Escape") {
      event.preventDefault();
      close(true);
    }
  });
  window.addEventListener("resize", () => close());
  document.addEventListener("scroll", () => close(), true);
  return { close: () => close(), refresh };
}
