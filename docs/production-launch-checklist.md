# Production Launch Checklist

## Required Web Configuration

- Set `DATABASE_URL` to the production PostgreSQL endpoint, with network restrictions, TLS, backups, and a tested restore procedure.
- Set `NEXTAUTH_SECRET` to a random value with at least 32 characters. Store it in the deployment secret manager, not in the repository.
- Set `NEXTAUTH_URL` and `APP_BASE_URL` to the production HTTPS origin.
- Configure a real delivery provider: `EMAIL_PROVIDER=smtp` or `api-provider`, plus its required credentials and `EMAIL_FROM`.
- Set `NOTIFICATION_JOBS_SECRET` to a separate random secret and configure the scheduler to call the job endpoint over HTTPS.
- Apply database migrations with `npx prisma migrate deploy`. Do not run the demo seed against production.

## Video and AI

- For Mux uploads, configure `MUX_TOKEN_ID`, `MUX_TOKEN_SECRET`, `MUX_WEBHOOK_SECRET`, `MUX_SIGNING_KEY_ID`, and `MUX_SIGNING_PRIVATE_KEY`.
- Confirm Mux direct-upload CORS is restricted to `APP_BASE_URL` and webhook delivery reaches `/api/providers/mux/webhook`.
- New assets are created with signed playback. Existing assets created under the former public policy remain public at Mux; replace or reprocess them with signed playback before treating their content as private. Review third-party playback URLs separately.
- Set `OPENAI_API_KEY` to enable AI lesson-script and text-to-video prompt generation. This feature does not render video files; an approved video-generation provider and its credentials are a separate integration.
- Verify upload limits, playback startup, token expiry, and webhook retries using production-like media before release.

## Security and Operations

- Run `npm run lint`, `npx tsc --noEmit --pretty false`, `npx prisma validate`, `npx prisma migrate status`, and the full test suite in CI.
- Verify learner, manager, and admin authorization across tenants, including inactive users and revoked mobile sessions.
- Verify mobile refresh-token rotation, login throttling under multiple app instances, and audit visibility.
- Configure monitoring for HTTP 5xx, authentication denials, database saturation, email failures, Mux upload/webhook errors, and signed playback failures.
- Configure backups, retention, incident response ownership, and a rollback plan for the app and migrations.

## Mobile Store Release

- Build signed iOS and Android binaries using the corresponding native toolchains and store credentials.
- Validate login, refresh/revoke, learner video playback, progress sync, background/foreground transitions, and network failure behavior on physical devices.
- Configure production HTTPS `EXPO_PUBLIC_API_BASE_URL`, app association files for Universal Links/App Links, privacy disclosures, and store metadata.
- Push delivery, offline progress, mobile assessments/certificates, and SCORM are not part of the current mobile client unless separately implemented and accepted in the release scope.
- Expo JavaScript exports are not substitutes for signed store builds or physical-device acceptance testing.
