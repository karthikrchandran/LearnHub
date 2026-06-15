# Admin Workspace V1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build separate admin screens for courses, media import handoff, users, bulk user import, safe user removal, assignments, and bulk assignments.

**Architecture:** Reuse the existing catalog, user lifecycle, SCORM, video, and assignment domain services. Add a shared admin shell and route-level pages so admin tasks are visible as separate navigation targets instead of being mixed into one catalog/users page.

**Tech Stack:** Next.js App Router server components and server actions, Prisma repositories, Vitest page-shell and action tests, existing LearnHub CSS utilities.

---

### Task 1: Admin Workspace Shell

**Files:**
- Modify: `src/app/ui/learnhub-components.tsx`
- Modify: `src/app/globals.css`
- Test: `src/modules/admin-workspace/page-shells.test.ts`

- [ ] Add a failing page-shell test that expects `AdminAppShell` and admin nav links for dashboard, courses, create course, video content, SCORM packages, users, bulk import, remove access, assignments, bulk assignments, reports, and settings.
- [ ] Implement `AdminAppShell` using the same sidebar pattern as learner and manager.
- [ ] Add compact sidebar section styles for admin grouping.
- [ ] Run `npm run test -- src/modules/admin-workspace/page-shells.test.ts`.

### Task 2: Split Course Admin

**Files:**
- Create: `src/app/org/[slug]/admin/page.tsx`
- Create: `src/app/org/[slug]/admin/courses/page.tsx`
- Create: `src/app/org/[slug]/admin/courses/new/page.tsx`
- Create: `src/app/org/[slug]/admin/courses/new/actions.ts`
- Modify: `src/app/org/[slug]/admin/catalog/page.tsx`
- Test: `src/modules/admin-workspace/page-shells.test.ts`

- [ ] Add failing assertions for separate dashboard, course list, create course, and taxonomy pages.
- [ ] Add an admin dashboard with task links and high-level counts.
- [ ] Move course creation out of catalog into `/admin/courses/new`.
- [ ] On successful create, redirect native video courses to `/admin/courses/{courseSlug}/content` and SCORM courses to `/admin/courses/{courseSlug}/scorm`.
- [ ] Keep catalog setup focused on categories and tags.

### Task 3: Split User Admin

**Files:**
- Create: `src/app/org/[slug]/admin/users/import/page.tsx`
- Create: `src/app/org/[slug]/admin/users/remove/page.tsx`
- Create: `src/app/org/[slug]/admin/users/lifecycle/page.tsx`
- Modify: `src/app/org/[slug]/admin/users/page.tsx`
- Test: `src/modules/admin-workspace/page-shells.test.ts`

- [ ] Add failing assertions for separate user directory, bulk import, lifecycle edit, and remove-access pages.
- [ ] Keep `/admin/users` as a directory/search page.
- [ ] Move CSV import to `/admin/users/import`.
- [ ] Move role, manager, profile, and status editing to `/admin/users/lifecycle`.
- [ ] Add `/admin/users/remove` with deactivate/remove-access buttons that set status to `INACTIVE` through the existing lifecycle action while preserving records.

### Task 4: Bulk Assignments

**Files:**
- Modify: `src/modules/assignments/server-actions.ts`
- Modify: `src/modules/assignments/server-actions.test.ts`
- Modify: `src/app/org/[slug]/admin/assignments/actions.ts`
- Create: `src/app/org/[slug]/admin/assignments/bulk/page.tsx`
- Modify: `src/app/org/[slug]/admin/assignments/page.tsx`

- [ ] Add a failing action test for assigning one course to multiple learner membership ids.
- [ ] Add `createBulkAssignCourseAction` that validates date and learner selection, then calls the existing assignment service once per learner.
- [ ] Return a clear message with assigned and failed counts.
- [ ] Add `/admin/assignments/bulk` with a published-course selector, learner checkboxes, and start date.
- [ ] Keep `/admin/assignments` focused on single learner assignment.

### Task 5: Verification

**Commands:**
- `npm run test -- src/modules/admin-workspace/page-shells.test.ts`
- `npm run test -- src/modules/assignments/server-actions.test.ts`
- `npx tsc --noEmit --incremental false`
- `npm run lint`
- `npm run test`
- `npm run build`

- [ ] Run focused tests after each implemented slice.
- [ ] Run full gates before reporting completion.
