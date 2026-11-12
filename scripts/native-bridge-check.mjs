import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 960 },
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "platform", { get: () => "MacIntel" });
    let next = 0;
    const callbacks = new Map(),
      listeners = new Map();
    window.testQueue = [
      {
        path: "/tmp/notes/Alpha.md",
        name: "Alpha.md",
        text: "# Alpha\n\nalpha body",
      },
      {
        path: "/tmp/notes/Beta.md",
        name: "Beta.md",
        text: "# Beta\n\nbeta body",
      },
    ];
    window.testCalls = [];
    window.testDefaultError = "install-first";
    window.testMenu = (action) => {
      callbacks.get(listeners.get("app-menu"))?.({
        event: "app-menu",
        id: 2,
        payload: action,
      });
    };
    window.testEmit = (files) => {
      window.testQueue.push(...files);
      callbacks.get(listeners.get("files-opened"))?.({
        event: "files-opened",
        id: 1,
        payload: null,
      });
    };
    window.__TAURI_INTERNALS__ = {
      metadata: {
        currentWindow: { label: "main" },
        currentWebview: { label: "main", windowLabel: "main" },
      },
      transformCallback: (handler) => {
        const id = ++next;
        callbacks.set(id, handler);
        return id;
      },
      invoke: async (command, args, options) => {
        window.testCalls.push({ command, args, options });
        if (command === "plugin:event|listen") {
          listeners.set(args.event, args.handler);
          return ++next;
        }
        if (command === "plugin:window|set_title") {
          window.testTitle = args.value;
          return null;
        }
        if (command === "update_app_menu") return null;
        if (command === "take_opened_files") {
          const files = window.testQueue;
          window.testQueue = [];
          return files;
        }
        if (command === "authorize_directory_for_file") return "/tmp/notes";
        if (command === "list_markdown_directory")
          return [
            {
              name: "Alpha.md",
              path: "/tmp/notes/Alpha.md",
              isDirectory: false,
            },
            { name: "Beta.md", path: "/tmp/notes/Beta.md", isDirectory: false },
            {
              name: "Gamma.md",
              path: "/tmp/notes/Gamma.md",
              isDirectory: false,
            },
          ];
        if (command === "read_markdown_tree_file")
          return {
            name: "Gamma.md",
            path: args.path,
            text: "# Gamma\n\nfrom file tree",
          };
        if (command === "plugin:fs|write_text_file") return null;
        if (command === "plugin:dialog|save") return "/tmp/notes/Gamma.md";
        if (command === "set_default_markdown_app") {
          if (window.testDefaultError) throw window.testDefaultError;
          return null;
        }
        throw new Error("Unexpected command: " + command);
      },
    };
  });
  await page.goto(process.env.MARK1LIGHT_TEST_URL || "http://localhost:5173");
  await expect(page.locator("#app-menu")).toBeHidden();

  await expect(page.locator(".document-tab")).toHaveCount(2);
  await expect(page).toHaveTitle("Beta.md");
  await page.evaluate(() => window.testMenu("toggle-mode"));
  await expect(page.locator('[data-action="toggle-mode"]')).toHaveAttribute(
    "data-state",
    "preview",
  );
  await page.evaluate(() => window.testMenu("toggle-mode"));
  await page.evaluate(() => window.testMenu("previous-tab"));
  await expect(page).toHaveTitle("Alpha.md");
  await page.evaluate(() => window.testMenu("next-tab"));
  await expect(page).toHaveTitle("Beta.md");

  await page.waitForFunction(() => window.testTitle === "Beta.md");
  await expect(page.locator(".tree-row")).toHaveCount(3);
  await page.locator(".tree-row").filter({ hasText: "Gamma.md" }).click();
  await expect(page.locator(".document-tab")).toHaveCount(3);
  await expect(page).toHaveTitle("Gamma.md");
  await expect(page.locator("#preview")).toContainText("from file tree");
  await page.locator(".cm-content").click();
  await page.keyboard.press("Meta+End");
  await page.keyboard.type("\nunsaved gamma");
  await page.evaluate(() =>
    window.testEmit([
      { path: "/tmp/notes/Delta.md", name: "Delta.md", text: "# Delta" },
    ]),
  );
  await expect(page.locator(".document-tab")).toHaveCount(4);
  await expect(page).toHaveTitle("Delta.md");
  await page.locator("[data-tab]").filter({ hasText: "Gamma.md" }).click();
  await expect(page.locator("#preview")).toContainText("unsaved gamma");
  await page.evaluate(() =>
    window.testEmit([
      {
        path: "/tmp/notes/Gamma.md",
        name: "Gamma.md",
        text: "# DO NOT OVERWRITE",
      },
    ]),
  );
  await expect(page.locator(".document-tab")).toHaveCount(4);
  await expect(page.locator("#preview")).toContainText("unsaved gamma");
  await page.evaluate(() => window.testMenu("save"));
  await page.waitForFunction(() =>
    window.testCalls.some(
      (call) => call.command === "plugin:fs|write_text_file",
    ),
  );
  assert.ok(
    await page.evaluate(
      () =>
        decodeURIComponent(
          window.testCalls.find(
            (call) => call.command === "plugin:fs|write_text_file",
          ).options.headers.path,
        ) === "/tmp/notes/Gamma.md",
    ),
  );
  await page.evaluate(() => window.testMenu("new"));
  await page.locator(".cm-content").click();
  await page.keyboard.type("separate draft");
  const writesBefore = await page.evaluate(
    () =>
      window.testCalls.filter(
        (call) => call.command === "plugin:fs|write_text_file",
      ).length,
  );
  await page.evaluate(() => window.testMenu("save"));
  await expect(page.locator("#toast")).toContainText("另一个标签页");
  assert.equal(
    await page.evaluate(
      () =>
        window.testCalls.filter(
          (call) => call.command === "plugin:fs|write_text_file",
        ).length,
    ),
    writesBefore,
  );
  await expect(page.locator("#preview")).toContainText("separate draft");
  await page.locator(".document-tab.selected [data-close-tab]").click();
  await page.locator('[data-close-choice="discard"]').click();
  await page.evaluate(() => window.testMenu("settings"));
  await expect(page.locator("#file-associations")).toBeVisible();
  await page.locator('[data-shortcut-edit="toggle-mode"]').click();
  await page
    .locator('[data-shortcut-modifiers="toggle-mode"]')
    .selectOption("Mod+Alt");
  await page.locator('[data-shortcut-key="toggle-mode"]').selectOption("P");
  await page.locator('[data-shortcut-apply="toggle-mode"]').click();
  await page.waitForFunction(() =>
    window.testCalls.some(
      (call) =>
        call.command === "update_app_menu" &&
        call.args.shortcuts?.["toggle-mode"] === "CmdOrCtrl+Alt+P",
    ),
  );

  await page.locator('[data-action="set-default-app"]').click();
  await expect(page.locator("#association-status")).toContainText(
    "Applications",
  );
  await page.evaluate(() => {
    window.testDefaultError = null;
  });
  await page.locator('[data-action="set-default-app"]').click();
  await expect(page.locator("#association-status")).toContainText(
    "已将 Mk.1 Lite",
  );
  await page.locator("#settings .primary").click();
  await page.locator('[data-side="outline"]').click();
  await expect(page.locator("#file-tree")).toBeHidden();
  await expect(page.locator("#outline-panel")).toBeVisible();
  await page.locator('[data-side="files"]').click();
  await expect(page.locator("#file-tree")).toBeVisible();
  await page.evaluate(() => window.testMenu("cheatsheet"));
  await expect(page.locator("#markdown-cheatsheet")).toBeVisible();
  await page.keyboard.press("Escape");
  assert.ok(
    await page.evaluate(() =>
      window.testCalls.some(
        (call) => call.command === "update_app_menu" && call.args.hasDocument,
      ),
    ),
  );
  await page.screenshot({ path: "artifacts/native-workspace.png" });
  assert.deepEqual(errors, []);
  console.log(
    "PASS: native bridge multi-file cold/warm events, exact native title, containing-folder tree, tree-opened tab, dirty-tab preservation, duplicate-file focus, save-back and default-app settings. No OS defaults changed.",
  );
} finally {
  await browser.close();
}
