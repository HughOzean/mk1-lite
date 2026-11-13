import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 398, height: 850 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => {
    window.openQueue = [
      { name: "外部打开.md", text: "# 外部文件", uri: "content://files/1" },
    ];
    window.Mark1Android = {
      takeOpenedFiles() {
        const queue = window.openQueue;
        window.openQueue = [];
        return JSON.stringify(queue);
      },
      openFile() {},
      saveFile() {},
    };
    window.emitOpen = (file) => {
      window.openQueue.push(file);
      window.dispatchEvent(new Event("mark1-android-opened"));
    };
  });
  await page.goto(process.env.MARK1LIGHT_TEST_URL || "http://localhost:5173");
  await expect(page.locator(".tab-name")).toContainText("外部打开.md");
  await expect(page.locator(".cm-content")).toContainText("外部文件");
  await page.locator(".cm-content").fill("# 我的修改");
  await expect(page.locator(".cm-content")).toContainText("我的修改");
  await page.evaluate(() =>
    window.emitOpen({
      name: "外部打开.md",
      text: "# 不应覆盖草稿",
      uri: "content://files/1",
    }),
  );
  await expect(page.locator(".document-tab")).toHaveCount(1);
  await expect(page.locator(".cm-content")).toContainText("我的修改");
  await page.evaluate(() =>
    window.emitOpen({
      name: "第二篇.md",
      text: "# 第二篇内容",
      uri: "content://files/2",
    }),
  );
  await expect(page.locator(".document-tab")).toHaveCount(2);
  await expect(page.locator(".cm-content")).toContainText("第二篇内容");
  await page.reload();
  await expect(page.locator(".document-tab")).toHaveCount(2);
  await expect(page.locator(".cm-content")).toContainText("我的修改");
  await page.evaluate(() =>
    window.emitOpen({
      error: "invalid-file",
      name: "photo.jpg",
      uri: "content://files/3",
      text: "",
    }),
  );
  await expect(page.locator(".document-tab")).toHaveCount(2);
  await expect(page.locator("#toast")).toHaveClass(/show/);
  assert.deepEqual(errors, []);
  console.log(
    "PASS: Android cold/warm external open, URI deduplication, preserved edits across repeat-open/reload, rejected-file handling.",
  );
} finally {
  await browser.close();
}
