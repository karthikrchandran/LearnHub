# Completed Slices Hardening Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Address standards-audit findings for completed LearnHub slices without broad rewrites.

**Architecture:** Keep the current modular monolith. Harden runtime consistency, route authorization, SCORM storage semantics, and documentation in focused commits.

**Tech Stack:** Next.js App Router, TypeScript, Prisma 7, PostgreSQL, Vitest.

---

## Task 1: Add Progress Consistency ADR

**Files:**
- Create: `docs/superpowers/adrs/2026-06-11-progress-consistency-model.md`

- [ ] Define source-of-truth rules for `LearningProgressEvent`, `AssignmentProgress`, `VideoLessonProgress`, and `ScormRegistration`.
- [ ] Decide the transaction boundary for runtime commits.
- [ ] Define idempotency expectations for repeated video/SCORM commits.
- [ ] Include validation commands and affected modules.
- [ ] Commit `docs: add progress consistency adr`.

## Task 2: Harden Runtime Progress Atomicity

**Files:**
- Modify: `src/modules/video/video-runtime.ts`
- Modify: `src/modules/video/video-runtime.test.ts`
- Modify: `src/modules/scorm/scorm-runtime.ts`
- Modify: `src/modules/scorm/scorm-runtime.test.ts`
- Modify or create repository adapters as needed.

- [ ] Add tests proving native video does not leave inconsistent runtime/progress state when learning progress persistence fails.
- [ ] Add tests proving SCORM does not leave inconsistent runtime/progress state when learning progress persistence fails.
- [ ] Introduce one unit-of-work boundary for runtime state and learning progress state.
- [ ] Run focused runtime tests.
- [ ] Run `npm run test`, `npm run lint`, `npx prisma validate`, `npm run prisma:generate; npx tsc --noEmit --incremental false`.
- [ ] Commit `fix: make runtime progress commits atomic`.

## Task 3: Add Runtime Authorization Helpers

**Files:**
- Create or modify: `src/modules/auth/runtime-permissions.ts`
- Create: `src/modules/auth/runtime-permissions.test.ts`

- [ ] Add acceptance tests for learner-owned assignment launch.
- [ ] Add tests for manager direct-report progress view without learner launch impersonation.
- [ ] Add tests for admin/platform-owner access.
- [ ] Add cross-organization denial tests.
- [ ] Export helpers to use before live video/SCORM launch endpoints.
- [ ] Commit `feat: add runtime authorization helpers`.

## Task 4: Split SCORM Package Upload Key From Content Root

**Files:**
- Modify: `prisma/schema.prisma`
- Create migration under `prisma/migrations/`
- Modify: `src/modules/scorm/scorm-package-service.ts`
- Modify: `src/modules/scorm/scorm-runtime.ts`
- Modify tests.

- [ ] Add `contentRootKey` or equivalent extracted-content root field to `ScormPackage`.
- [ ] Keep `storageKey` as the uploaded zip object key.
- [ ] Build launch URLs from content root plus relative launch path.
- [ ] Add tests proving launch URL does not append launch path to the zip object.
- [ ] Run Prisma and focused SCORM tests.
- [ ] Commit `fix: separate scorm package storage and content roots`.

## Task 5: Harden SCORM Session Time Semantics

**Files:**
- Modify: `src/modules/scorm/scorm-runtime.ts`
- Modify: `src/modules/scorm/scorm-runtime.test.ts`
- Possibly modify: `src/modules/scorm/scorm-time.ts`

- [ ] Add tests for repeated commits in one launch/session.
- [ ] Add tests for malformed session time returning controlled validation errors.
- [ ] Decide whether `session_time` is delta, cumulative within launch, or last reported value for MVP.
- [ ] Implement selected rule.
- [ ] Run focused SCORM tests.
- [ ] Commit `fix: harden scorm session time handling`.

## Task 6: Add Live Vs Placeholder Implementation Note

**Files:**
- Create: `docs/superpowers/notes/2026-06-11-live-vs-placeholder-capabilities.md`

- [ ] List live domain contracts.
- [ ] List placeholder UI shells.
- [ ] List deferred storage/player/reporting capabilities.
- [ ] Link relevant specs/plans.
- [ ] Commit `docs: document live and placeholder capabilities`.

## Task 7: Audit Dirty Auth/Login Redirect Work Separately

**Files:**
- Current dirty files from main, not this worktree:
  - `prisma/seed.ts`
  - `src/app/login/login-form.tsx`
  - `src/lib/auth/guards.ts`
  - `src/lib/auth/next-auth.ts`
  - `src/app/org/page.tsx`
  - `src/lib/auth/redirects.ts`
  - `src/lib/auth/redirects.test.ts`

- [ ] Create a separate worktree or stabilize the current dirty main state.
- [ ] Review redirect/auth changes with Rishi/Niti/Arjun.
- [ ] Run focused auth tests.
- [ ] Merge or discard intentionally; do not mix into runtime hardening.

