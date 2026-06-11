# Completed Slices Standards Audit

Date: 2026-06-11
Branch: `feature/standards-audit`
Baseline: `1d6989b merge: scorm 1.2 runtime`

## Scope

This audit reviews completed LearnHub MVP slices against the agreed Superpowers + role workflow standard:

- Foundation
- Users/Auth/Tenant Admin
- Course Catalog/Assignments
- Progress/Certificates
- Native Video Runtime
- SCORM 1.2 Runtime

The current dirty `main` auth/login redirect work is intentionally excluded from this audit worktree because `feature/standards-audit` was created from committed `main`. It should be reviewed as its own slice before merge.

## Verification Evidence

Commands run in `.worktrees/standards-audit`:

| Gate | Result | Notes |
| --- | --- | --- |
| `npm run test` | Pass | 43 test files, 208 tests |
| `npm run lint` | Pass | ESLint clean |
| `npx prisma validate` | Pass | Schema valid |
| `npm run prisma:generate; npx tsc --noEmit --incremental false` | Pass | Required local `npm install` first |
| `npm run build` | Pass | Required local `npm install` first |

Environmental notes:

- Running Prisma generation in parallel can trigger Windows `EBUSY` file locks against generated Prisma files.
- Worktrees need local `node_modules` for Turbopack/Next build resolution. Without local install, Next can fail resolving `next/package.json` from `src/app`.
- `npm install` adds only `package-lock.json` metadata `hasInstallScript`; this audit removes that noise.

## Executive Summary

The committed code is a strong MVP foundation: tenant-scoped schema design is consistent, service logic is covered by focused tests, and the full build/test gate passes. The main standards gaps are not broad rewrites; they are targeted hardening items before wiring real UI actions:

1. Runtime progress commits should become atomic across content-runtime state and learning progress events.
2. Learner runtime route/data access needs assignment ownership checks before live launch endpoints are added.
3. SCORM package launch semantics need an extracted content-root model, not a URL composed from the uploaded zip key.
4. SCORM session-time accumulation needs safer rules to avoid double-counting repeated commits.
5. Documentation should explicitly distinguish built contracts from intentionally deferred live UI/storage/player behavior.

## Rishi Architecture Audit

### What Meets The Standard

- Modular monolith boundaries are clear: `src/modules/auth`, `catalog`, `assignments`, `progress`, `certificates`, `video`, and `scorm`.
- Tenant scoping is consistently modeled with `organizationId` and composite unique keys.
- Native video uses course/module/lesson/chapter/transcript/progress entities that can support both one-video-with-chapters and multi-lesson courses.
- SCORM 1.2 is scoped as a course-level package with one registration per assignment, which matches the MVP decision.
- Provider boundaries exist for email, object storage, video, and credential issuance.

### Architecture Findings

**A1. Important: Runtime progress state and learning-event updates are not atomic.**

- Native video writes `VideoLessonProgress` before calling `recordLearningEvent`: `src/modules/video/video-runtime.ts:166` and `src/modules/video/video-runtime.ts:180`.
- SCORM writes `ScormRegistration` before calling `recordLearningEvent`: `src/modules/scorm/scorm-runtime.ts:139` and `src/modules/scorm/scorm-runtime.ts:150`.
- If the second write fails, assignment progress can drift from runtime state. This matters because reports, certificates, and manager progress views depend on assignment progress.
- Recommendation: create orchestration repositories that write runtime state and learning event/progress update in the same Prisma transaction, or move both operations behind one unit-of-work interface.

**A2. Important: Learner runtime shells only prove organization membership, not assignment ownership.**

- The current page shells use org-level membership guards, which is acceptable for non-wired placeholders.
- Before real launch/playback/commit endpoints exist, data access must require assignment ownership, direct-report manager visibility, admin membership, or platform owner access.
- Recommendation: add reusable runtime authorization helpers before adding live learner launch APIs.

**A3. Important: SCORM launch URL is not yet a real content launch contract.**

- `uploadScormPackage` stores a zip object key: `src/modules/scorm/scorm-package-service.ts:73`.
- `launchScormRegistration` builds `/scorm/{storageKey}/{launchPath}`: `src/modules/scorm/scorm-runtime.ts:199`.
- That produces a path under the uploaded zip object rather than an extracted content root. This is fine for metadata MVP but cannot become the live player contract.
- Recommendation: add `contentRootKey` or `extractedRootUrl` to `ScormPackage` before implementing ZIP extraction/serving.

**A4. Medium: SCORM package model has `active` but enforces one package per course.**

- `ScormPackage.active` exists, but `@@unique([organizationId, courseId])` prevents historical versions: `prisma/schema.prisma:402`.
- This matches the MVP "one active package per course" decision, but the `active` field can mislead future work into assuming version history exists.
- Recommendation: document it as MVP metadata only, or remove `active` until versioning is introduced.

## Niti QA Audit

### Coverage Strengths

