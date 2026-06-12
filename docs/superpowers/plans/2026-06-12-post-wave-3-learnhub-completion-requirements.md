# Post Wave 3 LearnHub Completion Requirements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Capture every LearnHub MVP requirement that remains after Wave 3 so the product can move from live learning workflow to complete commercial LMS readiness.

**Architecture:** Keep the current production-shaped modular monolith. Wave 3 closes media authoring and learner player shells; the remaining work must be split into independent product subsystems with explicit data models, provider adapters, background jobs, pages, tests, and deployment artifacts. Each subsystem below needs its own detailed implementation plan before code changes begin.

**Tech Stack:** Next.js App Router, React client components where browser interaction is required, TypeScript, Prisma 7, PostgreSQL/Neon, Vitest, NextAuth, Vercel, Cloudflare R2, Mux, Upstash, SMTP/API transactional email, Credly-compatible credential provider.

---

## Scope Boundary

This plan is for work remaining besides Wave 3. Wave 3 is already scoped in `docs/superpowers/specs/2026-06-12-wave-3-media-player-polish-design.md` and covers:

- Admin native video lesson, chapter, and transcript authoring forms.
- Admin SCORM package metadata form.
- Learner native video player client.
- Learner SCORM iframe player and SCORM 1.2 API bridge.
- Local constrained SCORM content serving.
- Live capability documentation cleanup.

This plan does not include the explicit MVP non-goals:

- Billing and subscriptions.
- Custom domains or subdomains.
- SSO or directory sync.
- Public self-signup.
- Social login.
- SCORM 2004.
- cmi5.
- Full xAPI package support.
- Course version history and approval workflows.
- Full theme builder.
- Holiday or tenant-specific business calendars.
- PDF report export.
- Advanced AI recommendations.

## Current Baseline

Implemented before this plan:

- Tenant auth, organization routing, invited/imported users, reset and invitation flows.
- Platform organization creation.
- CSV user import.
- Course catalog, category/tag, lifecycle, assignment, self-enrollment, and related-course service foundations.
- Live catalog and assignment server actions.
- Native video metadata, chapters, transcript parsing/search, runtime services, and Wave 2 endpoints.
- SCORM 1.2 package metadata, runtime registration/commit services, and Wave 2 endpoints.
- Normalized progress, assignment progress, certificates, basic certificate verification, progress reports, and progress CSV export.
- Provider interfaces for video, object storage, email, and credentials.
- Audit log write helper and audit records from selected services.

Remaining after Wave 3:

- Commercial tenant operations beyond initial organization creation.
- Real organization settings and branding management.
- User lifecycle management beyond CSV import.
- Global course library and copy-to-tenant workflow.
- Knowledge checks, scoring, attempts, quiz analytics, and learner feedback.
- Notification job scheduling, reminders, escalations, and retry inspection.
- Production Mux, R2, SMTP/API email, and Credly adapters.
- SCORM ZIP extraction, manifest validation hardening, and package-serving operations.
- Certificate download/print/share and credential retry/inspection.
- Complete report family beyond the current progress CSV foundation.
- Platform aggregate dashboard.
- Audit log browser and filtering.
- Deployment, infrastructure, security, runbooks, end-to-end smoke tests, and release documentation.

## Requirement Inventory

