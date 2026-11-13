import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 960 },
    acceptDownloads: true,
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  async function importFiles(files) {
    const pending = page.waitForEvent("filechooser");
    await menu("menuFile", "open");
    await (await pending).setFiles(files);
  }
  async function menu(group, action) {
    await page.locator(`[data-menu="${group}"]`).click();
    if (action) await page.locator(`[data-menu-action="${action}"]`).click();
  }
  const file = (name, text) => ({
    name,
    mimeType: "text/markdown",
    buffer: Buffer.from(text),
  });
  await page.addInitScript(() => {
    const files = new Map();
    document.addEventListener(
      "change",
      (event) => {
        if (event.target.id === "file-input")
          for (const file of event.target.files) files.set(file.name, file);
      },
      true,
    );
    window.showDirectoryPicker = async () => ({
      kind: "directory",
      name: "notes",
      async getFileHandle(name) {
        if (!files.has(name)) throw new Error("missing");
        return {
          kind: "file",
          name,
          async getFile() {
            return files.get(name);
          },
        };
      },
      async *entries() {
        for (const [name, file] of files)
          yield [
            name,
            {
              kind: "file",
              name,
              async getFile() {
                return file;
              },
            },
          ];
      },
    });
  });
  await page.goto(process.env.MARK1LIGHT_TEST_URL || "http://localhost:5173");
  await expect(page).toHaveTitle("Mk.1 Lite");
  await expect(page.locator("#empty-state")).toBeVisible();
  await expect(page.locator(".empty-mark")).toHaveText("Mk.1");
  assert.deepEqual(
    await page.locator("#heading-level option").allTextContents(),
    ["H1", "H2", "H3", "H4", "H5"],
  );
  assert.equal(
    await page
      .locator(
        '#app [data-action="new"],#app [data-action="open"],#app [data-action="save"]',
      )
      .count(),
    0,
  );
  await expect(page.locator(".component-bar button")).toHaveCount(4);
  await page.locator('[data-action="cheatsheet"]').click();
  await expect(page.locator("#markdown-cheatsheet")).toBeVisible();
  await expect(page.locator("#cheatsheet-title")).toHaveText("Markdown语法表");
  await page.keyboard.press("Escape");

  assert.equal(await page.locator("#file-associations").isVisible(), false);
  const alpha =
    "# Alpha\n\nfirst line\nsecond line\n\n" +
    "long-word ".repeat(140) +
    "\n\n## Child\n\nBody\n\n```md\n# fake\n```\n";
  await importFiles([
    file("Alpha.md", alpha),
    file("Beta.md", "# Beta\n\nBeta body\n"),
  ]);
  await expect(page.locator(".document-tab")).toHaveCount(2);
  await expect(page).toHaveTitle("Beta.md");
  const toggle = page.locator(".mode-toggle");
  assert.deepEqual(
    await page
      .locator(".component-bar button")
      .evaluateAll((elements) =>
        elements.map((el) => el.dataset.action || el.dataset.mode),
      ),
    ["cheatsheet", "settings", "editor", "preview"],
  );
  await toggle.locator('[data-mode="preview"]').click();
  await expect(toggle).toHaveAttribute("data-state", "preview");
  await expect(toggle.locator('[aria-pressed="true"]')).toHaveCSS(
    "background-color",
    "rgb(51, 255, 102)",
  );
  await expect(page.locator(".preview-pane")).toBeVisible();
  await expect(page.locator(".editor-pane")).toBeHidden();
  await toggle.locator('[data-mode="editor"]').click();
  await expect(toggle).toHaveAttribute("data-state", "editor");
  await expect(toggle.locator('[aria-pressed="true"]')).toHaveCSS(
    "background-color",
    "rgb(102, 204, 102)",
  );
  await page.keyboard.press("Meta+Shift+p");
  await expect(toggle).toHaveAttribute("data-state", "preview");
  await toggle.locator('[data-mode="editor"]').click();

  await expect(page.locator("#file-tree")).toBeVisible();
  await expect(page.locator("#outline-panel")).toBeHidden();
  await page.locator('[data-side="outline"]').click();
  await expect(page.locator("#file-tree")).toBeHidden();
  await expect(page.locator("#outline-panel")).toBeVisible();
  await page.locator("[data-tab]").filter({ hasText: "Alpha.md" }).click();
  await expect(page).toHaveTitle("Alpha.md");
  await expect(page.locator(".outline button")).toHaveCount(2);
  await page.locator('[data-side="files"]').click();
  await page.locator(".tree-choose").click();
  await expect(page.locator(".tree-row")).toHaveCount(2);
  await page.locator(".tree-row").filter({ hasText: "Alpha.md" }).click();
  await page.locator(".tree-row").filter({ hasText: "Alpha.md" }).click();
  await expect(page.locator(".document-tab")).toHaveCount(2);
  await page.locator('[data-side="outline"]').click();
  await page.locator(".cm-content").click();
  await page.keyboard.press("Meta+End");
  await page.keyboard.type("\nretained draft");
  await expect(page.locator("#preview")).toContainText("retained draft");
  await page.locator('[data-action="fold"]').click();
  assert.ok((await page.locator(".cm-foldPlaceholder").count()) > 0);
  await page.locator("[data-tab]").filter({ hasText: "Beta.md" }).click();
  await page.locator("[data-tab]").filter({ hasText: "Alpha.md" }).click();
  assert.ok((await page.locator(".cm-foldPlaceholder").count()) > 0);
  await page.locator('[data-action="unfold"]').click();
  await expect(page.locator("#preview")).toContainText("retained draft");
  await page.locator(".cm-content").click();
  await page.keyboard.press("Meta+z");
  await expect(page.locator("#preview")).not.toContainText("retained draft");
  await page.keyboard.press("Meta+Shift+z");
  await expect(page.locator("#preview")).toContainText("retained draft");
  await page
    .locator(".document-tab")
    .filter({ hasText: "Alpha.md" })
    .locator("[data-close-tab]")
    .click();
  await expect(page.locator("#close-document")).toBeVisible();
  await page.locator('[data-close-choice="cancel"]').click();
  await expect(page.locator(".document-tab")).toHaveCount(2);
  await menu("settings");
  await page.locator("#numbers").uncheck();
  await expect(page.locator(".cm-lineNumbers")).toHaveCount(0);
  await page.locator("#wrap").uncheck();
  await expect(page.locator(".cm-content.cm-lineWrapping")).toHaveCount(0);
  assert.ok(
    await page
      .locator(".cm-scroller")
      .evaluate((el) => el.scrollWidth > el.clientWidth),
  );
  await page.locator("#breaks").check();
  await expect(page.locator("#preview br")).not.toHaveCount(0);
  for (const locale of ["en", "pt", "fr", "de", "ru", "zh"]) {
    await page.locator("#language").selectOption(locale);
    await expect(page.locator("html")).toHaveAttribute("lang", locale);
  }
  await page.locator("#theme").selectOption("light");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.locator("#theme").selectOption("dark");

  await page.locator('[data-shortcut-edit="toggle-mode"]').click();
  await page
    .locator('[data-shortcut-modifiers="toggle-mode"]')
    .selectOption("Mod+Alt");
  await page.locator('[data-shortcut-key="toggle-mode"]').selectOption("P");
  await page.locator('[data-shortcut-apply="toggle-mode"]').click();
  await page.locator("#settings .primary").click();
  await page.locator(".cm-content").click();
  await page.keyboard.press("Meta+Alt+p");
  await expect(toggle).toHaveAttribute("data-state", "preview");
  await toggle.locator('[data-mode="editor"]').click();

  await page.locator("[data-tab]").filter({ hasText: "Beta.md" }).click();
  await expect(page.locator(".cm-lineNumbers")).toHaveCount(0);
  await expect(page.locator(".cm-content.cm-lineWrapping")).toHaveCount(0);
  await page.locator("[data-tab]").filter({ hasText: "Alpha.md" }).click();
  await page.reload();
  await expect(page).toHaveTitle("Alpha.md");
  await expect(page.locator(".document-tab")).toHaveCount(2);
  await expect(page.locator("#preview")).toContainText("retained draft");
  await expect(page.locator(".cm-lineNumbers")).toHaveCount(0);
  await expect(page.locator(".cm-content.cm-lineWrapping")).toHaveCount(0);
  await expect(page.locator("#preview br")).not.toHaveCount(0);
  await menu("menuFile", "new");
  await page.locator(".cm-content").click();
  await page.keyboard.type("Heading");
  for (const level of [1, 2, 3, 4, 5]) {
    await page.locator("#heading-level").selectOption(String(level));
    await expect(page.locator(`#preview h${level}`)).toHaveText("Heading");
  }
  await page.locator(".cm-content").click();
  await page.keyboard.press("Meta+End");
  await page.locator('[data-format="table"]').click();
  await expect(page.locator("#preview table")).toHaveCount(1);
  await menu("menuEdit", "replace");
  await expect(page.locator("#search-dialog")).toBeVisible();
  await expect(page.locator(".cm-panels")).toHaveCount(0);
  await page.locator("#search-find").fill("Heading");
  await page.locator("#search-replace").fill("Title");
  await page.locator('[data-search-action="replace-all"]').click();
  await expect(page.locator("#preview h5")).toHaveText("Title");
  await page.locator("#search-regex").check();
  await page.locator("#search-find").fill("[");
  await expect(page.locator("#search-status")).toContainText("无效");
  await page.locator('[data-search-action="close"]').click();
  await expect(page.locator("#search-dialog")).toBeHidden();
  const pending = page.waitForEvent("download");
  await menu("menuFile", "save");
  const download = await pending;
  await download.saveAs("artifacts/exported.md");
  const uiText = await page.locator("body").textContent();
  for (const label of [
    "MAKE IT YOURS",
    "文件在本机处理",
    "MARKDOWN WORKSPACE",
    "KEEP IT LIGHT",
  ])
    assert.ok(!uiText.includes(label));
  await page.screenshot({ path: "artifacts/desktop.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('.mode-toggle [data-mode="preview"]').click();
  await expect(page.locator(".preview-pane")).toBeVisible();
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await page.locator(".mobile-menu").click();
  await expect(page.locator(".sidebar")).toBeVisible();
  await page
    .locator(".sidebar-backdrop")
    .click({ position: { x: 330, y: 400 } });
  await expect(page.locator(".sidebar")).toBeHidden();
  await page.screenshot({ path: "artifacts/mobile.png" });
  await page.setViewportSize({ width: 1440, height: 960 });

  await page.locator("[data-tab]").filter({ hasText: "Alpha.md" }).click();
  await page
    .locator("[data-tab]")
    .filter({ hasText: "Beta.md" })
    .click({ button: "right" });
  await expect(page.locator("#tab-context-menu")).toBeVisible();
  await expect(page).toHaveTitle("Alpha.md");
  await page.locator('[data-tab-context-action="close-right"]').click();
  await expect(page.locator(".document-tab")).toHaveCount(2);
  await page
    .locator("[data-tab]")
    .filter({ hasText: "Alpha.md" })
    .click({ button: "right" });
  await page.locator('[data-tab-context-action="close-all"]').click();
  await expect(page.locator("#close-document")).toBeVisible();
  await page.locator('[data-close-choice="cancel"]').click();
  await expect(page.locator(".document-tab")).toHaveCount(2);
  await page
    .locator("[data-tab]")
    .filter({ hasText: "Alpha.md" })
    .click({ button: "right" });
  await page.locator('[data-tab-context-action="close-all"]').click();
  await page.locator('[data-close-choice="discard"]').click();
  await expect(page.locator(".document-tab")).toHaveCount(0);
  await expect(page).toHaveTitle("Mk.1 Lite");
  await expect(page.locator("#empty-state")).toBeVisible();
  assert.deepEqual(errors, []);
  console.log(
    "PASS: multiple tabs, independent edits/undo/folds, close cancel, empty title, actual sidebar switch, all three settings effects/persistence, H1–H5, table, floating search/replace, label removal, export, mobile layout. No runtime errors.",
  );
} finally {
  await browser.close();
}
