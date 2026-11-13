import { chromium } from "@playwright/test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
const root = new URL("../", import.meta.url);
const foreground = await readFile(
  new URL("android/artwork/launcher-foreground.svg", root),
  "utf8",
);
const glyphs = foreground.match(/<g[\s\S]*<\/g>/)[0];
const browser = await chromium.launch({ channel: "chrome", headless: true });
const resources = new URL("android/app/src/main/res/", root);
await mkdir(new URL("artifacts/android/", root), { recursive: true });
try {
  for (const [density, layer, legacy] of [
    ["mdpi", 108, 48],
    ["hdpi", 162, 72],
    ["xhdpi", 216, 96],
    ["xxhdpi", 324, 144],
    ["xxxhdpi", 432, 192],
  ]) {
    const folder = new URL(`mipmap-${density}/`, resources);
    await mkdir(folder, { recursive: true });
    for (const [name, size, svg] of [
      ["ic_launcher_foreground", layer, foreground],
      [
        "ic_launcher",
        legacy,
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"><rect width="1024" height="1024" rx="220" fill="#3c3e40"/>${glyphs}</svg>`,
      ],
      [
        "ic_launcher_round",
        legacy,
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"><circle cx="512" cy="512" r="512" fill="#3c3e40"/>${glyphs}</svg>`,
      ],
    ]) {
      const page = await browser.newPage({
        viewport: { width: size, height: size },
        deviceScaleFactor: 1,
      });
      await page.setContent(
        `<style>html,body{margin:0;background:transparent}svg{display:block;width:100vw;height:100vh}</style>${svg}`,
      );
      await page.screenshot({
        path: path.join(folder.pathname, `${name}.png`),
        omitBackground: true,
      });
      if (name === "ic_launcher_foreground") {
        // Every visible foreground pixel must fit the adaptive icon's 66dp safe circle.
        const outside = await page.evaluate(async () => {
          const svg = document.querySelector("svg");
          const url = URL.createObjectURL(
            new Blob([new XMLSerializer().serializeToString(svg)], {
              type: "image/svg+xml",
            }),
          );
          const img = new Image();
          img.src = url;
          await img.decode();
          const canvas = document.createElement("canvas");
          canvas.width = 432;
          canvas.height = 432;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0, 432, 432);
          const pixels = ctx.getImageData(0, 0, 432, 432).data;
          let outside = 0;
          for (let y = 0; y < 432; y++)
            for (let x = 0; x < 432; x++)
              if (
                pixels[(y * 432 + x) * 4 + 3] > 4 &&
                Math.hypot(x - 216, y - 216) > 132
              )
                outside++;
          URL.revokeObjectURL(url);
          return outside;
        });
        assert.equal(
          outside,
          0,
          "launcher text extends outside the adaptive safe zone",
        );
      }
      await page.close();
    }
  }
  await writeFile(
    new URL("values/ic_launcher_background.xml", resources),
    '<?xml version="1.0" encoding="utf-8"?>\n<resources><color name="ic_launcher_background">#3c3e40</color></resources>\n',
  );
  const adaptive =
    '<?xml version="1.0" encoding="utf-8"?>\n<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android"><background android:drawable="@color/ic_launcher_background"/><foreground android:drawable="@mipmap/ic_launcher_foreground"/></adaptive-icon>\n';
  await writeFile(
    new URL("mipmap-anydpi-v26/ic_launcher.xml", resources),
    adaptive,
  );
  await writeFile(
    new URL("mipmap-anydpi-v26/ic_launcher_round.xml", resources),
    adaptive,
  );
  const page = await browser.newPage({
    viewport: { width: 720, height: 280 },
    deviceScaleFactor: 1,
  });
  const img =
    "data:image/svg+xml;base64," + Buffer.from(foreground).toString("base64");
  await page.setContent(
    `<style>body{margin:0;background:#202623;color:#d7e1d9;font-family:system-ui;display:flex;justify-content:center;gap:55px;padding:55px 0}.item{text-align:center;font-size:13px}.mask{width:112px;height:112px;background:#3c3e40;position:relative;overflow:hidden;margin-bottom:22px}.mask img{position:absolute;width:168px;height:168px;left:-28px;top:-28px}.circle{border-radius:50%}.squircle{border-radius:28%}.rounded{border-radius:12%}</style>${[
      ["circle", "圆形裁切"],
      ["squircle", "圆角方形裁切"],
      ["rounded", "方形裁切"],
    ]
      .map(
        ([shape, label]) =>
          `<div class="item"><div class="mask ${shape}"><img src="${img}"></div>${label}</div>`,
      )
      .join("")}`,
  );
  await page.screenshot({
    path: new URL("artifacts/android/icon-masks.png", root).pathname,
  });
  console.log(
    "Generated Android icons for all densities; text fits the 66dp adaptive safe circle.",
  );
} finally {
  await browser.close();
}
