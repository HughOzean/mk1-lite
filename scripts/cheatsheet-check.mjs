import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1100, height: 900 },
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(process.env.MARK1LIGHT_TEST_URL || "http://localhost:5173");
  await page.evaluate(async () => {
    const { createCheatsheet } = await import("/src/cheatsheet.ts");
    document.querySelector("#markdown-cheatsheet")?.remove();
    window.cheatLocale = "zh";
    window.cheat = createCheatsheet({
      t: (key) => key,
      getLocale: () => window.cheatLocale,
    });
    const button = document.createElement("button");
    button.id = "cheat-test-button";
    button.textContent = "Markdown cheatsheet";
    button.style.cssText = "position:fixed;z-index:500;top:4px;left:4px";
    button.addEventListener("click", () => window.cheat.open());
    document.body.append(button);
  });
  const before = await page
    .locator(".cm-content")
    .textContent()
    .catch(() => "");
  const requested = [];
  page.on("request", (request) => requested.push(request.url()));
  await page.locator("#cheat-test-button").click();
  await expect(page.locator("#markdown-cheatsheet")).toBeVisible();
  await expect(page.locator(".cheatsheet-reference>tbody>tr")).toHaveCount(18);
  await expect(page.locator("#cheatsheet-title")).toHaveText("Markdown语法表");
  for (const level of [1, 2, 3, 4, 5])
    await expect(page.locator(`.cheatsheet-result h${level}`)).toHaveCount(1);
  await expect(page.locator(".cheatsheet-result img")).toHaveCount(0);
  await expect(page.locator(".cheatsheet-result svg")).toHaveCount(1);
  await expect(page.locator(".cheatsheet-result table")).toHaveCount(1);
  assert.equal(
    requested.length,
    0,
    "Opening the reference must not request images or other resources",
  );
  assert.equal(
    await page
      .locator(".cm-content")
      .textContent()
      .catch(() => ""),
    before,
  );
  await page.keyboard.press("Escape");
  await expect(page.locator("#markdown-cheatsheet")).toBeHidden();
  await expect(page.locator("#cheat-test-button")).toBeFocused();
  for (const locale of ["en", "pt", "fr", "de", "ru", "zh"]) {
    await page.evaluate((locale) => {
      window.cheatLocale = locale;
      window.cheat.open();
    }, locale);
    await expect(page.locator('#cheatsheet-title')).toHaveText(locale==='zh'?'Markdown语法表':'Markdown cheatsheet');
    await expect(
      page.locator(".cheatsheet-reference>thead th").first(),
    ).not.toBeEmpty();
    await page.evaluate(() => window.cheat.close());
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator("#cheat-test-button").click();
  assert.ok(
    await page
      .locator("#markdown-cheatsheet")
      .evaluate(
        (el) =>
          el.getBoundingClientRect().right <= innerWidth &&
          el.getBoundingClientRect().left >= 0,
      ),
  );
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await page.screenshot({ path: "artifacts/cheatsheet-mobile.png" });
  assert.deepEqual(errors, []);
  console.log(
    "PASS: offline Markdown cheatsheet, H1–H5, rendered syntax table, no document changes or asset requests, six languages, focus restoration, Escape and mobile width.",
  );
} finally {
  await browser.close();
}
