import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";

const base = process.env.MARK1LIGHT_TEST_URL || "http://localhost:5173";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const errors = [];
const original = "# Native file\n\noriginal disk content";
const period = 15 * 60_000;
async function harness(configuration = {}) {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 900 },
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.clock.install({ time: new Date("2026-11-16T01:00:00Z") });
  await page.addInitScript(
    ({ configuration, original }) => {
      Object.defineProperty(navigator, "platform", { get: () => "MacIntel" });
      let next = 0;
      const callbacks = new Map(),
        listeners = new Map();
      window.testCalls = [];
      window.writeFailure = !!configuration.writeFailure;
      window.diskText = original;
      window.updateAvailable = false;
      window.testQueue = [
        { path: "/tmp/notes/Native.md", name: "Native.md", text: original },
      ];
      window.testMenu = (action) =>
        callbacks.get(listeners.get("app-menu"))?.({
          event: "app-menu",
          id: 1,
          payload: action,
        });
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
          if (
            [
              "update_app_menu",
              "plugin:window|set_title",
              "plugin:event|unlisten",
              "plugin:resources|close",
            ].includes(command)
          )
            return null;
          if (command === "plugin:app|version") return "0.3.1";
          if (command === "take_opened_files") {
            const files = window.testQueue;
            window.testQueue = [];
            return files;
          }
          if (command === "authorize_directory_for_file") return "/tmp/notes";
          if (command === "list_markdown_directory") return [];
          if (command === "plugin:fs|read_text_file")
            return Array.from(new TextEncoder().encode(window.diskText));
          if (command === "plugin:fs|write_text_file") {
            if (window.writeFailure) throw new Error("Disk write failed");
            window.diskText = new TextDecoder().decode(args);
            return null;
          }
          if (command === "plugin:dialog|save")
            throw new Error("Autosave must never open Save As");
          if (command === "plugin:updater|check")
            return window.updateAvailable
              ? {
                  rid: 1,
                  currentVersion: "0.3.1",
                  version: "0.3.2",
                  body: "Test update",
                  rawJson: {},
                }
              : null;
          if (command === "plugin:updater|download") {
            args.onEvent.onmessage({
              event: "Started",
              data: { contentLength: 100 },
            });
            await new Promise((resolve, reject) => {
              window.failDownload = () =>
                reject(new Error("Cancelled test download"));
            });
            return 2;
          }
          throw new Error("Unexpected native command: " + command);
        },
      };
    },
    { configuration, original },
  );
  await page.goto(base);
  await expect(page.locator(".document-tab")).toHaveCount(1);
  await expect(page.locator("[data-autosave-enabled]")).toBeChecked();
  await expect(page.locator('[data-autosave-wheel="hours"]')).toHaveAttribute(
    "aria-valuenow",
    "0",
  );
  await expect(page.locator('[data-autosave-wheel="minutes"]')).toHaveAttribute(
    "aria-valuenow",
    "15",
  );
  return page;
}
const count = (page, command) =>
  page.evaluate(
    (command) =>
      window.testCalls.filter((call) => call.command === command).length,
    command,
  );
