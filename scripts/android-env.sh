#!/usr/bin/env bash
# Source this file to use this project's local Android toolchain.
MARK1_PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [ -d "$MARK1_PROJECT_ROOT/.build-tools/jdk-17" ]; then
  MARK1_JAVA_BIN="$(find "$MARK1_PROJECT_ROOT/.build-tools/jdk-17" -path '*/Contents/Home/bin/java' -type f -print -quit)"
  if [ -n "$MARK1_JAVA_BIN" ]; then export JAVA_HOME="${MARK1_JAVA_BIN%/bin/java}"; fi
fi
if [ -d "$MARK1_PROJECT_ROOT/.build-tools/android-sdk" ]; then
  export ANDROID_HOME="$MARK1_PROJECT_ROOT/.build-tools/android-sdk"
  export ANDROID_SDK_ROOT="$ANDROID_HOME"
fi
export GRADLE_USER_HOME="$MARK1_PROJECT_ROOT/.build-tools/gradle-cache"
export ANDROID_USER_HOME="$MARK1_PROJECT_ROOT/.build-tools/android-user"
export PATH="${JAVA_HOME:+$JAVA_HOME/bin:}${ANDROID_HOME:+$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:}$MARK1_PROJECT_ROOT/.build-tools/gradle-8.11.1/bin:$PATH"
