# Production Launch Runbook: Vercel + Supabase

Audience: LearnHub release operator and application owner.

Goal: deploy the web service safely to Vercel with Supabase Postgres, then prepare the separate iOS and Android releases. Follow the gates in order. Do not put secrets in Git, tickets, or chat.

## Launch Scope and Blockers

The web application builds on Next.js 16.4.2, the full test suite passes, and the production dependency audit reported zero vulnerabilities at the last check. The mobile workspace currently targets Expo SDK 58, but its installed native dependency versions were reported out of sync by `expo install --check`.

Two code gates must be resolved before accepting untrusted production content:

- **Platform-owner bootstrap:** `prisma/seed.ts` creates demo users and sample content, and includes legacy-account cleanup. There is no dedicated, safe first-production-owner bootstrap command. Do not run the seed against production. Add and review a one-time owner bootstrap mechanism before launch.
- **SCORM malware scanning:** the extraction route currently uses a pass-through scanner. Do not accept untrusted SCORM uploads in production until a real scanner is integrated and tested, or keep SCORM upload/extraction disabled.

This runbook deploys the web product first. The current mobile app is a limited learner/manager beta, not a complete store-ready product: there is no mobile SCORM, offline sync, push-delivery provider, assessment UI, or certificate wallet UI.

## 1. Create Supabase Environments

1. Create separate Supabase projects for production and preview/staging. Do not point preview deployments at production data.
2. Choose the region nearest the Vercel production region.
3. Keep database network access limited to the deployment environment and trusted operator/migration path. Require TLS for database connections.
4. Create a strong database password and store it in the approved secret manager.
5. Copy two connection strings from Supabase:
   - A pooled runtime connection suitable for Vercel serverless functions.
   - A direct or session connection suitable for Prisma migrations.
6. Preserve the URI encoding Supabase supplies. Ensure SSL is required. Do not commit either URL.
7. Configure and test Supabase backups and point-in-time recovery for the selected plan. Perform a restore exercise in a non-production project before go-live.

The application and Prisma CLI both read `DATABASE_URL`. The Vercel runtime gets the pooled URI; the controlled migration job temporarily receives the direct/session URI as `DATABASE_URL`.

## 2. Prepare Vercel

1. Import the LearnHub Git repository into Vercel and select the repository root as the project root.
2. Use the Next.js framework preset, install command `npm ci`, and build command `npm run build`. `prebuild` runs `prisma generate`; do not add demo seeding to the build.
3. Select Node.js 22 LTS in Vercel Project Settings. This is the supported deployment runtime to validate against; do not deploy using the workstation's Node 26 environment without testing.
4. Set Vercel project regions close to Supabase.
5. Create Preview and Production environments separately. Preview must use a separate Supabase project and separate credentials.
6. Add all server secrets through Vercel's environment-variable UI or CLI secret prompt. Never prefix server secrets with `NEXT_PUBLIC_` or `EXPO_PUBLIC_`.
7. Set the custom production domain in Vercel, then complete the DNS instructions Vercel displays. Wait for TLS to be issued and confirm HTTPS before enabling production traffic.

## 3. Configure Production Environment

Add these values to the Vercel **Production** environment. Add separate values for Preview.

Required for the application:

- `DATABASE_URL`: Supabase pooled runtime connection URI.
- `NEXTAUTH_SECRET`: generate at least 32 random characters. For example, generate locally with `node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"`, then enter the output directly into Vercel's secret field. Do not paste it into this runbook or commit it.
- `NEXTAUTH_URL`: `https://<production-domain>`.
- `APP_BASE_URL`: `https://<production-domain>`.
- `EMAIL_PROVIDER`: choose `smtp` or `api-provider`; `console` is rejected in production.
- `EMAIL_FROM`: verified sender address for the selected provider.
- `NOTIFICATION_JOBS_SECRET`: a separate random secret, not the NextAuth secret.