| Area | Current state | Wave 3 covers | Remaining requirement |
| --- | --- | --- | --- |
| Platform owner dashboard | `/platform` is a guarded shell with static counts. | No. | Replace static cards with aggregate organizations, active users, completions, overdue counts, provider failures, and audit summaries. |
| Organization management | Platform owner can create an organization. | No. | Add edit organization settings: name, slug-safe display, allowed domains, enrollment policy, global library access, logo URL/upload, primary color, accent color, and active/inactive access. |
| Organization workspace | `/org/[slug]` is a guarded shell with static cards. | No. | Render live assigned, in-progress, overdue, certificate, and role-aware action cards; apply organization branding. |
| User management | CSV import exists. | No. | Add user search, filters, status changes, role changes, manager reassignment, invite resend, reset link issue, deactivate/reactivate, and import history. |
| Global library | `globalLibraryEnabled` exists on organizations. | No. | Add platform-owned global courses, copy-to-tenant workflow, copied taxonomy rules, and tenant customization after copy. |
| Course detail lifecycle | Course detail page still has disabled lifecycle controls. | No. | Wire lifecycle actions and show safe warnings for deprecated/retired courses with assignment and launch effects. |
| Knowledge checks | Not modeled. | No. | Add embedded video knowledge checks, questions, answers, feedback, unlimited retries, attempt history, scoring, completion gating, and quiz difficulty reporting. |
| Learner ratings and feedback | Not modeled. | No. | Add course ratings, text feedback, satisfaction report, and moderation/visibility rules. |
| Notifications | Invite/reset email exists through auth flows; no job table. | No. | Add assignment, completion/certificate, due-soon reminder, overdue reminder, and manager escalation jobs with idempotency and retry status. |
| Email providers | Console email exists; SMTP/API providers throw unconfigured errors. | No. | Add SMTP and API provider implementations with production config validation, redaction, retries, and provider message tracking. |
| Video provider | Interface exists. | Admin/player forms use existing metadata. | Add Mux direct upload creation, playback source resolution, webhooks, processing state, and protected playback readiness checks. |
| Object storage | Interface exists. | Local SCORM serving only. | Add Cloudflare R2 adapter, signed read/write URLs, tenant-scoped keys, logo/transcript/certificate/SCORM storage, and deletion rules. |
| SCORM package operations | Metadata/runtime services exist. | Local file serving boundary. | Add ZIP upload, manifest parsing, launch file validation, extraction worker, content root publication, malware scan integration contract, and extraction retry/error states. |
| Certificates | Certificate issue service and public verification page exist. | No. | Add branded printable certificate, download route, share links, learner certificate wallet, admin certificate report, and certificate email. |
| Credentials | Credly-compatible interface and issuance records exist. | No. | Add Credly adapter, template mapping per course, admin retry, failure inspection, and credential status report. |
| Reports | Progress report and CSV foundation exists. | No. | Add course completion, scoring, timing, popularity, satisfaction, quiz difficulty, certificate/credential, and platform aggregate reports. |
| Audit logs | Write helper and audit model exist. | No. | Add tenant and platform audit browsers with filters by actor, action, target, date, and export. |
| Provider failures | Some services record failure tolerance. | No. | Add operational views for email, credential, SCORM extraction, Mux, and storage failures. |
| Deployment | Basic app scripts exist. | No. | Add environment templates, Vercel/Neon/R2/Mux/Upstash setup docs, protected cron routes, release checklist, smoke tests, and rollback runbook. |
| End-to-end tests | Unit and build gates exist. | No. | Add smoke tests for platform provision, org admin import, course creation, assignment, video completion, SCORM completion, manager report, and CSV export. |

## Required Sub-Project Plans

The remaining scope spans multiple independent subsystems. Do not implement this whole document as one branch. Create one dedicated implementation plan per sub-project below.

### Task 1: Tenant Operations, Branding, And User Lifecycle

**Files:**
- Create plan: `docs/superpowers/plans/2026-06-13-tenant-operations-branding-user-lifecycle-implementation.md`
- Modify: `prisma/schema.prisma`
- Create migration: `prisma/migrations/20260613010000_tenant_operations_user_lifecycle/migration.sql`
- Modify: `src/modules/organizations/provisioning.ts`
- Create: `src/modules/organizations/settings.ts`
- Create: `src/modules/organizations/settings.test.ts`
- Create: `src/modules/organizations/dashboard.ts`
- Create: `src/modules/organizations/dashboard.test.ts`
- Create: `src/modules/users/lifecycle.ts`
- Create: `src/modules/users/lifecycle.test.ts`
- Create: `src/modules/users/user-search.ts`
- Create: `src/modules/users/user-search.test.ts`
- Modify: `src/app/platform/page.tsx`
- Create: `src/app/platform/organizations/[slug]/page.tsx`
- Create: `src/app/platform/organizations/[slug]/actions.ts`
- Modify: `src/app/org/[slug]/page.tsx`
- Create: `src/app/org/[slug]/admin/settings/page.tsx`
- Create: `src/app/org/[slug]/admin/settings/actions.ts`
- Modify: `src/app/org/[slug]/admin/users/page.tsx`
- Modify: `src/app/org/[slug]/admin/users/actions.ts`

