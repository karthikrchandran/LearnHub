# Learner, Manager, and Admin Seamless Readiness Review

Date: 2026-06-14

Scope: current LearnHub learner, manager, and admin portal source in this checkout.

Review mode: source-backed audit. This review did not perform a fresh browser journey across all roles; the verification plan below defines the smoke coverage needed before calling the portals seamless.

## Executive Summary

The three role portals now have meaningful live surfaces:

- Learner has assigned courses, catalog/self-enrollment, course detail, lessons, assessments, certificates, and profile navigation.
- Manager has team dashboard, manager-scoped assignments, direct-report reports, and profile navigation.
- Admin has dashboard, course creation, video/SCORM content areas, catalog setup, users, bulk import, lifecycle, remove access, assignments, bulk assignments, reports, and settings.

The remaining work is not one large missing portal. It is mostly integration hardening: consistent shell/navigation, visible action feedback, tenant-safety guards, course lifecycle gates, and end-to-end role journeys with real media/SCORM upload paths.

## Implementation Update - 2026-06-14

Addressed in the follow-up implementation:

- RPA-001: Admin Library, Certificates, Credentials, and Notifications are now in the shared admin shell/navigation.
- RPA-002: User lifecycle now blocks deactivating or demoting the last active organization admin.
- RPA-003: Admin/manager assignment forms and user lifecycle/remove-access forms now surface server-action success and error messages.
- RPA-004: Learner SCORM runtime now uses the learner shell.
- RPA-005: Learner My Courses and Catalog search/filter affordances now use real query-backed filtering.
- RPA-006: Course detail lifecycle buttons are now live actions with feedback.

Still open:

- No open items remain from this audit.

Second follow-up implementation:

- Course publish now gates `PUBLISHED` transitions on ready native video lessons or ready, clean, active SCORM packages.
- Manager v1 now includes direct-report drill-down with assignment history, overdue/completion metrics, and certificate/compliance detail.
- Admin, manager, and shared report pages now group reports by learner progress, compliance/completion, assessment quality, and engagement; all manager CSV routes have direct-report scope coverage.
- Playwright role journeys now cover learner, manager, and admin browser smoke against seeded role-separated users. The local smoke verifies seeded SCORM package launch/import surfaces and local-video readiness; provider-backed Mux and R2 upload execution still requires real provider credentials in the environment.

## Blocking Gaps

### RPA-001: Admin operational pages are outside the admin shell

Status: blocker for seamless navigation.

Evidence:

- `src/app/ui/learnhub-components.tsx:154` defines `AdminAppShell`.
- The admin nav groups include Workspace, Courses, Users, and Assignments only at `src/app/ui/learnhub-components.tsx:167`, `src/app/ui/learnhub-components.tsx:175`, `src/app/ui/learnhub-components.tsx:185`, and `src/app/ui/learnhub-components.tsx:194`.
- Existing admin pages still render raw `<main>` without `AdminAppShell`:
  - `src/app/org/[slug]/admin/credentials/page.tsx:28`
  - `src/app/org/[slug]/admin/certificates/page.tsx:40`
  - `src/app/org/[slug]/admin/notifications/page.tsx:24`
  - `src/app/org/[slug]/admin/library/page.tsx:92`

Impact:

These pages do not share the admin side navigation or shell-level logoff. Users can land in older page frames and lose the clean portal flow.

Needed:

- Add nav keys and grouped admin nav links for Library, Credentials, Certificates, and Notifications.
- Wrap those pages in `AdminAppShell`.
- Add shell tests that assert each page includes admin navigation and the logoff control.

### RPA-002: User lifecycle can remove tenant administration without a last-admin guard

Status: blocker for tenant operations safety.

Evidence:

- `src/modules/users/lifecycle.ts:87` starts `updateOrganizationUserLifecycle`.
- The flow validates actor permission, target membership, manager assignment, changed fields, user status, membership lifecycle, and audit logging.
- There is no repository method or check in that transaction to prevent demoting, deactivating, or removing the final active `ADMIN`.

Impact:

An admin could accidentally remove the last active admin path for an organization and strand tenant operations.

Needed:

- Add repository support to count active admins or detect whether the target is the final active admin.
- Block status changes to `INACTIVE` and role changes that remove `ADMIN` when the target is the last active admin.
- Add service tests for deactivating, demoting, and preserving the last admin.
- Decide whether platform owners can override this guard, and document the rule.

### RPA-003: Several live server actions return results that the UI does not show

Status: blocker for reliable admin/manager operations.

Evidence:

