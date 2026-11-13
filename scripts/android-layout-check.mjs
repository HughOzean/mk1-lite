import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const url = process.env.MARK1LIGHT_TEST_URL || "http://localhost:5173";
try {
  const page = await browser.newPage({
    viewport: { width: 398, height: 850 },
    isMobile: true,
    hasTouch: true,
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${url}/?android-preview=1`);
  await page.locator('.mode-toggle [data-mode="editor"]').click();
  await page
    .locator(".cm-content")
    .fill(
      '# 代码显示\n\n```js\nconsole.log("hello");\n```\n\n```text\n' +
        Array.from(
          { length: 80 },
          (_, i) => `${i}: ${"long text ".repeat(20)}`,
        ).join("\n") +
        "\n```",
    );
  await page.locator('.mode-toggle [data-mode="preview"]').click();
  const blocks = page.locator("#preview pre");
  await expect(blocks).toHaveCount(2);
  await expect(blocks.nth(1)).toBeVisible();
  for (const width of [320, 398, 768]) {
    await page.setViewportSize({ width, height: 850 });
    await expect
      .poll(
        () =>
          blocks.evaluateAll(
            (elements) =>
              elements.length === 2 &&
              elements.every((el) => {
                const box = el.getBoundingClientRect();
                return box.width > 0 && Math.abs(box.width - box.height) < 2;
              }),
          ),
        { message: `code surfaces should stay square at ${width}` },
      )
      .toBe(true);
    await expect
      .poll(
        () =>
          blocks
            .nth(1)
            .evaluate(
              (el) =>
                el.scrollHeight > el.clientHeight &&
                el.scrollWidth > el.clientWidth,
            ),
        { message: "long code should scroll in both directions" },
      )
      .toBe(true);
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      "code must not widen the screen",
    );
  }
  await page.setViewportSize({ width: 398, height: 850 });
  await page.locator('.component-bar [data-action="settings"]').click();
  await page.locator("#topSpace").fill("48");
  await expect(page.locator("#topSpace-value")).toHaveText("48px");
  await page.locator("#squareCode").uncheck();
  await page.locator('[data-action="close-settings"]').first().click();
  assert.equal(Math.round((await page.locator(".topbar").boundingBox()).y), 48);
  assert.ok(
    (await blocks.first().boundingBox()).height < 120,
    "compact mode restores content height",
  );
  await page.reload();
  assert.equal(
    Math.round((await page.locator(".topbar").boundingBox()).y),
    48,
    "top spacing persists",
  );
  assert.ok(
    (await blocks.first().boundingBox()).height < 120,
    "code preference persists",
  );
  await page.locator('.component-bar [data-action="settings"]').click();
  await page.locator("#squareCode").check();
  await page.locator(".settings-body").evaluate((el) => {
    el.scrollTop = 0;
  });
  await page.screenshot({
    path: "artifacts/android/screen-settings.png",
    animations: "disabled",
  });
  await page.locator('[data-action="close-settings"]').first().click();
  await blocks.first().scrollIntoViewIfNeeded();
  await page.screenshot({ path: "artifacts/android/square-code.png" });
  await page.locator('.component-bar [data-action="settings"]').click();
  await page.locator('[data-action="reset"]').click();
  await expect(page.locator("#topSpace")).toHaveValue("0");
  await expect(page.locator("#squareCode")).toBeChecked();
  await page.locator('[data-action="close-settings"]').first().click();
  assert.equal(Math.round((await page.locator(".topbar").boundingBox()).y), 0);
  assert.deepEqual(errors, []);
  console.log(
    "PASS: square short/long code, internal scrolling, responsive widths, top spacing, persistence and reset.",
  );
} finally {
  await browser.close();
}
