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

  const workspace = await pageFor(() => {
    window.folderSelection = "/workspace";
    window.directoryLists = {
      "/workspace": [
        { name: "sub", path: "/workspace/sub", isDirectory: true },
      ],
      "/workspace/sub": [
        {
          name: "nested.md",
          path: "/workspace/sub/nested.md",
          isDirectory: false,
        },
      ],
      "/other": [
        { name: "other.md", path: "/other/other.md", isDirectory: false },
      ],
    };
    window.watchCalls = [];
    window.listCalls = [];
    window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener() {} };
    window.__TAURI_INTERNALS__ = {
      transformCallback: (callback) => {
        window.treeEventCallback = callback;
        return 1;
      },
      invoke: async (command, args) => {
        if (command === "plugin:event|listen") return 1;
        if (command === "plugin:event|unlisten") return;
        if (command === "choose_markdown_directory")
          return window.folderSelection;
        if (command === "watch_markdown_directories") {
          window.watchCalls.push(args);
          return;
        }
        if (command === "list_markdown_directory") {
          window.listCalls.push(args.path);
          if (window.holdSnapshots && args.path === "/workspace")
            return new Promise((resolve) => {
              window.finishSnapshot = () =>
                resolve(window.directoryLists[args.path]);
            });
          if (window.delayListing)
            return new Promise((resolve) => {
              window.resolveListing = () =>
                resolve([
                  {
                    name: "stale.md",
                    path: args.path + "/stale.md",
                    isDirectory: false,
                  },
                ]);
            });
          return window.directoryLists[args.path] || [];
        }
        if (command === "read_markdown_tree_file")
          return {
            path: args.path,
            name: args.path.split("/").pop(),
            text: "# selected",
          };
        throw new Error("Unexpected command: " + command);
      },
    };
  });
  const wp = workspace.page;
  await wp.locator(".tree-open-folder").click();
  await expect(wp.locator(".tree-root-title")).toHaveText("workspace");
  await wp.getByRole("treeitem", { name: "sub", exact: true }).click();
  await wp.getByRole("treeitem", { name: "nested.md", exact: true }).click();
  await wp.waitForFunction(() => window.testOpen.length === 1);
  await wp.evaluate(() =>
    window.tree.setDocument({
      id: "nested",
      name: "nested.md",
      path: "/workspace/sub/nested.md",
    }),
  );
  await expect(wp.locator(".tree-row.active")).toHaveText("nested.md");
  await wp.evaluate(() => {
    window.folderSelection = "/other";
  });
  await wp.locator(".tree-open-folder").click();
  await expect(wp.locator(".tree-root-title")).toHaveText([
    "workspace",
    "other",
  ]);
  await wp.locator(".tree-open-folder").click();
  await expect(wp.locator(".tree-root-title")).toHaveCount(2);
  await wp.waitForFunction(() =>
    window.watchCalls.some(
      (call) =>
        call.root === "/workspace" && call.paths.includes("/workspace/sub"),
    ),
  );
  await wp.evaluate(() => {
    document.querySelector("#tree").style.height = "170px";
    const list = document.querySelector(".tree-workspaces");
    list.scrollTop = 30;
    window.savedScroll = list.scrollTop;
    window.savedNode = document.querySelector(
      '[data-tree-key="/workspace/sub/nested.md"]',
    );
    window.savedNode.focus({ preventScroll: true });
    window.holdSnapshots = true;
    window.treeEventCallback({ payload: { root: "/workspace" } });
  });
  await wp.waitForFunction(() => !!window.finishSnapshot);
  await expect(
    wp.getByRole("treeitem", { name: "nested.md", exact: true }),
  ).toBeVisible();
  assert.equal(
    await wp.evaluate(
      () =>
        document.querySelector('[data-tree-key="/workspace/sub/nested.md"]') ===
        window.savedNode,
    ),
    true,
    "refresh in flight must retain old rows",
  );
  await wp.evaluate(() => {
    window.holdSnapshots = false;
    window.finishSnapshot();
  });
  await wp.waitForTimeout(100);
  assert.equal(
    await wp.evaluate(() => document.activeElement === window.savedNode),
    true,
    "unchanged refresh must preserve the focused DOM node",
  );
  assert.equal(
    await wp.evaluate(
      () =>
        document.querySelector(".tree-workspaces").scrollTop ===
        window.savedScroll,
    ),
    true,
    "unchanged refresh must preserve tree scroll position",
  );
  await wp.evaluate(() => {
    document.querySelector("#tree").style.height = "600px";
  });
  await wp.evaluate(() => {
    window.directoryLists["/workspace/sub"].push({
      name: "added.md",
      path: "/workspace/sub/added.md",
      isDirectory: false,
    });
    window.treeEventCallback({ payload: { root: "/workspace" } });
  });
  await expect(
    wp.getByRole("treeitem", { name: "added.md", exact: true }),
  ).toBeVisible();
  assert.equal(
    await wp.evaluate(() => window.testOpen.length),
    1,
    "filesystem refresh must never reload open document text",
  );
  await wp.locator(".tree-root-title").first().click();
  await expect(
    wp.getByRole("treeitem", { name: "added.md", exact: true }),
  ).toHaveCount(0);
  await wp.waitForFunction(() =>
    window.watchCalls.some(
      (call) => call.root === "/workspace" && call.paths.length === 0,
    ),
  );
  await wp.evaluate(() => {
    window.listCalls = [];
    window.treeEventCallback({ payload: { root: "/workspace" } });
  });
  await wp.waitForTimeout(100);
  assert.deepEqual(
    await wp.evaluate(() => window.listCalls),
    [],
    "collapsed root must not be scanned on events",
  );
  await wp.locator(".tree-root-title").first().click();
  await expect(
    wp.getByRole("treeitem", { name: "added.md", exact: true }),
  ).toBeVisible();
  await wp.evaluate(() => {
    window.directoryLists["/workspace/sub"] = [
      {
        name: "renamed.md",
        path: "/workspace/sub/renamed.md",
        isDirectory: false,
      },
    ];
    window.treeEventCallback({ payload: { root: "/workspace" } });
  });
  await expect(
    wp.getByRole("treeitem", { name: "added.md", exact: true }),
  ).toHaveCount(0);
  await expect(
    wp.getByRole("treeitem", { name: "renamed.md", exact: true }),
  ).toBeVisible();
  await wp.evaluate(() => {
    window.tree.setDocument(null);
    window.folderSelection = null;
  });
  await wp.locator(".tree-open-folder").click();
  await expect(wp.locator(".tree-root-title")).toHaveCount(2);
  await wp.locator(".tree-remove").first().click();
  await expect(wp.locator(".tree-root-title")).toHaveText("other");
  await wp.waitForFunction(
    () =>
      window.watchCalls.at(-1)?.root === "/workspace" &&
      window.watchCalls.at(-1)?.paths.length === 0,
  );
  await wp.evaluate(() => {
    window.delayListing = true;
    window.treeEventCallback({ payload: { root: "/other" } });
  });
  await wp.waitForFunction(() => !!window.resolveListing);
  await wp.locator(".tree-remove").click();
  await wp.evaluate(() => window.resolveListing());
  await expect(wp.locator(".tree-row")).toHaveCount(0);
  await expect(wp.locator(".tree-root-title")).toHaveCount(0);
  assert.deepEqual(workspace.errors, []);
  await wp.close();

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
      isSameEntry: async (other) => other.name === "selected-folder",
      entries: async function* () {
        yield [
          "first.md",
          file("first.md", window.webReplace ? "# replacement" : "# first"),
        ];
        if (window.webAdded) yield ["new.md", file("new.md", "# new")];
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
  await web.page.locator(".tree-open-folder").click();
  await expect(web.page.locator(".tree-root-title")).toHaveText(
    "selected-folder",
  );
  await web.page.locator(".tree-open-folder").click();
  await expect(web.page.locator(".tree-root-title")).toHaveCount(1);
  await web.page.evaluate(() => {
    window.webAdded = true;
    window.dispatchEvent(new Event("focus"));
  });
  await expect(
    web.page.getByRole("treeitem", { name: "new.md", exact: true }),
  ).toBeVisible();
  await web.page.evaluate(() => {
    window.savedBrowserRow = document.querySelector(
      '[data-tree-key$="/first.md"]',
    );
    window.webReplace = true;
    window.dispatchEvent(new Event("focus"));
  });
  await web.page.waitForTimeout(100);
  assert.equal(
    await web.page.evaluate(
      () =>
        document.querySelector('[data-tree-key$="/first.md"]') ===
        window.savedBrowserRow,
    ),
    true,
  );
  await web.page
    .getByRole("treeitem", { name: "first.md", exact: true })
    .click();
  await web.page.waitForFunction(() => window.testOpen.length === 2);
  assert.equal(
    await web.page.evaluate(() => window.testOpen[1].text),
    "# replacement",
    "same-name replacement must open through the newest file handle",
  );
  assert.deepEqual(web.errors, []);
  await web.page.close();
  console.log(
    "PASS: multiple deduplicated folders, independent collapse/remove, native event refresh, deletion/rename, no document reload, cancelled stale directory read, native lazy Markdown tree, active folder scope, ignored text files, stale async protection, honest web permission state, containing-folder verification, nested folder rebinding, restored document fallback.",
  );
} finally {
  await browser.close();
}