For SMTP, also set `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, and `SMTP_SECURE` as required by the mail provider.

For `api-provider`, set `EMAIL_API_ENDPOINT` and `EMAIL_API_TOKEN`.

Optional integrations:

- Mux: `MUX_TOKEN_ID`, `MUX_TOKEN_SECRET`, `MUX_WEBHOOK_SECRET`, `MUX_SIGNING_KEY_ID`, and `MUX_SIGNING_PRIVATE_KEY`. Production config rejects a partial Mux setup. The private key may be entered with real line breaks or escaped `\\n`, which the server normalizes.
- AI authoring: `OPENAI_API_KEY` and optionally `OPENAI_VIDEO_MODEL`. AI creates objectives, narration, scenes, and a prompt; it does not render a video.
- R2/SCORM: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, and `R2_BUCKET_NAME`. Do not enable production SCORM extraction until the malware-scanning gate above is closed.
- Credential integration: set Credly credentials only if the organization has approved and configured that integration.

After saving variables, trigger a new Vercel deployment so server functions receive them. Verify the deployment does not expose secret values in logs or build output.

## 4. Bootstrap the First Production Owner

1. **Do not run `npx prisma db seed` in production.** The seed script creates demo users/content with a known demo password and includes deletion of a legacy demo account.
2. Before public launch, add/review a one-time bootstrap procedure that creates exactly one active platform owner with a securely hashed password, refuses to run if an active platform owner already exists, and never prints the password/token.
3. Run it once from a trusted operator environment using a unique production password stored in the approved password manager.
4. Sign in through the production HTTPS login page, confirm the platform-owner role, then revoke/delete the bootstrap credential or disable the bootstrap mechanism.
5. Create the first organization and invite its admin through the application. Do not reuse demo accounts or demo passwords.

This step is currently a **code prerequisite**; no production-safe bootstrap script is present in the repository.

## 5. Apply Database Migrations

Run migrations from a trusted CI job or operator workstation against the production Supabase direct/session URI, not from a developer seed workflow.

PowerShell pattern for a trusted workstation (replace the placeholder locally; do not save the value in the repository):

```powershell
$env:DATABASE_URL = Read-Host "Supabase direct/session migration URL"
npx prisma migrate status
npx prisma migrate deploy
npx prisma migrate status
Remove-Item Env:DATABASE_URL
```

Expected result: the final status says the database schema is up to date. Never run `prisma migrate reset` or `prisma db seed` against production. Take/verify a backup before the first production migration. Deploy application code only after additive migrations succeed.

## 6. Deploy and Verify the Web App

1. Run CI gates on the release commit:

```powershell
npm ci
npx prisma generate
npx prisma validate
npx prisma migrate status
npx tsc --noEmit --pretty false
npm run lint
npm test
npm run build
npm audit --omit=dev --audit-level=high
```

2. Promote the Vercel deployment only after all gates pass and production variables are set.
3. Verify the HTTPS home page and `/login` return successfully.
4. Sign in with the newly bootstrapped production owner. Verify the organization admin can create an organization, invite an admin, and complete the invite flow.
5. Create one test learner and manager in a non-production tenant. Verify tenant isolation, learner assignment access, manager direct-report scope, and deactivation behavior.
6. Confirm the notification job works with a test message before scheduling it.

There is no dedicated readiness endpoint yet. A successful home-page response alone does not prove database connectivity; include an authenticated workflow smoke test and database-backed page/API check in release acceptance.

## 7. Configure Scheduled Notification Jobs

The notification worker is a `POST /api/jobs/notifications` endpoint. It accepts `Authorization: Bearer <NOTIFICATION_JOBS_SECRET>` or `x-notification-jobs-secret`. It defaults to 25 jobs per run and caps `batchSize` at 50.

1. Use a scheduler that can make authenticated HTTPS `POST` requests. Vercel Cron invokes GET requests, so it cannot call this POST-only endpoint directly without a proxy/worker; use an approved external scheduler or add a reviewed Vercel-compatible trigger.
2. Set a modest schedule based on required reminder latency (for example every 5 minutes), then adjust after observing queue volume.
3. Store the job secret only in the scheduler and Vercel environment. Never put it in the URL.
4. Test a run and verify processed/sent/failed counts and email delivery.
5. Alert on repeated failures and monitor notification enqueue failures.

SCORM extraction is `POST /api/jobs/scorm-extraction`, authenticated by `x-learnhub-job-secret`. Keep it disabled until R2 is configured and a real malware scanner replaces the current pass-through scanner.

## 8. Configure Private Mux Video

1. In Mux, create API credentials for upload/asset management and a signed playback signing key.
2. Add all five Mux variables to Vercel Production and Preview separately.
3. Configure Mux webhooks to send asset events to `https://<production-domain>/api/providers/mux/webhook`. Add the webhook signing secret to Vercel.
4. Ensure `APP_BASE_URL` is the exact production origin. The upload route uses that origin for direct-upload CORS.
5. Create a new test lesson and direct upload. Verify the asset is created with `playback_policy: signed` and the webhook reports `policy: signed`.
6. Verify the app launch endpoint returns a short-lived signed playback token with `Cache-Control: private, no-store`; verify the bare playback ID cannot be played without a token.
7. Upload one test video, wait for the signed-policy ready webhook, and play it from both the web learner player and mobile client.
8. Inventory legacy Mux assets created under the former public playback policy. They remain publicly playable at Mux until replaced/reprocessed. Re-upload those assets with signed policy before using them for confidential/licensed content.
9. Rotate Mux API, webhook, and signing secrets after any exposure and verify the rotation with a test asset.

