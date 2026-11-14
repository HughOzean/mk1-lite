import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";

const base = process.env.MARK1LIGHT_TEST_URL || "http://localhost:5173";
const browser = await chromium.launch({ channel: "chrome", headless: true });
await mkdir("artifacts", { recursive: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 960 },
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(base);
  await expect(page.locator("#empty-state")).toBeVisible();
  const newTab = page.locator(".new-document-tab");
  await expect(newTab).toBeVisible();
  await newTab.click();
  await expect(page.locator(".document-tab")).toHaveCount(1);
  const editor = page.locator(".cm-content");
  async function replaceDocument(text) {
    await editor.click();
    await page.keyboard.press("ControlOrMeta+A");
    await page.keyboard.insertText(text);
  }
  async function selectDocument() {
    await editor.click();
    await page.keyboard.press("ControlOrMeta+A");
  }
  const documentText = () =>
    page
      .locator(".cm-content .cm-line")
      .allTextContents()
      .then((lines) => lines.join("\n"));

  await replaceDocument("first item\nsecond item");
  await selectDocument();
  await page.locator('[data-format="orderedList"]').click();
  await expect(page.locator("#preview ol > li")).toHaveCount(2);
  assert.match(await documentText(), /^1\. first item\n2\. second item$/);
  await page.locator('[data-format="orderedList"]').click();
  assert.equal(await documentText(), "first item\nsecond item");

  await replaceDocument("removed phrase");
  await selectDocument();
  await page.locator('[data-format="strike"]').click();
  await expect(page.locator("#preview s")).toHaveText("removed phrase");
  assert.equal(await documentText(), "~~removed phrase~~");

  await replaceDocument("const value = 1;");
  await selectDocument();
  await page.locator('[data-format="inlineCode"]').click();
  await expect(page.locator("#preview p > code")).toHaveText(
    "const value = 1;",
  );
  assert.equal(await documentText(), "`const value = 1;`");

  await replaceDocument("a `quoted` value");
  await selectDocument();
  await page.locator('[data-format="inlineCode"]').click();
  await expect(page.locator("#preview p > code")).toHaveText(
    "a `quoted` value",
  );

  await replaceDocument("paragraph");
  await page.keyboard.press("ControlOrMeta+End");
  await page.locator('[data-format="rule"]').click();
  await expect(page.locator("#preview hr")).toHaveCount(1);
  await expect(page.locator("#preview p")).toHaveText("paragraph");

  const editorSize = () =>
    page
      .locator(".cm-editor")
      .evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  const previewSize = () =>
    page.locator("#preview").evaluate((el) => getComputedStyle(el).fontSize);
  const beforeSize = await editorSize();
  const previewBefore = await previewSize();
  const beforeZoomDocument = await documentText();
  await page.locator('[data-action="zoom-in"]').click();
  await expect.poll(editorSize).toBeGreaterThan(beforeSize);
  assert.equal(await previewSize(), previewBefore);
  await page.locator('[data-action="zoom-out"]').click();
  await expect.poll(editorSize).toBe(beforeSize);
  assert.equal(await previewSize(), previewBefore);
  assert.equal(await documentText(), beforeZoomDocument);

  const outlineSource =
    "# Parent\n\nParent body\n\n## Child\n\nChild body\n\n### Grandchild\n\nGrandchild body\n\n# Other\n\nOther body";
  await replaceDocument(outlineSource);
  await page.locator('[data-side="outline"]').click();
  await expect(page.locator('[data-heading="0"]')).toBeVisible();
  await expect(page.locator('[data-heading="1"]')).toBeVisible();
  await expect(page.locator('[data-heading="2"]')).toBeVisible();
  await page.locator('[data-outline-toggle="0"]').click();
  await expect(page.locator('[data-heading="1"]')).toBeHidden();
  await expect(page.locator('[data-heading="2"]')).toBeHidden();
  await expect(page.locator('[data-heading="3"]')).toBeVisible();
  assert.equal(await documentText(), outlineSource);
  await page.locator('[data-outline-toggle="0"]').click();
  await expect(page.locator('[data-heading="1"]')).toBeVisible();
  await page.locator('[data-action="outline-collapse"]').click();
  await expect(page.locator('[data-heading="1"]')).toBeHidden();
  await expect(page.locator('[data-heading="3"]')).toBeVisible();
  await page.locator('[data-action="outline-expand"]').click();
  await expect(page.locator('[data-heading="2"]')).toBeVisible();
  assert.equal(await documentText(), outlineSource);
  await expect(page.locator("#preview h3")).toHaveText("Grandchild");

  await page.locator('[data-outline-toggle="0"]').click();
  await newTab.click();
  await expect(page.locator(".document-tab")).toHaveCount(2);
  await expect(editor).toHaveText("");
  await page.locator("[data-tab]").first().click();
  assert.equal(await documentText(), outlineSource);
  await expect(page.locator('[data-heading="1"]')).toBeHidden();
  await page.locator('[data-action="outline-expand"]').click();
  await expect(page.locator('[data-heading="2"]')).toBeVisible();

  // Persisted editor zoom stays separate from preview preferences and clamps safely.
  for (let step = beforeSize; step < 28; step++)
    await page.locator('[data-action="zoom-in"]').click();
  await expect.poll(editorSize).toBe(28);
  await expect(page.locator('[data-action="zoom-in"]')).toBeDisabled();
  assert.equal(await previewSize(), previewBefore);
  for (let step = 28; step > 10; step--)
    await page.locator('[data-action="zoom-out"]').click();
  await expect.poll(editorSize).toBe(10);
  await expect(page.locator('[data-action="zoom-out"]')).toBeDisabled();
  await page.reload();
  await expect.poll(editorSize).toBe(10);
  assert.equal(await previewSize(), previewBefore);
  assert.equal(await documentText(), outlineSource);
  for (let step = 10; step < beforeSize; step++)
    await page.locator('[data-action="zoom-in"]').click();

  await page.screenshot({ path: "artifacts/desktop-features.png" });
  await page.setViewportSize({ width: 1024, height: 768 });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await expect(page.locator('[data-action="zoom-in"]')).toBeVisible();
  await expect(page.locator('[data-format="orderedList"]')).toBeVisible();
  assert.deepEqual(errors, []);
  console.log(
    "PASS: new-document tab, multiline ordered list, strikethrough, inline code, horizontal rule, editor-only font zoom, outline branch/all folding without document changes, desktop layout, no runtime errors.",
  );
} finally {
  await browser.close();
}
