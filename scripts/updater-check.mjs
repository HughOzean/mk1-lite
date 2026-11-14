import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";

const base = process.env.MARK1LIGHT_TEST_URL || "http://localhost:5173";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const runtimeErrors = [];
async function harness(scenario = {}) {
  const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
  page.on("pageerror", (error) => runtimeErrors.push(error.message));
  await page.addInitScript((scenario) => {
    window.scenario = scenario;
    window.calls = [];
    let callbackId = 0;
    const callbacks = new Map(),
      listeners = new Map();
    window.testQueue = [
      {
        path: "/tmp/notes/Native.md",
        name: "Native.md",
        text: "# Native file\n\nbody",
      },
    ];
    window.testEmit = (event, payload) =>
      callbacks.get(listeners.get(event))?.({ event, id: 1, payload });
    window.__TAURI_INTERNALS__ = {
      metadata: {
        currentWindow: { label: "main" },
        currentWebview: { label: "main", windowLabel: "main" },
      },
      transformCallback: (handler) => {
        const id = ++callbackId;
        callbacks.set(id, handler);
        return id;
      },
      invoke: async (command, args) => {
        window.calls.push(command);
        if (command === "plugin:updater|check") {
          if (scenario.checkFailure) throw new Error("offline");
          if (scenario.noUpdate) return null;
          return {
            rid: 1,
            currentVersion: "0.3.0",
            version: "0.3.1",
            body: '<img src=x onerror="window.injected=true"> release notes',
            rawJson: {},
          };
        }
        if (command === "plugin:updater|download") {
          args.onEvent.onmessage({
            event: "Started",
            data: { contentLength: 100 },
          });
          args.onEvent.onmessage({
            event: "Progress",
            data: { chunkLength: 40 },
          });
          if (scenario.holdDownload)
            await new Promise((resolve) => {
              window.releaseDownload = resolve;
            });
          if (scenario.downloadFailure) throw new Error("download failed");
          args.onEvent.onmessage({
            event: "Progress",
            data: { chunkLength: 60 },
          });
          args.onEvent.onmessage({ event: "Finished" });
          return 2;
        }
        if (command === "plugin:updater|install") {
          if (scenario.installFailure) throw new Error("installation failed");
          return null;
        }
        if (command === "plugin:process|restart") {
          if (scenario.restartFailure) throw new Error("restart failed");
          return null;
        }
        if (command === "plugin:resources|close") return null;
        if (scenario.integration) {
          if (command === "plugin:event|listen") {
            listeners.set(args.event, args.handler);
            return ++callbackId;
          }
          if (
            [
              "update_app_menu",
              "plugin:window|set_title",
              "plugin:event|unlisten",
            ].includes(command)
          )
            return null;
          if (command === "plugin:app|version") return "0.3.0";
          if (command === "take_opened_files") {
            const files = window.testQueue;
            window.testQueue = [];
            if (window.holdNextDrain) {
              window.holdNextDrain = false;
              await new Promise((resolve) => {
                window.releaseDrain = resolve;
              });
            }
            return files;
          }
          if (command === "authorize_directory_for_file") return "/tmp/notes";
          if (command === "list_markdown_directory") return [];
          if (command === "plugin:dialog|save")
            return scenario.cancelSave ? null : "/tmp/notes/Saved.md";
          if (command === "plugin:fs|write_text_file") {
            window.savedText = new TextDecoder().decode(args);
            if (scenario.holdSave)
              await new Promise((resolve, reject) => {
                window.releaseSave = resolve;
                window.failSave = () =>
                  reject(new Error("Save cancelled or failed"));
              });
            return null;
          }
          if (command === "plugin:window|destroy") return null;
        }
        throw new Error("Unexpected command: " + command);
      },
    };
  }, scenario);
  await page.route("**/updater-test", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<!doctype html><html><head><style>:root{--panel:#252725;--border:#343834;--text:#ddd;--muted:#888;--accent:#66cc66}body{background:#202220;color:#ddd;font:13px sans-serif}</style></head><body><button id="check">Check updates</button><script type="module">import {createDesktopUpdater} from '/src/updater.ts'; window.updater=createDesktopUpdater({enabled:!window.scenario.disabled,getLocale:()=>window.scenario.locale||'en',beforeInstall:async()=>{window.calls.push('before-install');return !window.scenario.cancelSave;}});document.querySelector('#check').addEventListener('click',()=>void window.updater.check(true));window.ready=true;</script></body></html>`,
    }),
  );
  await page.goto(scenario.integration ? base : `${base}/updater-test`);
  if (scenario.integration)
    await expect(page.locator(".document-tab")).toHaveCount(1);
  else await page.waitForFunction(() => window.ready);
  return page;
}
const commands = (page) => page.evaluate(() => window.calls);
const modal = (page) => page.locator("#desktop-updater");
const install = (page) => page.locator("[data-updater-install]");
try {
  let page = await harness({ disabled: true });
  await page.evaluate(() => window.updater.check(true));
  await expect(modal(page)).toBeHidden();
  assert.deepEqual(await commands(page), []);
  await page.close();

  page = await harness({ noUpdate: true });
  await page.evaluate(() => window.updater.check());
  await expect(modal(page)).toBeHidden();
  await page.locator("#check").click();
  await expect(page.locator("#updater-message")).toHaveText(
    "You are using the latest version.",
  );
  await expect(install(page)).toBeHidden();
  await page.keyboard.press("Escape");
  await expect(modal(page)).toBeHidden();
  await page.close();

  page = await harness();
  await page.locator("#check").click();
  await expect(modal(page)).toBeVisible();
  await expect(page.locator(".updater-version")).toHaveText("0.3.0 → 0.3.1");
  await expect(page.locator(".updater-notes img")).toHaveCount(0);
  assert.equal(await page.evaluate(() => window.injected), undefined);
  await page.locator("[data-updater-later]").click();
  await expect(modal(page)).toBeHidden();
  await expect(page.locator("#check")).toBeFocused();
  assert.deepEqual(await commands(page), [
    "plugin:updater|check",
    "plugin:resources|close",
  ]);
  await page.close();

  page = await harness({ cancelSave: true });
  await page.locator("#check").click();
  await install(page).click();
  await expect(page.locator("#updater-message")).toContainText(
    "Update postponed",
  );
  const cancelled = await commands(page);
  assert.ok(
    cancelled.indexOf("plugin:updater|download") <
      cancelled.indexOf("before-install"),
  );
  assert.ok(!cancelled.includes("plugin:updater|install"));
  assert.ok(!cancelled.includes("plugin:process|restart"));
  assert.equal(
    await page.evaluate(() => window.updater.updateInProgress),
    false,
  );
  await page.close();

  page = await harness({ holdDownload: true });
  await page.locator("#check").click();
  await install(page).click();
  await expect(page.locator("progress")).toHaveAttribute("value", "40");
  await expect(page.locator("[data-updater-later]")).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(modal(page)).toBeVisible();
  assert.ok(!(await commands(page)).includes("before-install"));
  await page.evaluate(() => window.releaseDownload());
  await page.waitForFunction(() =>
    window.calls.includes("plugin:process|restart"),
  );
  assert.deepEqual(
    (await commands(page)).filter(
      (command) => command !== "plugin:resources|close",
    ),
    [
      "plugin:updater|check",
      "plugin:updater|download",
      "before-install",
      "plugin:updater|install",
      "plugin:process|restart",
    ],
  );
  assert.equal(
    await page.evaluate(() => window.updater.installationInProgress),
    true,
  );
  await page.close();

  for (const failure of ["downloadFailure", "installFailure"]) {
    page = await harness({ [failure]: true });
    await page.locator("#check").click();
    await install(page).click();
    await expect(page.locator("#updater-message")).toContainText(
      "Could not update",
    );
    assert.ok(!(await commands(page)).includes("plugin:process|restart"));
    if (failure === "downloadFailure")
      assert.ok(!(await commands(page)).includes("before-install"));
    assert.equal(
      await page.evaluate(() => window.updater.updateInProgress),
      false,
    );
    await page.locator("[data-updater-later]").click();
    await expect(modal(page)).toBeHidden();
    await page.close();
  }

  page = await harness({ restartFailure: true });
  await page.locator("#check").click();
  await install(page).click();
  await expect(page.locator("#updater-message")).toContainText(
    "Update installed",
  );
  await expect(install(page)).toBeEnabled();
  assert.equal(
    await page.evaluate(() => window.updater.updateInProgress),
    true,
  );
  await page.evaluate(() => {
    window.scenario.restartFailure = false;
  });
  await install(page).click();
  await expect
    .poll(
      async () =>
        (await commands(page)).filter(
          (command) => command === "plugin:process|restart",
        ).length,
    )
    .toBe(2);
  assert.equal(
    (await commands(page)).filter(
      (command) => command === "plugin:updater|install",
    ).length,
    1,
  );
  await page.close();

  page = await harness({ checkFailure: true });
  await page.evaluate(() => window.updater.check());
  await expect(modal(page)).toBeHidden();
  await page.locator("#check").click();
  await expect(page.locator("#updater-message")).toContainText(
    "Could not update",
  );
  await page.close();

  // Exercise the actual main.ts integration, including native menu and OS-open events.
  page = await harness({ integration: true, holdDownload: true });
  await page.locator(".cm-content").click();
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.insertText("\nunsaved native data");
  await expect(page.locator("#preview")).toContainText("unsaved native data");
  await page.evaluate(() => window.testEmit("app-menu", "settings"));
  await page.locator(".check-updates-button").click();
  await install(page).click();
  await expect(page.locator("progress")).toHaveAttribute("value", "40");
  const drainsBefore = (await commands(page)).filter(
    (command) => command === "take_opened_files",
  ).length;
  await page.evaluate(() => {
    for (const action of ["new", "undo", "paste", "close-document"])
      window.testEmit("app-menu", action);
    window.testQueue.push({
      path: "/tmp/notes/Deferred.md",
      name: "Deferred.md",
      text: "# Deferred",
    });
    window.testEmit("files-opened", null);
    window.testEmit("tauri://close-requested", null);
  });
  await expect(page.locator(".document-tab")).toHaveCount(1);
  await expect(page.locator("#preview")).toContainText("unsaved native data");
  assert.equal(
    (await commands(page)).filter((command) => command === "take_opened_files")
      .length,
    drainsBefore,
  );
  assert.ok(!(await commands(page)).includes("plugin:window|destroy"));
  await page.evaluate(() => window.releaseDownload());
  await page.waitForFunction(() =>
    window.calls.includes("plugin:process|restart"),
  );
  assert.match(
    await page.evaluate(() => window.savedText),
    /unsaved native data/,
  );
  const integrated = await commands(page);
  assert.ok(
    integrated.indexOf("plugin:fs|write_text_file") <
      integrated.indexOf("plugin:updater|install"),
  );
  await expect(page.locator(".tab-dirty")).toHaveCount(0);
  await page.close();

  // An IPC already in flight must not slip a new document into the installation window.
  page = await harness({ integration: true, holdSave: true });
  await page.locator(".cm-content").click();
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.insertText("\ninflight unsaved data");
  await page.evaluate(() => window.testEmit("app-menu", "settings"));
  await page.locator(".check-updates-button").click();
  await page.evaluate(() => {
    window.holdNextDrain = true;
    window.testQueue.push({
      path: "/tmp/notes/Inflight.md",
      name: "Inflight.md",
      text: "# Inflight request",
    });
    window.testEmit("files-opened", null);
  });
  await page.waitForFunction(() => !!window.releaseDrain);
  await install(page).click();
  await page.waitForFunction(() => !!window.failSave);
  await page.evaluate(() => window.releaseDrain());
  // Wait beyond the production guard interval to ensure the already returned IPC stays blocked.
  await page.waitForTimeout(1200);
  await expect(page.locator(".document-tab")).toHaveCount(1);
  await expect(page.locator("#preview")).toContainText("inflight unsaved data");
  assert.ok(!(await commands(page)).includes("plugin:updater|install"));
  await page.evaluate(() => window.failSave());
  await expect(page.locator("#updater-message")).toContainText("暂缓更新");
  await expect(page.locator(".document-tab")).toHaveCount(2);
  await expect(page).toHaveTitle("Inflight.md");
  assert.ok(!(await commands(page)).includes("plugin:updater|install"));
  assert.ok(!(await commands(page)).includes("plugin:process|restart"));
  await page.locator("[data-updater-later]").click();
  await page.locator("#settings .primary").click();
  await page.locator("[data-tab]").first().click();
  await expect(page.locator("#preview")).toContainText("inflight unsaved data");
  await expect(
    page.locator(".document-tab").first().locator(".tab-dirty"),
  ).toHaveCount(1);
  await page.close();

  assert.deepEqual(runtimeErrors, []);
  console.log(
    "PASS: updater opt-out, no-update/background behavior, update prompt/dismissal, safe release notes, download progress/locking, save cancellation, install ordering, download/install errors, restart-only retry and resource cleanup. Actual main integration saves dirty documents and blocks native edit/menu/close/OS-open during updates, including already in-flight IPC resumed only after a cancelled save. Native network/signature/install are mocked.",
  );
} finally {
  await browser.close();
}