- Bulk user import has the right pattern: `src/app/org/[slug]/admin/users/user-import-form.tsx:19` uses `useActionState`, and `src/app/org/[slug]/admin/users/user-import-form.tsx:42` renders status messages.
- Assignment and lifecycle pages call actions through plain forms:
  - `src/app/org/[slug]/admin/assignments/page.tsx:78`
  - `src/app/org/[slug]/admin/assignments/bulk/page.tsx:76`
  - `src/app/org/[slug]/manager/assignments/page.tsx:71`
  - `src/app/org/[slug]/admin/users/lifecycle/page.tsx:139`
  - `src/app/org/[slug]/admin/users/lifecycle/page.tsx:149`
  - `src/app/org/[slug]/admin/users/lifecycle/page.tsx:162`
  - `src/app/org/[slug]/admin/users/remove/page.tsx:74`
- The server actions return success/error messages in `src/modules/users/server-actions.ts:163`, `src/modules/users/server-actions.ts:165`, `src/modules/users/server-actions.ts:197`, and `src/modules/users/server-actions.ts:233`, but those messages are not surfaced on these pages.

Impact:

Admins and managers can submit important actions without seeing whether they succeeded, failed, or were blocked by validation.

Needed:

- Create a shared action-result panel or client wrapper for server-action forms.
- Apply it to admin assignments, bulk assignments, manager assignments, lifecycle update, resend invite, password reset, and remove access.
- Add tests for success and failure state rendering.

## Important Gaps

### RPA-004: Learner SCORM runtime is outside the learner shell

Evidence:

- `src/app/org/[slug]/learn/[courseSlug]/scorm/page.tsx:58` and `src/app/org/[slug]/learn/[courseSlug]/scorm/page.tsx:75` render raw `<main>` layouts.
- Learner shell navigation and logoff live in `LearnerAppShell`, but this runtime does not use it.

Needed:

- Wrap the SCORM runtime in `LearnerAppShell`.
- Keep the SCORM iframe usable within the shell at desktop and mobile sizes.
- Add learner shell tests covering the SCORM launch route.

### RPA-005: Learner search and catalog filters are visual only

Evidence:

- `src/app/org/[slug]/learn/page.tsx:110` renders `Search my courses` as a static `div`.
- `src/app/org/[slug]/learn/catalog/page.tsx:72` renders `Search catalog` as a static `div`.
- `src/app/org/[slug]/learn/catalog/page.tsx:75` through `src/app/org/[slug]/learn/catalog/page.tsx:80` render category filter spans without query behavior.

Needed:

- Implement query, category, tag, and certificate-eligible filtering against the learner catalog data.
- Either implement assigned-course search or remove the search affordance until it is real.

### RPA-006: Course lifecycle controls are placeholders

Evidence:

- New course creation allows `Published` at `src/app/org/[slug]/admin/courses/new/page.tsx:84`.
- The course detail page renders disabled `Publish`, `Deprecate`, and `Retire` buttons at `src/app/org/[slug]/admin/courses/[courseSlug]/page.tsx:102`.

Impact:

Admins can create a published course shell, but cannot manage status transitions from the course detail page. Publishing also needs readiness checks for content, SCORM package state, catalog visibility, and assignments.

Needed:

- Add course lifecycle server actions and service tests.
- Gate publish on required content readiness.
- Allow deprecate/retire with assignment and learner-progress implications documented.

### RPA-007: Manager experience is functional but still v1

Evidence:

- Manager reports are direct-report scoped in copy at `src/app/org/[slug]/manager/reports/page.tsx:79`.
- Manager assignment form exists at `src/app/org/[slug]/manager/assignments/page.tsx:71`.
- Manager role detection excludes memberships that are also admin at `src/app/org/[slug]/manager/manager-utils.ts:24` through `src/app/org/[slug]/manager/manager-utils.ts:29`.

Needed:

- Decide if admin+manager users should be allowed to use the manager portal or if seeded/demo users must stay role-separated.
- Add team member drill-down from manager dashboard to learner detail, assignment history, overdue items, and certificate status.
- Add visible result handling for manager assignment actions.

### RPA-008: Reports are usable but need organization before they are seamless

Evidence:

- Admin reports expose progress, completions, scoring, timing, satisfaction, quiz difficulty, and certificates CSV links at `src/app/org/[slug]/admin/reports/page.tsx:43` through `src/app/org/[slug]/admin/reports/page.tsx:49`.
- Manager reports expose the same export set at `src/app/org/[slug]/manager/reports/page.tsx:63` through `src/app/org/[slug]/manager/reports/page.tsx:69`.

