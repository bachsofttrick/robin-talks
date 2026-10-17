# Android SDK Setup and APK Export Log

Environment: Debian 13 (trixie), user `node` (has sudo), Bun 1.4.2, Node 26.10.0.
Target: local Android SDK plus a Gradle-built APK for `apps/mobile`.

The `apps/mobile` `apk` script runs `eas build -p android --profile preview`
(EAS cloud). A local APK export instead needs `expo prebuild` and the Android
Gradle toolchain installed on this machine. Each step below lists the exact
command run and why.

---

## Step 1: Inspect the environment

Reasons: establish the baseline before installing anything, and discover what was
missing (no Java, no `ANDROID_HOME`, no SDK).

```bash
uname -a
java -version
echo "ANDROID_HOME=$ANDROID_HOME ANDROID_SDK_ROOT=$ANDROID_SDK_ROOT"
which adb sdkmanager gradle
cat /etc/os-release | head -5
```

Result: Linux x86_64, Debian 13 trixie. `java`, `adb`, `sdkmanager`, `gradle`
were all absent; the SDK env vars were empty.

---

## Step 2: Install a JDK

Reason: the Android Gradle Plugin used by React Native 0.86 needs a JDK. Debian 13
ships OpenJDK 21 (no 17), and AGP 8.x supports JDK 21.

```bash
sudo apt-get update -qq
sudo apt-get install -y -qq openjdk-21-jdk-headless
java -version
javac -version
```

Result: `openjdk 21.0.12.1` at `/usr/lib/jvm/java-21-openjdk-amd64`.

---

## Step 3: Install the Android command line tools

Reason: the `sdkmanager` binary ships inside the command line tools, the
supported way to install SDK packages.

```bash
mkdir -p ~/android-setup && cd ~/android-setup
curl -sL -o cmdline-tools.zip \
  https://dl.google.com/android/repository/commandlinetools-linux-13114758_latest.zip
unzip -q -o cmdline-tools.zip -d ~/android-setup/extract
sudo mkdir -p /opt/android-sdk/cmdline-tools
sudo mv ~/android-setup/extract/cmdline-tools /opt/android-sdk/cmdline-tools/latest
sudo chown -R node:node /opt/android-sdk
```

Result: `/opt/android-sdk/cmdline-tools/latest/bin/sdkmanager` (version 19.0),
owned by `node`.

---

## Step 4: Accept licenses and install SDK packages

Reason: Expo 57 / RN 0.86 compiles against Android 36, so the platform, build
tools, and platform-tools (adb) are required; licenses must be accepted first.

```bash
export ANDROID_HOME=/opt/android-sdk
export JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64
export PATH=$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$PATH

yes | sdkmanager --licenses
sdkmanager "platform-tools" "platforms;android-36" "build-tools;36.0.0"
```

Result: `platform-tools` (adb 1.0.41), `platforms/android-36`, and
`build-tools/36.0.0` installed under `/opt/android-sdk`.

---

## Step 5: Point Gradle at the SDK

Reason: Gradle needs the SDK location. `local.properties` with `sdk.dir` is the
standard per-project pointer (equivalent to `ANDROID_HOME`).

```bash
printf 'sdk.dir=/opt/android-sdk\n' > /app/apps/mobile/android/local.properties
cat /app/apps/mobile/android/local.properties
```

Result: `sdk.dir=/opt/android-sdk`.

---

## Step 6: Generate the native Android project

Reason: `apps/mobile` ships no `android/` directory, so `expo prebuild` generates
the Gradle project from `app.json`. `--no-install` skips a package install since
dependencies were already present.

```bash
cd /app/apps/mobile
export ANDROID_HOME=/opt/android-sdk
/app/node_modules/.bin/expo prebuild --platform android --no-install
```

Result: `android/` created, prebuild finished. Side effect: it rewrote the
`android`/`ios` scripts in `package.json` to `expo run:android`/`expo run:ios`.

---

## Step 7: Build the release APK

Reason: `assembleRelease` produces the APK. The Expo Gradle template signs the
release variant with the bundled debug keystore, so the output is installable.

```bash
cd /app/apps/mobile/android
export ANDROID_HOME=/opt/android-sdk
export ANDROID_SDK_ROOT=/opt/android-sdk
export JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64
export PATH=$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$PATH

./gradlew :app:assembleRelease
```

