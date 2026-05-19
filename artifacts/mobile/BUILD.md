# FinTrack Mobile — Android Build Guide

> **Project:** `com.rahil1191.mobile` · Expo SDK 54 · React Native 0.81.5 · New Architecture enabled

---

## Prerequisites

| Tool | Minimum Version | Notes |
|------|----------------|-------|
| Java (JDK) | 17 | `java -version` |
| Android SDK | API 36 | `$env:ANDROID_HOME` = `C:\Users\rahil\AppData\Local\Android\Sdk` |
| Node.js | 18+ | `node --version` |
| CMake | 3.22.1 | Required for llama.rn native compilation |
| Ninja | **1.12.1** | Must be ≥ 1.12.1 — replace `%LOCALAPPDATA%\Android\Sdk\cmake\3.22.1\bin\ninja.exe` |

### Windows Long Path Fix (one-time, run as Administrator)
```powershell
Set-ItemProperty `
  -Path "HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem" `
  -Name LongPathsEnabled -Value 1
```

---

## Build Types

| Type | JS Bundle | Server Needed | Use Case |
|------|-----------|---------------|----------|
| **Debug** | Loaded from Metro over Wi-Fi | ✅ Yes — Metro on port 8081 | Development only |
| **Release** | Baked into APK | ❌ No — fully standalone | Install on any phone |
| **EAS Cloud** | Built by Expo servers | ❌ No | Play Store / wide distribution |

> **Always use Release** when copying or sharing the APK. Debug APKs show  
> *"Unable to load script"* on any device not connected to your dev machine.

---

## Build Release APK

### 1. Navigate to the android folder
```powershell
cd C:\Users\rahil\Replit\Email-Finance-Sync\artifacts\mobile\android
```

### 2. Run Gradle
```powershell
.\gradlew.bat assembleRelease --no-daemon
```

Build takes **5–15 minutes** on first run (CMake compiles llama.rn + expo-modules-core native code).  
Subsequent builds are faster thanks to incremental compilation.

### 3. Output APK
```
artifacts\mobile\android\app\build\outputs\apk\release\app-release.apk
```
Typical size: ~180 MB (includes llama.rn GGML native libraries for arm64-v8a).

---

## Install on Phone via USB

### Prerequisites on the phone
1. **Developer Options:** Settings → About Phone → tap *Build Number* 7 times  
2. **USB Debugging:** Settings → Developer Options → USB Debugging ON  
3. Connect via USB and tap **Allow** on the "Allow USB Debugging?" prompt

### Verify connection
```powershell
adb devices
# Expected output:
# List of devices attached
# XXXXXXXX    device
```

### Install
```powershell
# From the mobile folder:
adb install -r android\app\build\outputs\apk\release\app-release.apk
```
The `-r` flag reinstalls (keeps app data if already installed).

---

## Install Without USB (Manual Copy)

1. Copy `app-release.apk` to the phone (USB storage, Google Drive, WhatsApp, etc.)
2. Open the APK file on the phone
3. If prompted, enable **Install Unknown Apps** for your file manager / browser
4. Tap Install

---

## Signing Configuration

The release APK is signed with the **debug keystore** (sufficient for personal use / sideloading).

| Property | Value |
|----------|-------|
| Keystore | `android/app/debug.keystore` |
| Key alias | `androiddebugkey` |
| Store password | `android` |
| Key password | `android` |

> For Play Store publishing, generate a production keystore and update  
> `signingConfigs.release` in `android/app/build.gradle`.

---

## Known Windows Build Fixes

These are already applied in the repo. Re-apply **only if you run `expo prebuild --clean`**  
(which regenerates the android/ folder from scratch).

### Fix 1 — Short CXX output path (avoids Windows 260-char path limit)
Add to `android/gradle.properties`:
```properties
android.experimental.cxxBuildOutputDirectory=C:/cxx
```

### Fix 2 — Ninja version
Replace the bundled `ninja.exe` (1.10.2) with 1.12.1:
- Download: https://github.com/ninja-build/ninja/releases
- Replace: `%LOCALAPPDATA%\Android\Sdk\cmake\3.22.1\bin\ninja.exe`

### Fix 3 — Registry long paths
```powershell
# Run as Administrator — one-time only
Set-ItemProperty `
  -Path "HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem" `
  -Name LongPathsEnabled -Value 1
```

---

## Troubleshooting

| Error | Cause | Fix |
|-------|-------|-----|
| `.\gradlew.bat` not recognized | Wrong folder | Must be inside `android/`, not `mobile/` |
| *Unable to load script* on phone | Debug APK installed | Rebuild with `assembleRelease` |
| `ninja: build.ninja:XXX: bad $-escape` | Ninja 1.10.2 bug | Upgrade ninja to 1.12.1 (Fix 2 above) |
| Long path errors during CMake | Windows 260-char limit | Apply Fix 1 + Fix 3 |
| `expo-file-system` crash on startup | Wrong SDK version | Use `expo-file-system@~19.0.22`, import from `expo-file-system/src/legacy/FileSystem` |

---

## Quick Reference

```powershell
# Build release APK
cd C:\Users\rahil\Replit\Email-Finance-Sync\artifacts\mobile\android
.\gradlew.bat assembleRelease --no-daemon

# Install to connected phone
adb install -r ..\android\app\build\outputs\apk\release\app-release.apk

# Check connected devices
adb devices

# Clean build (if something is broken)
.\gradlew.bat clean
.\gradlew.bat assembleRelease --no-daemon
```
