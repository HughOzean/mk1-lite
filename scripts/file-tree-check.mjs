import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const harness = `<!doctype html><html><head><style>:root{--text:#ddd;--muted:#888;--subtle:#aaa;--border:#444;--accent:#66cc66}body{background:#222;color:#ddd}#tree{width:260px;height:600px}button{color:inherit;background:none;border:0;cursor:pointer}</style></head><body><div id="tree"></div><script type="module">import {createFileTree} from '/src/file-tree.ts';window.testOpen=[];window.testErrors=[];window.tree=createFileTree({container:document.querySelector('#tree'),t:key=>key,onOpenFile:file=>window.testOpen.push(file),onError:message=>window.testErrors.push(message)});window.testReady=true;</script></body></html>`;
async function pageFor(init) {
  const page = await browser.newPage({ viewport: { width: 900, height: 800 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/__file-tree-check.html", (route) =>
    route.fulfill({ contentType: "text/html", body: harness }),
  );
  await page.addInitScript(init);
  await page.goto("http://localhost:5173/__file-tree-check.html");
  await page.waitForFunction(() => window.testReady);
  return { page, errors };
}
try {
  const { page, errors } = await pageFor(() => {
    window.testCalls = [];
    window.delayRead = false;
    const dirs = {
      "/one": [
        { name: "first.md", path: "/one/first.md", isDirectory: false },
        { name: "sub", path: "/one/sub", isDirectory: true },
        {
          name: "another.markdown",
          path: "/one/another.markdown",
          isDirectory: false,
        },
        { name: "notes.txt", path: "/one/notes.txt", isDirectory: false },
      ],
      "/one/sub": [
        { name: "nested.md", path: "/one/sub/nested.md", isDirectory: false },
      ],
      "/two": [
        { name: "second.md", path: "/two/second.md", isDirectory: false },
      ],
    };
    window.__TAURI_INTERNALS__ = {
      invoke: async (command, args) => {
        window.testCalls.push({ command, args });
        if (command === "authorize_directory_for_file") {
          if (args.path.startsWith("/slow/"))
            return new Promise((resolve) => {
              window.resolveAuth = () => resolve("/slow");
            });
          return args.path.slice(0, args.path.lastIndexOf("/"));
        }
        if (command === "list_markdown_directory") return dirs[args.path] || [];
        if (command === "read_markdown_tree_file") {
          const result = {
            path: args.path,
            name: args.path.split("/").pop(),
            text: "# selected",
          };
          if (window.delayRead)
            return new Promise((resolve) => {
              window.resolveRead = () => resolve(result);
            });
          return result;
        }
        throw new Error("Unexpected native command " + command);
      },
    };
  });
  await expect(page.locator(".tree-message")).toHaveText("treeEmpty");
  await page.evaluate(() =>
    window.tree.setDocument({
      id: "one",
      name: "first.md",
      path: "/one/first.md",
    }),
  );
  await expect(page.locator(".tree-row")).toHaveCount(3);
  await expect(page.locator(".tree-row").first()).toContainText("sub");
  await expect(page.locator(".tree-row.active")).toHaveText("first.md");
  await expect(page.getByText("notes.txt", { exact: true })).toHaveCount(0);
  await page.getByRole("treeitem", { name: "sub", exact: true }).click();
  await expect(
    page.getByRole("treeitem", { name: "nested.md", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("treeitem", { name: "another.markdown", exact: true })
    .click();
  await page.waitForFunction(() => window.testOpen.length === 1);
  assert.equal(
    await page.evaluate(() => window.testOpen[0].path),
    "/one/another.markdown",
  );
  await page.evaluate(() =>
    window.tree.setDocument({
      id: "slow",
      name: "old.md",
      path: "/slow/old.md",
    }),
  );
  await page.waitForFunction(() => !!window.resolveAuth);
  await page.evaluate(() =>
    window.tree.setDocument({
      id: "two",
      name: "second.md",
      path: "/two/second.md",
    }),
  );
  await expect(page.locator(".tree-root-title")).toHaveText("two");
  await page.evaluate(() => window.resolveAuth());
  await expect(page.locator(".tree-root-title")).toHaveText("two");
  await page.evaluate(() =>
    window.tree.setDocument({
      id: "one",
      name: "first.md",
      path: "/one/first.md",
    }),
  );
  await expect(
    page.getByRole("treeitem", { name: "first.md", exact: true }),
  ).toBeVisible();
  await page.evaluate(() => {
    window.delayRead = true;
  });
  await page
    .getByRole("treeitem", { name: "another.markdown", exact: true })
    .click();
  await page.waitForFunction(() => !!window.resolveRead);
  await page.evaluate(() =>
    window.tree.setDocument({
      id: "two",
      name: "second.md",
      path: "/two/second.md",
    }),
  );
  await expect(page.locator(".tree-root-title")).toHaveText("two");
  await page.evaluate(() => window.resolveRead());
  await page.waitForTimeout(100);
  assert.equal(
    await page.evaluate(() => window.testOpen.length),
    1,
    "a stale read must not open a file in a newly selected folder",
  );
  assert.deepEqual(errors, []);
  await page.close();

  const web = await pageFor(() => {
    const file = (name, text) => ({
      kind: "file",
      name,
      getFile: async () => new File([text], name, { lastModified: 123 }),
    });
    const nested = {
      kind: "directory",
      name: "sub",
      entries: async function* () {
        yield ["deep.md", file("deep.md", "# deep")];
      },
      getFileHandle: async () => {
        throw new Error("not found");
      },
    };
    const root = {
      kind: "directory",
      name: "selected-folder",
      entries: async function* () {
        yield ["first.md", file("first.md", "# first")];
        yield ["second.markdown", file("second.markdown", "# second")];
        yield ["note.txt", file("note.txt", "private")];
        yield ["sub", nested];
      },
      getFileHandle: async (name) => {
        if (name === "first.md") return file(name, "# first");
        throw new Error("not found");
      },
    };
    const wrong = {
      ...root,
      getFileHandle: async (name) => file(name, "wrong content"),
    };
    window.pickWrong = true;
    window.showDirectoryPicker = async () => (window.pickWrong ? wrong : root);
    window.originalFile = new File(["# first"], "first.md", {
      lastModified: 123,
    });
  });
  await web.page.evaluate(() =>
    window.tree.setDocument({
      id: "web",
      name: "first.md",
      path: null,
      file: window.originalFile,
    }),
  );
  await expect(web.page.locator(".tree-message")).toHaveText(
    "treeNeedsPermission",
  );
  await web.page.getByRole("button", { name: "treeChooseFolder" }).click();
  await expect(web.page.locator(".tree-message")).toHaveText("treeWrongFolder");
  await web.page.evaluate(() => {
    window.pickWrong = false;
  });
  await web.page.getByRole("button", { name: "treeChooseFolder" }).click();
  await expect(web.page.locator(".tree-root-title")).toHaveText(
    "selected-folder",
  );
  await expect(web.page.locator(".tree-row")).toHaveCount(3);
  await expect(web.page.getByText("note.txt", { exact: true })).toHaveCount(0);
  await web.page.getByRole("treeitem", { name: "sub", exact: true }).click();
  await web.page
    .getByRole("treeitem", { name: "deep.md", exact: true })
    .click();
  await web.page.waitForFunction(() => window.testOpen.length === 1);
  await web.page.evaluate(() => {
    const file = window.testOpen[0];
    window.tree.setDocument({
      id: "deep",
      name: file.name,
      path: null,
      file: file.file,
    });
  });
  await expect(web.page.locator(".tree-root-title")).toHaveText("sub");
  await expect(web.page.locator(".tree-row.active")).toHaveText("deep.md");
  await web.page.evaluate(() =>
    window.tree.setDocument({
      id: "restored",
      name: "restored.md",
      path: null,
    }),
  );
  await expect(web.page.locator(".tree-message")).toHaveText(
    "treeRestoredNoFile",
  );
  await expect(web.page.locator(".tree-row")).toHaveCount(0);
  assert.deepEqual(web.errors, []);
  await web.page.close();
  console.log(
    "PASS: native lazy Markdown tree, active folder scope, ignored text files, stale async protection, honest web permission state, containing-folder verification, nested folder rebinding, restored document fallback.",
  );
} finally {
  await browser.close();
}