**Requirements:**
- Platform owner can edit organization settings after creation.
- Organization admin can edit branding only when the platform policy allows it.
- Organization workspace uses name, primary color, accent color, and logo when present.
- Platform dashboard cards use live counts instead of static zeroes.
- Organization dashboard cards use live assignment, progress, overdue, and certificate counts.
- Admin user page supports search, role filter, status filter, manager filter, and department filter.
- Admin can change roles, manager, department, title, employee id, and status.
- Admin can resend invitation and issue password reset for active or invited users.
- Deactivation blocks login and launch while preserving historical progress and certificates.
- Every write records audit metadata that includes previous and next values for changed settings.

**Verification commands:**

```powershell
npm run test -- src/modules/organizations/settings.test.ts src/modules/organizations/dashboard.test.ts src/modules/users/lifecycle.test.ts src/modules/users/user-search.test.ts
npm run lint
npx prisma validate
npm run prisma:generate
npx tsc --noEmit --incremental false
npm run build
```

### Task 2: Global Course Library And Tenant Copy Workflow

**Files:**
- Create plan: `docs/superpowers/plans/2026-06-13-global-library-copy-workflow-implementation.md`
- Modify: `prisma/schema.prisma`
- Create migration: `prisma/migrations/20260613020000_global_course_library/migration.sql`
- Create: `src/modules/library/global-library.ts`
- Create: `src/modules/library/global-library.test.ts`
- Create: `src/modules/library/prisma-repository.ts`
- Create: `src/modules/library/prisma-repository.test.ts`
- Create: `src/modules/library/server-actions.ts`
- Create: `src/modules/library/server-actions.test.ts`
- Create: `src/app/platform/library/page.tsx`
- Create: `src/app/platform/library/actions.ts`
- Create: `src/app/platform/library/[courseSlug]/page.tsx`
- Create: `src/app/org/[slug]/admin/library/page.tsx`
- Create: `src/app/org/[slug]/admin/library/actions.ts`
- Modify: `src/modules/catalog/related-courses.ts`

**Requirements:**
- Platform owner can create, publish, deprecate, and retire global library courses.
- Organization global library access is controlled by `Organization.globalLibraryEnabled`.
- Organization admin can copy an allowed global course into the tenant catalog.
- Copy creates tenant-owned `Course`, `CourseCategory`, `CourseTag`, `CourseTagLink`, video metadata, SCORM metadata, and knowledge-check metadata when present.
- Copied tenant courses can be customized without mutating the global course.
- Re-copying the same global course is blocked unless the admin selects an explicit duplicate action.
- Related-course ranking remains tenant-scoped and never mixes global-only records into learner recommendations.
- Copy actions record audit logs with source global course id and created tenant course id.

**Verification commands:**

```powershell
npm run test -- src/modules/library/global-library.test.ts src/modules/library/prisma-repository.test.ts src/modules/library/server-actions.test.ts src/modules/catalog/related-courses.test.ts
npm run lint
npx prisma validate
npm run prisma:generate
npx tsc --noEmit --incremental false
npm run build
```

### Task 3: Knowledge Checks, Scoring, And Learner Feedback