Result: `BUILD SUCCESSFUL in 10m 37s` (486 tasks).

---

## Step 8: Verify the APK

Reason: confirm the artifact is present, signed, correctly packaged, and carries
all target ABIs.

```bash
APK=/app/apps/mobile/android/app/build/outputs/apk/release/app-release.apk

ls -la "$APK"
sha256sum "$APK"
/opt/android-sdk/build-tools/36.0.0/apksigner verify --print-certs "$APK"
/opt/android-sdk/build-tools/36.0.0/aapt2 dump badging "$APK" \
  | grep -E "^package:|^sdkVersion|^targetSdkVersion|^application-label:|^native-code"
```

Result:

- Package: `com.example.robintalks`, versionName `1.0.0`, versionCode `1`
- compileSdk/targetSdk: 36, label `Robin Talks`
- ABIs: `arm64-v8a`, `armeabi-v7a`, `x86`, `x86_64`
- Signer: `CN=Android Debug`, SHA-256 `fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c`
- APK SHA-256 (first build): `84293aae555c0619567293e14c1c40f4526a40d4e18d089d472e678c349ec417`

---

## Build re-run

Between turns the machine kept the JDK and the SDK at `/opt/android-sdk` (now
also containing `cmake` and `ndk`), but the build output and
`android/local.properties` were gone. Steps 1-6 did not need repeating; only the
SDK pointer (Step 5) and the build (Step 7) were re-run.

```bash
cd /app/apps/mobile/android
printf 'sdk.dir=/opt/android-sdk\n' > local.properties

export ANDROID_HOME=/opt/android-sdk
export ANDROID_SDK_ROOT=/opt/android-sdk
export JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64
export PATH=$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$PATH

time ./gradlew :app:assembleRelease
```

Result: `BUILD SUCCESSFUL in 6m 25s` (486 tasks: 458 executed, 28 up-to-date).
Gradle 9.3.1, Kotlin 2.2.21, JVM 21.0.12.1.

Re-run output:

```
apps/mobile/android/app/build/outputs/apk/release/app-release.apk
```

- Size: 99,351,929 bytes (95 MiB)
- Same package/signing/ABIs as the first build
- APK SHA-256 (re-run): `4958b5308b8280046f6bbe21ef6e55afb30d3096efd2fdd4a6b379a0b70ccb46`

The first-run and re-run SHA-256 differ because APK packaging is not
byte-for-byte reproducible (embedded timestamps and ordering); the content and
signing are equivalent.

---

## Step 9: EAS local APK build

Reason: EAS itself can build locally with `eas build --local` (experimental),
which runs the EAS build job on this machine via `eas-cli-local-build-plugin`
instead of on EAS servers. That is the EAS-native equivalent of the manual
Gradle build above, and it needs the same Android SDK/JDK already installed.

Confirmed via EAS docs (`ctx7 docs /expo/eas-cli`) that `eas build` accepts
`--local` (run locally), `--output <path>` (copy the artifact), and that build
profiles select `android.buildType: apk`. Also confirmed in the installed
`@expo/eas-json` schema that a profile supports `distribution: internal`,
`credentialsSource: local|remote`, `withoutCredentials`, and
`android.buildType: apk|app-bundle`.

### 9a. Install EAS CLI

```bash
bun install -g eas-cli
eas --version   # eas-cli/24.12.1 linux-x64 node-v26.10.0
```

Result: `eas-cli@24.12.1`, which satisfies the `>= 24.12.1` pin in `eas.json`.

### 9b. Adjust eas.json for a local APK

Added a dedicated `local` profile (internal distribution, APK output, local
keystore source) so local builds do not touch remote credentials:

```bash
# apps/mobile/eas.json
{
  "cli": { "version": ">= 24.12.1", "appVersionSource": "local" },
  "build": {
    "preview": { "android": { "buildType": "apk" } },
    "local": {
      "distribution": "internal",
      "credentialsSource": "local",
      "android": { "buildType": "apk" }
    },
    "production": {}
  }
}
```

### 9c. Try the local build

```bash
cd /app/apps/mobile
export PATH="$HOME/.bun/bin:$PATH"
export ANDROID_HOME=/opt/android-sdk
export ANDROID_SDK_ROOT=/opt/android-sdk
export JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64

eas config --platform android --profile local
eas build -p android --profile local --local --non-interactive --output /app/eas-local.apk
```

