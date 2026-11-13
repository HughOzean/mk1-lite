import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const url = process.env.MARK1LIGHT_TEST_URL || "http://localhost:5173";
await mkdir("artifacts/android", { recursive: true });
try {
  const page = await browser.newPage({
    viewport: { width: 398, height: 796 },
    isMobile: true,
    hasTouch: true,
    acceptDownloads: true,
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${url}/?android-preview=1`);
  await expect(page.locator("#preview h1")).toHaveText("把灵感，留在此刻");
  await expect(page.locator(".mobile-actions")).toBeVisible();
  await expect(page.locator("#app-menu")).toBeHidden();
  await expect(page.locator(".editor-pane")).toBeHidden();
  assert.equal(
    await page.evaluate(() => localStorage.getItem("m1-workspace-v2")),
    null,
  );
  for (const width of [320, 360, 398, 430, 768]) {
    await page.setViewportSize({ width, height: 796 });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
      `overflow at ${width}`,
    );
    await expect(
      page.locator('.mode-toggle [data-mode="preview"]'),
    ).toBeInViewport();
    await expect(
      page.locator('.mobile-actions [data-action="save"]'),
    ).toBeInViewport();
  }
  await page.setViewportSize({ width: 398, height: 796 });
  await page.screenshot({ path: "artifacts/android/reading.png" });
  await page.locator('.mode-toggle [data-mode="editor"]').click();
  await expect(page.locator(".editor-pane")).toBeVisible();
  await expect(page.locator(".format-toolbar")).toBeVisible();
  const content = page.locator(".cm-content");
  await content.fill("# 手机编辑测试\n\n保存我的灵感。");
  await page.locator('.mode-toggle [data-mode="preview"]').click();
  await expect(page.locator("#preview h1")).toHaveText("手机编辑测试");
  await page.locator('.mode-toggle [data-mode="editor"]').click();
  await page.screenshot({ path: "artifacts/android/editing.png" });
  await page.locator('.topbar [data-action="sidebar"]').click();
  await expect(page.locator(".sidebar")).toBeVisible();
  await page.screenshot({ path: "artifacts/android/files.png" });
  await page
    .locator(".sidebar-backdrop")
    .click({ position: { x: 370, y: 300 } });
  await page.locator('.component-bar [data-action="settings"]').click();
  await expect(page.locator("#settings")).toBeVisible();
  await page.screenshot({ path: "artifacts/android/settings.png" });
  await page.locator('[data-action="close-settings"]').first().click();
  await page.reload();
  await expect(page.locator(".tab-name")).toContainText("随手记.md");
  await expect(content).toContainText("手机编辑测试");
  await page.locator('.mobile-actions [data-action="new"]').click();
  await expect(page.locator(".document-tab")).toHaveCount(2);
  const chooser = page.waitForEvent("filechooser");
  await page.locator('.mobile-actions [data-action="open"]').click();
  await (
    await chooser
  ).setFiles({
    name: "安卓导入.md",
    mimeType: "text/markdown",
    buffer: Buffer.from("# 导入成功"),
  });
  await expect(page.locator(".document-tab")).toHaveCount(3);
  await page.locator('.mobile-actions [data-action="save"]').click();
  // Android bridge contract: URI restored across reload, cancel and success handling.
  const native = await browser.newPage({
    viewport: { width: 398, height: 796 },
  });
  await native.addInitScript(() => {
    window.Mark1Android = {
      openFile(id) {
        window.dispatchEvent(
          new CustomEvent("mark1-android-result", {
            detail: {
              id,
              result: {
                name: "设备笔记.md",
                text: "# 原生文件",
                uri: "content://documents/test",
              },
            },
          }),
        );
      },
      saveFile(id, name, text, uri) {
        window.lastSave = { name, text, uri };
        window.dispatchEvent(
          new CustomEvent("mark1-android-result", {
            detail: {
              id,
              result: { name, text: "", uri: uri || "content://documents/new" },
            },
          }),
        );
      },
    };
  });
  await native.goto(url);
  await native.locator('.mobile-actions [data-action="open"]').click();
  await expect(native.locator(".tab-name")).toContainText("设备笔记.md");
  await native.locator('.mobile-actions [data-action="save"]').click();
  assert.equal(
    await native.evaluate(() => window.lastSave.uri),
    "content://documents/test",
  );
  await native.reload();
  await native.locator('.mobile-actions [data-action="save"]').click();
  assert.equal(
    await native.evaluate(() => window.lastSave.uri),
    "content://documents/test",
  );
  await native.locator('.mobile-actions [data-action="open"]').click();
  await expect(native.locator(".document-tab")).toHaveCount(1);
  assert.deepEqual(errors, []);
  const shell = await browser.newPage({
    viewport: { width: 1280, height: 1000 },
    deviceScaleFactor: 1,
  });
  await shell.goto(`${url}/android-preview.html`);
  await expect(
    shell.frameLocator("iframe").locator("#preview h1"),
  ).toBeVisible();
  await shell.screenshot({ path: "artifacts/android/preview.png" });
  console.log(
    "PASS: mobile widths, editing, file import/export, drawer/settings, draft restore, Android bridge and preview.",
  );
} finally {
  await browser.close();
}
