# Android Build Instructions

1.  Deploy the Chatly web application (e.g., via Vercel or your preferred provider).
2.  In your GitHub repository settings, add a secret named `APP_URL` and set its value to the URL of your deployed application.
3.  Go to the "Actions" tab in your GitHub repository.
4.  Select the "Android APK" workflow and click "Run workflow".
5.  Once the build completes, download the `chatly-debug-apk` artifact.

*Note: For Play Store releases, you must sign the build using a keystore. Refer to the official Android documentation for signing APKs.*
