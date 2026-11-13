#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/android-env.sh"
cd "$MARK1_PROJECT_ROOT"
if ! java -version >/dev/null 2>&1; then
  echo '缺少 JDK：请配置 JDK 17 或将其放入 .build-tools/jdk-17。' >&2
  exit 1
fi
if [ -z "${ANDROID_HOME:-}" ] || [ ! -d "$ANDROID_HOME/platforms/android-35" ]; then
  echo '缺少 Android API 35：请配置 ANDROID_HOME。' >&2
  exit 1
fi
npm run android:prepare
if [ -x .build-tools/gradle-8.11.1/bin/gradle ]; then
  .build-tools/gradle-8.11.1/bin/gradle --no-daemon -p android assembleDebug
else
  (cd android && ./gradlew --no-daemon assembleDebug)
fi
mkdir -p release/android
MARK1_VERSION="$(node -p "require('./android/app/build/outputs/apk/debug/output-metadata.json').elements[0].versionName")"
MARK1_APK="release/android/Mk1-Lite-${MARK1_VERSION}-debug.apk"
cp android/app/build/outputs/apk/debug/app-debug.apk "$MARK1_APK"
"$ANDROID_HOME/build-tools/35.0.0/apksigner" verify --verbose "$MARK1_APK"
(cd release/android && shasum -a 256 "$(basename "$MARK1_APK")" > "$(basename "$MARK1_APK").sha256")
cp "$MARK1_APK.sha256" release/android/android-SHA256SUMS.txt
printf '\nAPK: %s/%s\n' "$MARK1_PROJECT_ROOT" "$MARK1_APK"
