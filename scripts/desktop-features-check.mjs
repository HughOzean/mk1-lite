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
  await expect(page.locator("#tab-list > *")).toHaveCount(1);
  await expect(page.locator("#tab-list > :last-child")).toHaveClass(
    /new-document-tab/,
  );
  await newTab.click();
  await expect(page.locator(".document-tab")).toHaveCount(1);
  async function checkTrailingTab() {
    await expect(page.locator("#tab-list > :last-child")).toHaveClass(
      /new-document-tab/,
    );
    await expect(page.locator(".new-document-tab")).toHaveCount(1);
    const dimensions = await page.locator("#tab-list").evaluate((list) => {
      const last = list.querySelector(".document-tab:last-of-type");
      const plus = list.querySelector(".new-document-tab");
      const tab = last?.getBoundingClientRect();
      const add = plus.getBoundingClientRect();
      return tab
        ? {
            width: tab.width,
            height: tab.height,
            addWidth: add.width,
            addHeight: add.height,
            gap: add.left - tab.right,
          }
        : null;
    });
    assert.ok(dimensions);
    assert.ok(
      Math.abs(dimensions.width / 4 - dimensions.addWidth) < 1,
      "new tab width is one quarter of document tab",
    );
    assert.ok(
      Math.abs(dimensions.height - dimensions.addHeight) < 1,
      "new tab height matches document tab",
    );
    assert.ok(
      Math.abs(dimensions.gap) < 1,
      "new tab directly follows the final document tab",
    );
  }
  await checkTrailingTab();
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

  await expect(
    page.locator('[data-format="list"] + [data-format="orderedList"]'),
  ).toHaveCount(1);
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
  await expect(page.locator('[data-heading="0"]')).toHaveText("Parent");
  await expect(page.locator('[data-heading="0"] .outline-hash')).toHaveCount(0);
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
  await checkTrailingTab();
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

  // Indentation is a persistent rendering preference; Markdown stays unchanged.
  await replaceDocument(
    "# Title\n\nBody paragraph\n\nSecond paragraph\n\n> Quoted paragraph\n\n- List item\n\n```\ncode\n```",
  );
  const indentSource = await documentText();
  await expect(page.locator("#preview > p")).toHaveCount(2);
  await expect(page.locator("#preview > p").first()).toHaveCSS(
    "text-indent",
    "0px",
  );
  await page.locator('[data-action="settings"]').click();
  await page.locator("#paragraphIndent").check();
  await page
    .locator('#settings [data-action="close-settings"]')
    .first()
    .click();
  const indent = await page
    .locator("#preview")
    .evaluate((el) => `${parseFloat(getComputedStyle(el).fontSize) * 2}px`);
  await expect(page.locator("#preview > p").first()).toHaveCSS(
    "text-indent",
    indent,
  );
  await expect(page.locator("#preview > p").nth(1)).toHaveCSS(
    "text-indent",
    indent,
  );
  await expect(page.locator("#preview blockquote p")).toHaveCSS(
    "text-indent",
    "0px",
  );
  await expect(page.locator("#preview li")).toHaveCSS("text-indent", "0px");
  await expect(page.locator("#preview h1")).toHaveCSS("text-indent", "0px");
  assert.equal(await documentText(), indentSource);
  await page.reload();
  await expect(page.locator("#preview > p").first()).toHaveCSS(
    "text-indent",
    indent,
  );
  assert.equal(await documentText(), indentSource);
  await page.locator('[data-action="settings"]').click();
  await expect(page.locator("#paragraphIndent")).toBeChecked();
  await page.locator("#paragraphIndent").uncheck();
  await page
    .locator('#settings [data-action="close-settings"]')
    .first()
    .click();
  await expect(page.locator("#preview > p").first()).toHaveCSS(
    "text-indent",
    "0px",
  );
  await page.screenshot({ path: "artifacts/desktop-features.png" });
  await page.setViewportSize({ width: 1024, height: 768 });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await expect(page.locator('[data-action="zoom-in"]')).toBeVisible();
  await expect(page.locator('[data-format="orderedList"]')).toBeVisible();
  // The add tab stays beside the last document even when the strip overflows.
  for (let index = 0; index < 9; index++) await newTab.click();
  await checkTrailingTab();
  assert.ok(
    await page
      .locator("#tab-list")
      .evaluate((list) => list.scrollWidth > list.clientWidth),
  );
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  const addBounds = await newTab.boundingBox();
  assert.ok(addBounds.x >= 0 && addBounds.x + addBounds.width <= 1024);
  await page.screenshot({ path: "artifacts/workspace-tabs-overflow.png" });

  // App-owned save controls use theme accent green, never the high-saturation highlight.
  await page.locator("[data-close-tab]").last().click();
  await expect(page.locator("#close-document")).toBeVisible();
  const saveChoice = page.locator('[data-close-choice="save"]');
  await expect(saveChoice).toHaveCSS("background-color", "rgb(102, 204, 102)");
  await expect(saveChoice).toHaveCSS("border-top-color", "rgb(102, 204, 102)");
  await page.screenshot({ path: "artifacts/workspace-save-green.png" });
  await page.locator('[data-close-choice="cancel"]').click();
  await page.locator('[data-menu="menuFile"]').click();
  await expect(page.locator('[data-menu-action="save"]')).toHaveCSS(
    "color",
    "rgb(102, 204, 102)",
  );
  await expect(page.locator('[data-menu-action="save-as"]')).toHaveCSS(
    "color",
    "rgb(102, 204, 102)",
  );
  await page.keyboard.press("Escape");
  assert.deepEqual(errors, []);
  console.log(
    "PASS: new-document tab, multiline ordered list, strikethrough, inline code, horizontal rule, editor-only font zoom, outline branch/all folding without document changes, desktop layout, quarter-width trailing add tab/overflow, Mk.1 green save actions, no runtime errors.",
  );
} finally {
  await browser.close();
}