**Files:**
- Create plan: `docs/superpowers/plans/2026-06-13-knowledge-checks-scoring-feedback-implementation.md`
- Modify: `prisma/schema.prisma`
- Create migration: `prisma/migrations/20260613030000_knowledge_checks_feedback/migration.sql`
- Create: `src/modules/assessments/knowledge-checks.ts`
- Create: `src/modules/assessments/knowledge-checks.test.ts`
- Create: `src/modules/assessments/scoring.ts`
- Create: `src/modules/assessments/scoring.test.ts`
- Create: `src/modules/assessments/prisma-repository.ts`
- Create: `src/modules/assessments/prisma-repository.test.ts`
- Create: `src/modules/assessments/server-actions.ts`
- Create: `src/modules/assessments/server-actions.test.ts`
- Create: `src/modules/feedback/course-feedback.ts`
- Create: `src/modules/feedback/course-feedback.test.ts`
- Create: `src/app/org/[slug]/admin/courses/[courseSlug]/checks/page.tsx`
- Create: `src/app/org/[slug]/admin/courses/[courseSlug]/checks/actions.ts`
- Create: `src/app/api/org/[slug]/assignments/[assignmentId]/checks/[checkId]/submit/route.ts`
- Modify: `src/modules/video/video-runtime.ts`
- Modify: `src/modules/progress/progress.ts`
- Modify: `src/app/org/[slug]/learn/[courseSlug]/page.tsx`

**Requirements:**
- Knowledge checks are embedded in native video learning flows.
- Supported question types are single-answer multiple choice, multiple-answer multiple choice, and true/false.
- Each answer can include optional feedback.
- Each question can include optional explanation/context feedback.
- MVP retry behavior is unlimited.
- Attempt history stores selected answers, correctness, score, attempt number, submitted at, and assignment id.
- Native course completion requires required video lessons and required knowledge checks.
- Scores feed progress, scoring reports, and quiz difficulty reports.
- Admin can create, edit, reorder, activate, and deactivate checks for a course or lesson.
- Learner can answer checks from the learning flow without cross-organization access.
- Course ratings use one to five stars plus optional text feedback.
- Satisfaction report aggregates ratings and feedback by tenant and course.

**Verification commands:**

```powershell
npm run test -- src/modules/assessments/knowledge-checks.test.ts src/modules/assessments/scoring.test.ts src/modules/assessments/prisma-repository.test.ts src/modules/assessments/server-actions.test.ts src/modules/feedback/course-feedback.test.ts src/modules/video/video-runtime.test.ts src/modules/progress/progress.test.ts
npm run lint
npx prisma validate
npm run prisma:generate
npx tsc --noEmit --incremental false
npm run build
```

### Task 4: Notifications, Jobs, And Email Providers

**Files:**
- Create plan: `docs/superpowers/plans/2026-06-13-notifications-jobs-email-providers-implementation.md`
- Modify: `prisma/schema.prisma`
- Create migration: `prisma/migrations/20260613040000_notification_jobs/migration.sql`
- Create: `src/modules/notifications/notification-jobs.ts`
- Create: `src/modules/notifications/notification-jobs.test.ts`
- Create: `src/modules/notifications/scheduler.ts`
- Create: `src/modules/notifications/scheduler.test.ts`
- Create: `src/modules/notifications/templates.ts`
- Create: `src/modules/notifications/templates.test.ts`
- Create: `src/modules/notifications/prisma-repository.ts`
- Create: `src/modules/notifications/prisma-repository.test.ts`
- Create: `src/modules/providers/email/smtp-email-provider.ts`
- Create: `src/modules/providers/email/smtp-email-provider.test.ts`
- Create: `src/modules/providers/email/api-email-provider.ts`
- Create: `src/modules/providers/email/api-email-provider.test.ts`
- Modify: `src/modules/providers/email/email-provider.ts`
- Create: `src/app/api/jobs/notifications/route.ts`
- Create: `src/app/org/[slug]/admin/notifications/page.tsx`

**Requirements:**
- Assignment email is scheduled when a course is assigned.
- Completion and certificate email is scheduled when a certificate is created.
- Due-soon learner reminder is scheduled before assignment due date.
- Overdue learner reminder is scheduled after due date when incomplete.
- Manager escalation is scheduled after the overdue threshold when incomplete.
- Job identity is idempotent per assignment, notification type, and scheduled date.
- Notification jobs store status, attempts, provider message id, last error, next run time, and sent time.
- Admin can inspect failed and pending tenant notification jobs.
- Platform owner can inspect cross-tenant notification failures.
- SMTP provider sends through configured SMTP settings and is allowed in production.
- API provider sends through configured transactional email endpoint and is allowed in production.
- Console provider remains local-only and redacts token-bearing URLs.
- Cron route requires a shared secret and processes bounded batches.

