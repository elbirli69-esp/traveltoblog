#!/usr/bin/env bash
# Instala Android SDK (command-line) si no existe. Idempotente.
set -euo pipefail

ANDROID_HOME="${ANDROID_HOME:-/opt/android-sdk}"
export ANDROID_HOME
export PATH="$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$PATH"

if [[ -x "$ANDROID_HOME/platform-tools/adb" ]] && [[ -d "$ANDROID_HOME/platforms/android-34" ]]; then
  echo "→ Android SDK ya instalado en $ANDROID_HOME"
  exit 0
fi

echo "→ Instalando Android SDK en $ANDROID_HOME…"
sudo mkdir -p "$ANDROID_HOME/cmdline-tools"
cd /tmp

if [[ ! -f cmdline-tools.zip ]]; then
  curl -fsSL -o cmdline-tools.zip \
    "https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip"
fi

sudo rm -rf "$ANDROID_HOME/cmdline-tools/latest"
sudo unzip -qo cmdline-tools.zip -d "$ANDROID_HOME/cmdline-tools"
sudo mv "$ANDROID_HOME/cmdline-tools/cmdline-tools" "$ANDROID_HOME/cmdline-tools/latest"

SDKMANAGER="$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager"
export PATH="$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$PATH"

yes | sudo "$SDKMANAGER" --sdk_root="$ANDROID_HOME" --licenses >/tmp/sdk-licenses.log 2>&1 || true
sudo "$SDKMANAGER" --sdk_root="$ANDROID_HOME" \
  "platform-tools" \
  "platforms;android-34" \
  "build-tools;34.0.0"

echo "→ Android SDK listo"
