# SCORM 1.2 Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add SCORM 1.2 package metadata, launch state, runtime commits, and approximate progress events.

**Architecture:** Add tenant-scoped Prisma models for SCORM packages and registrations. Keep SCORM rules in `src/modules/scorm`, and reuse the existing `recordLearningEvent` boundary for assignment progress and certificate readiness.

**Tech Stack:** Next.js App Router, TypeScript, Prisma 7, PostgreSQL, Vitest, existing progress module.

---

## File Structure

- `prisma/schema.prisma`: add `ScormPackage` and `ScormRegistration`.
- `prisma/migrations/20260610020000_scorm_1_2_runtime/migration.sql`: SQL migration.
- `prisma/seed.ts`: add demo SCORM package metadata for the demo SCORM course.
- `src/modules/scorm/scorm-time.ts`: parse and format SCORM 1.2 time strings.
- `src/modules/scorm/scorm-progress.ts`: normalize statuses and calculate approximate percent.
- `src/modules/scorm/scorm-package-service.ts`: validate package upload metadata and create package records.
- `src/modules/scorm/scorm-runtime.ts`: launch registrations and commit SCORM 1.2 CMI state.
- `src/modules/scorm/prisma-repository.ts`: Prisma adapter for package/runtime repositories.
- `src/modules/scorm/*.test.ts`: focused tests for all domain modules.
- `src/modules/scorm/page-shells.test.ts`: smoke tests for route shells.
- `src/app/org/[slug]/admin/courses/[courseSlug]/scorm/page.tsx`: admin upload shell.
- `src/app/org/[slug]/learn/[courseSlug]/scorm/page.tsx`: learner launch shell.

## Task 1: Add SCORM Schema And Seed

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260610020000_scorm_1_2_runtime/migration.sql`
- Modify: `prisma/seed.ts`

- [ ] Add `scormPackages ScormPackage[]` to `Organization` and `Course`.
- [ ] Add `scormRegistration ScormRegistration?` to `CourseAssignment`.
- [ ] Create `ScormPackage` with tenant-scoped course relation, upload metadata, launch path, active flag, and audit fields.
- [ ] Create `ScormRegistration` with tenant-scoped assignment relation, CMI JSON, lesson status, score, session/total time seconds, launch/commit timestamps.
- [ ] Create SQL migration with composite foreign keys and unique indexes.
- [ ] Seed a demo package for the existing demo `SCORM_1_2` course.
- [ ] Run `npx prisma validate` and `npm run prisma:generate`.
- [ ] Commit `feat: add scorm runtime schema`.

## Task 2: Add SCORM Time And Progress Rules

**Files:**
- Create: `src/modules/scorm/scorm-time.test.ts`
- Create: `src/modules/scorm/scorm-time.ts`
- Create: `src/modules/scorm/scorm-progress.test.ts`
- Create: `src/modules/scorm/scorm-progress.ts`

- [ ] Test and implement `parseScorm12Time("01:02:03.50") === 3723`.
- [ ] Test and implement `formatScorm12Time(3723) === "01:02:03"`.
- [ ] Test invalid time strings throw `Invalid SCORM 1.2 time`.
- [ ] Test `completed` and `passed` map to 100 and completion event types.
- [ ] Test `incomplete` with score maps to score capped at 95.
- [ ] Test `incomplete` with no score maps to 50 after activity.
- [ ] Test `browsed` maps to 25 and `not attempted` maps to 0.
- [ ] Run focused tests and commit `feat: add scorm progress rules`.

## Task 3: Add SCORM Package Service

**Files:**
- Create: `src/modules/scorm/scorm-package-service.test.ts`
- Create: `src/modules/scorm/scorm-package-service.ts`

- [ ] Test upload rejects non-SCORM courses with `SCORM packages can only be added to SCORM 1.2 courses`.
- [ ] Test upload rejects non-zip file names with `SCORM package must be a zip file`.
- [ ] Test upload rejects unsafe launch paths with `SCORM launch path must be relative`.
- [ ] Test upload creates storage key `org/{organizationId}/courses/{courseId}/scorm/{packageId}/{fileName}`.
- [ ] Test audit action `scorm.package_uploaded`.
- [ ] Implement service with repository contract and transaction support.
- [ ] Run focused tests and commit `feat: add scorm package service`.

## Task 4: Add SCORM Runtime Service

**Files:**
- Create: `src/modules/scorm/scorm-runtime.test.ts`
- Create: `src/modules/scorm/scorm-runtime.ts`

- [ ] Test launch rejects missing assignment with `Assignment was not found`.
- [ ] Test launch rejects non-SCORM courses with `Assignment is not for a SCORM 1.2 course`.
- [ ] Test launch rejects missing package with `SCORM package was not found`.
- [ ] Test launch increments launch count and returns launch URL/state.
- [ ] Test commit merges allowed CMI values.
- [ ] Test commit records `SCORM PROGRESS` below completion.
- [ ] Test commit records `SCORM COMPLETED` for `completed` and `PASSED` for `passed`.
- [ ] Run focused tests and commit `feat: add scorm runtime service`.

## Task 5: Add SCORM Prisma Repository

**Files:**
- Create: `src/modules/scorm/prisma-repository.test.ts`
- Create: `src/modules/scorm/prisma-repository.ts`

- [ ] Test package course lookup scopes by `organizationId`.
- [ ] Test runtime assignment lookup includes course type, package, and registration.
- [ ] Test registration upsert uses `organizationId_assignmentId`.
- [ ] Implement repository adapter.
- [ ] Run focused tests and commit `feat: add scorm prisma repository`.

## Task 6: Add SCORM Page Shells

**Files:**
- Create: `src/modules/scorm/page-shells.test.ts`
- Create: `src/app/org/[slug]/admin/courses/[courseSlug]/scorm/page.tsx`
- Create: `src/app/org/[slug]/learn/[courseSlug]/scorm/page.tsx`

- [ ] Test admin page includes `SCORM package`, `Upload zip`, `Launch path`, and disabled controls.
- [ ] Test learner page includes `SCORM player`, `Launch`, `Progress`, `Score`, and disabled controls.
- [ ] Use `requireOrganizationUsersAdminBySlug` for admin.
- [ ] Use `requireOrganizationMemberBySlug` for learner.
- [ ] Run page-shell test and `npm run build`.
- [ ] Commit `feat: add scorm page shells`.

## Task 7: Final Verification

- [ ] Run `npm run test`.
- [ ] Run `npm run lint`.
- [ ] Run `npx prisma validate`.
- [ ] Run `npx tsc --noEmit --incremental false`.
- [ ] Run `npm run build`.
- [ ] Confirm `git status --short --branch`.
