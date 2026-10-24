# Chatly Android APK Build Guide

Follow these steps to build and install the offline-capable Chatly Android app:

### 1. Push to GitHub
Push your latest Chatly project code to your GitHub repository (e.g. `main` branch or release tag).

### 2. Run the Workflow
1. Navigate to the **Actions** tab in your GitHub repository.
2. Under **Workflows** on the left, select **"Build Android APK"**.
3. Click the **"Run workflow"** button, select the target branch (`main`), and confirm.

### 3. Download & Install the APK
1. When the workflow completes (takes ~3-4 minutes), scroll down to the **Artifacts** section at the bottom of the run page.
2. Download the **`chatly-debug-apk`** zip archive.
3. Extract `app-debug.apk` and transfer it to your Android device (or download directly on your phone).
4. Tap the APK file to install. If prompted by Android, enable **"Allow from this source"** (or "Install unknown apps").

### 4. Build Validation & TypeScript Checks
- The workflow runs `npm run build:android`, which bundles a fully static, standalone web export into the Android APK.
- `next build` automatically executes full TypeScript validation checks (`tsc`). Any type or syntax errors in the codebase will fail the build before APK compilation. Always test locally with `npm run build:android` to ensure clean compilation.

### 5. Production Signed Releases
- The debug APK (`app-debug.apk`) is unsigned and intended for direct sideloading and personal testing.
- An optional signed release APK or AAB (Android App Bundle) for the Google Play Store requires generating a Java Keystore (`.keystore` / `.jks`) and configuring signing credentials in Gradle or GitHub Secrets.
