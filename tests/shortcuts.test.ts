import test from "node:test";
import assert from "node:assert/strict";
import {
  defaultShortcuts,
  parseBinding,
  validateShortcut,
  bindingToAccelerator,
  matchShortcut,
  restoreBindings,
} from "../src/shortcut-bindings.ts";
test("portable shortcut parser normalizes order and rejects malformed bindings", () => {
  assert.equal(parseBinding("Shift+Mod+P")?.canonical, "Mod+Shift+P");
  for (const value of ["P", "Mod+Mod+P", "Cmd+P", "Mod+Unknown", "Mod+Ctrl+P"])
    assert.equal(parseBinding(value), null);
  assert.equal(bindingToAccelerator("Mod+Shift+P"), "CmdOrCtrl+Shift+P");
  assert.equal(bindingToAccelerator(""), "");
});
test("shortcut conflicts use effective platform modifiers and block system/file editing commands", () => {
  assert.equal(
    validateShortcut("next-tab", "Mod+Q", defaultShortcuts, true),
    "shortcutReserved",
  );
  assert.equal(
    validateShortcut("next-tab", "Mod+S", defaultShortcuts, true),
    "shortcutReserved",
  );
  assert.equal(
    validateShortcut("next-tab", "Mod+Shift+P", defaultShortcuts, true),
    "shortcutConflict",
  );
  assert.equal(
    validateShortcut("toggle-mode", "Mod+Tab", defaultShortcuts, false),
    "shortcutConflict",
  );
  assert.equal(
    validateShortcut("toggle-mode", "Mod+Shift+L", defaultShortcuts, true),
    null,
  );
  assert.equal(
    validateShortcut("toggle-mode", "", defaultShortcuts, true),
    null,
  );
});
test("matching respects physical letter keys, exact modifiers, Mac command and explicit control", () => {
  const event = {
    key: "P",
    code: "KeyP",
    metaKey: true,
    ctrlKey: false,
    altKey: false,
    shiftKey: true,
  };
  assert.ok(matchShortcut(event, "Mod+Shift+P", true));
  assert.ok(!matchShortcut(event, "Ctrl+Shift+P", true));
  assert.ok(!matchShortcut({ ...event, altKey: true }, "Mod+Shift+P", true));
  assert.ok(
    matchShortcut(
      { ...event, metaKey: false, ctrlKey: true },
      "Mod+Shift+P",
      false,
    ),
  );
  assert.ok(
    matchShortcut(
      {
        key: "Tab",
        code: "Tab",
        metaKey: false,
        ctrlKey: true,
        altKey: false,
        shiftKey: false,
      },
      "Ctrl+Tab",
      true,
    ),
  );
});
test("restored preferences reject corrupt, reserved or conflicting values and preserve cleared bindings", () => {
  assert.deepEqual(restoreBindings(null, true), defaultShortcuts);
  assert.equal(
    restoreBindings({ "toggle-mode": "Mod+Q" }, true)["toggle-mode"],
    defaultShortcuts["toggle-mode"],
  );
  const restored = restoreBindings(
    { "toggle-mode": "", "next-tab": "Mod+Shift+L" },
    true,
  );
  assert.equal(restored["toggle-mode"], "");
  assert.equal(restored["next-tab"], "Mod+Shift+L");
  const duplicate = restoreBindings({ "toggle-mode": "Ctrl+Tab" }, true);
  assert.equal(duplicate["toggle-mode"], defaultShortcuts["toggle-mode"]);
});
