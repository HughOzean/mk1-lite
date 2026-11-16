import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
const base = process.env.MARK1LIGHT_TEST_URL || "http://localhost:5173";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const errors = [];
await mkdir("artifacts", { recursive: true });
try {
  const context = await browser.newContext({
    viewport: { width: 800, height: 800 },
    hasTouch: true,
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/autosave-harness", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: '<!doctype html><html><head><title>Auto-save settings test</title></head><body><main id="harness" style="max-width:460px;margin:32px auto;padding:20px"></main></body></html>',
    }),
  );
  await page.goto(`${base}/autosave-harness`);
  await page.evaluate(async () => {
    await import("/src/style.css");
    const { createAutoSave, normalizeAutoSaveSettings } =
      await import("/src/autosave.ts");
    window.settings = normalizeAutoSaveSettings();
    window.locale = "en";
    window.changes = [];
    window.saves = 0;
    window.available = true;
    const container = document.querySelector("#harness");
    container.style.display = "none";
    window.autosave = createAutoSave({
      container,
      getLocale: () => window.locale,
      getSettings: () => window.settings,
      onSettingsChange: (settings) => {
        window.settings = settings;
        window.changes.push({ ...settings });
      },
      canSave: () => window.available,
      save: async () => {
        window.saves++;
      },
    });
  });
  const hours = page.locator('[data-autosave-wheel="hours"]');
  const minutes = page.locator('[data-autosave-wheel="minutes"]');
  const toggle = page.locator("[data-autosave-enabled]");
  await expect(toggle).toBeChecked();
  await expect(hours).toHaveAttribute("aria-valuenow", "0");
  await expect(minutes).toHaveAttribute("aria-valuenow", "15");
  await page.evaluate(
    () => (document.querySelector("#harness").style.display = "block"),
  );
  await expect
    .poll(() => minutes.evaluate((el) => Math.round(el.scrollTop)))
    .toBe(15 * 36);
  // Closing immediately after the visibility-driven scroll must not save 0.
  await page.evaluate(
    () => (document.querySelector("#harness").style.display = "none"),
  );
  await page.waitForTimeout(250);
  assert.equal(await page.evaluate(() => window.settings.intervalMinutes), 15);
  assert.equal(await page.evaluate(() => window.changes.length), 0);
  // Theme/locale refreshes while hidden must also preserve the selected value.
  await page.evaluate(() => {
    window.locale = "fr";
    document.documentElement.dataset.theme = "light";
    window.autosave.refresh();
  });
  await page.waitForTimeout(250);
  assert.equal(await page.evaluate(() => window.settings.intervalMinutes), 15);
  assert.equal(await page.evaluate(() => window.changes.length), 0);
  await page.evaluate(() => {
    window.locale = "en";
    delete document.documentElement.dataset.theme;
    window.autosave.refresh();
    document.querySelector("#harness").style.display = "block";
  });
  await expect
    .poll(() => minutes.evaluate((el) => Math.round(el.scrollTop)))
    .toBe(15 * 36);
  // A wheel scrolled just before its container closes must not commit hidden 0.
  await page.evaluate(async () => {
    document.querySelector('[data-autosave-wheel="minutes"]').scrollTop =
      11 * 36;
    await new Promise((resolve) => requestAnimationFrame(resolve));
    document.querySelector("#harness").style.display = "none";
  });
  await page.waitForTimeout(250);
  assert.equal(await page.evaluate(() => window.settings.intervalMinutes), 15);
  assert.equal(await page.evaluate(() => window.changes.length), 0);
  // An external settings update while closed is positioned when reopened.
  await page.evaluate(() => {
    window.settings.intervalMinutes = 40;
    window.autosave.refresh();
  });
  await page.waitForTimeout(250);
  assert.equal(await page.evaluate(() => window.settings.intervalMinutes), 40);
  assert.equal(await page.evaluate(() => window.changes.length), 0);
  await page.evaluate(
    () => (document.querySelector("#harness").style.display = "block"),
  );
  await expect
    .poll(() => minutes.evaluate((el) => Math.round(el.scrollTop)))
    .toBe(40 * 36);
  await page.evaluate(() => {
    window.settings.intervalMinutes = 15;
    window.autosave.refresh();
  });
  await expect(minutes).toHaveAttribute("aria-valuenow", "15");
  await minutes.focus();
  await page.keyboard.press("ArrowDown");
  await expect(minutes).toHaveAttribute("aria-valuenow", "16");
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("Home");
  await expect(minutes).toHaveAttribute("aria-valuenow", "1");
  await expect(page.locator(".autosave-minimum")).toContainText(
    "minimum of 1 minute",
  );
  assert.equal(await page.evaluate(() => window.settings.intervalMinutes), 1);
  await hours.focus();
  await page.keyboard.press("End");
  await minutes.focus();
  await page.keyboard.press("End");
  assert.equal(
    await page.evaluate(() => window.settings.intervalMinutes),
    1439,
  );
  await hours.focus();
  await page.keyboard.press("Home");
  await minutes.focus();
  await page.keyboard.press("Home");
  await minutes.hover();
  await page.mouse.wheel(0, 108);
  await expect
    .poll(async () => Number(await minutes.getAttribute("aria-valuenow")))
    .toBeGreaterThan(1);
  const afterWheel = Number(await minutes.getAttribute("aria-valuenow"));
  assert.equal(
    await page.evaluate(() => window.settings.intervalMinutes),
    afterWheel,
  );
  // Chrome's native touch scrolling exercises the same scroll-snap commit path.
  const box = await minutes.boundingBox();
  const cdp = await context.newCDPSession(page);
  const x = box.x + box.width / 2,
    y = box.y + box.height / 2;
  const beforeTouch = Number(await minutes.getAttribute("aria-valuenow"));
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x, y: y + 30 }],
  });
  for (let step = 1; step <= 6; step++) {
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x, y: y + 30 - step * 12 }],
    });
    await page.waitForTimeout(20);
  }
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await expect
    .poll(async () => Number(await minutes.getAttribute("aria-valuenow")))
    .toBeGreaterThan(beforeTouch);
  await cdp.detach();
  for (const [locale, label] of [
    ["zh", "小时"],
    ["en", "Hours"],
    ["pt", "Horas"],
    ["fr", "Heures"],
    ["de", "Stunden"],
    ["ru", "Часы"],
  ]) {
    await page.evaluate((locale) => {
      window.locale = locale;
      window.autosave.refresh();
    }, locale);
    await expect(hours).toHaveAttribute("aria-label", label);
  }
  await page.evaluate(() => {
    window.locale = "zh";
    window.autosave.refresh();
  });
  await page.screenshot({ path: "artifacts/autosave-settings-dark.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await page.evaluate(() => (document.documentElement.dataset.theme = "light"));
  await page.screenshot({
    path: "artifacts/autosave-settings-light-mobile.png",
  });
  await page.evaluate(async () => {
    window.available = false;
    await window.autosave.runNow();
  });
  assert.equal(await page.evaluate(() => window.saves), 0);
  await page.evaluate(async () => {
    window.available = true;
    await window.autosave.runNow();
  });
  assert.equal(await page.evaluate(() => window.saves), 1);
  await toggle.uncheck();
  assert.equal(await page.evaluate(() => window.settings.enabled), false);
  await page.evaluate(async () => {
    await window.autosave.runNow();
  });
  assert.equal(await page.evaluate(() => window.saves), 1);
  await page.evaluate(() => window.autosave.destroy());
  await expect(page.locator(".autosave-settings")).toHaveCount(0);
  assert.deepEqual(errors, []);
  console.log(
    "PASS: 15-minute defaults, persistence callbacks, hour/minute keyboard/mouse/touch wheels, 1-minute minimum, six languages, hidden-dialog initialization/close/refresh, themes/mobile, disabled/busy skips and cleanup.",
  );
} finally {
  await browser.close();
}
