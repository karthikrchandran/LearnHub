# Production Media Storage SCORM Operations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add production-shaped Mux, Cloudflare R2, tenant storage-key, SCORM manifest validation, extraction, malware scan, and launch-readiness operations without changing LearnHub's tenant-scoped runtime contract.

**Architecture:** Keep provider integrations behind small modules with injected `fetch`, clock, and crypto helpers so tests do not call Mux or R2. Extend existing media models with explicit provider, malware, and extraction state; runtime services block learner playback/launch until state is ready. Route handlers stay thin and call provider/domain modules.

**Tech Stack:** Next.js App Router, TypeScript, Prisma 7, PostgreSQL, Vitest, Node `crypto`, Node `zlib`, Mux Video API, Cloudflare R2 S3-compatible signed URLs.

---

## File Responsibilities

- `prisma/schema.prisma`: Add `VideoAssetStatus`, `ScormExtractionStatus`, `MalwareScanStatus`, Mux state on `VideoLesson`, and package operation state on `ScormPackage`.
- `prisma/migrations/20260613050000_media_storage_operations/migration.sql`: Apply only this lane's schema changes.
- `src/modules/providers/video/mux-video-provider.ts`: Mux direct upload creation, playback source lookup, webhook signature verification, and webhook event mapping.
- `src/modules/providers/storage/r2-object-storage-provider.ts`: R2 presigned read/write/delete URLs and explicit object writes/deletes.
- `src/modules/storage/storage-keys.ts`: Tenant-scoped object-key builders for logos, transcripts, certificates, SCORM zips, extracted SCORM files, and CSV exports.
- `src/modules/scorm/scorm-manifest.ts`: SCORM upload metadata validation and `imsmanifest.xml` launch parsing.
- `src/modules/scorm/scorm-extraction.ts`: ZIP parsing, traversal rejection, pass-through malware scanner contract, and extracted object writes under `contentRootKey`.
- `src/modules/scorm/scorm-package-jobs.ts`: Extraction job orchestration and status transitions.
- `src/app/api/providers/mux/webhook/route.ts`: Verify Mux webhook signatures before updating lesson provider state.
- `src/app/api/jobs/scorm-extraction/route.ts`: Run bounded extraction jobs.
- `src/app/api/org/[slug]/storage/upload/route.ts`: Admin-scoped signed upload URL route.
- `src/app/org/[slug]/admin/courses/[courseSlug]/content/page.tsx`: Show video provider readiness.
- `src/app/org/[slug]/admin/courses/[courseSlug]/scorm/page.tsx`: Show extraction and malware status.

## Schema Contract

Add:

```prisma
enum VideoAssetStatus {
  UPLOAD_CREATED
  PROCESSING
  READY
  FAILED
}

enum ScormExtractionStatus {
  PENDING
  PROCESSING
  READY
  FAILED
}

enum MalwareScanStatus {
  PENDING
  PASSED
  FAILED
}
```

Add to `VideoLesson`:

```prisma
providerUploadId String?
providerPlaybackId String?
providerStatus VideoAssetStatus @default(READY)
providerError String?
```

Add to `ScormPackage`:

```prisma
extractionStatus ScormExtractionStatus @default(PENDING)
extractionError String?
malwareScanStatus MalwareScanStatus @default(PENDING)
malwareScanError String?
```

The migration should backfill existing SCORM rows to `READY`/`PASSED`, then keep schema defaults as `PENDING` for new package uploads.

## TDD Execution Tasks

### Task 1: Storage Keys

**Files:**
- Create: `src/modules/storage/storage-keys.test.ts`
- Create: `src/modules/storage/storage-keys.ts`

- [ ] Write RED tests for `organizationLogoKey`, `videoTranscriptKey`, `certificateArtifactKey`, `scormZipKey`, `scormExtractedFileKey`, `csvExportKey`, and `assertTenantScopedKey`.
- [ ] Run `npm run test -- src/modules/storage/storage-keys.test.ts`; expected FAIL because the module is missing.
- [ ] Implement segment/path validation and key builders. Reject empty segments, `.`/`..`, slashes inside segments, backslashes, absolute paths, NUL, and unscoped keys.
- [ ] Run the same command; expected PASS.

### Task 2: R2 Provider

**Files:**
- Create: `src/modules/providers/storage/r2-object-storage-provider.test.ts`
- Create: `src/modules/providers/storage/r2-object-storage-provider.ts`
- Modify: `src/modules/providers/storage/object-storage-provider.ts`

