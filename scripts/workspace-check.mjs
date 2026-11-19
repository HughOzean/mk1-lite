import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    let next = 0;
    const callbacks = new Map();
    const listeners = new Map();
    window.requestClose = () => {
      void callbacks.get(listeners.get("tauri://close-requested"))?.({
        event: "tauri://close-requested",
        id: 1,
        payload: null,
      });
    };
    window.calls = [];
    window.__TAURI_INTERNALS__ = {
      metadata: {
        currentWindow: { label: "main" },
        currentWebview: { label: "main", windowLabel: "main" },
      },
      transformCallback: (handler) => {
        callbacks.set(++next, handler);
        return next;
      },
      invoke: async (command, args) => {
        window.calls.push({ command, args });
        if (command === "restore_workspace")
          return JSON.parse(
            localStorage.getItem("mock-native") || '{"folders":[],"files":[]}',
          );
        if (command === "remember_workspace") {
          if (window.delayRemember)
            await new Promise((resolve) => {
              window.finishRemember = resolve;
            });
          localStorage.setItem(
            "mock-native",
            JSON.stringify({
              folders: args.folders,
              files: args.files.map((path) => ({
                path,
                name: path.split("/").pop(),
                text: "# Disk updated",
              })),
            }),
          );
          return;
        }
        if (command === "plugin:event|listen") {
          listeners.set(args.event, args.handler);
          return ++next;
        }
        if (command === "take_opened_files") return [];
        if (command === "plugin:updater|check") return null;
        if (command === "authorize_directory_for_file") return "/notes";
        if (command === "list_markdown_directory")
          return [
            { name: "first.md", path: "/notes/first.md", isDirectory: false },
          ];
        if (command === "plugin:app|version") return "0.4.0";
        if (
          [
            "update_app_menu",
            "watch_markdown_directories",
            "plugin:window|set_title",
            "plugin:window|destroy",
            "plugin:event|unlisten",
            "plugin:resources|close",
          ].includes(command)
        )
          return null;
        throw new Error("Unexpected command: " + command);
      },
    };
  });
  await page.addInitScript(() => {
    if (sessionStorage.getItem("seeded")) return;
    sessionStorage.setItem("seeded", "yes");
    localStorage.setItem(
      "m1-settings",
      JSON.stringify({ rememberWorkspace: true }),
    );
    localStorage.setItem(
      "m1-workspace-v2",
      JSON.stringify({
        documents: [
          {
            name: "first.md",
            sourceKey: "/notes/first.md",
            text: "# Old disk",
            dirty: false,
          },
          {
            name: "draft.md",
            sourceKey: "/notes/draft.md",
            text: "# Unsaved edits",
            savedText: "# Original",
            dirty: true,
          },
        ],
        activeIndex: 1,
      }),
    );
    localStorage.setItem(
      "mock-native",
      JSON.stringify({
        folders: ["/notes"],
        files: [
          { path: "/notes/first.md", name: "first.md", text: "# Disk updated" },
          {
            path: "/notes/draft.md",
            name: "draft.md",
            text: "# Externally changed",
          },
        ],
      }),
    );
  });
  await page.goto(process.env.MARK1LIGHT_TEST_URL || "http://localhost:5173");
  await expect(page.locator(".document-tab")).toHaveCount(2);
  await expect(page.locator(".document-tab.selected")).toContainText(
    "draft.md",
  );
  await expect(page.locator(".cm-content")).toContainText("Unsaved edits");
  await expect(page.locator(".tree-root-title")).toContainText("notes");
  assert.equal(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("m1-workspace-v2")).documents[1]
          .savedText,
    ),
    "# Original",
  );
  await page.locator("[data-tab]").first().click();
  await expect(page.locator(".cm-content")).toContainText("Disk updated");
  await expect(
    page.locator(".document-tab.selected [data-tab]"),
  ).toHaveAttribute("title", "/notes/first.md");
  await page.reload();
  await expect(page.locator(".document-tab.selected")).toContainText(
    "first.md",
  );
  await page.locator('[data-action="settings"]').click();
  await page.locator("#rememberWorkspace").uncheck();
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("m1-workspace-v2")))
    .toBe(null);
  await expect
    .poll(() =>
      page.evaluate(
        () => JSON.parse(localStorage.getItem("mock-native")).folders.length,
      ),
    )
    .toBe(0);
  await page.reload();
  await expect(page.locator(".document-tab")).toHaveCount(0);
  await expect(page.locator(".tree-root-title")).toHaveCount(0);
  await page.locator('[data-action="settings"]').click();
  await expect(page.locator("#rememberWorkspace")).not.toBeChecked();
  await page.locator("#rememberWorkspace").check();
  await page
    .locator('#settings [data-action="close-settings"]')
    .first()
    .click();
  // Browser imports and unnamed drafts also survive reload when enabled.
  await page.locator("#file-input").setInputFiles({
    name: "browser.md",
    mimeType: "text/markdown",
    buffer: Buffer.from("# Browser document"),
  });
  await page.reload();
  await expect(page.locator(".document-tab")).toHaveCount(1);
  await expect(page.locator(".cm-content")).toContainText("Browser document");
  // Native close must wait until the last folder snapshot has reached disk.
  await page.evaluate(() => {
    localStorage.setItem(
      "mock-native",
      JSON.stringify({ folders: ["/notes"], files: [] }),
    );
  });
  await page.reload();
  await expect(page.locator(".tree-root-title")).toContainText("notes");
  await page.evaluate(() => {
    window.delayRemember = true;
  });
  await page.locator(".tree-remove").click();
  await expect
    .poll(() => page.evaluate(() => typeof window.finishRemember))
    .toBe("function");
  await page.evaluate(() => window.requestClose());
  assert.equal(
    await page.evaluate(() =>
      window.calls.some((call) => call.command === "plugin:window|destroy"),
    ),
    false,
  );
  await page.evaluate(() => {
    window.delayRemember = false;
    window.finishRemember();
  });
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.calls.some((call) => call.command === "plugin:window|destroy"),
      ),
    )
    .toBe(true);
  assert.equal(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem("mock-native")).folders.length,
    ),
    0,
  );
  assert.deepEqual(errors, []);
  console.log(
    "Workspace checks passed: folders, clean disk refresh, dirty recovery baseline, active tab, disable/enable and imported document.",
  );
} finally {
  await browser.close();
}
