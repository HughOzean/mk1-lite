#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [ "$(uname -s)" != "Darwin" ]; then
  echo "This build requires macOS."
  exit 1
fi
if [ -x "$PWD/.build-tools/cargo/bin/cargo" ]; then
  export RUSTUP_HOME="$PWD/.build-tools/rustup"
  export CARGO_HOME="$PWD/.build-tools/cargo"
  export PATH="$CARGO_HOME/bin:$PATH"
fi
if ! command -v cargo >/dev/null 2>&1; then
  echo "Rust is required: install the aarch64-apple-darwin toolchain first."
  exit 1
fi
npm run tauri -- build --target aarch64-apple-darwin --bundles app --ci \
  --config '{"bundle":{"macOS":{"signingIdentity":"-","minimumSystemVersion":"11.0"}}}'

node scripts/package-macos-dmg.mjs