## 9. Enable AI Lesson Authoring

1. Add `OPENAI_API_KEY` to Vercel Production as a server-only secret. Set `OPENAI_VIDEO_MODEL` only if using a different compatible model.
2. Redeploy and confirm the admin lesson authoring page enables **Generate with AI**.
3. Generate a test package and review the title, audience fit, objectives, narration, scenes, and video-generation prompt for factual and policy compliance.
4. Save the lesson draft. Use the prompt with an approved video-generation tool, review its output, then upload the rendered file through Mux.
5. Do not represent generated text or storyboards as a generated video. A video-generation provider is not currently integrated.
6. Monitor provider usage and set provider-side spend limits. Remove or rotate the key if it is exposed.

## 10. Mobile SDK, Builds, and Store Release

The current `mobile/package.json` was pinned to Expo 58, but `expo install --check` reports these mismatches in the current install: SecureStore expected `~58.0.2`, Expo Video expected `~58.0.12`, React expected `19.3.0`, React Native expected `0.88.0`, React types expected `~19.3.0`, and TypeScript expected `~6.0.3`.

1. From `mobile/`, run `npx expo install --fix` and review the package/lockfile diff. Do not accept a React Native major upgrade without reviewing native compatibility and its security audit.
2. Run `npx expo-doctor`, `npm run typecheck`, and `npx expo export --platform android` plus `--platform ios`.
3. Resolve remaining Expo audit findings or document accepted development-only risks. Do not use `npm audit fix --force` blindly; it may move Expo/React Native across incompatible SDK majors.
4. Configure a production HTTPS `EXPO_PUBLIC_API_BASE_URL`. Never include secret values in Expo public variables.
5. Set unique production bundle/package identifiers, Universal Link/App Link association files, app display assets, privacy disclosures, and store metadata. The current example IDs and custom scheme are placeholders.
6. Use EAS or equivalent signed builds: authenticate the Apple Developer/App Store Connect and Google Play accounts, configure signing credentials, then create internal iOS and Android builds.
7. Test on physical devices: sign-in, refresh/revoke, tenant switching, video seek/resume, progress sync, background/foreground transitions, Wi-Fi/cellular changes, signed media expiry, and logout.
8. Use internal/TestFlight and Play internal tracks first. Roll out gradually and monitor crashes, playback failures, sync errors, auth denials, and API latency.
9. Keep push notifications, offline progress, mobile assessments/certificates, and SCORM out of the store release scope unless separately implemented and tested. Device token registration endpoints alone do not constitute APNs/FCM delivery.

Windows cannot produce an iOS simulator/device or App Store build; complete those checks on macOS with Xcode. Android native builds require a configured Android SDK or EAS build workers.

## 11. Monitoring, Backups, and Rollback

1. Configure alerts for HTTP 5xx, login throttling, revoked-session failures, PostgreSQL connection saturation, email delivery failures, Mux webhook failures, and signed playback errors.
2. Track database backup completion and perform a restore test to a separate Supabase project.
3. Keep a tested Vercel rollback deployment available. For database changes, use expand/contract migrations; application rollback does not undo a database migration.
4. Assign an incident owner and define how to disable AI authoring, Mux uploads, scheduled jobs, or mobile rollout independently.
5. Record the deployment ID, migration state, configuration version, and smoke-test outcome for each release without recording secrets.

## Go/No-Go Gate

Do not announce public production launch until all applicable checks pass:

- Production secrets and HTTPS are set; no demo seed data/passwords are present.
- A secure initial platform owner exists and can sign in.
- Production migrations are applied and backups/restores are verified.
- Email delivery and the authenticated job scheduler are tested.
- Mux assets are signed and legacy public assets are remediated, if video is in launch scope.
- SCORM uploads remain disabled until real malware scanning is in place.
- `npm audit --omit=dev --audit-level=high`, type-check, lint, tests, and build pass on the release commit.
- Mobile release, if included, passes Expo compatibility checks, signed builds, store review requirements, and physical-device acceptance.
