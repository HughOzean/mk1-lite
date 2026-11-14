# Desktop automatic updates

Mk.1 Lite 0.3.0 adds Tauri 2 updates for macOS ARM64, macOS Intel, and Windows x64. Older installed versions must first be upgraded manually once. Android remains on its separate native build and is not handled by the desktop updater.

## User behavior

- Check 8 seconds after startup and every 6 hours while running. Background network failures remain quiet.
- A discovered update shows its current/new version and release notes. Installation only starts after the user chooses Update and restart.
- The update dialog remains modal during download, saving, installation, and restart. Main app actions and native file-open events must be blocked/deferred while `updateInProgress` is true.
- `beforeInstall` runs after the verified package has downloaded and before installation. It must save every dirty document and return false on cancellation or failure. Discard is not an update option.
- Installation failure keeps the old app usable. Restart failure after a successful installation keeps editing locked and permits retrying restart, so users cannot continue writing in a process whose bundle was replaced.
- The Settings check action calls `updater.check(true)`, which also reports no update or a check failure.

## Signing key

The public key is committed in `src-tauri/tauri.conf.json`. The matching private key is stored locally at `.build-tools/updater/signing.key` with mode 0600 and is ignored by Git. **Back up this private key securely before distributing the first updater-enabled app.** Losing or replacing it prevents that installed app from trusting future releases. Never commit, upload as a release asset, or print the private key.

This key signs updater payloads. It is independent of Apple Developer ID signing/notarization and Windows Authenticode signing. Current macOS packaging continues to use ad-hoc signing unless formal signing is configured separately.

For the Windows build workflow, provision the same private key as a repository secret without printing it:

```sh
gh secret set TAURI_SIGNING_PRIVATE_KEY --repo HughOzean/mk1-lite < .build-tools/updater/signing.key
```

The current key has no password. `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` is optional and can be configured if a future key uses one. CI must use the same key as the checked-in public key.

## Build and stage

Keep `package.json`, `package-lock.json`, `src-tauri/Cargo.toml`, `Cargo.lock`, and `tauri.conf.json` versions aligned. The macOS build scripts load the local private key unless `TAURI_SIGNING_PRIVATE_KEY` is already set:

```sh
npm run build:mac:arm
npm run build:mac:intel
```

Each still creates its normal DMG and also stages its signed updater `.app.tar.gz`, `.sig`, `.sha256`, and platform manifest under:

- `release/updater/darwin-aarch64/`
- `release/updater/darwin-x86_64/`

For Windows, run **Build Windows installer** against the matching version tag. It requires the signing secret, builds NSIS with Tauri updater signatures, stages the installer/signature/manifest in `release/updater/windows-x86_64/`, and optionally attaches them to an existing draft release. The workflow does not publish the draft.

For direct CLI builds outside these scripts, set `TAURI_SIGNING_PRIVATE_KEY` to the private key path or content and build with Tauri. `bundle.createUpdaterArtifacts` is enabled and signatures are mandatory.

## Publish order

1. Build all three targets from the same tagged source. Verify normal installers and generated signed updater packages. Keep the release draft until all required assets are attached.
2. Upload the macOS DMGs plus each platform's `release/updater/<target>/*` files to the versioned GitHub Release. Windows CI can attach its own files to the draft.
3. Publish the release only after the real artifact assets exist. Never point an update manifest at a DMG; macOS updater payloads are the `.app.tar.gz` archives.
4. Promote platform manifests only after public assets/signatures have been verified:

```sh
node scripts/publish-updater-manifests.mjs v0.3.0
```

The promotion script downloads the three per-platform metadata files, verifies version, expected repository/release URL, public asset presence, and exact signature metadata match, then writes `docs/updates/<target>.json` together. It does not print or access private keys. Update `docs/releases.json` separately with the installer metadata for the website.

5. Commit `docs/updates/` and the website download metadata, push, and deploy GitHub Pages. The app reads `https://hughozean.github.io/mk1-lite/updates/{{target}}-{{arch}}.json`. Each platform has its own endpoint so an incomplete platform release cannot accidentally point another architecture at a wrong build.

The first 0.3.0 manifests reference the real 0.3.0 signed artifacts. An installed 0.3.0 client correctly reports up to date; a later 0.3.1 release exercises the full upgrade path.

## Verification

- Run frontend/unit tests and native Rust checks before packaging.
- Staging verifies each real update payload and its signed version against the configured public key using Node’s Ed25519 and BLAKE2b-512 primitives (matching the updater’s minisign format). For a standalone check that also proves a one-byte payload modification is rejected, run `node scripts/verify-updater-artifact.mjs <artifact>`. The verifier also authenticates minisign’s global signature over the trusted comment before reading the signed version.
- In updater mock checks verify detection, postpone, download error/signature failure, save cancellation, success order (`download → save → install → restart`), and restart failure.
- Test a real 0.3.0 → 0.3.1 signed upgrade on both macOS architectures and Windows before declaring the updater fully accepted. Confirm unsaved/untitled documents, Cancel in Save As, app bundle permissions, installer restart, invalid signature rejection, and offline behavior.
- Check the public updater JSON responses and asset URLs after deployment. Monitor update-check, download/install error reports, and the installed version after restart. Do not mark a mocked or cross-compiled run as real-device acceptance.

Official references: [Updater](https://v2.tauri.app/plugin/updater/), [Process](https://v2.tauri.app/plugin/process/), [macOS code signing](https://v2.tauri.app/distribute/sign/macos/).
