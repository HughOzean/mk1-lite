# Sourced by macOS build scripts. Private keys stay outside version control.
if [ -z "${TAURI_SIGNING_PRIVATE_KEY:-}" ]; then
  MARK1_UPDATER_KEY="$PWD/.build-tools/updater/signing.key"
  if [ ! -f "$MARK1_UPDATER_KEY" ]; then
    echo "Missing updater signing key. Restore the private key to .build-tools/updater/signing.key or set TAURI_SIGNING_PRIVATE_KEY."
    return 1
  fi
  export TAURI_SIGNING_PRIVATE_KEY="$MARK1_UPDATER_KEY"
fi
export TAURI_SIGNING_PRIVATE_KEY_PASSWORD="${TAURI_SIGNING_PRIVATE_KEY_PASSWORD:-}"
