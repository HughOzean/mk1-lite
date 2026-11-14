import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
const base = process.env.MARK1LIGHT_SITE_URL || "http://127.0.0.1:5180";
const browser = await chromium.launch({ channel: "chrome", headless: true });
await mkdir("artifacts", { recursive: true });
try {
  const errors = [];
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(base);
  await expect(page.locator("#release-status")).not.toContainText("正在读取");
  const response = await page.request.get(`${base}/releases.json`);
  assert.equal(response.status(), 200);
  const release = await response.json();
  async function checkCards(target, manifest) {
    for (const platform of ["macos", "macos-intel", "windows", "android"]) {
      const card = target.locator(`[data-platform="${platform}"]`),
        file = manifest.platforms[platform];
      await expect(card).toBeVisible();
      await expect(card.locator("[data-platform-version]")).toHaveText(
        `v${file?.version || manifest.version}`,
      );
      if (file?.available) {
        await expect(card.locator(".download-button")).toBeVisible();
        await expect(card.locator(".download-button")).toHaveAttribute(
          "href",
          `${manifest.repository}/releases/download/${encodeURIComponent(file.tag || manifest.tag)}/${encodeURIComponent(file.asset)}`,
        );
        await expect(card.locator(".checksum code")).toHaveText(file.sha256);
        assert.match(file.sha256, /^[0-9a-f]{64}$/);
      } else {
        await expect(card.locator(".download-button")).toBeHidden();
        await expect(card.locator(".pending-button")).toBeDisabled();
      }
    }
  }
  await checkCards(page, release);
  await expect(page.locator('[data-i18n="androidMinimum"]')).toContainText(
    "Android 8.0",
  );
  await expect(page.locator('[data-i18n="androidSigning"]')).toContainText(
    "调试",
  );
  await expect(page.locator('[data-i18n="androidStep2"]')).toContainText(
    "草稿",
  );
  await page.locator("#language").click();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.locator('[data-i18n="androidSigning"]')).toContainText(
    "Debug-signed",
  );
  await expect(page.locator('[data-i18n="androidStep3"]')).toContainText(
    "Always",
  );
  if (release.platforms.android?.available)
    await expect(
      page.locator('[data-platform="android"] .download-button'),
    ).toContainText("Download Android APK");
  await expect(
    page.locator('[data-platform="macos-intel"] .download-button'),
  ).toContainText("Download macOS Intel");
  await expect(page.locator('[data-i18n="macIntelSigning"]')).toContainText(
    "Intel device testing",
  );
  await page.locator("#language").click();
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
  await page.locator("#preview-mode").click();
  await page.locator("#preview-mode").click();
  await page.screenshot({ path: "artifacts/download-page-desktop.png" });
  for (const width of [320, 390, 768]) {
    const mobile = await browser.newPage({ viewport: { width, height: 844 } });
    mobile.on("pageerror", (error) => errors.push(error.message));
    await mobile.goto(`${base}/mk1-lite/`);
    await expect(mobile.locator("#release-status")).not.toContainText(
      "正在读取",
    );
    assert.equal(await mobile.locator("header.site-header").count(), 1);
    assert.equal(await mobile.locator("section.hero").count(), 1);
    assert.ok(
      await mobile.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      `overflow at ${width}`,
    );
    await checkCards(mobile, release);
    if (width === 390) {
      await mobile.screenshot({ path: "artifacts/download-page-mobile.png" });
      await mobile
        .locator('[data-platform="android"]')
        .scrollIntoViewIfNeeded();
      await mobile.screenshot({
        path: "artifacts/download-page-mobile-downloads.png",
      });
    }
    await mobile.close();
  }
  // A routed manifest proves per-platform tags work independently of the live release values.
  const independent = structuredClone(release);
  independent.platforms.android = {
    available: true,
    version: "0.2.8",
    tag: "android-v0.2.8",
    asset: "Mk1-Lite-0.2.8-debug.apk",
    bytes: 1688007,
    sha256: "a".repeat(64),
  };
  await page.route("**/releases.json", (route) =>
    route.fulfill({ json: independent }),
  );
  await page.reload();
  await checkCards(page, independent);
  delete independent.platforms["macos-intel"];
  // Existing manifests without an Android release remain usable and keep its button disabled.
  delete independent.platforms.android;
  await page.reload();
  await checkCards(page, independent);
  assert.deepEqual(errors, []);
  console.log(
    "PASS: four download cards, independent release tags/versions/checksums, legacy manifest fallback, Android bilingual instructions, 320/390/768px layouts and GitHub Pages subpath.",
  );
} finally {
  await browser.close();
}