**Verification commands:**

```powershell
npm run test -- src/modules/notifications/notification-jobs.test.ts src/modules/notifications/scheduler.test.ts src/modules/notifications/templates.test.ts src/modules/notifications/prisma-repository.test.ts src/modules/providers/email/email-provider.test.ts src/modules/providers/email/smtp-email-provider.test.ts src/modules/providers/email/api-email-provider.test.ts
npm run lint
npx prisma validate
npm run prisma:generate
npx tsc --noEmit --incremental false
npm run build
```

### Task 5: Production Media, Storage, And SCORM Package Operations

**Files:**
- Create plan: `docs/superpowers/plans/2026-06-13-production-media-storage-scorm-operations-implementation.md`
- Modify: `prisma/schema.prisma`
- Create migration: `prisma/migrations/20260613050000_media_storage_operations/migration.sql`
- Create: `src/modules/providers/video/mux-video-provider.ts`
- Create: `src/modules/providers/video/mux-video-provider.test.ts`
- Create: `src/modules/providers/storage/r2-object-storage-provider.ts`
- Create: `src/modules/providers/storage/r2-object-storage-provider.test.ts`
- Create: `src/modules/storage/storage-keys.ts`
- Create: `src/modules/storage/storage-keys.test.ts`
- Create: `src/modules/scorm/scorm-manifest.ts`
- Create: `src/modules/scorm/scorm-manifest.test.ts`
- Create: `src/modules/scorm/scorm-extraction.ts`
- Create: `src/modules/scorm/scorm-extraction.test.ts`
- Create: `src/modules/scorm/scorm-package-jobs.ts`
- Create: `src/modules/scorm/scorm-package-jobs.test.ts`
- Create: `src/app/api/providers/mux/webhook/route.ts`
- Create: `src/app/api/jobs/scorm-extraction/route.ts`
- Create: `src/app/api/org/[slug]/storage/upload/route.ts`
- Modify: `src/app/org/[slug]/admin/courses/[courseSlug]/content/page.tsx`
- Modify: `src/app/org/[slug]/admin/courses/[courseSlug]/scorm/page.tsx`

**Requirements:**
- Mux adapter creates direct upload URLs with tenant and course metadata.
- Mux webhook verifies signature before updating upload/asset state.
- Video lessons expose playback only when Mux asset is ready.
- R2 adapter creates tenant-scoped object keys and signed read/write URLs.
- Logos, transcripts, certificates, SCORM zips, extracted SCORM files, and CSV exports use tenant-scoped storage keys.
- SCORM upload validates `.zip` content type, size, `imsmanifest.xml`, and launch file presence.
- SCORM extraction job writes extracted files under `contentRootKey`.
- Extraction status is visible to admins and blocks learner launch until ready.
- ZIP path traversal entries are rejected during extraction.
- Malware scan hook stores pending, passed, or failed status even if the first implementation only supports a configured pass-through scanner.
- Storage delete operations are explicit and never infer tenant from user input.

**Verification commands:**

```powershell
npm run test -- src/modules/providers/video/mux-video-provider.test.ts src/modules/providers/storage/r2-object-storage-provider.test.ts src/modules/storage/storage-keys.test.ts src/modules/scorm/scorm-manifest.test.ts src/modules/scorm/scorm-extraction.test.ts src/modules/scorm/scorm-package-jobs.test.ts src/modules/scorm/scorm-package-service.test.ts src/modules/scorm/scorm-runtime.test.ts
npm run lint
npx prisma validate
npm run prisma:generate
npx tsc --noEmit --incremental false
npm run build
```

