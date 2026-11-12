import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1100, height: 700 },
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/app-menu-test", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<!doctype html><style>:root{--border:#343834;--panel:#252725;--sidebar:#202220;--text:#ddd;--muted:#888;--accent:#66cc66}*{box-sizing:border-box}body{margin:0;background:#202220}button{border:0;background:none;color:inherit;cursor:pointer;font:inherit}</style><nav id="menu"></nav><button id="outside">outside</button><script type="module">import {createAppMenu} from '/src/app-menu.ts';window.calls=[];window.language='';window.menu=createAppMenu({container:document.querySelector('#menu'),t:key=>language+key,onAction:action=>calls.push(action)});window.ready=true;</script>`,
    }),
  );
  await page.goto("http://localhost:5173/app-menu-test");
  await page.waitForFunction(() => window.ready, null, { timeout: 10000 });
  await page.locator('[data-menu="menuFile"]').click();
  await expect(page.locator('[data-menu-action="save"]')).toBeDisabled();
  await page.locator('[data-menu-action="open"]').click();
  assert.deepEqual(await page.evaluate(() => window.calls), ["open"]);
  await expect(page.locator("#app-menu-1-0")).toBeHidden();
  await page.evaluate(() => window.menu.refresh({ hasDocument: true }));
  await page.locator('[data-menu="menuFile"]').focus();
  await page.keyboard.press("ArrowDown");
  await expect(page.locator('[data-menu-action="new"]')).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(page.locator('[data-menu-action="open"]')).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.locator('[data-menu="menuFile"]')).toBeFocused();
  await page.locator('[data-menu="menuFormat"]').click();
  await page.locator('[data-menu-action="heading-3"]').click();
  assert.equal((await page.evaluate(() => window.calls)).at(-1), "heading-3");
  await page.locator('[data-menu="menuFile"]').click();
  await expect(page.locator('[data-menu-action="save"]')).toBeEnabled();
  await page.mouse.click(900, 500);
  await expect(page.locator("#app-menu-1-0")).toBeHidden();
  await page.locator('[data-menu="settings"]').click();
  assert.equal((await page.evaluate(() => window.calls)).at(-1), "settings");
  await page.evaluate(() => {
    window.language = "translated ";
    window.menu.refresh({ hasDocument: true });
  });
  await expect(page.locator('[data-menu="menuFile"]')).toHaveText(
    "translated menuFile",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('[data-menu="menuHelp"]').click();
  const box = await page.locator("#app-menu-1-5").boundingBox();
  assert.ok(box.x >= 0 && box.x + box.width <= 390);
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await page.locator('[data-menu-action="cheatsheet"]').click();
  assert.equal((await page.evaluate(() => window.calls)).at(-1), "cheatsheet");
  assert.deepEqual(errors, []);
  console.log(
    "PASS: fallback menu actions, disabled document commands, keyboard navigation, outside/Escape close, locale refresh and mobile viewport.",
  );
} finally {
  await browser.close();
}
