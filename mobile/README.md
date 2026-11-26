# LearnHub Mobile

This is the shared React Native/Expo learner and manager client.

## Run locally

1. Install dependencies in this directory with `npm install`.
2. Start the existing LearnHub web server.
3. Set `EXPO_PUBLIC_API_BASE_URL` to the reachable web-server URL. A physical device cannot use `localhost`; use the development machine's LAN address.
4. Run `npm start`, then open the project in an iOS simulator, Android emulator, or Expo development client.

The installed toolchain has been validated with `npx expo-doctor` (18/18 checks), `npm run typecheck`, and platform exports for both Android and iOS. This Windows workspace does not have `adb`, an Android SDK emulator, macOS/Xcode, or `xcrun`, so physical/simulator execution and native store builds must run on a machine with those platform toolchains.

## Current scope

- Email/password sign-in using a short-lived bearer token.
- Rotating refresh tokens with server-side session revocation.
- Learner assigned-course view.
- Manager direct-report view.
- Native-video launch and progress APIs with required idempotency keys.
- APNs/FCM device registration and revocation APIs.
- Secure token storage through Keychain on iOS and Keystore-backed storage on Android.

The native client still needs a production media player adapter, SCORM WebView adapter, APNs/FCM provider credentials, offline queue persistence, and physical-device validation before store release. The backend APIs for sessions, video runtime, progress, and device lifecycle are available now.

## iOS and Android

- iOS: Keychain storage, APNs, AVFoundation/FairPlay, Universal Links.
- Android: Keystore storage, FCM, Media3/Widevine, App Links, WorkManager.

The shared screens stay platform-neutral; native media, notification, deep-link, and background-sync behavior belongs behind adapters rather than duplicated screens.