### Task 6: Certificates, Credential Issuing, And Credential Operations

**Files:**
- Create plan: `docs/superpowers/plans/2026-06-13-certificates-credentials-operations-implementation.md`
- Modify: `prisma/schema.prisma`
- Create migration: `prisma/migrations/20260613060000_certificate_credential_operations/migration.sql`
- Modify: `src/modules/certificates/certificates.ts`
- Modify: `src/modules/certificates/certificates.test.ts`
- Create: `src/modules/certificates/certificate-renderer.tsx`
- Create: `src/modules/certificates/certificate-renderer.test.tsx`
- Create: `src/modules/certificates/share-links.ts`
- Create: `src/modules/certificates/share-links.test.ts`
- Create: `src/modules/providers/credentials/credly-provider.ts`
- Create: `src/modules/providers/credentials/credly-provider.test.ts`
- Create: `src/modules/credentials/credential-operations.ts`
- Create: `src/modules/credentials/credential-operations.test.ts`
- Modify: `src/app/certificates/[verificationCode]/page.tsx`
- Create: `src/app/certificates/[verificationCode]/download/route.ts`
- Create: `src/app/org/[slug]/certificates/page.tsx`
- Create: `src/app/org/[slug]/admin/certificates/page.tsx`
- Create: `src/app/org/[slug]/admin/credentials/page.tsx`
- Create: `src/app/org/[slug]/admin/credentials/actions.ts`

**Requirements:**
- Certificate page renders a branded certificate suitable for browser print.
- Download route returns a stable certificate artifact generated from stored certificate data.
- Learner certificate wallet lists earned certificates and verification URLs.
- Public verification page never exposes private membership or assignment ids.
- Share links include LinkedIn, email, and plain copyable verification URL.
- Course settings can map a Credly template id.
- Credly adapter issues credentials and stores provider credential id and provider URL.
- Failed credential issuance can be retried by an admin without creating duplicate certificates.
- Admin can inspect credential status by learner, course, provider, and failure message.
- Certificate email uses notification job infrastructure from Task 4.

**Verification commands:**

```powershell
npm run test -- src/modules/certificates/certificates.test.ts src/modules/certificates/certificate-renderer.test.tsx src/modules/certificates/share-links.test.ts src/modules/providers/credentials/credly-provider.test.ts src/modules/credentials/credential-operations.test.ts
npm run lint
npx prisma validate
npm run prisma:generate
npx tsc --noEmit --incremental false
npm run build
```

### Task 7: Complete Reporting And Analytics

**Files:**
- Create plan: `docs/superpowers/plans/2026-06-13-reporting-analytics-completion-implementation.md`
- Create: `src/modules/reports/course-completion-report.ts`
- Create: `src/modules/reports/course-completion-report.test.ts`
- Create: `src/modules/reports/scoring-report.ts`
- Create: `src/modules/reports/scoring-report.test.ts`
- Create: `src/modules/reports/timing-report.ts`
- Create: `src/modules/reports/timing-report.test.ts`
- Create: `src/modules/reports/popularity-report.ts`
- Create: `src/modules/reports/popularity-report.test.ts`
- Create: `src/modules/reports/satisfaction-report.ts`
- Create: `src/modules/reports/satisfaction-report.test.ts`
- Create: `src/modules/reports/quiz-difficulty-report.ts`
- Create: `src/modules/reports/quiz-difficulty-report.test.ts`
- Create: `src/modules/reports/certificate-credential-report.ts`
- Create: `src/modules/reports/certificate-credential-report.test.ts`
- Create: `src/modules/reports/platform-aggregate-report.ts`
- Create: `src/modules/reports/platform-aggregate-report.test.ts`
- Modify: `src/modules/reports/prisma-repository.ts`
- Modify: `src/app/org/[slug]/admin/reports/page.tsx`
- Modify: `src/app/org/[slug]/reports/page.tsx`
- Modify: `src/app/platform/page.tsx`
- Create: `src/app/api/org/[slug]/reports/completions.csv/route.ts`
- Create: `src/app/api/org/[slug]/reports/scoring.csv/route.ts`
- Create: `src/app/api/org/[slug]/reports/timing.csv/route.ts`
- Create: `src/app/api/org/[slug]/reports/satisfaction.csv/route.ts`
- Create: `src/app/api/org/[slug]/reports/quiz-difficulty.csv/route.ts`
- Create: `src/app/api/org/[slug]/reports/certificates.csv/route.ts`

