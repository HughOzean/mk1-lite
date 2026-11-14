// This promotes metadata only after all three signed update packages are public.
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
const config = JSON.parse(
  await readFile(path.join(root, "src-tauri/tauri.conf.json"), "utf8"),
);
const tag = process.argv[2] || `v${config.version}`;
if (!/^v\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(tag))
  throw new Error("Expected a release version tag.");
const repo = "HughOzean/mk1-lite";
const release = JSON.parse(
  execFileSync(
    "gh",
    ["release", "view", tag, "--repo", repo, "--json", "isDraft,assets"],
    { encoding: "utf8" },
  ),
);
if (release.isDraft)
  throw new Error(
    "Publish the release and artifacts before promoting updater manifests.",
  );
const targets = ["darwin-aarch64", "darwin-x86_64", "windows-x86_64"];
const staging = await mkdtemp(path.join(tmpdir(), "mk1-updater-manifests-"));
try {
  const manifests = [];
  for (const target of targets) {
    execFileSync(
      "gh",
      [
        "release",
        "download",
        tag,
        "--repo",
        repo,
        "--pattern",
        `${target}.json`,
        "--dir",
        staging,
      ],
      { stdio: "pipe" },
    );
    const content = await readFile(
      path.join(staging, `${target}.json`),
      "utf8",
    );
    const manifest = JSON.parse(content);
    const entry = manifest.platforms?.[target];
    if (
      `v${manifest.version}` !== tag ||
      !entry ||
      typeof entry.signature !== "string" ||
      !/^[A-Za-z0-9+/=]+$/.test(entry.signature)
    )
      throw new Error(`Invalid manifest for ${target}.`);
    const expectedPrefix = `https://github.com/${repo}/releases/download/${tag}/`;
    if (typeof entry.url !== "string" || !entry.url.startsWith(expectedPrefix))
      throw new Error(`Invalid update URL for ${target}.`);
    const filename = decodeURIComponent(entry.url.slice(expectedPrefix.length));
    const asset = release.assets.find(
      (asset) => asset.name === filename && asset.state === "uploaded",
    );
    if (!asset || asset.size <= 0)
      throw new Error(`Public update artifact missing: ${filename}`);
    execFileSync(
      "gh",
      [
        "release",
        "download",
        tag,
        "--repo",
        repo,
        "--pattern",
        `${filename}.sig`,
        "--dir",
        staging,
      ],
      { stdio: "pipe" },
    );
    const signature = (
      await readFile(path.join(staging, `${filename}.sig`), "utf8")
    ).trim();
    if (signature !== entry.signature)
      throw new Error(`Signature metadata mismatch for ${target}.`);
    manifests.push([target, content]);
  }
  await mkdir(path.join(root, "docs/updates"), { recursive: true });
  for (const [target, content] of manifests)
    await writeFile(path.join(root, "docs/updates", `${target}.json`), content);
  console.log(
    `Promoted ${tag} updater manifests for all three desktop targets. Commit docs/updates and deploy Pages.`,
  );
} finally {
  await rm(staging, { recursive: true, force: true });
}
