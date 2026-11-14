import { execFileSync } from "node:child_process";
import {
  readFile,
  writeFile,
  mkdtemp,
  mkdir,
  symlink,
  rm,
  stat,
} from "node:fs/promises";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
const config = JSON.parse(
  await readFile(path.join(root, "src-tauri/tauri.conf.json"), "utf8"),
);
const name = config.productName,
  version = config.version;
const architecture = process.argv[2] || "arm64";
const targets = { arm64: "aarch64-apple-darwin", x64: "x86_64-apple-darwin" };
if (!Object.hasOwn(targets, architecture))
  throw new Error(`Unsupported architecture: ${architecture}`);
const app = path.join(
  root,
  `src-tauri/target/${targets[architecture]}/release/bundle/macos`,
  `${name}.app`,
);
await stat(app);
const binary = path.join(
  app,
  "Contents/MacOS",
  config.mainBinaryName || "mark1light",
);
execFileSync(
  "lipo",
  [binary, "-verify_arch", architecture === "x64" ? "x86_64" : "arm64"],
  { stdio: "inherit" },
);
execFileSync("codesign", ["--verify", "--deep", "--strict", app], {
  stdio: "inherit",
});
const stage = await mkdtemp(path.join(tmpdir(), "mk1-lite-dmg-stage-"));
const output = path.join(
  root,
  "release",
  `${name.replaceAll(" ", "-")}_${version}_macos-${architecture}.dmg`,
);
try {
  await mkdir(path.dirname(output), { recursive: true });
  execFileSync("ditto", [app, path.join(stage, `${name}.app`)], {
    stdio: "inherit",
  });
  await symlink("/Applications", path.join(stage, "Applications"), "dir");
  // A private stage prevents old product names or stale build bundles entering the image.
  // hdiutil creates the read-only image without Finder automation or mounting intermediates.
  execFileSync(
    "hdiutil",
    [
      "create",
      "-volname",
      name,
      "-srcfolder",
      stage,
      "-fs",
      "HFS+",
      "-format",
      "UDZO",
      "-imagekey",
      "zlib-level=9",
      "-ov",
      output,
    ],
    {
      stdio: "inherit",
      env: {
        ...process.env,
        LC_ALL: "en_US.UTF-8",
        LC_CTYPE: "en_US.UTF-8",
        LANG: "en_US.UTF-8",
      },
    },
  );
  execFileSync("hdiutil", ["verify", output], { stdio: "inherit" });
  const checksum = createHash("sha256")
    .update(await readFile(output))
    .digest("hex");
  await writeFile(
    `${output}.sha256`,
    `${checksum}  ${path.basename(output)}\n`,
  );
  console.log(`Installer: ${output}`);
} finally {
  await rm(stage, { recursive: true, force: true });
}