**Requirements:**
- Course completion report includes assigned, started, completed, overdue, and completion rate by course.
- Scoring report includes average score, best score, latest score, and pass/fail rate.
- Timing report includes average time, total time, and last activity.
- Popularity report includes most viewed, most enrolled, most completed, and highest-rated courses.
- Satisfaction report uses learner ratings and feedback from Task 3.
- Quiz difficulty report uses knowledge-check attempts from Task 3.
- Certificate and credential report includes certificate URL, issued date, credential provider, credential status, and failure message.
- Platform aggregate report spans organizations and never exposes tenant data to organization users.
- CSV exports use the same visibility filters as on-screen reports.
- PDF report export remains excluded.

**Verification commands:**

```powershell
npm run test -- src/modules/reports/course-completion-report.test.ts src/modules/reports/scoring-report.test.ts src/modules/reports/timing-report.test.ts src/modules/reports/popularity-report.test.ts src/modules/reports/satisfaction-report.test.ts src/modules/reports/quiz-difficulty-report.test.ts src/modules/reports/certificate-credential-report.test.ts src/modules/reports/platform-aggregate-report.test.ts src/modules/reports/export-route.test.ts src/modules/reports/page-shells.test.ts
npm run lint
npx prisma validate
npm run prisma:generate
npx tsc --noEmit --incremental false
npm run build
```

### Task 8: Audit Browsing, Operational Failure Views, And Admin Observability

**Files:**
- Create plan: `docs/superpowers/plans/2026-06-13-audit-operations-observability-implementation.md`
- Create: `src/modules/audit/audit-read-models.ts`
- Create: `src/modules/audit/audit-read-models.test.ts`
- Create: `src/modules/audit/prisma-repository.ts`
- Create: `src/modules/audit/prisma-repository.test.ts`
- Create: `src/modules/operations/provider-failures.ts`
- Create: `src/modules/operations/provider-failures.test.ts`
- Create: `src/app/org/[slug]/admin/audit/page.tsx`
- Create: `src/app/platform/audit/page.tsx`
- Create: `src/app/org/[slug]/admin/operations/page.tsx`
- Create: `src/app/platform/operations/page.tsx`
- Create: `src/app/api/org/[slug]/audit.csv/route.ts`
- Create: `src/app/api/platform/audit.csv/route.ts`

**Requirements:**
- Organization admins can browse audit logs only for their organization.
- Platform owners can browse audit logs across organizations.
- Filters include actor, action, target type, target id, date range, and organization.
- CSV exports use the same filters as the page.
- Operations views surface failed notification jobs, failed credential issuance, SCORM extraction failures, Mux asset failures, and storage errors.
- Provider failure rows include retry eligibility and last error without leaking secrets.
- Audit metadata uses JSON but page output renders stable known fields first.

**Verification commands:**

```powershell
npm run test -- src/modules/audit/audit-read-models.test.ts src/modules/audit/prisma-repository.test.ts src/modules/operations/provider-failures.test.ts
npm run lint
npx prisma validate
npm run prisma:generate
npx tsc --noEmit --incremental false
npm run build
```

### Task 9: Deployment, Security, End-To-End Smoke, And Release Artifacts

