#!/usr/bin/env bash
# Run: npm run android:check
# Fixes: "Unable to locate a Java Runtime", missing SDK, adb ENOENT.
#
# Note: Android emulators are created in Android Studio (Device Manager), not in React/Expo.

set +e

STUDIO_JBR="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
DEFAULT_SDK="$HOME/Library/Android/sdk"

echo "=== Autexa — Android build environment ==="
echo ""

# --- Java (required for Gradle when you run `npm run android`) ---
JAVA_OK=0
if [[ -n "${JAVA_HOME}" && -x "${JAVA_HOME}/bin/java" ]]; then
  echo "JAVA_HOME: ${JAVA_HOME}"
  "${JAVA_HOME}/bin/java" -version 2>&1 | head -1
  JAVA_OK=1
elif [[ -x "${STUDIO_JBR}/bin/java" ]]; then
  echo "PROBLEM: Terminal cannot find Java, but Android Studio includes one here:"
  echo "  ${STUDIO_JBR}"
  echo ""
  echo "Add these lines to ~/.zshrc , then open a NEW terminal:"
  echo ""
  echo "  export JAVA_HOME=\"${STUDIO_JBR}\""
  echo "  export PATH=\"\$PATH:\$JAVA_HOME/bin\""
  echo ""
elif command -v java >/dev/null 2>&1; then
  JV=$(java -version 2>&1)
  if echo "$JV" | grep -qi "Unable to locate"; then
    echo "PROBLEM: macOS 'java' stub only opens a browser — Gradle needs a real JDK."
    if [[ -x "${STUDIO_JBR}/bin/java" ]]; then
      echo "Use Android Studio's JDK — add to ~/.zshrc:"
      echo "  export JAVA_HOME=\"${STUDIO_JBR}\""
      echo "  export PATH=\"\$PATH:\$JAVA_HOME/bin\""
    fi
  else
    echo "java on PATH:"
    echo "$JV" | head -1
    JAVA_OK=1
  fi
else
  echo "No java on PATH. Install JDK 17+ (brew install openjdk@17) or set JAVA_HOME to Android Studio JBR."
fi

echo ""

# --- Android SDK + adb ---
SDK_OK=0
if [[ -n "${ANDROID_HOME}" && -d "${ANDROID_HOME}" ]]; then
  echo "ANDROID_HOME: ${ANDROID_HOME}"
  if [[ -x "${ANDROID_HOME}/platform-tools/adb" ]]; then
    echo "adb: $("${ANDROID_HOME}/platform-tools/adb" version 2>&1 | head -1)"
    SDK_OK=1
  else
    echo "Missing platform-tools. Android Studio → Settings → Android SDK → SDK Tools → Android SDK Platform-Tools."
  fi
else
  echo "ANDROID_HOME not set or missing."
  if [[ -d "${DEFAULT_SDK}/platform-tools" ]]; then
    echo "Default SDK exists. Add to ~/.zshrc:"
    echo "  export ANDROID_HOME=\"${DEFAULT_SDK}\""
    echo "  export PATH=\"\$PATH:\$ANDROID_HOME/platform-tools:\$ANDROID_HOME/emulator\""
  else
    echo "Install SDK: Android Studio → Settings → Android SDK → pick an SDK Platform + Platform-Tools."
  fi
fi

echo ""

if [[ "${JAVA_OK}" -eq 1 && "${SDK_OK}" -eq 1 ]]; then
  echo "OK — run from project root:  npm run android"
  exit 0
fi

echo "Emulators: create in Android Studio → Device Manager (not in React)."
echo "USB debugging: only needed for physical devices; the emulator does not need it."
exit 1