- Auth has token, invitation, reset, credentials, permissions, and guard tests.
- CSV import has strong parsing and row-level validation coverage.
- Catalog/assignment has lifecycle, permission, related-course, assignment, and page-shell tests.
- Progress/certificates cover SCORM capping, completion, idempotent certificate issuance, and credential-provider failure tolerance.
- Native video has parser, validation, content service, runtime, transcript search, Prisma adapter, and page-shell tests.
- SCORM has time, progress, package service, runtime, Prisma adapter, and page-shell tests.

### QA Gaps To Add

**Q1. Add transaction-failure regression tests for runtime progress drift.**

- Native video: simulate `recordLearningEvent` throwing after `upsertLessonProgress`.
- SCORM: simulate `recordLearningEvent` throwing after `saveRuntimeCommit`.
- Expected future behavior: no partial persisted progress or clear retry/idempotency strategy.

**Q2. Add runtime authorization acceptance tests before live endpoints.**

Acceptance criteria:

- Learner can launch only their own assignment.
- Manager can view direct-report progress but cannot launch as the learner.
- Admin can inspect org assignments.
- Cross-organization assignment IDs are rejected.

**Q3. Add SCORM commit boundary tests.**

Missing cases:

- malformed `cmi.core.session_time` returns a controlled validation error.
- repeated commits do not double-count session time unless a new launch/session boundary exists.
- disallowed CMI keys are ignored and verified with negative assertions.
- `failed` with score follows the selected product rule.

**Q4. Add route-level tests when actions become live.**

The current page-shell tests are appropriate placeholders. Once actions are wired, add server action or route handler tests for:

- admin video content mutation authorization.
- SCORM package upload authorization.
- learner video progress commit ownership.
- learner SCORM commit ownership.

## Arjun Senior Review

### What Meets The Standard

- Service contracts are small and testable.
- Error messages are explicit and already tested in many places.
- Prisma adapter tests assert query shape for tenant scoping.
- Migrations add important DB checks for video timing and SCORM score/time ranges.
- The code avoids introducing new frameworks or premature abstractions.

### Code Quality Findings

**C1. Important: Runtime state writes and learning progress writes are split across services.**

This is the same risk as A1, but from implementation quality: the API shape makes partial updates easy. The next hardening pass should redesign the persistence boundary before adding real UI calls.

**C2. Medium: SCORM launch storage fields are ambiguous.**

`storageKey` currently means "uploaded zip object", while launch needs "servable extracted content root". This should be split before storage integration.

**C3. Medium: Prisma model formatting has minor alignment drift.**

Example: `User.uploadedScormPackages` is not aligned with surrounding fields. This is not behavioral, but `npx prisma format` should be considered once the team accepts Prisma formatting churn.

**C4. Medium: Audit logs lack metadata on several new actions.**

Actions such as `scorm.package_uploaded`, `video.lesson_created`, and `course.lifecycle_updated` record target and actor but not useful metadata such as course id, package id, lesson slug, or status transition.

**C5. Low: Page-shell tests assert text presence rather than behavior.**

Appropriate for placeholder shells, but not sufficient once controls are enabled.

## Kavya Documentation Audit

### Documentation Strengths

- Durable specs and implementation plans exist under `docs/superpowers/specs` and `docs/superpowers/plans`.
- Native video and SCORM scope boundaries are documented.
- The implementation follows the documented service/repository architecture closely.

### Documentation Gaps

**D1. Add an implementation note for "what is live vs placeholder".**

The repo now contains real domain services and placeholder page shells. Future contributors need one short map that says:

- live: schemas, migrations, services, tests, progress contracts.
- placeholder: video browser player, SCORM JS API bridge, upload UI, storage/extraction, report dashboards.

**D2. Add ADR for media/storage runtime boundary.**

Before wiring R2/Mux/local demo storage, capture:

- video storage/transcoding path.
- SCORM zip upload/extraction/content serving path.
- local/demo fallback.
- security concerns around serving SCORM content.

**D3. Add ADR for progress consistency model.**

Decide whether LearnHub treats learning events as source of truth or runtime tables as source of truth, and define transaction/idempotency expectations.

## Completed Slice Status

| Slice | Status | Standard Assessment | Next Action |
| --- | --- | --- | --- |
| Foundation | Pass | Good enough for MVP | Add README/dev guide later |
| Users/Auth/Tenant Admin | Pass with pending dirty-main work | Strong domain coverage | Audit current redirect/login changes separately |
| Course Catalog/Assignments | Pass | Good service/test shape | Wire real admin actions later |
| Progress/Certificates | Pass with hardening | Progress boundary works | Define atomicity/idempotency model |
| Native Video Runtime | Pass with hardening | Strong service foundation | Fix atomicity and route ownership before live player |
| SCORM 1.2 Runtime | Pass with hardening | Good contract MVP | Split package storage root and harden time/session handling |

## Recommended Hardening Order

1. Progress consistency ADR and runtime transaction redesign.
2. Runtime authorization helpers and tests.
3. SCORM package content-root model.
4. SCORM session-time/idempotency rules.
5. Documentation note for live vs placeholder capabilities.
6. Audit current dirty auth/login redirect work from `main`.