**Files:**
- Create plan: `docs/superpowers/plans/2026-06-13-deployment-security-release-readiness-implementation.md`
- Create: `.env.example`
- Create: `docs/runbooks/local-development.md`
- Create: `docs/runbooks/production-environment.md`
- Create: `docs/runbooks/provider-setup.md`
- Create: `docs/runbooks/release-checklist.md`
- Create: `docs/runbooks/rollback.md`
- Create: `docs/release/2026-06-learnhub-mvp-release-notes.md`
- Create: `docs/security/tenant-isolation-checklist.md`
- Create: `docs/security/provider-secret-handling.md`
- Create: `docs/superpowers/traceability/2026-06-learnhub-mvp-traceability-matrix.md`
- Create: `e2e/learnhub-mvp-smoke.spec.ts`
- Create: `playwright.config.ts`
- Create: `tooling/learnhub-release-check.ps1`
- Modify: `package.json`
- Modify: `src/lib/env.ts`
- Modify: `src/lib/env.test.ts`

**Requirements:**
- `.env.example` documents every required local and production variable without secrets.
- Production environment validation rejects default development secrets and missing provider configuration.
- Release script runs tests, lint, Prisma validation, Prisma generate, TypeScript, build, and Playwright smoke in order.
- Smoke test covers platform owner login, organization provision, admin user import, course creation, assignment, learner launch, progress commit, certificate verification, manager report, and CSV export.
- Runbooks cover Vercel, Neon, Mux, R2, Upstash, SMTP/API email, Credly, cron route secrets, and database migration order.
- Tenant isolation checklist maps every organization-scoped module to its scoping tests.
- Traceability matrix maps MVP requirements to spec, implementation module, test file, and release evidence.
- Rollback runbook includes database migration rollback stance, provider webhook disablement, and user communication steps.

**Verification commands:**

```powershell
npm run test
npm run lint
npx prisma validate
npm run prisma:generate
npx tsc --noEmit --incremental false
npm run build
npx playwright test e2e/learnhub-mvp-smoke.spec.ts
powershell -ExecutionPolicy Bypass -File tooling/learnhub-release-check.ps1
```

## Execution Order

Use this order unless a new dependency changes the work:

1. Finish Wave 3.
2. Tenant operations, branding, and user lifecycle.
3. Global library copy workflow.
4. Knowledge checks, scoring, and learner feedback.
5. Notifications, jobs, and email providers.
6. Production media, storage, and SCORM package operations.
7. Certificates, credentials, and credential operations.
8. Complete reporting and analytics.
9. Audit browsing, operational failure views, and admin observability.
10. Deployment, security, end-to-end smoke, and release artifacts.

Parallelization guidance:

- Tasks 1 and 3 should be sequential after Wave 3 because they touch shared schema, progress, learner pages, and admin pages.
- Tasks 4 and 5 can run in parallel after Task 1 if migration ownership is coordinated.
- Tasks 6 and 7 depend on Tasks 3, 4, and 5.
- Task 8 can run after Tasks 4, 5, and 6 create provider failure sources.
- Task 9 should be last because it needs the final route map, provider config, and release gates.

## Full MVP Done Criteria

LearnHub is complete against the current MVP requirements when:

- Wave 3 is merged and verified.
- Every sub-project plan above exists and has been executed.
- Every MVP requirement in `docs/superpowers/specs/2026-06-09-learnhub-mvp-design.md` maps to a shipped module, route, test, or accepted non-goal.
- `npm run test`, `npm run lint`, `npx prisma validate`, `npm run prisma:generate`, `npx tsc --noEmit --incremental false`, and `npm run build` pass sequentially.
- Playwright MVP smoke passes against the real local app.
- Production provider configuration is documented and validated.
- Traceability matrix and release checklist are updated with final evidence.

## Self-Review

Spec coverage:

- Product scope, roles, tenant catalog, lifecycle, course types, assignments, progress, certificates, users/auth, email, notifications, reporting, branding, audit logs, architecture, demo deployment, error handling, testing, and MVP non-goals are represented.

Placeholder scan:

- This document intentionally avoids code-level implementation details for each subsystem because the scope spans independent projects. Each listed sub-project must receive a dedicated writing-plans pass before code changes.

Type consistency:

- Proposed module names align with existing boundaries: `organizations`, `users`, `catalog`, `assignments`, `video`, `scorm`, `progress`, `certificates`, `reports`, `audit`, and `providers`.
