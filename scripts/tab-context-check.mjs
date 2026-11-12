import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 900, height: 600 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/tab-context-test", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<!doctype html><style>:root{--panel:#252725;--border:#343834;--text:#ddd;--muted:#888;--accent:#66cc66}*{box-sizing:border-box}body{margin:0;background:#202220;color:#ddd;font:13px sans-serif}#tabs{display:flex}.document-tab button{padding:15px;background:none;color:inherit;border:1px solid #444}</style><div id="tabs"></div><button id="outside">outside</button><script type="module">import {createTabContextMenu} from '/src/tab-context-menu.ts';window.docs=[{id:'a',name:'A.md'},{id:'b',name:'B.md'},{id:'c',name:'C.md'},{id:'d',name:'D.md'}];window.active='a';window.calls=[];window.cancel=null;window.addDuring=null;window.busy=false;window.language='';window.render=()=>{document.querySelector('#tabs').innerHTML=docs.map(doc=>'<div class="document-tab"><button data-tab="'+doc.id+'">'+doc.name+'</button></div>').join('')};window.context=createTabContextMenu({container:document.querySelector('#tabs'),t:key=>language+key,getTabs:()=>docs,isBusy:()=>busy,onClose:async id=>{calls.push(id);if(cancel===id)return false;docs=docs.filter(doc=>doc.id!==id);if(addDuring===id){docs.push({id:'new',name:'New.md'});addDuring=null}render();return true}});document.querySelector('#tabs').addEventListener('click',event=>{if(event.target.dataset.tab)active=event.target.dataset.tab});render();window.ready=true;</script>`,
    }),
  );
  await page.goto(
    `${process.env.MARK1LIGHT_TEST_URL || "http://localhost:5173"}/tab-context-test`,
  );
  await page
    .waitForFunction(() => window.ready, null, { timeout: 10000 })
    .catch((error) => {
      throw new Error(JSON.stringify(errors) + "; " + error.message);
    });
  await page.locator('[data-tab="b"]').click({ button: "right" });
  await expect(page.locator("#tab-context-menu")).toBeVisible();
  assert.equal(await page.evaluate(() => active), "a");
  await page.locator('[data-tab-context-action="close-right"]').click();
  assert.deepEqual(await page.evaluate(() => calls), ["c", "d"]);
  assert.deepEqual(await page.evaluate(() => docs.map((doc) => doc.id)), [
    "a",
    "b",
  ]);
  await page.evaluate(() => {
    docs = [
      { id: "a", name: "A.md" },
      { id: "b", name: "B.md" },
      { id: "c", name: "C.md" },
      { id: "d", name: "D.md" },
    ];
    calls = [];
    cancel = "b";
    render();
  });
  await page.locator('[data-tab="c"]').click({ button: "right" });
  await page.locator('[data-tab-context-action="close-all"]').click();
  assert.deepEqual(await page.evaluate(() => calls), ["a", "b"]);
  assert.deepEqual(await page.evaluate(() => docs.map((doc) => doc.id)), [
    "b",
    "c",
    "d",
  ]);
  await page.evaluate(() => {
    cancel = null;
    calls = [];
    addDuring = "b";
  });
  await page.locator('[data-tab="b"]').click({ button: "right" });
  await page.locator('[data-tab-context-action="close-all"]').click();
  assert.deepEqual(await page.evaluate(() => calls), ["b", "c", "d"]);
  assert.deepEqual(await page.evaluate(() => docs.map((doc) => doc.id)), [
    "new",
  ]);
  await page.locator('[data-tab="new"]').click({ button: "right" });
  await expect(
    page.locator('[data-tab-context-action="close-right"]'),
  ).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(page.locator("#tab-context-menu")).toBeHidden();
  await expect(page.locator('[data-tab="new"]')).toBeFocused();
  await page.keyboard.press("Shift+F10");
  await expect(page.locator("#tab-context-menu")).toBeVisible();
  await page.keyboard.press("ArrowDown");
  await expect(
    page.locator('[data-tab-context-action="close-all"]'),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await page.evaluate(() => {
    language = "translated ";
    context.refresh();
  });
  await page.locator('[data-tab="new"]').click({ button: "right" });
  await expect(
    page.locator('[data-tab-context-action="close-all"]'),
  ).toHaveText("translated closeAllTabs");
  await page.locator("#outside").click();
  await expect(page.locator("#tab-context-menu")).toBeHidden();
  await page.setViewportSize({ width: 390, height: 250 });
  await page.evaluate(() =>
    document.querySelector('[data-tab="new"]').dispatchEvent(
      new MouseEvent("contextmenu", {
        bubbles: true,
        clientX: 389,
        clientY: 249,
        cancelable: true,
      }),
    ),
  );
  const bounds = await page.locator("#tab-context-menu").boundingBox();
  assert.ok(
    bounds.x >= 0 &&
      bounds.y >= 0 &&
      bounds.x + bounds.width <= 390 &&
      bounds.y + bounds.height <= 250,
  );
  await page.evaluate(() => {
    context.close();
    busy = true;
  });
  await page.locator('[data-tab="new"]').click({ button: "right" });
  await expect(page.locator("#tab-context-menu")).toBeHidden();
  assert.deepEqual(errors, []);
  console.log(
    "PASS: tab context targeting, close-right order, close-all cancellation, snapshot exclusion of new tabs, keyboard, busy guard, localization and viewport clamp.",
  );
} finally {
  await browser.close();
}