Needed:

- Keep the current report set for now, but add clearer grouping later: learner progress, compliance/completion, assessment quality, certificates, engagement.
- Add export-state handling and empty-state guidance.
- Add route tests for every manager-scoped CSV, not just the progress happy path.

## Cross-Portal Work Packages

### WP-001: Shell and Navigation Completion

Goal: every portal page has the correct role shell, role nav, active state, and logoff path.

Includes:

- Admin shell wrap for Library, Credentials, Certificates, Notifications.
- Learner shell wrap for SCORM runtime.
- Route-level shell tests for every role page.
- One visual smoke on desktop and mobile for each portal.

### WP-002: Action Feedback Standard

Goal: every create, update, assign, import, delete/deactivate, resend, reset, upload, and lifecycle action shows visible success or error feedback.

Includes:

- Shared `ActionResultPanel` pattern.
- Assignment and lifecycle client wrappers.
- Consistent confirmation for destructive actions such as remove access.
- Tests for at least one success and one failure path per action family.

### WP-003: Tenant Safety and Admin Guardrails

Goal: avoid tenant lockout and unsafe bulk changes.

Includes:

- Last-active-admin guard.
- Bulk assignment validation summary before commit.
- Bulk user import duplicate and manager-email validation is already present; add more page-level confirmation around commit.
- Audit-log visibility for user lifecycle and assignment operations.

### WP-004: Course Publishing and Content Readiness

Goal: course creation, video upload, SCORM import, catalog publication, and learner launch behave as one complete workflow.

Includes:

- Publish/deprecate/retire actions.
- Publish readiness checks for video lessons and SCORM packages.
- Clear admin status labels for local stub media, Mux upload media, local SCORM, and R2-backed SCORM readiness.
- Learner launch tests for video and SCORM.

### WP-005: End-to-End Role Journeys

Goal: prove the portals work together using real user paths.

Minimum Playwright journeys:

- Learner: log in, view assigned courses, enroll from catalog, launch video lesson, complete knowledge check, launch SCORM, view certificate/profile, logoff.
- Manager: log in, view team, assign a course to a direct report, inspect reports, export CSV, logoff.
- Admin: log in, create course, add video through Mux path, import SCORM package, bulk import users, bulk assign course, manage lifecycle, remove access, inspect reports/settings, logoff.

## Current Readiness Matrix

| Area | Learner | Manager | Admin | Seamless status |
| --- | --- | --- | --- | --- |
| Role shell and nav | Mostly ready | Mostly ready | Partial | Not seamless until all existing pages use role shells |
| Logoff | Present in main shells | Present in main shell | Present only in shell-wrapped admin pages | Needs shell completion |
| Real data | Assigned courses, catalog, assessments, certificates | Direct reports, assignments, reports | Courses, users, assignments, reports, settings | Good base |
| Bulk users | Not applicable | Not applicable | Implemented with feedback | Good base |
| Bulk assignments | Not applicable | Single direct-report assignment | Implemented but feedback is weak | Needs feedback |
| Video upload | Learner can consume lessons | Reports only | Mux/local content path exists | Needs E2E journey |
| SCORM upload | Runtime exists but outside shell | Reports only | SCORM package path exists | Needs shell wrap and E2E journey |
| Reports | Learner certificate/profile views | Direct-report reports | Org reports | Usable but needs organization |
| Safety guardrails | Membership guard | Direct-report scope | Missing last-admin guard | Needs hardening |

## Definition of Seamless

Before calling the role portals complete, all of these should be true:

- Every portal page uses its role shell and exposes logoff.
- Every form action provides visible success and error feedback.
- Admin cannot accidentally remove the final active tenant admin.
- A real video course can be created, uploaded through Mux, assigned, launched, and tracked.
- A real SCORM package can be uploaded, assigned, launched, committed, and reported.
- Bulk user import, bulk assignment, user deletion/deactivation, lifecycle edits, and manager assignments have tests and clear UI states.
- Learner, manager, and admin journeys pass in browser smoke tests against seeded role-separated users.

## Recommended Next Sequence

1. Shell and navigation completion: fixes the most visible broken flow with low product risk.
2. Action feedback standard: makes existing live functionality trustworthy.
3. Last-active-admin guard: closes the highest tenant-safety risk.
4. Course lifecycle/readiness gates: turns create course, video, and SCORM into one controlled workflow.
5. Role journey Playwright suite: locks the workflows so later styling/report reorganization does not regress them.
