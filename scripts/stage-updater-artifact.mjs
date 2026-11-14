import {
  copyFile,
  mkdir,
  readFile,
  readdir,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { verifyUpdaterArtifact } from "./verify-updater-artifact.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const config = JSON.parse(
  await readFile(path.join(root, "src-tauri/tauri.conf.json"), "utf8"),
);
const target = process.argv[2];
const platforms = {
  "darwin-aarch64": {
    rust: "aarch64-apple-darwin",
    folder: "macos",
    suffix: ".app.tar.gz",
    platform: "macos-arm64",
  },
  "darwin-x86_64": {
    rust: "x86_64-apple-darwin",
    folder: "macos",
    suffix: ".app.tar.gz",
    platform: "macos-x64",
  },
  "windows-x86_64": {
    rust: "x86_64-pc-windows-msvc",
    folder: "nsis",
    suffix: "-setup.exe",
    platform: "windows-x64",
  },
};
const platform = platforms[target];
if (!platform)
  throw new Error("Expected darwin-aarch64, darwin-x86_64 or windows-x86_64.");
const folder = path.join(
  root,
  "src-tauri/target",
  platform.rust,
  "release/bundle",
  platform.folder,
);
const files = (await readdir(folder)).filter((name) =>
  name.endsWith(platform.suffix),
);
if (files.length !== 1)
  throw new Error(
    `Expected one updater artifact in ${folder}, found ${files.length}.`,
  );
const source = path.join(folder, files[0]);
const signature = (await readFile(`${source}.sig`, "utf8")).trim();
if (!signature || !/^[A-Za-z0-9+/=]+$/.test(signature))
  throw new Error("Missing or malformed updater signature.");
const version = config.version;
const payload = await readFile(source);
verifyUpdaterArtifact(
  payload,
  signature,
  config.plugins.updater.pubkey,
  version,
);
const extension = target.startsWith("windows") ? "-setup.exe" : ".app.tar.gz";
const filename = `${config.productName.replaceAll(" ", "-")}_${version}_${platform.platform}${extension}`;
const output = path.join(root, "release/updater", target);
await mkdir(output, { recursive: true });
await copyFile(source, path.join(output, filename));
await copyFile(`${source}.sig`, path.join(output, `${filename}.sig`));
const sha256 = createHash("sha256").update(payload).digest("hex");
await writeFile(
  path.join(output, `${filename}.sha256`),
  `${sha256}  ${filename}\n`,
);
const manifest = {
  version,
  notes: "A new desktop release of Mk.1 Lite is available.",
  pub_date: new Date().toISOString(),
  platforms: {
    [target]: {
      url: `https://github.com/HughOzean/mk1-lite/releases/download/v${version}/${filename}`,
      signature,
    },
  },
};
await writeFile(
  path.join(output, `${target}.json`),
  JSON.stringify(manifest, null, 2) + "\n",
);
console.log(
  `Staged ${target} signed updater artifact and manifest in ${output}`,
);