Result: blocked. EAS requires an authenticated Expo account for every `eas`
command, local builds included:

```
An Expo user account is required to proceed.
Either log in with eas login or set the EXPO_TOKEN environment variable if you're
using EAS CLI on CI (https://docs.expo.dev/accounts/programmatic-access/)
    Error: build command failed.
```

`eas config` fails the same way. Even a local build resolves the `LoggedIn`
context field first (`sessionManager.ensureLoggedInAsync`), and Android
credential provisioning dereferences `ctx.user.accounts`, so no Expo account or
`EXPO_TOKEN` means no EAS build, local or cloud.

### 9d. Provide local credentials

Reason: the `local` profile uses `credentialsSource: local`, so EAS reads a
project-root `credentials.json` instead of server-managed keystores. Without it
the build stops with `credentials.json does not exist in the project root
directory`. `eas-cli` reads the keystore as base64 locally and injects it into
the build job; the `keystorePath` may be relative to the project root.

```bash
export JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64
export PATH=$JAVA_HOME/bin:$PATH
mkdir -p /app/apps/mobile/credentials
keytool -genkeypair -v \
  -keystore /app/apps/mobile/credentials/android-keystore.jks \
  -alias robintalks \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -storepass robintalks -keypass robintalks \
  -dname "CN=Robin Talks, OU=Local, O=Robin Talks, L=Unknown, ST=Unknown, C=US"
```

`apps/mobile/credentials.json`:

```json
{
  "android": {
    "keystore": {
      "keystorePath": "credentials/android-keystore.jks",
      "keystorePassword": "robintalks",
      "keyAlias": "robintalks",
      "keyPassword": "robintalks"
    }
  }
}
```

Both the keystore and `credentials.json` were added to `.gitignore`
(`apps/mobile/credentials.json`, `apps/mobile/credentials/`) so they are not
committed.

### 9e. Successful local build

```bash
cd /app/apps/mobile
export PATH="$HOME/.bun/bin:$PATH"
export ANDROID_HOME=/opt/android-sdk
export ANDROID_SDK_ROOT=/opt/android-sdk
export JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64
export PATH=$JAVA_HOME/bin:$PATH

eas build -p android --profile local --local --output /app/eas-local.apk
```

Result: `Build successful` (Gradle `BUILD SUCCESSFUL in 6m 21s`, total ~6m 46s
wall). The job ran in a temp working dir
(`/tmp/node/eas-build-local-nodejs/<uuid>/build`) because `EAS_LOCAL_BUILD_WORKINGDIR`
is unset; `.easignore` excludes `/android` and `/ios`, so EAS ran its own
prebuild before Gradle. Artifact written to `/app/eas-local.apk`.

- Path: `/app/eas-local.apk`
- Size: 99,342,325 bytes (94.7 MB)
- Package: `com.example.robintalks`, versionName `1.0.0`, versionCode `1`
- compileSdk/targetSdk: 36, label `Robin Talks`
- ABIs: `arm64-v8a`, `armeabi-v7a`, `x86`, `x86_64`
- Signer: `CN=Robin Talks, OU=Local` (local keystore), SHA-256 `74dc5379c70f65145604bec480e97d647776400021ff3b2cc93c5b2a2fed7036`
- APK SHA-256: `b1bb399deb18cada60f533eebe6b3eec63d86085c8d8fa9fdd59d3e4ab245969`

### 9f. Notes

- Authentication is mandatory for `eas build` even with `--local`: the command
  resolves the `LoggedIn` context (`sessionManager.ensureLoggedInAsync`) before
  doing anything. Log in with `eas login` or set `EXPO_TOKEN`.
- The local-build path needs the same Android SDK/JDK as the manual Gradle
  build, and produced an equivalent APK signed with the local keystore rather
  than the RN debug keystore.
- The Step 7 Gradle path remains the account-free way to produce an APK.

---

## Notes and side effects

- `expo prebuild` rewrote the `apps/mobile/package.json` scripts `android` and
  `ios` to `expo run:android` / `expo run:ios`. Revert if unintended.
- `apps/mobile/android/` is generated; `.gitignore` already covers it via
  `apps/mobile/android/*`.
- The manual release APK (Step 7) is signed with the shared RN debug key; the EAS
  local APK (Step 9e) is signed with the generated local keystore. Both are for
  local testing only, not store distribution.
