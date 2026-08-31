#!/usr/bin/env bash
# Build TravelToBlog Android APK and copy to public/releases for NAS download.
set -euo pipefail

cd "$(dirname "$0")/.."

CAPACITOR_SERVER_URL="${CAPACITOR_SERVER_URL:-${NEXT_PUBLIC_HTTPS_APP_URL:-https://syno-nas.tailf9872a.ts.net}}"
export CAPACITOR_SERVER_URL

echo "→ Capacitor server URL: $CAPACITOR_SERVER_URL"

bash scripts/install-android-sdk.sh

export ANDROID_HOME="${ANDROID_HOME:-/opt/android-sdk}"
export JAVA_HOME="${JAVA_HOME:-/usr/lib/jvm/java-21-openjdk-amd64}"
export PATH="$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$PATH"

echo "→ Sincronizando Capacitor…"
npx cap sync android

mkdir -p public/releases

KEYSTORE="${ANDROID_KEYSTORE:-android/traveltoblog-release.keystore}"
KEYSTORE_PASS="${ANDROID_KEYSTORE_PASSWORD:-traveltoblog}"
KEY_ALIAS="${ANDROID_KEY_ALIAS:-traveltoblog}"

if [[ ! -f "$KEYSTORE" ]]; then
  echo "→ Generando keystore de firma ($KEYSTORE)…"
  keytool -genkeypair -v \
    -keystore "$KEYSTORE" \
    -alias "$KEY_ALIAS" \
    -keyalg RSA -keysize 2048 -validity 10000 \
    -storepass "$KEYSTORE_PASS" -keypass "$KEYSTORE_PASS" \
    -dname "CN=TravelToBlog, OU=SelfHosted, O=TravelToBlog, L=Local, S=Local, C=ES"
fi

cat > android/keystore.properties <<EOF
storePassword=${KEYSTORE_PASS}
keyPassword=${KEYSTORE_PASS}
keyAlias=${KEY_ALIAS}
storeFile=../traveltoblog-release.keystore
EOF

# Inject signing config if missing
if ! grep -q signingConfigs android/app/build.gradle; then
  python3 - <<'PY'
from pathlib import Path
path = Path("android/app/build.gradle")
text = path.read_text()
needle = "    buildTypes {"
insert = """    signingConfigs {
        release {
            def keystorePropsFile = rootProject.file("keystore.properties")
            if (keystorePropsFile.exists()) {
                def keystoreProps = new Properties()
                keystoreProps.load(new FileInputStream(keystorePropsFile))
                storeFile file(keystoreProps['storeFile'])
                storePassword keystoreProps['storePassword']
                keyAlias keystoreProps['keyAlias']
                keyPassword keystoreProps['keyPassword']
            }
        }
    }

"""
if needle in text and "signingConfigs" not in text:
    text = text.replace(needle, insert + needle, 1)
    text = text.replace(
        "        release {\n            minifyEnabled false",
        "        release {\n            signingConfig signingConfigs.release\n            minifyEnabled false",
        1,
    )
    path.write_text(text)
PY
fi

echo "→ Compilando APK release…"
cd android
./gradlew assembleRelease --no-daemon -q

APK_SRC="app/build/outputs/apk/release/app-release.apk"
if [[ ! -f "$APK_SRC" ]]; then
  echo "❌ No se generó el APK en android/$APK_SRC"
  exit 1
fi

cp "$APK_SRC" ../public/releases/traveltoblog-latest.apk
cd ..

VERSION="$(node -p "require('./package.json').version")"
cp public/releases/traveltoblog-latest.apk "public/releases/traveltoblog-${VERSION}.apk"

APK_SIZE="$(du -h public/releases/traveltoblog-latest.apk | cut -f1)"
echo "✅ APK listo: public/releases/traveltoblog-latest.apk ($APK_SIZE)"
