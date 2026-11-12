export const shortcutActions = [
  "toggle-mode",
  "next-tab",
  "previous-tab",
] as const;
export type ShortcutAction = (typeof shortcutActions)[number];
export type ShortcutBindings = Record<ShortcutAction, string>;
export const defaultShortcuts: ShortcutBindings = {
  "toggle-mode": "Mod+Shift+P",
  "next-tab": "Ctrl+Tab",
  "previous-tab": "Ctrl+Shift+Tab",
};
export const modifierChoices = [
  "",
  "Mod",
  "Mod+Shift",
  "Mod+Alt",
  "Mod+Alt+Shift",
  "Ctrl",
  "Ctrl+Shift",
  "Ctrl+Alt",
  "Ctrl+Alt+Shift",
  "Alt",
  "Alt+Shift",
];
export const shortcutKeys = [
  ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  ..."0123456789",
  ...Array.from({ length: 24 }, (_, i) => `F${i + 1}`),
  "Tab",
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "ArrowDown",
  "Space",
  "Enter",
  "Backspace",
  "Delete",
  "Home",
  "End",
  "PageUp",
  "PageDown",
  "Comma",
];
const modifierOrder = ["Mod", "Ctrl", "Alt", "Shift"];
export function parseBinding(
  binding: string,
): { modifiers: string[]; key: string; canonical: string } | null {
  if (!binding) return null;
  const parts = binding.split("+");
  const key = parts.pop()!;
  if (
    !shortcutKeys.includes(key) ||
    parts.some((part) => !modifierOrder.includes(part)) ||
    new Set(parts).size !== parts.length
  )
    return null;
  const modifiers = modifierOrder.filter((part) => parts.includes(part));
  if (!modifierChoices.includes(modifiers.join("+"))) return null;
  if (!modifiers.length && !/^F(?:[1-9]|1\d|2[0-4])$/.test(key)) return null;
  return { modifiers, key, canonical: [...modifiers, key].join("+") };
}
function signature(binding: string, mac: boolean): string | null {
  const parsed = parseBinding(binding);
  if (!parsed) return null;
  const modifiers = new Set(
    parsed.modifiers.map((modifier) =>
      modifier === "Mod" ? (mac ? "Meta" : "Ctrl") : modifier,
    ),
  );
  return ["Meta", "Ctrl", "Alt", "Shift"]
    .filter((modifier) => modifiers.has(modifier))
    .concat(parsed.key)
    .join("+");
}
const fixedBindings = [
  "Mod+N",
  "Mod+O",
  "Mod+S",
  "Mod+Shift+S",
  "Mod+W",
  "Mod+F",
  "Mod+Shift+H",
  "Mod+B",
  "Mod+I",
  "Mod+K",
  "Mod+Comma",
  "Mod+Z",
  "Mod+Shift+Z",
  "Mod+Y",
  "Mod+X",
  "Mod+C",
  "Mod+V",
  "Mod+A",
  "Mod+M",
  "Mod+R",
  "Mod+Shift+R",
  "Mod+L",
  "Mod+T",
  "Mod+Shift+T",
  "Ctrl+H",
];
const systemBindings = [
  "Mod+Q",
  "Mod+Shift+Q",
  "Mod+H",
  "Mod+Alt+H",
  "Mod+Space",
  "Mod+Tab",
  "Mod+Shift+Tab",
  "Alt+Tab",
  "Alt+Shift+Tab",
  "Ctrl+Space",
  "Ctrl+Alt+Delete",
  "Mod+Alt+Escape",
  "Alt+F4",
  "F5",
  "F11",
];
export function validateShortcut(
  action: ShortcutAction,
  binding: string,
  bindings: ShortcutBindings,
  mac: boolean,
): "shortcutInvalid" | "shortcutReserved" | "shortcutConflict" | null {
  if (binding === "") return null;
  const parsed = parseBinding(binding);
  if (!parsed) return "shortcutInvalid";
  const key = signature(binding, mac);
  if (
    [
      ...fixedBindings,
      ...systemBindings.filter(
        (binding) => mac || !["Mod+Tab", "Mod+Shift+Tab"].includes(binding),
      ),
    ].some((item) => signature(item, mac) === key)
  )
    return "shortcutReserved";
  if (
    shortcutActions.some(
      (other) =>
        other !== action &&
        bindings[other] &&
        signature(bindings[other], mac) === key,
    )
  )
    return "shortcutConflict";
  return null;
}
export function bindingToAccelerator(binding: string): string {
  const parsed = parseBinding(binding);
  return parsed ? parsed.canonical.replace(/^Mod(?=\+)/, "CmdOrCtrl") : "";
}
export function displayBinding(binding: string, mac: boolean): string {
  const parsed = parseBinding(binding);
  if (!parsed) return "";
  const names: Record<string, string> = {
    Mod: mac ? "⌘" : "Ctrl",
    Ctrl: "Ctrl",
    Alt: mac ? "⌥" : "Alt",
    Shift: mac ? "⇧" : "Shift",
    ArrowLeft: "←",
    ArrowRight: "→",
    ArrowUp: "↑",
    ArrowDown: "↓",
    Comma: ",",
    Space: "Space",
  };
  return [...parsed.modifiers, parsed.key]
    .map((part) => names[part] || part)
    .join(mac ? " " : " + ");
}
export function matchShortcut(
  event: Pick<
    KeyboardEvent,
    "key" | "code" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey"
  >,
  binding: string,
  mac: boolean,
): boolean {
  const parsed = parseBinding(binding);
  if (!parsed) return false;
  const expectsMeta = mac && parsed.modifiers.includes("Mod");
  const expectsCtrl =
    parsed.modifiers.includes("Ctrl") ||
    (!mac && parsed.modifiers.includes("Mod"));
  if (
    event.metaKey !== expectsMeta ||
    event.ctrlKey !== expectsCtrl ||
    event.altKey !== parsed.modifiers.includes("Alt") ||
    event.shiftKey !== parsed.modifiers.includes("Shift")
  )
    return false;
  const code = event.code;
  const key = /^Key[A-Z]$/.test(code)
    ? code.slice(3)
    : /^Digit\d$/.test(code)
      ? code.slice(5)
      : code === "Space"
        ? "Space"
        : code === "Comma"
          ? "Comma"
          : event.key.length === 1
            ? event.key.toUpperCase()
            : event.key;
  return key === parsed.key;
}
export function restoreBindings(raw: unknown, mac: boolean): ShortcutBindings {
  const restored = { ...defaultShortcuts };
  if (!raw || typeof raw !== "object") return restored;
  // Check each against the complete candidate map to avoid order-dependent duplicate restoration.
  const candidate = { ...defaultShortcuts };
  for (const action of shortcutActions) {
    const value = (raw as Record<string, unknown>)[action];
    if (typeof value === "string") candidate[action] = value;
  }
  for (const action of shortcutActions) {
    const binding = candidate[action];
    if (!validateShortcut(action, binding, candidate, mac))
      restored[action] = binding;
  }
  // A rejected custom value can collide with another action's valid value after fallback.
  for (const action of shortcutActions)
    if (validateShortcut(action, restored[action], restored, mac))
      restored[action] = defaultShortcuts[action];
  return restored;
}
