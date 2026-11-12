import { chromium } from "@playwright/test";
import { readFile, mkdir } from "node:fs/promises";
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  await mkdir("artifacts", { recursive: true });
  for (const [source, destination, size, background] of [
    ["app-icon.svg", "public/icon-macos.png", 1024, "transparent"],
    ["favicon.svg", "public/icon.png", 1024, "transparent"],
    ["app-icon.svg", "artifacts/icon-preview.png", 512, "#222425"],
  ]) {
    const page = await browser.newPage({
      viewport: { width: size, height: size },
      deviceScaleFactor: 1,
    });
    const svg = await readFile(
      new URL(`../public/${source}`, import.meta.url),
      "utf8",
    );
    await page.setContent(
      `<style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:${background}}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`,
    );
    await page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    );
    await page.screenshot({
      path: destination,
      omitBackground: background === "transparent",
    });
    await page.close();
  }
  const check = await browser.newPage();
  const bytes = await readFile(
    new URL("../public/icon-macos.png", import.meta.url),
  );
  const metrics = await check.evaluate(
    async (data) => {
      const img = new Image();
      img.src = data;
      await img.decode();
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const context = canvas.getContext("2d");
      context.drawImage(img, 0, 0);
      const { data: pixels } = context.getImageData(
        0,
        0,
        img.width,
        img.height,
      );
      let minX = img.width,
        minY = img.height,
        maxX = -1,
        maxY = -1,
        green = 0,
        white = 0;
      for (let y = 0; y < img.height; y++)
        for (let x = 0; x < img.width; x++) {
          const i = (y * img.width + x) * 4;
          if (pixels[i + 3] >= 250) {
            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
            maxX = Math.max(maxX, x);
            maxY = Math.max(maxY, y);
          }
          if (
            pixels[i] === 51 &&
            pixels[i + 1] === 255 &&
            pixels[i + 2] === 102 &&
            pixels[i + 3] === 255
          )
            green++;
          if (
            pixels[i] === 255 &&
            pixels[i + 1] === 255 &&
            pixels[i + 2] === 255 &&
            pixels[i + 3] === 255
          )
            white++;
        }
      return {
        canvas: [img.width, img.height],
        opaqueBody: [minX, minY, maxX + 1, maxY + 1],
        exactGreenPixels: green,
        exactWhitePixels: white,
      };
    },
    `data:image/png;base64,${bytes.toString("base64")}`,
  );
  if (
    JSON.stringify(metrics.opaqueBody) !== "[100,100,924,924]" ||
    !metrics.exactGreenPixels ||
    metrics.exactWhitePixels < 1500
  )
    throw new Error("Unexpected icon geometry or foreground color");
  console.log(JSON.stringify(metrics));
} finally {
  await browser.close();
}
