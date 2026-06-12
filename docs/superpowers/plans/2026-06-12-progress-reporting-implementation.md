# Progress Reporting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add tenant-scoped progress report read models, pages, and CSV export foundations for admins, managers, and learners.

**Architecture:** Reporting is read-only and uses normalized progress tables as the source of truth. Permission filtering happens before query construction and is shared by page and export handlers. Reports do not write runtime state.

**Tech Stack:** Next.js App Router pages and route handlers, TypeScript, Prisma 7, PostgreSQL, Vitest.

---

## Scope Boundary

This plan adds progress and certificate reporting views plus CSV export foundations. It does not add PDF export, scheduled emails, notification jobs, chart libraries, or analytics warehouses.

## File Structure

- Create `src/modules/reports/progress-report.ts`: read-model types, filters, and CSV formatting.
- Create `src/modules/reports/progress-report.test.ts`: filter, permission, and CSV tests.
- Create `src/modules/reports/prisma-repository.ts`: Prisma read repository.
- Create `src/modules/reports/prisma-repository.test.ts`: query-shape tests.
- Create `src/app/org/[slug]/reports/page.tsx`: learner and manager progress page.
- Create `src/app/org/[slug]/admin/reports/page.tsx`: admin organization report page.
- Create `src/app/api/org/[slug]/reports/progress.csv/route.ts`: CSV export route.
- Create `src/modules/reports/page-shells.test.ts`: page smoke tests.

## Task 1: Add Progress Report Read Model

**Files:**
- Create: `src/modules/reports/progress-report.test.ts`
- Create: `src/modules/reports/progress-report.ts`

- [ ] **Step 1: Write tests**

Tests must prove:

- learner filter returns only the actor's membership ids.
- manager filter returns only direct-report membership ids.
- admin filter returns all organization assignments.
- cross-organization target memberships are excluded.
- CSV output includes learner email, course title, assignment status, progress percent, due date, completed flag, certificate URL, and last event date.

Run:

```powershell
npm run test -- src/modules/reports/progress-report.test.ts
```

Expected: fail because the report module does not exist.

- [ ] **Step 2: Implement read-model helpers**

Export:

```ts
export type ProgressReportScope =
  | { kind: "learner"; membershipIds: string[] }
  | { kind: "manager"; membershipIds: string[] }
  | { kind: "admin" };

export type ProgressReportRow = {
  assignmentId: string;
  learnerName: string;
  learnerEmail: string;
  courseTitle: string;
  courseType: "NATIVE_VIDEO" | "SCORM_1_2";
  assignmentStatus: "ASSIGNED" | "IN_PROGRESS" | "COMPLETED" | "OVERDUE";
  progressPercent: number;
  dueDate: Date;
  lastEventAt: Date | null;
  certificateUrl: string | null;
};

export function resolveProgressReportScope(context: MembershipAuthContext, organizationId: string): ProgressReportScope;
export function progressReportWhere(organizationId: string, scope: ProgressReportScope): object;
export function formatProgressReportCsv(rows: ProgressReportRow[]): string;
```

CSV values with commas or quotes must be quoted.

- [ ] **Step 3: Verify and commit**

Run:

```powershell
npm run test -- src/modules/reports/progress-report.test.ts
git add src/modules/reports/progress-report.ts src/modules/reports/progress-report.test.ts
git commit -m "feat: add progress report read model"
```

Expected: tests pass and commit succeeds.

## Task 2: Add Prisma Reporting Repository

**Files:**
- Create: `src/modules/reports/prisma-repository.test.ts`
- Create: `src/modules/reports/prisma-repository.ts`

- [ ] **Step 1: Write query-shape tests**

Tests must assert:

- all report queries include `organizationId`.
- learner and manager report queries include `membershipId: { in: [...] }`.
- admin report queries omit the membership filter.
- selected fields include course, learner user, progress, certificate, and last event data.

- [ ] **Step 2: Implement repository**

Export:

```ts
export type ProgressReportRepository = {
  listProgressRows(input: { organizationId: string; scope: ProgressReportScope }): Promise<ProgressReportRow[]>;
};

export function createPrismaProgressReportRepository(client: PrismaProgressReportClient): ProgressReportRepository;
```

Map missing `AssignmentProgress` to `0` percent and `null` last event.

- [ ] **Step 3: Verify and commit**

Run:

```powershell
npm run test -- src/modules/reports/prisma-repository.test.ts
git add src/modules/reports/prisma-repository.ts src/modules/reports/prisma-repository.test.ts
git commit -m "feat: add progress report prisma repository"
```

Expected: tests pass and commit succeeds.

## Task 3: Add Report Pages

**Files:**
- Create: `src/app/org/[slug]/reports/page.tsx`
- Create: `src/app/org/[slug]/admin/reports/page.tsx`
- Create: `src/modules/reports/page-shells.test.ts`

- [ ] **Step 1: Write page tests**

Tests must assert:

- learner/manager report page renders a progress table.
- admin report page renders organization-wide progress.
- CSV export link points to `/api/org/{slug}/reports/progress.csv`.
- empty results show a stable empty state.

- [ ] **Step 2: Implement pages**

Pages must:

- call `requireOrganizationMemberBySlug`.
- derive `ProgressReportScope` from the auth context.
- load rows through `createPrismaProgressReportRepository(prisma)`.
- render compact tables with learner, course, status, percent, due date, and certificate link.

- [ ] **Step 3: Verify and commit**

Run:

```powershell
npm run test -- src/modules/reports/page-shells.test.ts
npm run build
git add src/app/org/[slug]/reports/page.tsx src/app/org/[slug]/admin/reports/page.tsx src/modules/reports/page-shells.test.ts
git commit -m "feat: add progress report pages"
```

Expected: tests and build pass.

## Task 4: Add CSV Export Route

**Files:**
- Create: `src/app/api/org/[slug]/reports/progress.csv/route.ts`
- Create: `src/modules/reports/export-route.test.ts`

- [ ] **Step 1: Write export route tests**

Tests must prove:

- authorized learners receive their own CSV rows.
- managers receive direct-report rows.
- admins receive organization rows.
- unauthenticated requests return `401`.
- authorized users from another organization receive no rows.

- [ ] **Step 2: Implement export route**

The route must:

- call `requireOrganizationMemberBySlug`.
- derive report scope.
- load rows through the Prisma repository.
- return `text/csv; charset=utf-8`.
- set `Content-Disposition` to `attachment; filename="learnhub-progress.csv"`.

- [ ] **Step 3: Verify and commit**

Run:

```powershell
npm run test -- src/modules/reports/export-route.test.ts
git add src/app/api/org/[slug]/reports/progress.csv/route.ts src/modules/reports/export-route.test.ts
git commit -m "feat: add progress report csv export"
```

Expected: tests pass and commit succeeds.

## Task 5: Final Verification

Run:

```powershell
npm run test
npm run lint
npx prisma validate
npm run prisma:generate
npx tsc --noEmit --incremental false
npm run build
```

Expected: all commands exit `0`.