- [ ] Write RED tests for signed read/write URLs, `putObject` using injected fetch, and explicit tenant-scoped `deleteObject`.
- [ ] Run `npm run test -- src/modules/providers/storage/r2-object-storage-provider.test.ts`; expected FAIL because the module is missing.
- [ ] Add `getSignedWriteUrl` to the storage interface and implement R2 SigV4 presigning with region `auto`, service `s3`, path-style bucket URLs, and `UNSIGNED-PAYLOAD`.
- [ ] Run the same command; expected PASS.

### Task 3: Mux Provider And Webhook Route

**Files:**
- Create: `src/modules/providers/video/mux-video-provider.test.ts`
- Create: `src/modules/providers/video/mux-video-provider.ts`
- Modify: `src/modules/providers/video/video-provider.ts`
- Create: `src/app/api/providers/mux/webhook/route.ts`

- [ ] Write RED tests for direct upload metadata, playback readiness, HMAC signature verification, and normalized asset-ready/asset-failed webhook events.
- [ ] Run `npm run test -- src/modules/providers/video/mux-video-provider.test.ts`; expected FAIL because the module is missing.
- [ ] Implement Basic Auth API calls, `new_asset_settings.passthrough` metadata, playback source normalization, signature verification over `t.rawBody`, and route-safe event mapping.
- [ ] Implement route raw-body verification before JSON parsing, then Prisma `updateMany` by `providerUploadId` or `providerAssetId`.
- [ ] Run the same command; expected PASS.