async function edit(page, text = "unsaved edits") {
  await page.locator(".cm-content").click();
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.insertText("\n" + text);
  await expect(page.locator(".tab-dirty")).toHaveCount(1);
}
async function advance(page, milliseconds) {
  await page.clock.fastForward(milliseconds);
  // IPC dynamic imports and async file writes settle on real microtask turns.
  await page.evaluate(() => new Promise((resolve) => queueMicrotask(resolve)));
}
try {
  let page = await harness();
  await edit(page);
  await advance(page, 14 * 60_000);
  assert.equal(await count(page, "plugin:fs|write_text_file"), 0);
  await advance(page, 60_000 + 1000);
  await expect.poll(() => count(page, "plugin:fs|write_text_file")).toBe(1);
  await expect(page.locator(".tab-dirty")).toHaveCount(0);
  assert.equal(
    await page.evaluate(() => window.diskText),
    original + "\nunsaved edits",
  );
  assert.equal(await count(page, "plugin:dialog|save"), 0);
  await page.locator(".new-document-tab").click();
  await page.keyboard.insertText("untitled draft stays local");
  await advance(page, period + 1000);
  assert.equal(await count(page, "plugin:fs|write_text_file"), 1);
  assert.equal(await count(page, "plugin:dialog|save"), 0);
  await expect(
    page.locator(".document-tab").last().locator(".tab-dirty"),
  ).toHaveCount(1);
  await page.close();

  page = await harness();
  await edit(page, "one minute interval");
  await page.evaluate(() => window.testMenu("settings"));
  const minutes = page.locator('[data-autosave-wheel="minutes"]');
  await minutes.focus();
  await page.keyboard.press("Home");
  await expect(minutes).toHaveAttribute("aria-valuenow", "1");
  await page
    .locator('#settings .primary[data-action="close-settings"]')
    .click();
  await advance(page, 59_000);
  assert.equal(await count(page, "plugin:fs|write_text_file"), 0);
  await advance(page, 2000);
  await expect.poll(() => count(page, "plugin:fs|write_text_file")).toBe(1);
  await expect(page.locator(".tab-dirty")).toHaveCount(0);
  assert.equal(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem("m1-settings")).autoSaveMinutes,
    ),
    1,
  );
  await page.close();

  page = await harness({ writeFailure: true });
  await edit(page, "retry this failed save");
  await advance(page, period + 1000);
  await expect.poll(() => count(page, "plugin:fs|write_text_file")).toBe(1);
  await expect(page.locator(".tab-dirty")).toHaveCount(1);
  assert.equal(await page.evaluate(() => window.diskText), original);
  await page.evaluate(() => {
    window.writeFailure = false;
  });
  await advance(page, period + 1000);
  await expect.poll(() => count(page, "plugin:fs|write_text_file")).toBe(2);
  await expect(page.locator(".tab-dirty")).toHaveCount(0);
  assert.match(
    await page.evaluate(() => window.diskText),
    /retry this failed save/,
  );
  await page.close();

  page = await harness();
  await edit(page, "do not overwrite outside changes");
  await page.evaluate(() => {
    window.diskText = "# Changed by another editor";
  });
  await advance(page, period + 1000);
  await expect.poll(() => count(page, "plugin:fs|read_text_file")).toBe(1);
  assert.equal(await count(page, "plugin:fs|write_text_file"), 0);
  await expect(page.locator(".tab-dirty")).toHaveCount(1);
  assert.equal(
    await page.evaluate(() => window.diskText),
    "# Changed by another editor",
  );
  await page.close();

  page = await harness();
  await edit(page, "wait until updater is idle");
  await page.evaluate(() => {
    window.updateAvailable = true;
    window.testMenu("settings");
  });
  await page.locator(".check-updates-button").click();
  await page.locator("[data-updater-install]").click();
  await page.waitForFunction(() => !!window.failDownload);
  await advance(page, period + 1000);
  assert.equal(await count(page, "plugin:fs|read_text_file"), 0);
  assert.equal(await count(page, "plugin:fs|write_text_file"), 0);
  await expect(page.locator(".tab-dirty")).toHaveCount(1);
  await page.evaluate(() => window.failDownload());
  await expect(page.locator("[data-updater-later]")).toBeEnabled();
  await page.locator("[data-updater-later]").click();
  await page
    .locator('#settings .primary[data-action="close-settings"]')
    .click();
  await advance(page, period + 1000);
  await expect.poll(() => count(page, "plugin:fs|write_text_file")).toBe(1);
  await expect(page.locator(".tab-dirty")).toHaveCount(0);
  await page.close();

  page = await harness();
  await page.evaluate(() => window.testMenu("settings"));
  await page.locator("#autosave-settings").scrollIntoViewIfNeeded();
  await expect(page.locator('[data-autosave-wheel="minutes"]')).toHaveAttribute(
    "aria-valuenow",
    "15",
  );
  await expect
    .poll(() =>
      page
        .locator('[data-autosave-wheel="minutes"]')
        .evaluate((wheel) => Math.abs(wheel.scrollTop - 15 * 36)),
    )
    .toBeLessThan(1);
  await page.screenshot({ path: "artifacts/autosave-in-app.png" });
  await page.close();

  assert.deepEqual(errors, []);
  console.log(
    "PASS: actual desktop autosave defaults to 15 minutes; interval changes reschedule; untitled files never trigger Save As; failed writes and external changes preserve dirty edits; active updater blocks autosave until a later idle cycle. Native filesystem and updater calls are mocked.",
  );
} finally {
  await browser.close();
}
