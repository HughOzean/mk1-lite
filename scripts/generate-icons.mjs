import { execFileSync } from "node:child_process";
import { copyFile, mkdtemp, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(import.meta.url);
const cli = path.join(
  path.dirname(require.resolve("@tauri-apps/cli/package.json")),
  "tauri.js",
);
execFileSync(process.execPath, [path.join(root, "scripts/generate-icon.mjs")], {
  cwd: root,
  stdio: "inherit",
});
const output = await mkdtemp(path.join(tmpdir(), "mark1light-macos-icons-"));
try {
  execFileSync(process.execPath, [cli, "icon", "public/icon.png"], {
    cwd: root,
    stdio: ["ignore", "ignore", "pipe"],
  });
  execFileSync(
    process.execPath,
    [cli, "icon", "public/icon-macos.png", "--output", output],
    { cwd: root, stdio: ["ignore", "ignore", "pipe"] },
  );
  await copyFile(
    path.join(output, "icon.icns"),
    path.join(root, "src-tauri/icons/icon.icns"),
  );
  console.log(
    "Updated platform icons; macOS ICNS uses the 824px body on a transparent 1024px canvas.",
  );
} finally {
  await rm(output, { recursive: true, force: true });
}