### Task 4: Runtime Readiness Gates And Migration

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260613050000_media_storage_operations/migration.sql`
- Modify: `src/modules/video/video-runtime.ts`
- Modify: `src/modules/video/prisma-repository.ts`
- Modify: `src/modules/video/video-runtime.test.ts`
- Modify: `src/modules/scorm/scorm-runtime.ts`
- Modify: `src/modules/scorm/prisma-repository.ts`
- Modify: `src/modules/scorm/scorm-runtime.test.ts`

- [ ] Write RED tests that video launch rejects `providerStatus !== READY` when playback is provider-backed, and SCORM launch rejects extraction not `READY` or malware not `PASSED`.
- [ ] Run `npm run test -- src/modules/video/video-runtime.test.ts src/modules/scorm/scorm-runtime.test.ts`; expected FAIL.
- [ ] Add schema fields/migration, update Prisma selects, update runtime types, and add readiness checks.
- [ ] Run the same command; expected PASS.

### Task 5: SCORM Manifest Validation

**Files:**
- Create: `src/modules/scorm/scorm-manifest.test.ts`
- Create: `src/modules/scorm/scorm-manifest.ts`
- Modify: `src/modules/scorm/scorm-package-service.test.ts`
- Modify: `src/modules/scorm/scorm-package-service.ts`

- [ ] Write RED tests for `.zip` file name, zip content type, size limit, `imsmanifest.xml` presence, launch path parsing, launch file presence, and traversal rejection.
- [ ] Run `npm run test -- src/modules/scorm/scorm-manifest.test.ts src/modules/scorm/scorm-package-service.test.ts`; expected FAIL.
- [ ] Move metadata validation into manifest helpers, keep existing server-action metadata flow compatible, and set new package operation statuses to `PENDING`.
- [ ] Run the same command; expected PASS.

### Task 6: SCORM Extraction And Malware Scan

**Files:**
- Create: `src/modules/scorm/scorm-extraction.test.ts`
- Create: `src/modules/scorm/scorm-extraction.ts`

- [ ] Write RED tests with a local ZIP builder: successful extraction under `contentRootKey`, traversal rejection before writes, and malware failed status with no writes.
- [ ] Run `npm run test -- src/modules/scorm/scorm-extraction.test.ts`; expected FAIL.
- [ ] Implement ZIP local-header parsing for stored and deflated entries, manifest validation, scanner contract, content-type inference, and object writes through injected writer.
- [ ] Run the same command; expected PASS.

### Task 7: SCORM Package Jobs

**Files:**
- Create: `src/modules/scorm/scorm-package-jobs.test.ts`
- Create: `src/modules/scorm/scorm-package-jobs.ts`
- Create: `src/app/api/jobs/scorm-extraction/route.ts`
- Modify: `src/modules/scorm/prisma-repository.ts`

- [ ] Write RED tests for pending package claim, processing transition, malware pass/fail persistence, ready transition, failed transition, and no-work skip.
- [ ] Run `npm run test -- src/modules/scorm/scorm-package-jobs.test.ts`; expected FAIL.
- [ ] Implement job orchestration with repository/storage/scanner injection and a bounded route that reports processed/skipped/failed counts.
- [ ] Run the same command; expected PASS.

### Task 8: Signed Upload Route And Admin Status

**Files:**
- Create: `src/app/api/org/[slug]/storage/upload/route.ts`
- Modify: `src/app/org/[slug]/admin/courses/[courseSlug]/content/page.tsx`
- Modify: `src/app/org/[slug]/admin/courses/[courseSlug]/scorm/page.tsx`
- Modify: `src/modules/video/page-shells.test.ts`
- Modify: `src/modules/scorm/page-shells.test.ts`

- [ ] Write RED shell assertions for `Provider status`, `Extraction status`, and `Malware scan`.
- [ ] Run `npm run test -- src/modules/video/page-shells.test.ts src/modules/scorm/page-shells.test.ts`; expected FAIL.
- [ ] Implement upload route authorization, storage key purpose mapping, R2 signed write URL response, and admin page status rendering.
- [ ] Run the same command; expected PASS.

### Task 9: Final Verification And Commit

- [ ] Run focused verification:

```powershell
npm run test -- src/modules/providers/video/mux-video-provider.test.ts src/modules/providers/storage/r2-object-storage-provider.test.ts src/modules/storage/storage-keys.test.ts src/modules/scorm/scorm-manifest.test.ts src/modules/scorm/scorm-extraction.test.ts src/modules/scorm/scorm-package-jobs.test.ts src/modules/scorm/scorm-package-service.test.ts src/modules/scorm/scorm-runtime.test.ts
```

- [ ] Run:

```powershell
npm run lint
npx prisma validate
npm run prisma:generate
npx tsc --noEmit --incremental false
npm run build
git diff --check
```

- [ ] Commit with:

```powershell
git add prisma/schema.prisma prisma/migrations/20260613050000_media_storage_operations/migration.sql src docs/superpowers/plans/2026-06-13-production-media-storage-scorm-operations-implementation.md
git commit -m "feat: add production media storage scorm operations"
git rev-parse HEAD
```

Do not push. Do not merge.

## Self-Review

Spec coverage:

- Mux direct uploads, Mux signature verification, asset readiness, R2 signed URLs, tenant-scoped keys, SCORM ZIP/manifest/launch validation, extraction under `contentRootKey`, extraction status visibility, learner launch blocking, traversal rejection, malware scan statuses, and explicit delete operations are covered.

Placeholder scan:

- No deferred implementation placeholders remain. Each task has concrete files, expected red/green commands, and behavior.

Type consistency:

- The status enums and field names are consistent across schema, runtime checks, jobs, and admin pages.

---

## Spec Compliance Correction Plan

**Goal:** Close the post-review gaps without changing the Task 5 lane boundary or touching other workers' worktrees.

**Architecture:** Keep production integrations behind the existing provider and route boundaries. Add route-level validation tests first, then implement the smallest changes to make upload, launch, webhook, and job execution paths fail closed and stay tenant-scoped.

**Tech Stack:** Next.js route handlers, Prisma, Vitest, Mux direct uploads/webhooks, Cloudflare R2 signed URLs, SCORM 1.2 package metadata.

### Correction Task 1: SCORM Runtime Content Reads Through Storage

**Files:**
- Modify: `src/modules/scorm/content-route.test.ts`
- Modify: `src/app/scorm/[...path]/route.ts`

- [x] Write RED tests in `src/modules/scorm/content-route.test.ts` that mock the R2 provider, request `/scorm/org_org_1/scorm/pkg_1/content/index.html`, and expect a redirect to the signed read URL while preserving the original launch path.
- [x] Run `npm run test -- src/modules/scorm/content-route.test.ts`; expected FAIL because the route only checks `.learnhub/scorm`.
- [x] Implement storage-provider resolution before local fallback when R2 env is configured.
- [x] Run `npm run test -- src/modules/scorm/content-route.test.ts`; expected PASS.

### Correction Task 2: SCORM Signed Upload Key Consistency

**Files:**
- Modify: `src/modules/scorm/scorm-package-service.test.ts`
- Modify: `src/modules/scorm/server-actions.test.ts`
- Modify: `src/modules/scorm/scorm-package-service.ts`
- Modify: `src/modules/scorm/server-actions.ts`
- Modify: `src/app/org/[slug]/admin/courses/[courseSlug]/scorm/page.tsx`

- [x] Write RED tests that create packages with a caller-supplied `storageKey` equal to `scormZipKey({ organizationId, courseId, packageId, fileName })` and assert the stored key includes `/source/`.
- [x] Add RED tests for mismatched `storageKey` rejection and action-form metadata forwarding.
- [x] Run `npm run test -- src/modules/scorm/scorm-package-service.test.ts src/modules/scorm/server-actions.test.ts`; expected FAIL on missing `storageKey` support.
- [x] Implement `storageKey` input validation against the tenant-scoped `scorm_zip` key and wire the admin action field.
- [x] Run the same command; expected PASS.

### Correction Task 3: Mux Upload Route And Tenant-Scoped Webhook Updates

**Files:**
- Create: `src/app/api/org/[slug]/courses/[courseSlug]/video/lessons/[lessonId]/mux-upload/route.ts`
- Create: `src/modules/providers/video/mux-upload-route.test.ts`
- Create: `src/modules/providers/video/mux-webhook-route.test.ts`
- Modify: `src/modules/providers/video/video-provider.ts`
- Modify: `src/modules/providers/video/mux-video-provider.ts`
- Modify: `src/app/api/providers/mux/webhook/route.ts`
- Modify: `src/app/org/[slug]/admin/courses/[courseSlug]/content/page.tsx`

- [x] Write RED route tests that mock org admin authorization, Prisma, and `createMuxVideoProvider().createUpload()`, then assert the lesson is set to `PROCESSING` with `providerUploadId`.
- [x] Write RED webhook tests asserting updates include `organizationId`, `courseId`, and `lessonId` from Mux passthrough and do not update cross-org lessons with the same provider ID.
- [x] Run `npm run test -- src/modules/providers/video/mux-upload-route.test.ts src/modules/providers/video/mux-webhook-route.test.ts`; expected FAIL because the upload route does not exist and webhook updates by provider ID only.
- [x] Implement the authorized Mux upload route, include `lessonId` in passthrough metadata, and require tenant/course/lesson context in webhook updates.
- [x] Run the same command; expected PASS.

### Correction Task 4: Storage Upload Route Child Resource Validation

**Files:**
- Create: `src/modules/storage/storage-upload-route.test.ts`
- Modify: `src/app/api/org/[slug]/storage/upload/route.ts`

- [x] Write RED tests for `scorm_zip` course validation, `video_transcript` lesson validation, certificate ownership validation, and provider non-invocation when validation fails.
- [x] Run `npm run test -- src/modules/storage/storage-upload-route.test.ts`; expected FAIL because the route currently mints URLs without child-resource checks.
- [x] Implement purpose-specific Prisma checks before storage key creation and signed URL minting.
- [x] Run `npm run test -- src/modules/storage/storage-upload-route.test.ts`; expected PASS.

### Correction Task 5: SCORM Job Secret Fails Closed

**Files:**
- Create: `src/modules/scorm/scorm-extraction-route.test.ts`
- Modify: `src/app/api/jobs/scorm-extraction/route.ts`

- [x] Write RED route tests where `SCORM_EXTRACTION_JOB_SECRET` is absent or mismatched and assert HTTP 403 with no package processing.
- [x] Run `npm run test -- src/modules/scorm/scorm-extraction-route.test.ts`; expected FAIL because an absent secret currently allows execution.
- [x] Require a configured secret and matching `x-learnhub-job-secret` header before importing runtime dependencies.
- [x] Run `npm run test -- src/modules/scorm/scorm-extraction-route.test.ts`; expected PASS.

### Correction Task 6: Verification And Fix Commit

- [x] Run focused Task 5 tests:

```powershell
npm run test -- src/modules/providers/video/mux-video-provider.test.ts src/modules/providers/storage/r2-object-storage-provider.test.ts src/modules/storage/storage-keys.test.ts src/modules/scorm/scorm-manifest.test.ts src/modules/scorm/scorm-extraction.test.ts src/modules/scorm/scorm-package-jobs.test.ts src/modules/scorm/scorm-package-service.test.ts src/modules/scorm/scorm-runtime.test.ts src/modules/scorm/content-route.test.ts src/modules/scorm/server-actions.test.ts src/modules/providers/video/mux-upload-route.test.ts src/modules/providers/video/mux-webhook-route.test.ts src/modules/storage/storage-upload-route.test.ts src/modules/scorm/scorm-extraction-route.test.ts
```

- [x] Run final gates:

```powershell
npm run lint
npx prisma validate
npm run prisma:generate
npx tsc --noEmit --incremental false
npm run build
git diff --check
```

- [x] Commit the fix:

```powershell
git add docs/superpowers/plans/2026-06-13-production-media-storage-scorm-operations-implementation.md src
git commit -m "fix: close task 5 media storage compliance gaps"
git rev-parse HEAD
```

Do not push. Do not merge.

## Correction Self-Review

Spec coverage:

- The correction tasks map directly to the six review gaps: SCORM runtime storage reads, SCORM signed-upload key consistency, Mux upload integration, tenant-scoped Mux webhook updates, storage upload child-resource validation, and fail-closed extraction job authorization.

Placeholder scan:

- No correction task uses deferred placeholders. Each task lists concrete files, failing-test commands, implementation behavior, and verification commands.

Type consistency:

- The correction tasks reuse the existing Task 5 models and provider contracts, adding only `lessonId` passthrough metadata and optional SCORM `storageKey` input where needed.
