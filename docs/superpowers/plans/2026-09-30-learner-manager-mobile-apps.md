# LearnHub Learner and Manager Mobile Apps

## Goal

Add a mobile client for the learner and manager experiences while keeping course authoring, bulk administration, exports, billing, and platform operations web-first.

The app will use one shared React Native codebase with explicit iOS and Android adapters. The backend remains the authority for tenant membership, roles, assignment access, progress, completion, certificates, and manager/reporting scope.

## Product Boundary

### Mobile in the first release

- Login, session renewal, organization selection, and profile
- Learner home with assigned courses, due dates, progress, and resume
- Course detail and native video playback
- Online video progress synchronization
- Knowledge checks, scores, and feedback
- Certificate wallet and secure sharing links
- SCORM launch through an authenticated WebView with browser fallback
- Manager dashboard with direct reports and read-only completion/compliance views
- Manager course assignment and reminder actions behind a feature flag
- Push notifications for assignments, due dates, overdue work, and certificates

### Web-first

- Video authoring and large media uploads
- SCORM package upload, validation, and administration
- Bulk user import and organization lifecycle management
- Detailed CSV/report exports
- Branding, billing, global library curation, and platform-owner controls

### Explicitly deferred

- Offline video downloads
- Offline SCORM
- Universal SCORM compatibility
- Full platform-owner mobile console

## Shared Client Architecture

- React Native with Expo-compatible tooling for the shared shell and screens.
- Typed API client for `/api/v1/mobile/**`; no direct Prisma, server-action, or browser-cookie dependencies.
- Feature modules: `auth`, `tenant`, `learner`, `manager`, `video`, `scorm`, `assessments`, `certificates`, `notifications`, and `sync`.
- Secure storage for refresh credentials: iOS Keychain and Android Keystore-backed storage.
- Server-authorized deep links using Universal Links/App Links; no secrets in URLs.
- A small native adapter boundary for secure storage, push, media playback, WebView, background sync, and deep links.
- Stable error envelopes with `401`, `403`, `404`, `422`, `429`, and `5xx` semantics.

## iOS Decisions

- Use Keychain for refresh-token storage and Face ID/Touch ID only as a local unlock.
- Use AVFoundation-backed playback for native video; evaluate FairPlay before protected downloads.
- Register APNs tokens only after permission rationale and support provisional authorization where appropriate.
- Use Universal Links and an `apple-app-site-association` file.
- Treat background execution as constrained; foreground progress commits are the reliable baseline.
- Test SCORM WebView behavior on supported iOS versions, including storage, orientation, popups, file links, and bridge recovery.
- Complete App Store privacy declarations and encrypted-data export review before submission.

## Android Decisions

- Use Android Keystore-backed storage for refresh credentials and biometric unlock where available.
- Use ExoPlayer/Media3-backed playback; evaluate Widevine before protected downloads.
- Use FCM with token rotation, Android 13+ notification permission, and channel-level preferences.
- Use App Links and an `assetlinks.json` file.
- Use WorkManager only for bounded retryable sync; tolerate OEM process termination and battery restrictions.
- Test SCORM WebView behavior across supported Android versions and representative OEM devices.
- Validate storage pressure, notification channels, back navigation, split-screen behavior, and Play policy requirements.

## Backend Contract Work

Create additive, versioned mobile routes that adapt existing domain services:

- `POST /api/v1/mobile/auth/token` and refresh/revoke operations
- `GET /api/v1/mobile/me` and available organizations
- `GET /api/v1/mobile/learner/assignments`
- `GET /api/v1/mobile/learner/assignments/:id`
- `GET /api/v1/mobile/learner/certificates`
- `GET /api/v1/mobile/manager/direct-reports`
- `GET /api/v1/mobile/manager/reports/progress`
- `POST /api/v1/mobile/devices`
- `DELETE /api/v1/mobile/devices/:id`
- `POST /api/v1/mobile/sync/progress`

Existing runtime services remain the owners of video, SCORM, assessment, and progress rules. Every mutation accepts an idempotency key. Tenant context is resolved from authenticated membership and resource ownership, never trusted from a client-provided organization identifier.

Before production mobile release, also require signed or entitlement-checked video URLs, authenticated SCORM grants for every storage backend, API-native errors, rate limits, request limits, cross-tenant negative tests, and audit correlation IDs.

## Delivery Loop

Each slice follows a React-style loop:

1. **Reason**: state the smallest behavior hypothesis and the cheapest check that can disprove it.
2. **Execute**: implement one narrow vertical slice with shared and platform-specific acceptance criteria.
3. **Assess**: run focused tests, type checks, security checks, and iOS/Android device checks.
4. **Challenge**: use a separate review pass to look for tenant leaks, replay bugs, inaccessible states, store-policy issues, and platform divergence.
5. **Test**: add regression coverage for the discovered edge cases before moving to the next slice.

No slice is complete until both platform adapters are either tested or explicitly marked unsupported with a user-visible fallback.

## Phases

### Phase 0: Contracts and foundation

- Establish mobile API DTOs, auth strategy, error envelope, pagination, idempotency, and capability flags.
- Add API contract tests and cross-tenant negative tests.
- Scaffold the shared mobile app, navigation, secure storage adapter, and environment configuration.

### Phase 1: Online learner app

- Login and tenant selection
- Assigned-learning home and course detail
- Native video playback and online progress
- Assessments, feedback, certificates, and profile
- SCORM WebView fallback with explicit compatibility messaging

### Phase 2: Manager app surface and push

- Direct reports and read-only progress/compliance dashboard
- Manager assignment action behind a feature flag
- APNs/FCM registration, notification preferences, and safe deep links

### Phase 3: Offline progress

- Encrypted local event queue
- Idempotent ordered replay and canonical server reconciliation
- Visible failed-sync state and bounded retry behavior

### Phase 4: Protected offline media and SCORM hardening

- Signed downloads, entitlement, expiry, revocation, storage quotas, and DRM decisions
- Tested SCORM 1.2 subset with browser fallback and package compatibility matrix

## Release Gates

- Backend is additive and old web routes remain functional.
- Refresh tokens rotate and can be revoked per device.
- Learner, manager, admin, and cross-tenant negative authorization tests pass.
- Video and SCORM content cannot be accessed from copied or expired URLs.
- Push payloads contain no sensitive content and deep links re-authorize on open.
- Crash-free sessions, playback startup, sync replay, SCORM initialization, push delivery, and authorization-denial telemetry are visible.
- TestFlight internal testing and Google Play internal testing pass before staged production rollout.