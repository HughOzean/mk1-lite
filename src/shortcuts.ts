import {
  shortcutActions,
  defaultShortcuts,
  modifierChoices,
  shortcutKeys,
  parseBinding,
  validateShortcut,
  bindingToAccelerator,
  displayBinding,
  matchShortcut,
  restoreBindings,
  type ShortcutAction,
} from "./shortcut-bindings";
import "./shortcuts.css";
interface ShortcutOptions {
  container: HTMLElement;
  t: (key: string) => string;
  onChange: () => void;
}
const labels: Record<ShortcutAction, string> = {
  "toggle-mode": "shortcutToggleMode",
  "next-tab": "shortcutNextTab",
  "previous-tab": "shortcutPreviousTab",
};
export function createShortcutSettings({
  container,
  t,
  onChange,
}: ShortcutOptions) {
  const mac = /Mac|iPhone|iPad/.test(navigator.platform);
  let raw: unknown;
  try {
    raw = JSON.parse(localStorage.getItem("m1-shortcuts") || "null");
  } catch {}
  let bindings = restoreBindings(raw, mac);
  let editing: ShortcutAction | null = null,
    lastError: string | null = null;
  container.classList.add("shortcut-settings");
  function commit() {
    try {
      localStorage.setItem("m1-shortcuts", JSON.stringify(bindings));
    } catch {
      lastError = "storageError";
    }
    refresh();
    onChange();
  }
  function button(label: string, className = "") {
    const element = document.createElement("button");
    element.type = "button";
    element.textContent = t(label);
    element.className = className;
    return element;
  }
  function refresh() {
    container.replaceChildren();
    const heading = document.createElement("h3");
    heading.textContent = t("shortcutSettings");
    container.append(heading);
    const hint = document.createElement("p");
    hint.className = "shortcut-hint";
    hint.textContent = t("shortcutRecordHint");
    container.append(hint);
    for (const action of shortcutActions) {
      const row = document.createElement("div");
      row.className = "shortcut-setting";
      row.dataset.shortcut = action;
      const top = document.createElement("div");
      top.className = "shortcut-row";
      const label = document.createElement("span");
      label.textContent = t(labels[action]);
      const value = document.createElement("kbd");
      value.dataset.shortcutValue = action;
      value.textContent =
        displayBinding(bindings[action], mac) || t("shortcutUnassigned");
      const edit = button("shortcutEdit");
      edit.dataset.shortcutEdit = action;
      edit.setAttribute(
        "aria-label",
        `${t("shortcutEdit")}: ${t(labels[action])}`,
      );
      edit.addEventListener("click", () => {
        editing = editing === action ? null : action;
        lastError = null;
        refresh();
      });
      const clear = button("shortcutClear");
      clear.dataset.shortcutClear = action;
      clear.disabled = !bindings[action];
      clear.setAttribute(
        "aria-label",
        `${t("shortcutClear")}: ${t(labels[action])}`,
      );
      clear.addEventListener("click", () => {
        bindings[action] = "";
        editing = null;
        lastError = null;
        commit();
      });
      top.append(label, value, edit, clear);
      row.append(top);
      if (editing === action) {
        const editor = document.createElement("div");
        editor.className = "shortcut-editor";
        const parsed = parseBinding(bindings[action]);
        const modifierLabel = document.createElement("label");
        modifierLabel.append(document.createTextNode(t("shortcutModifier")));
        const modifiers = document.createElement("select");
        modifiers.dataset.shortcutModifiers = action;
        modifiers.setAttribute(
          "aria-label",
          `${t("shortcutModifier")}: ${t(labels[action])}`,
        );
        for (const choice of modifierChoices) {
          const option = new Option(
            choice
              ? displayBinding(`${choice}+P`, mac)
                  .replace(/\s*(?:\+\s*)?P$/, "")
                  .trim()
              : t("shortcutNone"),
            choice,
          );
          modifiers.add(option);
        }
        modifiers.value = parsed ? parsed.modifiers.join("+") : "Mod";
        modifierLabel.append(modifiers);
        const keyLabel = document.createElement("label");
        keyLabel.append(document.createTextNode(t("shortcutKey")));
        const key = document.createElement("select");
        key.dataset.shortcutKey = action;
        key.setAttribute(
          "aria-label",
          `${t("shortcutKey")}: ${t(labels[action])}`,
        );
        for (const choice of shortcutKeys) key.add(new Option(choice, choice));
        key.value = parsed?.key || "P";
        keyLabel.append(key);
        const apply = button("shortcutApply", "shortcut-apply");
        apply.dataset.shortcutApply = action;
        apply.addEventListener("click", () => {
          const value = [modifiers.value, key.value].filter(Boolean).join("+");
          lastError = validateShortcut(action, value, bindings, mac);
          if (lastError) {
            const notice =
              container.querySelector<HTMLElement>(".shortcut-error")!;
            notice.textContent = t(lastError);
            return;
          }
          bindings[action] = parseBinding(value)!.canonical;
          editing = null;
          commit();
        });
        const cancel = button("cancel");
        cancel.dataset.shortcutCancel = action;
        cancel.addEventListener("click", () => {
          editing = null;
          lastError = null;
          refresh();
        });
        editor.append(modifierLabel, keyLabel, apply, cancel);
        row.append(editor);
      }
      container.append(row);
    }
    const notice = document.createElement("p");
    notice.className = "shortcut-error";
    notice.setAttribute("role", "status");
    notice.setAttribute("aria-live", "polite");
    notice.textContent = lastError ? t(lastError) : "";
    container.append(notice);
    const reset = button("shortcutReset", "shortcut-reset");
    reset.dataset.shortcutReset = "";
    reset.addEventListener("click", () => {
      bindings = { ...defaultShortcuts };
      editing = null;
      lastError = null;
      commit();
    });
    container.append(reset);
  }
  container.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && editing) {
      event.preventDefault();
      event.stopPropagation();
      editing = null;
      lastError = null;
      refresh();
    }
  });
  refresh();
  return {
    getBindings: () => ({ ...bindings }),
    getMenuAccelerators: () =>
      Object.fromEntries(
        shortcutActions.map((action) => [
          action,
          bindingToAccelerator(bindings[action]),
        ]),
      ),
    refresh,
    handleKeydown(event: KeyboardEvent): string | null {
      if (
        event.defaultPrevented ||
        event.isComposing ||
        event.getModifierState?.("AltGraph")
      )
        return null;
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest(".shortcut-settings")) return null;
      if (
        target?.closest('input,textarea,select,[contenteditable="true"]') &&
        !target.closest(".cm-content")
      )
        return null;
      const action = shortcutActions.find((action) =>
        matchShortcut(event, bindings[action], mac),
      );
      if (!action || (event.repeat && action === "toggle-mode")) return null;
      return action;
    },
  };
}
