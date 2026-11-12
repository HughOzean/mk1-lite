import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 700, height: 800 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/shortcuts-test", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<!doctype html><style>:root{--border:#343834;--panel:#252725;--text:#ddd;--muted:#888;--accent:#66cc66;--subtle:#aaa}*{box-sizing:border-box}body{margin:0;padding:20px;background:#202220;color:#ddd;font:13px sans-serif}button,select{font:inherit;color:inherit;background:#252725}#settings{max-width:430px}button{cursor:pointer}</style><section id="settings"></section><input id="typing"><div class="cm-content" contenteditable="true">editor</div><script type="module">import {createShortcutSettings} from '/src/shortcuts.ts';Object.defineProperty(navigator,'platform',{get:()=> 'MacIntel'});window.changes=0;window.shortcuts=createShortcutSettings({container:document.querySelector('#settings'),t:key=>key,onChange:()=>changes++});window.results=[];document.addEventListener('keydown',event=>results.push(shortcuts.handleKeydown(event)));window.ready=true;</script>`,
    }),
  );
  await page.goto(`${process.env.MARK1LIGHT_TEST_URL || "http://localhost:5173"}/shortcuts-test`);
  await page.waitForFunction(() => window.ready);
  assert.equal(
    await page.evaluate(
      () => window.shortcuts.getMenuAccelerators()["toggle-mode"],
    ),
    "CmdOrCtrl+Shift+P",
  );
  await page.locator('[data-shortcut-edit="toggle-mode"]').click();
  await page
    .locator('[data-shortcut-modifiers="toggle-mode"]')
    .selectOption("Mod+Shift");
  await page.locator('[data-shortcut-key="toggle-mode"]').selectOption("L");
  await page.locator('[data-shortcut-apply="toggle-mode"]').click();
  assert.equal(
    await page.evaluate(() => window.shortcuts.getBindings()["toggle-mode"]),
    "Mod+Shift+L",
  );
  assert.equal(await page.evaluate(() => window.changes), 1);
  await page.locator('[data-shortcut-edit="next-tab"]').click();
  await page
    .locator('[data-shortcut-modifiers="next-tab"]')
    .selectOption("Mod+Shift");
  await page.locator('[data-shortcut-key="next-tab"]').selectOption("L");
  await page.locator('[data-shortcut-apply="next-tab"]').click();
  await expect(page.locator(".shortcut-error")).toHaveText("shortcutConflict");
  assert.equal(
    await page.evaluate(() => window.shortcuts.getBindings()["next-tab"]),
    "Ctrl+Tab",
  );
  await page
    .locator('[data-shortcut-modifiers="next-tab"]')
    .selectOption("Mod");
  await page.locator('[data-shortcut-key="next-tab"]').selectOption("Q");
  await page.locator('[data-shortcut-apply="next-tab"]').click();
  await expect(page.locator(".shortcut-error")).toHaveText("shortcutReserved");
  await page.locator('[data-shortcut-cancel="next-tab"]').click();
  await page.locator('[data-shortcut-clear="toggle-mode"]').click();
  assert.equal(
    await page.evaluate(
      () => window.shortcuts.getMenuAccelerators()["toggle-mode"],
    ),
    "",
  );
  await page.reload();
  await page.waitForFunction(() => window.ready);
  assert.equal(
    await page.evaluate(() => window.shortcuts.getBindings()["toggle-mode"]),
    "",
  );
  await page.locator("[data-shortcut-reset]").click();
  assert.equal(
    await page.evaluate(() => window.shortcuts.getBindings()["toggle-mode"]),
    "Mod+Shift+P",
  );
  await page.evaluate(() => {
    document
      .querySelector("#typing")
      .dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "P",
          code: "KeyP",
          metaKey: true,
          shiftKey: true,
          bubbles: true,
        }),
      );
    document
      .querySelector(".cm-content")
      .dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "P",
          code: "KeyP",
          metaKey: true,
          shiftKey: true,
          bubbles: true,
        }),
      );
  });
  assert.deepEqual((await page.evaluate(() => window.results)).slice(-2), [
    null,
    "toggle-mode",
  ]);
  await page.locator('[data-shortcut-edit="toggle-mode"]').click();
  await page.locator('[data-shortcut-apply="toggle-mode"]').focus();
  await page.keyboard.press("Escape");
  await expect(page.locator('[data-shortcut-apply="toggle-mode"]')).toHaveCount(
    0,
  );
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS: explicit shortcut editing, native accelerator conversion, conflict/reserved validation, disabled binding persistence, reset, textfield exclusion, editor matching, Escape and mobile width. No physical system shortcut was pressed.",
  );
} finally {
  await browser.close();
}
