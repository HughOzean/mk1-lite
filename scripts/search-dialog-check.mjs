import { readFile } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
const deps = JSON.parse(
  await readFile(
    new URL("../node_modules/.vite/deps/_metadata.json", import.meta.url),
    "utf8",
  ),
);
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1100, height: 800 },
  });
  const errors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(process.env.MARK1LIGHT_TEST_URL || "http://localhost:5173");
  await page.evaluate(async (browserHash) => {
    const [
      { EditorView },
      { EditorState },
      { search },
      { createSearchDialog },
    ] = await Promise.all([
      import(`/node_modules/.vite/deps/@codemirror_view.js?v=${browserHash}`),
      import(`/node_modules/.vite/deps/@codemirror_state.js?v=${browserHash}`),
      import(`/node_modules/.vite/deps/@codemirror_search.js?v=${browserHash}`),
      import("/src/search-dialog.ts"),
    ]);
    document.querySelector("#search-dialog")?.remove();
    const host = document.createElement("div");
    host.style.cssText =
      "position:fixed;left:0;top:0;width:600px;height:500px;z-index:1;background:var(--bg)";
    document.body.append(host);
    window.testSearchEditor = new EditorView({
      parent: host,
      state: EditorState.create({
        doc: "hello hello HELLO\nworld hello-world",
        extensions: [search()],
      }),
    });
    window.testSearchDialog = createSearchDialog({
      getView: () => window.testSearchEditor,
      t: (key) => key,
    });
    window.testSearchDialog.open(true);
  }, deps.browserHash);
  await page.locator("#search-find").fill("hello");
  await expect(page.locator("#search-status")).toContainText("4 matches");
  assert.ok((await page.locator(".cm-searchMatch").count()) > 0);
  await page.locator('[data-search-action="next"]').click();
  assert.equal(
    await page.evaluate(
      () => window.testSearchEditor.state.selection.main.from,
    ),
    0,
  );
  await page.locator("#search-replace").fill("hi");
  await page.locator('[data-search-action="replace-one"]').click();
  assert.equal(
    await page.evaluate(() => window.testSearchEditor.state.doc.toString()),
    "hi hello HELLO\nworld hello-world",
  );
  await page.locator('[data-search-action="replace-all"]').click();
  assert.equal(
    await page.evaluate(() => window.testSearchEditor.state.doc.toString()),
    "hi hi hi\nworld hi-world",
  );
  await page.locator("#search-find").fill("hi");
  await page.locator("#search-case").check();
  await page.locator("#search-word").check();
  await expect(page.locator("#search-status")).toContainText("4 matches");
  await page.locator("#search-regex").check();
  await page.locator("#search-find").fill("(");
  await expect(page.locator("#search-status")).toHaveText("invalidRegex");
  await expect(
    page.locator('[data-search-action="replace-all"]'),
  ).toBeDisabled();
  await page.locator("#search-find").fill("hi");
  await page.evaluate(() => {
    const view = window.testSearchEditor;
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: "hi other hi" },
    });
    window.testSearchDialog.documentChanged();
  });
  await expect(page.locator("#search-status")).toContainText("2 matches");
  await expect(page.locator(".cm-search")).toHaveCount(0);
  await page.locator("#search-find").press("Escape");
  await expect(page.locator("#search-dialog")).not.toBeVisible();
  await expect(page.locator(".cm-searchMatch")).toHaveCount(0);
  await page.evaluate(() => window.testSearchDialog.open());
  await expect(page.locator("#search-find")).toHaveValue("hi");
  await expect(page.locator("#search-replace-row")).not.toBeVisible();
  assert.deepEqual(errors, []);
  console.log(
    "PASS: standalone nonmodal search, next, replace one/all, match counts, invalid regex, document updates, query preservation, Escape close, no embedded search panel.",
  );
} finally {
  await browser.close();
}
