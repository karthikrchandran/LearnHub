# Reporting And Analytics Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete tenant-scoped reporting and analytics for a commercial multi-tenant LMS, including course completion, scoring, timing, popularity, satisfaction, quiz difficulty, certificate/credential, platform aggregate, and CSV export surfaces.

**Architecture:** Reporting stays read-only and lives behind pure report modules plus one Prisma repository adapter. Organization pages and CSV routes share the same `ProgressReportScope` visibility filters, while the platform aggregate report is reachable only from `requirePlatformOwner()` and never appears in organization routes.

**Tech Stack:** Next.js App Router pages and route handlers, TypeScript, Prisma 7, PostgreSQL, Vitest, existing auth guards, existing progress-report scope helpers, Task 3 knowledge-check and feedback models.

---

## Scope Boundary

This plan assumes the existing progress reporting slice is present and the Task 3 knowledge-checks/scoring/feedback work has added `KnowledgeCheckAttempt` and `CourseFeedback`. If Task 3 has not landed in the execution branch, execute that plan first and then run this plan without changing this reporting scope.

This plan does not add scheduled reports, chart libraries, event warehouses, custom report builders, public signup analytics, cross-tenant organization-user views, report document export, or new runtime tracking events. Popularity uses data already available from assignments, progress events, video progress, SCORM launches, completions, and ratings.

## File Structure

- Create: `src/modules/reports/course-completion-report.ts` - course-level assigned, started, completed, overdue, and completion-rate read model plus CSV formatter.
- Create: `src/modules/reports/course-completion-report.test.ts` - aggregation, organization filtering, and CSV tests.
- Create: `src/modules/reports/scoring-report.ts` - course-level average score, best score, latest score, pass/fail rate read model plus CSV formatter.
- Create: `src/modules/reports/scoring-report.test.ts` - scoring aggregation, pass/fail, organization filtering, and CSV tests.
- Create: `src/modules/reports/timing-report.ts` - course-level average time, total time, and last-activity read model plus CSV formatter.
- Create: `src/modules/reports/timing-report.test.ts` - timing aggregation, native/SCORM input normalization, and CSV tests.
- Create: `src/modules/reports/popularity-report.ts` - most viewed, most enrolled, most completed, and highest-rated course read model.
- Create: `src/modules/reports/popularity-report.test.ts` - popularity ranking and organization filtering tests.
- Create: `src/modules/reports/satisfaction-report.ts` - Task 3 learner rating and feedback aggregation plus CSV formatter.
- Create: `src/modules/reports/satisfaction-report.test.ts` - rating average, feedback snippets, scope filtering, and CSV tests.
- Create: `src/modules/reports/quiz-difficulty-report.ts` - Task 3 knowledge-check attempt difficulty aggregation plus CSV formatter.
- Create: `src/modules/reports/quiz-difficulty-report.test.ts` - correct rate, missed answers, ordering, and CSV tests.
- Create: `src/modules/reports/certificate-credential-report.ts` - certificate URL, issued date, credential provider, credential status, provider URL, and failure-message rows plus CSV formatter.
- Create: `src/modules/reports/certificate-credential-report.test.ts` - certificate/credential mapping, missing credential values, scope filtering, and CSV tests.
- Create: `src/modules/reports/platform-aggregate-report.ts` - platform-owner organization aggregate rows.
- Create: `src/modules/reports/platform-aggregate-report.test.ts` - cross-organization aggregation and tenant-data boundary tests.
- Modify: `src/modules/reports/prisma-repository.ts` - preserve `createPrismaProgressReportRepository` and add `createPrismaReportsRepository` with methods for all reports.
- Modify: `src/modules/reports/prisma-repository.test.ts` - query-shape and mapping tests for new repository methods.
- Modify: `src/modules/reports/export-route.test.ts` - route tests for completions, scoring, timing, satisfaction, quiz difficulty, and certificates CSV exports.
- Modify: `src/modules/reports/page-shells.test.ts` - page shell tests for organization admin, organization member, and platform owner reporting pages.
- Modify: `src/app/org/[slug]/admin/reports/page.tsx` - admin report dashboard with organization-wide reports and CSV links.
- Modify: `src/app/org/[slug]/reports/page.tsx` - learner/manager report dashboard with scoped report rows and CSV links.
- Modify: `src/app/platform/page.tsx` - platform aggregate report table for platform owners only.
- Create: `src/app/api/org/[slug]/reports/completions.csv/route.ts` - scoped course completion CSV export.
- Create: `src/app/api/org/[slug]/reports/scoring.csv/route.ts` - scoped scoring CSV export.
- Create: `src/app/api/org/[slug]/reports/timing.csv/route.ts` - scoped timing CSV export.
- Create: `src/app/api/org/[slug]/reports/satisfaction.csv/route.ts` - scoped satisfaction CSV export.
- Create: `src/app/api/org/[slug]/reports/quiz-difficulty.csv/route.ts` - scoped quiz difficulty CSV export.
- Create: `src/app/api/org/[slug]/reports/certificates.csv/route.ts` - scoped certificate and credential CSV export.

## Report Contracts

Add these shared contracts through the new report modules and `src/modules/reports/prisma-repository.ts`:

```ts
import type { ProgressReportScope } from "./progress-report";

export type OrganizationReportInput = {
  organizationId: string;
  scope: ProgressReportScope;
};

export type PlatformReportInput = {
  requestedByPlatformOwner: true;
};
```

Each organization report method must accept `OrganizationReportInput`. Use `resolveProgressReportScope(context, organizationId, directReports)` in both pages and CSV routes, then pass the resulting scope into the repository. The same scope must produce the same rows for on-screen tables and CSV exports.

### Row Shapes

Use these row shapes exactly. `CertificateCredentialReportRow.credentialStatus` is a reporting-only union because `NOT_REQUESTED` represents the absence of any credential issuance and must not be replaced by a generated provider enum.

```ts
export type CourseCompletionReportRow = {
  courseId: string;
  courseTitle: string;
  assignedCount: number;
  startedCount: number;
  completedCount: number;
  overdueCount: number;
  completionRate: number;
};

export type ScoringReportRow = {
  courseId: string;
  courseTitle: string;
  attemptCount: number;
  averageScore: number | null;
  bestScore: number | null;
  latestScore: number | null;
  passedCount: number;
  failedCount: number;
  passRate: number;
  failRate: number;
};

export type TimingReportRow = {
  courseId: string;
  courseTitle: string;
  assignmentCount: number;
  averageTimeSeconds: number;
  totalTimeSeconds: number;
  lastActivityAt: Date | null;
};

export type PopularityReportRow = {
  courseId: string;
  courseTitle: string;
  viewCount: number;
  enrolledCount: number;
  completedCount: number;
  averageRating: number | null;
  ratingCount: number;
};

export type SatisfactionFeedbackSnippet = {
  learnerName: string;
  learnerEmail: string;
  rating: number;
  feedback: string;
  submittedAt: Date;
};

export type SatisfactionReportRow = {
  courseId: string;
  courseTitle: string;
  ratingCount: number;
  averageRating: number | null;
  feedbackCount: number;
  latestFeedback: SatisfactionFeedbackSnippet[];
};

export type QuizDifficultyReportRow = {
  courseId: string;
  courseTitle: string;
  questionId: string;
  prompt: string;
  attemptCount: number;
  correctCount: number;
  incorrectCount: number;
  correctRate: number;
  failRate: number;
  averageScore: number;
  commonlyMissedAnswerIds: string[];
};

export type CertificateCredentialReportRow = {
  certificateId: string;
  learnerName: string;
  learnerEmail: string;
  courseId: string;
  courseTitle: string;
  certificateUrl: string;
  issuedAt: Date;
  credentialProvider: "CREDLY" | null;
  credentialStatus: "NOT_REQUESTED" | "PENDING" | "SUCCEEDED" | "FAILED";
  providerUrl: string | null;
  failureMessage: string | null;
};

export type PlatformAggregateReportRow = {
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  activeLearnerCount: number;
  courseCount: number;
  assignmentCount: number;
  completedAssignmentCount: number;
  completionRate: number;
  certificateCount: number;
  averageRating: number | null;
  lastActivityAt: Date | null;
};
```

### Repository Contract

Update `src/modules/reports/prisma-repository.ts` to export:

```ts
export type ReportsRepository = ProgressReportRepository & {
  listCourseCompletionRows(input: OrganizationReportInput): Promise<CourseCompletionReportRow[]>;
  listScoringRows(input: OrganizationReportInput): Promise<ScoringReportRow[]>;
  listTimingRows(input: OrganizationReportInput): Promise<TimingReportRow[]>;
  listPopularityRows(input: OrganizationReportInput): Promise<PopularityReportRow[]>;
  listSatisfactionRows(input: OrganizationReportInput): Promise<SatisfactionReportRow[]>;
  listQuizDifficultyRows(input: OrganizationReportInput): Promise<QuizDifficultyReportRow[]>;
  listCertificateCredentialRows(input: OrganizationReportInput): Promise<CertificateCredentialReportRow[]>;
  listPlatformAggregateRows(input: PlatformReportInput): Promise<PlatformAggregateReportRow[]>;
};

export function createPrismaReportsRepository(client: PrismaReportsClient): ReportsRepository;
export function createPrismaProgressReportRepository(client: PrismaProgressReportClient): ProgressReportRepository;
```

Keep `createPrismaProgressReportRepository(client)` as a compatibility export by returning the progress subset from `createPrismaReportsRepository(client)`.

### Tenant And Platform Boundaries

- Organization report pages use `requireOrganizationMemberBySlug(slug)` for learner/manager views and `requireOrganizationUsersAdminBySlug(slug)` for admin reports.
- CSV routes use `requireOrganizationMemberBySlug(slug)`, `loadDirectReportTargets`, and `resolveProgressReportScope` so learners get their own rows, managers get direct-report rows, admins get organization rows, and cross-organization memberships get zero rows.
- Repository organization methods never query without `organizationId`.
- Repository organization methods apply `membershipId: { in: scope.membershipIds }` for `learner` and `manager` scopes and omit membership filtering only for `admin`.
- Platform aggregate rows are loaded only after `requirePlatformOwner()` in `src/app/platform/page.tsx`.
- `listPlatformAggregateRows` must not be called from `src/app/org/[slug]/**` routes or pages.
- Organization users never receive cross-tenant platform aggregate data through organization pages or CSV routes.

### CSV Rules

Each CSV formatter must:

- use stable header order.
- convert `Date` values with `toISOString()`.
- convert `null` and `undefined` values to an empty cell.
- convert booleans to `true` or `false`.
- quote cells containing a comma, quote, carriage return, or newline.
- escape quotes inside quoted cells by doubling them.
- join rows with `\r\n`.

Every CSV route must return:

```ts
new Response(csv, {
  headers: {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": 'attachment; filename="learnhub-completions.csv"',
  },
});
```

Use the report-specific filenames listed in Task 9 for the other CSV routes.

## Task 1: Add Course Completion Report Module

**Files:**
- Create: `src/modules/reports/course-completion-report.test.ts`
- Create: `src/modules/reports/course-completion-report.ts`

- [ ] **Step 1: Write the failing test**

Create `src/modules/reports/course-completion-report.test.ts` with tests that prove assigned, started, completed, overdue, and completion rate by course:

```ts
import { describe, expect, it } from "vitest";

import {
  buildCourseCompletionReportRows,
  formatCourseCompletionReportCsv,
} from "./course-completion-report";

describe("course completion report", () => {
  it("aggregates assignment status counts and completion rate by course", () => {
    const rows = buildCourseCompletionReportRows(
      [
        { organizationId: "org_1", courseId: "course_1", courseTitle: "Safety", status: "ASSIGNED", progressPercent: 0 },
        { organizationId: "org_1", courseId: "course_1", courseTitle: "Safety", status: "IN_PROGRESS", progressPercent: 25 },
        { organizationId: "org_1", courseId: "course_1", courseTitle: "Safety", status: "COMPLETED", progressPercent: 100 },
        { organizationId: "org_1", courseId: "course_1", courseTitle: "Safety", status: "OVERDUE", progressPercent: 10 },
        { organizationId: "org_2", courseId: "course_1", courseTitle: "Other Safety", status: "COMPLETED", progressPercent: 100 },
      ],
      "org_1",
    );

    expect(rows).toEqual([
      {
        courseId: "course_1",
        courseTitle: "Safety",
        assignedCount: 4,
        startedCount: 3,
        completedCount: 1,
        overdueCount: 1,
        completionRate: 25,
      },
    ]);
  });

  it("formats CSV with quoted course names and percentage columns", () => {
    const csv = formatCourseCompletionReportCsv([
      {
        courseId: "course_1",
        courseTitle: 'Safety, "Basics"',
        assignedCount: 4,
        startedCount: 3,
        completedCount: 1,
        overdueCount: 1,
        completionRate: 25,
      },
    ]);

    expect(csv).toBe(
      [
        "Course ID,Course Title,Assigned,Started,Completed,Overdue,Completion Rate",
        'course_1,"Safety, ""Basics""",4,3,1,1,25',
      ].join("\r\n"),
    );
  });
});
```

- [ ] **Step 2: Run the focused failing test**

Run:

```powershell
npm run test -- src/modules/reports/course-completion-report.test.ts
```

Expected: fail because `src/modules/reports/course-completion-report.ts` does not exist.

- [ ] **Step 3: Implement the report module**

Create `src/modules/reports/course-completion-report.ts` with:

```ts
export type CourseCompletionAssignmentInput = {
  organizationId: string;
  courseId: string;
  courseTitle: string;
  status: "ASSIGNED" | "IN_PROGRESS" | "COMPLETED" | "OVERDUE";
  progressPercent: number;
};

export type CourseCompletionReportRow = {
  courseId: string;
  courseTitle: string;
  assignedCount: number;
  startedCount: number;
  completedCount: number;
  overdueCount: number;
  completionRate: number;
};

export function buildCourseCompletionReportRows(
  assignments: CourseCompletionAssignmentInput[],
  organizationId: string,
): CourseCompletionReportRow[] {
  const grouped = new Map<string, CourseCompletionReportRow>();

  for (const assignment of assignments.filter((row) => row.organizationId === organizationId)) {
    const row =
      grouped.get(assignment.courseId) ??
      {
        courseId: assignment.courseId,
        courseTitle: assignment.courseTitle,
        assignedCount: 0,
        startedCount: 0,
        completedCount: 0,
        overdueCount: 0,
        completionRate: 0,
      };

    row.assignedCount += 1;
    row.startedCount += assignment.status !== "ASSIGNED" || assignment.progressPercent > 0 ? 1 : 0;
    row.completedCount += assignment.status === "COMPLETED" ? 1 : 0;
    row.overdueCount += assignment.status === "OVERDUE" ? 1 : 0;
    row.completionRate = percentage(row.completedCount, row.assignedCount);
    grouped.set(assignment.courseId, row);
  }

  return [...grouped.values()].sort((left, right) => left.courseTitle.localeCompare(right.courseTitle));
}

export function formatCourseCompletionReportCsv(rows: CourseCompletionReportRow[]): string {
  return formatCsv([
    ["Course ID", "Course Title", "Assigned", "Started", "Completed", "Overdue", "Completion Rate"],
    ...rows.map((row) => [
      row.courseId,
      row.courseTitle,
      row.assignedCount,
      row.startedCount,
      row.completedCount,
      row.overdueCount,
      row.completionRate,
    ]),
  ]);
}

function percentage(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : Math.round((numerator / denominator) * 100);
}

function formatCsv(rows: Array<Array<string | number | boolean | Date | null | undefined>>): string {
  return rows.map((row) => row.map(formatCsvCell).join(",")).join("\r\n");
}

function formatCsvCell(value: string | number | boolean | Date | null | undefined): string {
  const text = value instanceof Date ? value.toISOString() : value == null ? "" : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
```

- [ ] **Step 4: Run the focused passing test**

Run:

```powershell
npm run test -- src/modules/reports/course-completion-report.test.ts
```

Expected: pass.

- [ ] **Step 5: Commit checkpoint**

Run:

```powershell
git add src/modules/reports/course-completion-report.ts src/modules/reports/course-completion-report.test.ts
git commit -m "feat: add course completion report model"
```

Expected: commit succeeds.

## Task 2: Add Scoring Report Module

**Files:**
- Create: `src/modules/reports/scoring-report.test.ts`
- Create: `src/modules/reports/scoring-report.ts`

- [ ] **Step 1: Write the failing test**

Create `src/modules/reports/scoring-report.test.ts` with tests for average score, best score, latest score, and pass/fail rate:

```ts
import { describe, expect, it } from "vitest";

import { buildScoringReportRows, formatScoringReportCsv } from "./scoring-report";

describe("scoring report", () => {
  it("aggregates score metrics by course and organization", () => {
    const rows = buildScoringReportRows(
      [
        { organizationId: "org_1", courseId: "course_1", courseTitle: "Safety", scorePercent: 50, correct: false, submittedAt: new Date("2026-06-13T10:00:00.000Z") },
        { organizationId: "org_1", courseId: "course_1", courseTitle: "Safety", scorePercent: 100, correct: true, submittedAt: new Date("2026-06-13T11:00:00.000Z") },
        { organizationId: "org_1", courseId: "course_1", courseTitle: "Safety", scorePercent: 0, correct: false, submittedAt: new Date("2026-06-13T09:00:00.000Z") },
        { organizationId: "org_2", courseId: "course_1", courseTitle: "Other", scorePercent: 100, correct: true, submittedAt: new Date("2026-06-13T12:00:00.000Z") },
      ],
      "org_1",
    );

    expect(rows).toEqual([
      {
        courseId: "course_1",
        courseTitle: "Safety",
        attemptCount: 3,
        averageScore: 50,
        bestScore: 100,
        latestScore: 100,
        passedCount: 1,
        failedCount: 2,
        passRate: 33,
        failRate: 67,
      },
    ]);
  });

  it("keeps empty score fields null when a course has no attempts", () => {
    expect(buildScoringReportRows([], "org_1")).toEqual([]);
  });

  it("formats CSV with pass and fail rates", () => {
    expect(
      formatScoringReportCsv([
        {
          courseId: "course_1",
          courseTitle: "Safety",
          attemptCount: 3,
          averageScore: 50,
          bestScore: 100,
          latestScore: 100,
          passedCount: 1,
          failedCount: 2,
          passRate: 33,
          failRate: 67,
        },
      ]),
    ).toContain("Average Score,Best Score,Latest Score,Passed,Failed,Pass Rate,Fail Rate");
  });
});
```

- [ ] **Step 2: Run the focused failing test**

Run:

```powershell
npm run test -- src/modules/reports/scoring-report.test.ts
```

Expected: fail because `src/modules/reports/scoring-report.ts` does not exist.

- [ ] **Step 3: Implement the report module**

Create `src/modules/reports/scoring-report.ts` with:

```ts
export type ScoringAttemptInput = {
  organizationId: string;
  courseId: string;
  courseTitle: string;
  scorePercent: number;
  correct: boolean;
  submittedAt: Date;
};

export type ScoringReportRow = {
  courseId: string;
  courseTitle: string;
  attemptCount: number;
  averageScore: number | null;
  bestScore: number | null;
  latestScore: number | null;
  passedCount: number;
  failedCount: number;
  passRate: number;
  failRate: number;
};

export function buildScoringReportRows(attempts: ScoringAttemptInput[], organizationId: string): ScoringReportRow[] {
  const grouped = new Map<string, ScoringAttemptInput[]>();

  for (const attempt of attempts.filter((row) => row.organizationId === organizationId)) {
    grouped.set(attempt.courseId, [...(grouped.get(attempt.courseId) ?? []), attempt]);
  }

  return [...grouped.entries()]
    .map(([courseId, courseAttempts]) => {
      const latest = [...courseAttempts].sort((left, right) => right.submittedAt.getTime() - left.submittedAt.getTime())[0];
      const passedCount = courseAttempts.filter((attempt) => attempt.correct).length;
      const failedCount = courseAttempts.length - passedCount;

      return {
        courseId,
        courseTitle: courseAttempts[0].courseTitle,
        attemptCount: courseAttempts.length,
        averageScore: roundedAverage(courseAttempts.map((attempt) => attempt.scorePercent)),
        bestScore: Math.max(...courseAttempts.map((attempt) => attempt.scorePercent)),
        latestScore: latest.scorePercent,
        passedCount,
        failedCount,
        passRate: percentage(passedCount, courseAttempts.length),
        failRate: percentage(failedCount, courseAttempts.length),
      };
    })
    .sort((left, right) => left.courseTitle.localeCompare(right.courseTitle));
}

export function formatScoringReportCsv(rows: ScoringReportRow[]): string {
  return formatCsv([
    ["Course ID", "Course Title", "Attempts", "Average Score", "Best Score", "Latest Score", "Passed", "Failed", "Pass Rate", "Fail Rate"],
    ...rows.map((row) => [
      row.courseId,
      row.courseTitle,
      row.attemptCount,
      row.averageScore,
      row.bestScore,
      row.latestScore,
      row.passedCount,
      row.failedCount,
      row.passRate,
      row.failRate,
    ]),
  ]);
}

function roundedAverage(values: number[]): number | null {
  return values.length === 0 ? null : Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function percentage(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : Math.round((numerator / denominator) * 100);
}

function formatCsv(rows: Array<Array<string | number | boolean | Date | null | undefined>>): string {
  return rows.map((row) => row.map(formatCsvCell).join(",")).join("\r\n");
}

function formatCsvCell(value: string | number | boolean | Date | null | undefined): string {
  const text = value instanceof Date ? value.toISOString() : value == null ? "" : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
```

- [ ] **Step 4: Run the focused passing test**

Run:

```powershell
npm run test -- src/modules/reports/scoring-report.test.ts
```

Expected: pass.

- [ ] **Step 5: Commit checkpoint**

Run:

```powershell
git add src/modules/reports/scoring-report.ts src/modules/reports/scoring-report.test.ts
git commit -m "feat: add scoring report model"
```

Expected: commit succeeds.

## Task 3: Add Timing Report Module

**Files:**
- Create: `src/modules/reports/timing-report.test.ts`
- Create: `src/modules/reports/timing-report.ts`

- [ ] **Step 1: Write the failing test**

Create `src/modules/reports/timing-report.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { buildTimingReportRows, formatTimingReportCsv } from "./timing-report";

describe("timing report", () => {
  it("aggregates average time, total time, and last activity by course", () => {
    expect(
      buildTimingReportRows(
        [
          { organizationId: "org_1", courseId: "course_1", courseTitle: "Safety", timeSeconds: 300, lastActivityAt: new Date("2026-06-13T10:00:00.000Z") },
          { organizationId: "org_1", courseId: "course_1", courseTitle: "Safety", timeSeconds: 900, lastActivityAt: new Date("2026-06-13T12:00:00.000Z") },
          { organizationId: "org_2", courseId: "course_1", courseTitle: "Other", timeSeconds: 999, lastActivityAt: new Date("2026-06-13T13:00:00.000Z") },
        ],
        "org_1",
      ),
    ).toEqual([
      {
        courseId: "course_1",
        courseTitle: "Safety",
        assignmentCount: 2,
        averageTimeSeconds: 600,
        totalTimeSeconds: 1200,
        lastActivityAt: new Date("2026-06-13T12:00:00.000Z"),
      },
    ]);
  });

  it("formats CSV with ISO last activity", () => {
    expect(
      formatTimingReportCsv([
        {
          courseId: "course_1",
          courseTitle: "Safety",
          assignmentCount: 2,
          averageTimeSeconds: 600,
          totalTimeSeconds: 1200,
          lastActivityAt: new Date("2026-06-13T12:00:00.000Z"),
        },
      ]),
    ).toBe(
      [
        "Course ID,Course Title,Assignments,Average Time Seconds,Total Time Seconds,Last Activity",
        "course_1,Safety,2,600,1200,2026-06-13T12:00:00.000Z",
      ].join("\r\n"),
    );
  });
});
```

- [ ] **Step 2: Run the focused failing test**

Run:

```powershell
npm run test -- src/modules/reports/timing-report.test.ts
```

Expected: fail because `src/modules/reports/timing-report.ts` does not exist.

- [ ] **Step 3: Implement the report module**

Create `src/modules/reports/timing-report.ts` with:

```ts
export type TimingAssignmentInput = {
  organizationId: string;
  courseId: string;
  courseTitle: string;
  timeSeconds: number;
  lastActivityAt: Date | null;
};

export type TimingReportRow = {
  courseId: string;
  courseTitle: string;
  assignmentCount: number;
  averageTimeSeconds: number;
  totalTimeSeconds: number;
  lastActivityAt: Date | null;
};

export function buildTimingReportRows(assignments: TimingAssignmentInput[], organizationId: string): TimingReportRow[] {
  const grouped = new Map<string, TimingAssignmentInput[]>();

  for (const assignment of assignments.filter((row) => row.organizationId === organizationId)) {
    grouped.set(assignment.courseId, [...(grouped.get(assignment.courseId) ?? []), assignment]);
  }

  return [...grouped.entries()]
    .map(([courseId, courseAssignments]) => {
      const totalTimeSeconds = courseAssignments.reduce((sum, assignment) => sum + assignment.timeSeconds, 0);
      const activityTimes = courseAssignments
        .map((assignment) => assignment.lastActivityAt)
        .filter((value): value is Date => value instanceof Date)
        .sort((left, right) => right.getTime() - left.getTime());

      return {
        courseId,
        courseTitle: courseAssignments[0].courseTitle,
        assignmentCount: courseAssignments.length,
        averageTimeSeconds: Math.round(totalTimeSeconds / courseAssignments.length),
        totalTimeSeconds,
        lastActivityAt: activityTimes[0] ?? null,
      };
    })
    .sort((left, right) => left.courseTitle.localeCompare(right.courseTitle));
}

export function formatTimingReportCsv(rows: TimingReportRow[]): string {
  return formatCsv([
    ["Course ID", "Course Title", "Assignments", "Average Time Seconds", "Total Time Seconds", "Last Activity"],
    ...rows.map((row) => [
      row.courseId,
      row.courseTitle,
      row.assignmentCount,
      row.averageTimeSeconds,
      row.totalTimeSeconds,
      row.lastActivityAt,
    ]),
  ]);
}

function formatCsv(rows: Array<Array<string | number | boolean | Date | null | undefined>>): string {
  return rows.map((row) => row.map(formatCsvCell).join(",")).join("\r\n");
}

function formatCsvCell(value: string | number | boolean | Date | null | undefined): string {
  const text = value instanceof Date ? value.toISOString() : value == null ? "" : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
```

- [ ] **Step 4: Run the focused passing test**

Run:

```powershell
npm run test -- src/modules/reports/timing-report.test.ts
```

Expected: pass.

- [ ] **Step 5: Commit checkpoint**

Run:

```powershell
git add src/modules/reports/timing-report.ts src/modules/reports/timing-report.test.ts
git commit -m "feat: add timing report model"
```

Expected: commit succeeds.

## Task 4: Add Popularity Report Module

**Files:**
- Create: `src/modules/reports/popularity-report.test.ts`
- Create: `src/modules/reports/popularity-report.ts`

- [ ] **Step 1: Write the failing test**

Create `src/modules/reports/popularity-report.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
  buildPopularityReportRows,
  highestRatedCourses,
  mostCompletedCourses,
  mostEnrolledCourses,
  mostViewedCourses,
} from "./popularity-report";

describe("popularity report", () => {
  it("builds most viewed, most enrolled, most completed, and highest-rated courses", () => {
    const rows = buildPopularityReportRows(
      [
        { organizationId: "org_1", courseId: "course_1", courseTitle: "Safety", viewCount: 10, enrolledCount: 4, completedCount: 2, ratingSum: 9, ratingCount: 2 },
        { organizationId: "org_1", courseId: "course_2", courseTitle: "Ethics", viewCount: 5, enrolledCount: 8, completedCount: 5, ratingSum: 15, ratingCount: 3 },
        { organizationId: "org_2", courseId: "course_3", courseTitle: "Other", viewCount: 99, enrolledCount: 99, completedCount: 99, ratingSum: 5, ratingCount: 1 },
      ],
      "org_1",
    );

    expect(mostViewedCourses(rows)[0].courseTitle).toBe("Safety");
    expect(mostEnrolledCourses(rows)[0].courseTitle).toBe("Ethics");
    expect(mostCompletedCourses(rows)[0].courseTitle).toBe("Ethics");
    expect(highestRatedCourses(rows)[0]).toMatchObject({ courseTitle: "Ethics", averageRating: 5 });
  });
});
```

- [ ] **Step 2: Run the focused failing test**

Run:

```powershell
npm run test -- src/modules/reports/popularity-report.test.ts
```

Expected: fail because `src/modules/reports/popularity-report.ts` does not exist.

- [ ] **Step 3: Implement the report module**

Create `src/modules/reports/popularity-report.ts` with:

```ts
export type PopularityReportInput = {
  organizationId: string;
  courseId: string;
  courseTitle: string;
  viewCount: number;
  enrolledCount: number;
  completedCount: number;
  ratingSum: number;
  ratingCount: number;
};

export type PopularityReportRow = {
  courseId: string;
  courseTitle: string;
  viewCount: number;
  enrolledCount: number;
  completedCount: number;
  averageRating: number | null;
  ratingCount: number;
};

export function buildPopularityReportRows(inputs: PopularityReportInput[], organizationId: string): PopularityReportRow[] {
  return inputs
    .filter((input) => input.organizationId === organizationId)
    .map((input) => ({
      courseId: input.courseId,
      courseTitle: input.courseTitle,
      viewCount: input.viewCount,
      enrolledCount: input.enrolledCount,
      completedCount: input.completedCount,
      averageRating: input.ratingCount === 0 ? null : Math.round((input.ratingSum / input.ratingCount) * 10) / 10,
      ratingCount: input.ratingCount,
    }))
    .sort((left, right) => left.courseTitle.localeCompare(right.courseTitle));
}

export function mostViewedCourses(rows: PopularityReportRow[]): PopularityReportRow[] {
  return [...rows].sort((left, right) => right.viewCount - left.viewCount || left.courseTitle.localeCompare(right.courseTitle));
}

export function mostEnrolledCourses(rows: PopularityReportRow[]): PopularityReportRow[] {
  return [...rows].sort((left, right) => right.enrolledCount - left.enrolledCount || left.courseTitle.localeCompare(right.courseTitle));
}

export function mostCompletedCourses(rows: PopularityReportRow[]): PopularityReportRow[] {
  return [...rows].sort((left, right) => right.completedCount - left.completedCount || left.courseTitle.localeCompare(right.courseTitle));
}

export function highestRatedCourses(rows: PopularityReportRow[]): PopularityReportRow[] {
  return [...rows]
    .filter((row) => row.averageRating !== null)
    .sort((left, right) => (right.averageRating ?? 0) - (left.averageRating ?? 0) || right.ratingCount - left.ratingCount);
}
```

- [ ] **Step 4: Run the focused passing test**

Run:

```powershell
npm run test -- src/modules/reports/popularity-report.test.ts
```

Expected: pass.

- [ ] **Step 5: Commit checkpoint**

Run:

```powershell
git add src/modules/reports/popularity-report.ts src/modules/reports/popularity-report.test.ts
git commit -m "feat: add popularity report model"
```

Expected: commit succeeds.

## Task 5: Add Satisfaction Report Module

**Files:**
- Create: `src/modules/reports/satisfaction-report.test.ts`
- Create: `src/modules/reports/satisfaction-report.ts`

- [ ] **Step 1: Write the failing test**

Create `src/modules/reports/satisfaction-report.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { buildSatisfactionReportRows, formatSatisfactionReportCsv } from "./satisfaction-report";

describe("satisfaction report", () => {
  it("uses Task 3 learner ratings and feedback by course", () => {
    const rows = buildSatisfactionReportRows(
      [
        { organizationId: "org_1", courseId: "course_1", courseTitle: "Safety", learnerName: "Ada Lovelace", learnerEmail: "ada@example.com", rating: 5, feedback: "Useful", submittedAt: new Date("2026-06-13T10:00:00.000Z") },
        { organizationId: "org_1", courseId: "course_1", courseTitle: "Safety", learnerName: "Grace Hopper", learnerEmail: "grace@example.com", rating: 3, feedback: "", submittedAt: new Date("2026-06-13T11:00:00.000Z") },
        { organizationId: "org_2", courseId: "course_1", courseTitle: "Other", learnerName: "Other", learnerEmail: "other@example.com", rating: 1, feedback: "No", submittedAt: new Date("2026-06-13T12:00:00.000Z") },
      ],
      "org_1",
    );

    expect(rows).toEqual([
      {
        courseId: "course_1",
        courseTitle: "Safety",
        ratingCount: 2,
        averageRating: 4,
        feedbackCount: 1,
        latestFeedback: [
          {
            learnerName: "Ada Lovelace",
            learnerEmail: "ada@example.com",
            rating: 5,
            feedback: "Useful",
            submittedAt: new Date("2026-06-13T10:00:00.000Z"),
          },
        ],
      },
    ]);
  });

  it("formats satisfaction CSV without losing learner feedback quotes", () => {
    expect(
      formatSatisfactionReportCsv([
        {
          courseId: "course_1",
          courseTitle: "Safety",
          ratingCount: 1,
          averageRating: 5,
          feedbackCount: 1,
          latestFeedback: [
            {
              learnerName: "Ada Lovelace",
              learnerEmail: "ada@example.com",
              rating: 5,
              feedback: 'Great, "clear" course',
              submittedAt: new Date("2026-06-13T10:00:00.000Z"),
            },
          ],
        },
      ]),
    ).toContain('"Great, ""clear"" course"');
  });
});
```

- [ ] **Step 2: Run the focused failing test**

Run:

```powershell
npm run test -- src/modules/reports/satisfaction-report.test.ts
```

Expected: fail because `src/modules/reports/satisfaction-report.ts` does not exist.

- [ ] **Step 3: Implement the report module**

Create `src/modules/reports/satisfaction-report.ts` with:

```ts
export type SatisfactionReportInput = {
  organizationId: string;
  courseId: string;
  courseTitle: string;
  learnerName: string;
  learnerEmail: string;
  rating: number;
  feedback: string;
  submittedAt: Date;
};

export type SatisfactionFeedbackSnippet = {
  learnerName: string;
  learnerEmail: string;
  rating: number;
  feedback: string;
  submittedAt: Date;
};

export type SatisfactionReportRow = {
  courseId: string;
  courseTitle: string;
  ratingCount: number;
  averageRating: number | null;
  feedbackCount: number;
  latestFeedback: SatisfactionFeedbackSnippet[];
};

export function buildSatisfactionReportRows(inputs: SatisfactionReportInput[], organizationId: string): SatisfactionReportRow[] {
  const grouped = new Map<string, SatisfactionReportInput[]>();

  for (const input of inputs.filter((row) => row.organizationId === organizationId)) {
    grouped.set(input.courseId, [...(grouped.get(input.courseId) ?? []), input]);
  }

  return [...grouped.entries()]
    .map(([courseId, courseRows]) => {
      const feedbackRows = courseRows
        .filter((row) => row.feedback.trim().length > 0)
        .sort((left, right) => right.submittedAt.getTime() - left.submittedAt.getTime())
        .slice(0, 5)
        .map((row) => ({
          learnerName: row.learnerName,
          learnerEmail: row.learnerEmail,
          rating: row.rating,
          feedback: row.feedback,
          submittedAt: row.submittedAt,
        }));

      return {
        courseId,
        courseTitle: courseRows[0].courseTitle,
        ratingCount: courseRows.length,
        averageRating: Math.round((courseRows.reduce((sum, row) => sum + row.rating, 0) / courseRows.length) * 10) / 10,
        feedbackCount: courseRows.filter((row) => row.feedback.trim().length > 0).length,
        latestFeedback: feedbackRows,
      };
    })
    .sort((left, right) => left.courseTitle.localeCompare(right.courseTitle));
}

export function formatSatisfactionReportCsv(rows: SatisfactionReportRow[]): string {
  const body = rows.flatMap((row) =>
    row.latestFeedback.length === 0
      ? [[row.courseId, row.courseTitle, row.ratingCount, row.averageRating, row.feedbackCount, "", "", "", "", ""]]
      : row.latestFeedback.map((feedback) => [
          row.courseId,
          row.courseTitle,
          row.ratingCount,
          row.averageRating,
          row.feedbackCount,
          feedback.learnerName,
          feedback.learnerEmail,
          feedback.rating,
          feedback.feedback,
          feedback.submittedAt,
        ]),
  );

  return formatCsv([
    ["Course ID", "Course Title", "Ratings", "Average Rating", "Feedback Count", "Learner Name", "Learner Email", "Learner Rating", "Feedback", "Submitted At"],
    ...body,
  ]);
}

function formatCsv(rows: Array<Array<string | number | boolean | Date | null | undefined>>): string {
  return rows.map((row) => row.map(formatCsvCell).join(",")).join("\r\n");
}

function formatCsvCell(value: string | number | boolean | Date | null | undefined): string {
  const text = value instanceof Date ? value.toISOString() : value == null ? "" : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
```

- [ ] **Step 4: Run the focused passing test**

Run:

```powershell
npm run test -- src/modules/reports/satisfaction-report.test.ts
```

Expected: pass.

- [ ] **Step 5: Commit checkpoint**

Run:

```powershell
git add src/modules/reports/satisfaction-report.ts src/modules/reports/satisfaction-report.test.ts
git commit -m "feat: add satisfaction report model"
```

Expected: commit succeeds.

## Task 6: Add Quiz Difficulty Report Module

**Files:**
- Create: `src/modules/reports/quiz-difficulty-report.test.ts`
- Create: `src/modules/reports/quiz-difficulty-report.ts`

- [ ] **Step 1: Write the failing test**

Create `src/modules/reports/quiz-difficulty-report.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { buildQuizDifficultyReportRows, formatQuizDifficultyReportCsv } from "./quiz-difficulty-report";

describe("quiz difficulty report", () => {
  it("uses Task 3 knowledge-check attempts to calculate difficulty", () => {
    const rows = buildQuizDifficultyReportRows(
      [
        { organizationId: "org_1", courseId: "course_1", courseTitle: "Safety", questionId: "q1", prompt: "Harness?", selectedAnswerIds: ["a_wrong"], correct: false, scorePercent: 0 },
        { organizationId: "org_1", courseId: "course_1", courseTitle: "Safety", questionId: "q1", prompt: "Harness?", selectedAnswerIds: ["a_right"], correct: true, scorePercent: 100 },
        { organizationId: "org_1", courseId: "course_1", courseTitle: "Safety", questionId: "q1", prompt: "Harness?", selectedAnswerIds: ["a_wrong"], correct: false, scorePercent: 0 },
        { organizationId: "org_2", courseId: "course_1", courseTitle: "Other", questionId: "q1", prompt: "Other?", selectedAnswerIds: ["x"], correct: true, scorePercent: 100 },
      ],
      "org_1",
    );

    expect(rows).toEqual([
      {
        courseId: "course_1",
        courseTitle: "Safety",
        questionId: "q1",
        prompt: "Harness?",
        attemptCount: 3,
        correctCount: 1,
        incorrectCount: 2,
        correctRate: 33,
        failRate: 67,
        averageScore: 33,
        commonlyMissedAnswerIds: ["a_wrong"],
      },
    ]);
  });

  it("formats commonly missed answer ids as a pipe-delimited CSV cell", () => {
    expect(
      formatQuizDifficultyReportCsv([
        {
          courseId: "course_1",
          courseTitle: "Safety",
          questionId: "q1",
          prompt: "Harness?",
          attemptCount: 3,
          correctCount: 1,
          incorrectCount: 2,
          correctRate: 33,
          failRate: 67,
          averageScore: 33,
          commonlyMissedAnswerIds: ["a_wrong", "b_wrong"],
        },
      ]),
    ).toContain("a_wrong|b_wrong");
  });
});
```

- [ ] **Step 2: Run the focused failing test**

Run:

```powershell
npm run test -- src/modules/reports/quiz-difficulty-report.test.ts
```

Expected: fail because `src/modules/reports/quiz-difficulty-report.ts` does not exist.

- [ ] **Step 3: Implement the report module**

Create `src/modules/reports/quiz-difficulty-report.ts` with:

```ts
export type QuizDifficultyAttemptInput = {
  organizationId: string;
  courseId: string;
  courseTitle: string;
  questionId: string;
  prompt: string;
  selectedAnswerIds: string[];
  correct: boolean;
  scorePercent: number;
};

export type QuizDifficultyReportRow = {
  courseId: string;
  courseTitle: string;
  questionId: string;
  prompt: string;
  attemptCount: number;
  correctCount: number;
  incorrectCount: number;
  correctRate: number;
  failRate: number;
  averageScore: number;
  commonlyMissedAnswerIds: string[];
};

export function buildQuizDifficultyReportRows(
  attempts: QuizDifficultyAttemptInput[],
  organizationId: string,
): QuizDifficultyReportRow[] {
  const grouped = new Map<string, QuizDifficultyAttemptInput[]>();

  for (const attempt of attempts.filter((row) => row.organizationId === organizationId)) {
    grouped.set(attempt.questionId, [...(grouped.get(attempt.questionId) ?? []), attempt]);
  }

  return [...grouped.entries()]
    .map(([questionId, questionAttempts]) => {
      const correctCount = questionAttempts.filter((attempt) => attempt.correct).length;
      const incorrectAttempts = questionAttempts.filter((attempt) => !attempt.correct);

      return {
        courseId: questionAttempts[0].courseId,
        courseTitle: questionAttempts[0].courseTitle,
        questionId,
        prompt: questionAttempts[0].prompt,
        attemptCount: questionAttempts.length,
        correctCount,
        incorrectCount: incorrectAttempts.length,
        correctRate: percentage(correctCount, questionAttempts.length),
        failRate: percentage(incorrectAttempts.length, questionAttempts.length),
        averageScore: Math.round(questionAttempts.reduce((sum, attempt) => sum + attempt.scorePercent, 0) / questionAttempts.length),
        commonlyMissedAnswerIds: mostCommonMissedAnswers(incorrectAttempts),
      };
    })
    .sort((left, right) => left.correctRate - right.correctRate || left.courseTitle.localeCompare(right.courseTitle));
}

export function formatQuizDifficultyReportCsv(rows: QuizDifficultyReportRow[]): string {
  return formatCsv([
    ["Course ID", "Course Title", "Question ID", "Prompt", "Attempts", "Correct", "Incorrect", "Correct Rate", "Fail Rate", "Average Score", "Commonly Missed Answer IDs"],
    ...rows.map((row) => [
      row.courseId,
      row.courseTitle,
      row.questionId,
      row.prompt,
      row.attemptCount,
      row.correctCount,
      row.incorrectCount,
      row.correctRate,
      row.failRate,
      row.averageScore,
      row.commonlyMissedAnswerIds.join("|"),
    ]),
  ]);
}

function mostCommonMissedAnswers(attempts: QuizDifficultyAttemptInput[]): string[] {
  const counts = new Map<string, number>();

  for (const attempt of attempts) {
    for (const answerId of attempt.selectedAnswerIds) {
      counts.set(answerId, (counts.get(answerId) ?? 0) + 1);
    }
  }

  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 5)
    .map(([answerId]) => answerId);
}

function percentage(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : Math.round((numerator / denominator) * 100);
}

function formatCsv(rows: Array<Array<string | number | boolean | Date | null | undefined>>): string {
  return rows.map((row) => row.map(formatCsvCell).join(",")).join("\r\n");
}

function formatCsvCell(value: string | number | boolean | Date | null | undefined): string {
  const text = value instanceof Date ? value.toISOString() : value == null ? "" : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
```

- [ ] **Step 4: Run the focused passing test**

Run:

```powershell
npm run test -- src/modules/reports/quiz-difficulty-report.test.ts
```

Expected: pass.

- [ ] **Step 5: Commit checkpoint**

Run:

```powershell
git add src/modules/reports/quiz-difficulty-report.ts src/modules/reports/quiz-difficulty-report.test.ts
git commit -m "feat: add quiz difficulty report model"
```

Expected: commit succeeds.

## Task 7: Add Certificate, Credential, And Platform Aggregate Report Modules

**Files:**
- Create: `src/modules/reports/certificate-credential-report.test.ts`
- Create: `src/modules/reports/certificate-credential-report.ts`
- Create: `src/modules/reports/platform-aggregate-report.test.ts`
- Create: `src/modules/reports/platform-aggregate-report.ts`

- [ ] **Step 1: Write certificate and credential failing tests**

Create `src/modules/reports/certificate-credential-report.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { buildCertificateCredentialReportRows, formatCertificateCredentialReportCsv } from "./certificate-credential-report";

describe("certificate and credential report", () => {
  it("includes certificate URL, issued date, credential provider, credential status, and failure message", () => {
    expect(
      buildCertificateCredentialReportRows(
        [
          {
            organizationId: "org_1",
            certificateId: "cert_1",
            learnerName: "Ada Lovelace",
            learnerEmail: "ada@example.com",
            courseId: "course_1",
            courseTitle: "Safety",
            certificateUrl: "https://learnhub.test/certificates/ABC",
            issuedAt: new Date("2026-06-13T10:00:00.000Z"),
            credentialProvider: "CREDLY",
            credentialStatus: "FAILED",
            providerUrl: null,
            failureMessage: "Credly rejected recipient email",
          },
          {
            organizationId: "org_2",
            certificateId: "cert_2",
            learnerName: "Other",
            learnerEmail: "other@example.com",
            courseId: "course_2",
            courseTitle: "Other",
            certificateUrl: "https://learnhub.test/certificates/XYZ",
            issuedAt: new Date("2026-06-13T11:00:00.000Z"),
            credentialProvider: null,
            credentialStatus: "NOT_REQUESTED",
            providerUrl: null,
            failureMessage: null,
          },
        ],
        "org_1",
      ),
    ).toEqual([
      {
        certificateId: "cert_1",
        learnerName: "Ada Lovelace",
        learnerEmail: "ada@example.com",
        courseId: "course_1",
        courseTitle: "Safety",
        certificateUrl: "https://learnhub.test/certificates/ABC",
        issuedAt: new Date("2026-06-13T10:00:00.000Z"),
        credentialProvider: "CREDLY",
        credentialStatus: "FAILED",
        providerUrl: null,
        failureMessage: "Credly rejected recipient email",
      },
    ]);
  });

  it("formats certificate CSV fields", () => {
    expect(
      formatCertificateCredentialReportCsv([
        {
          certificateId: "cert_1",
          learnerName: "Ada Lovelace",
          learnerEmail: "ada@example.com",
          courseId: "course_1",
          courseTitle: "Safety",
          certificateUrl: "https://learnhub.test/certificates/ABC",
          issuedAt: new Date("2026-06-13T10:00:00.000Z"),
          credentialProvider: "CREDLY",
          credentialStatus: "SUCCEEDED",
          providerUrl: "https://credly.test/badges/1",
          failureMessage: null,
        },
      ]),
    ).toContain("Certificate URL,Issued Date,Credential Provider,Credential Status,Provider URL,Failure Message");
    expect(formatCertificateCredentialReportCsv([
      {
        certificateId: "cert_2",
        learnerName: "Grace\rHopper",
        learnerEmail: "grace@example.com",
        courseId: "course_1",
        courseTitle: "Safety",
        certificateUrl: "https://learnhub.test/certificates/DEF",
        issuedAt: new Date("2026-06-13T10:00:00.000Z"),
        credentialProvider: null,
        credentialStatus: "NOT_REQUESTED",
        providerUrl: null,
        failureMessage: "Line one\r\nLine two",
      },
    ])).toContain("\"Grace\rHopper\"");
  });
});
```

- [ ] **Step 2: Write platform aggregate failing tests**

Create `src/modules/reports/platform-aggregate-report.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { buildPlatformAggregateReportRows } from "./platform-aggregate-report";

describe("platform aggregate report", () => {
  it("spans organizations without learner or feedback text detail", () => {
    const rows = buildPlatformAggregateReportRows([
      {
        organizationId: "org_1",
        organizationName: "Acme",
        organizationSlug: "acme",
        activeLearnerCount: 10,
        courseCount: 4,
        assignmentCount: 20,
        completedAssignmentCount: 15,
        certificateCount: 8,
        ratingSum: 18,
        ratingCount: 4,
        lastActivityAt: new Date("2026-06-13T10:00:00.000Z"),
      },
      {
        organizationId: "org_2",
        organizationName: "Beta",
        organizationSlug: "beta",
        activeLearnerCount: 5,
        courseCount: 2,
        assignmentCount: 10,
        completedAssignmentCount: 2,
        certificateCount: 1,
        ratingSum: 0,
        ratingCount: 0,
        lastActivityAt: null,
      },
    ]);

    expect(rows[0]).toEqual({
      organizationId: "org_1",
      organizationName: "Acme",
      organizationSlug: "acme",
      activeLearnerCount: 10,
      courseCount: 4,
      assignmentCount: 20,
      completedAssignmentCount: 15,
      completionRate: 75,
      certificateCount: 8,
      averageRating: 4.5,
      lastActivityAt: new Date("2026-06-13T10:00:00.000Z"),
    });
    expect(JSON.stringify(rows)).not.toContain("learnerEmail");
    expect(JSON.stringify(rows)).not.toContain("feedback");
  });
});
```

- [ ] **Step 3: Run the focused failing tests**

Run:

```powershell
npm run test -- src/modules/reports/certificate-credential-report.test.ts src/modules/reports/platform-aggregate-report.test.ts
```

Expected: fail because the report modules do not exist.

- [ ] **Step 4: Implement the report modules**

Create `src/modules/reports/certificate-credential-report.ts` with these exports:

```ts
export type CertificateCredentialSourceRow = {
  organizationId: string;
  certificateId: string;
  learnerName: string;
  learnerEmail: string;
  courseId: string;
  courseTitle: string;
  certificateUrl: string;
  issuedAt: Date;
  credentialProvider: "CREDLY" | null;
  credentialStatus: "NOT_REQUESTED" | "PENDING" | "SUCCEEDED" | "FAILED";
  providerUrl: string | null;
  failureMessage: string | null;
};

export type CertificateCredentialReportRow = Omit<CertificateCredentialSourceRow, "organizationId">;

export function buildCertificateCredentialReportRows(
  certificates: CertificateCredentialSourceRow[],
  organizationId: string,
): CertificateCredentialReportRow[] {
  return certificates
    .filter((certificate) => certificate.organizationId === organizationId)
    .sort((left, right) => right.issuedAt.getTime() - left.issuedAt.getTime())
    .map(({ organizationId: _organizationId, ...certificate }) => certificate);
}

export function formatCertificateCredentialReportCsv(rows: CertificateCredentialReportRow[]): string {
  return formatCsv([
    ["Learner Name", "Learner Email", "Course Title", "Certificate URL", "Issued Date", "Credential Provider", "Credential Status", "Provider URL", "Failure Message"],
    ...rows.map((row) => [
      row.learnerName,
      row.learnerEmail,
      row.courseTitle,
      row.certificateUrl,
      row.issuedAt.toISOString(),
      row.credentialProvider ?? "",
      row.credentialStatus,
      row.providerUrl ?? "",
      row.failureMessage ?? "",
    ]),
  ]);
}

function formatCsv(rows: Array<Array<string | number | Date | null>>): string {
  return rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
}

function csvCell(value: string | number | Date | null): string {
  const text = value instanceof Date ? value.toISOString() : String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}
```

Create `src/modules/reports/platform-aggregate-report.ts` with this export:

```ts
export type PlatformAggregateSourceRow = {
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  activeLearnerCount: number;
  courseCount: number;
  assignmentCount: number;
  completedAssignmentCount: number;
  certificateCount: number;
  ratingSum: number;
  ratingCount: number;
  lastActivityAt: Date | null;
};

export type PlatformAggregateReportRow = Omit<PlatformAggregateSourceRow, "ratingSum" | "ratingCount"> & {
  completionRate: number;
  averageRating: number | null;
};

export function buildPlatformAggregateReportRows(organizations: PlatformAggregateSourceRow[]): PlatformAggregateReportRow[] {
  return organizations.map((organization) => ({
    organizationId: organization.organizationId,
    organizationName: organization.organizationName,
    organizationSlug: organization.organizationSlug,
    activeLearnerCount: organization.activeLearnerCount,
    courseCount: organization.courseCount,
    assignmentCount: organization.assignmentCount,
    completedAssignmentCount: organization.completedAssignmentCount,
    completionRate: organization.assignmentCount > 0 ? Math.round((organization.completedAssignmentCount / organization.assignmentCount) * 100) : 0,
    certificateCount: organization.certificateCount,
    averageRating: organization.ratingCount > 0 ? Math.round((organization.ratingSum / organization.ratingCount) * 10) / 10 : null,
    lastActivityAt: organization.lastActivityAt,
  }));
}
```

Do not add learner names, learner emails, feedback text, certificate URLs, provider URLs, or credential failure text to `PlatformAggregateReportRow`.

- [ ] **Step 5: Run the focused passing tests**

Run:

```powershell
npm run test -- src/modules/reports/certificate-credential-report.test.ts src/modules/reports/platform-aggregate-report.test.ts
```

Expected: pass.

- [ ] **Step 6: Commit checkpoint**

Run:

```powershell
git add src/modules/reports/certificate-credential-report.ts src/modules/reports/certificate-credential-report.test.ts src/modules/reports/platform-aggregate-report.ts src/modules/reports/platform-aggregate-report.test.ts
git commit -m "feat: add certificate and platform aggregate reports"
```

Expected: commit succeeds.

## Task 8: Extend Prisma Reporting Repository

**Files:**
- Modify: `src/modules/reports/prisma-repository.test.ts`
- Modify: `src/modules/reports/prisma-repository.ts`

- [ ] **Step 1: Write repository failing tests**

Extend `src/modules/reports/prisma-repository.test.ts` with cases that assert:

- `listCourseCompletionRows`, `listScoringRows`, `listTimingRows`, `listPopularityRows`, `listSatisfactionRows`, `listQuizDifficultyRows`, and `listCertificateCredentialRows` include `organizationId` in every Prisma query.
- `learner` and `manager` scopes add `membershipId: { in: [...] }` to assignment, attempt, feedback, and certificate-source queries.
- `admin` scope omits membership filters but keeps `organizationId`.
- scoring selects Task 3 `knowledgeCheckAttempt` rows with course, question, score, correctness, and `submittedAt`.
- satisfaction selects Task 3 `courseFeedback` rows with course, learner user, stars, text, and `submittedAt`.
- quiz difficulty selects Task 3 `knowledgeCheckAttempt` rows with question prompt and `selectedAnswerIds`.
- certificate/credential selects certificate `verificationUrl`, `issuedAt`, and latest credential issuance fields `provider`, `status`, `providerUrl`, and `errorMessage`.
- platform aggregate uses `organization.findMany` and does not select learner email, learner name, feedback text, certificate URL, or credential failure text.

Use a concrete mocked `PrismaReportsClient` helper in `src/modules/reports/prisma-repository.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import type { PrismaReportsClient } from "./prisma-repository";

function createReportsPrismaMock(overrides: Partial<PrismaReportsClient> = {}): PrismaReportsClient {
  return {
    courseAssignment: { findMany: vi.fn().mockResolvedValue([]) },
    knowledgeCheckAttempt: { findMany: vi.fn().mockResolvedValue([]) },
    courseFeedback: { findMany: vi.fn().mockResolvedValue([]) },
    certificate: { findMany: vi.fn().mockResolvedValue([]) },
    course: { findMany: vi.fn().mockResolvedValue([]) },
    organization: { findMany: vi.fn().mockResolvedValue([]) },
    organizationMembership: { findMany: vi.fn().mockResolvedValue([]) },
    ...overrides,
  } as unknown as PrismaReportsClient;
}
```

Every repository test must assert the exact delegate call it cares about, including `organizationId`, the scoped membership filter, selected relation fields, ordering, and forbidden platform aggregate selections.

- [ ] **Step 2: Run the focused failing repository tests**

Run:

```powershell
npm run test -- src/modules/reports/prisma-repository.test.ts
```

Expected: fail because the repository methods are not implemented.

- [ ] **Step 3: Implement repository methods**

Update `src/modules/reports/prisma-repository.ts`:

- Expand `PrismaReportsClient` to pick these delegates as generated by Prisma: `courseAssignment`, `knowledgeCheckAttempt`, `courseFeedback`, `certificate`, `course`, `organization`, and `organizationMembership`.
- Add a private `scopedMembershipWhere(organizationId, scope)` helper that returns `{ organizationId }` for admin and `{ organizationId, membershipId: { in: scope.membershipIds } }` for learner/manager.
- Keep progress rows using the existing `progressReportWhere`.
- Build course completion rows from `courseAssignment.findMany` selecting `organizationId`, `courseId`, `status`, `progress.progressPercent`, and `course.title`.
- Build scoring rows from `knowledgeCheckAttempt.findMany` selecting `organizationId`, `scorePercent`, `correct`, `submittedAt`, and `question.course.id/title`.
- Build timing rows from `courseAssignment.findMany`; for native video sum `videoProgress.maxWatchedSecond`, for SCORM use `scormRegistration.totalTimeSeconds`, and use the max of `videoProgress.lastWatchedAt`, `scormRegistration.lastCommittedAt`, `scormRegistration.lastLaunchedAt`, and `progress.lastEventAt` for last activity.
- Build popularity rows from courses with scoped assignments, completions, Task 3 feedback ratings, native video progress records, SCORM launch counts, and learning events available under that course.
- Build satisfaction rows from `courseFeedback.findMany` joined through assignment membership and user, filtered through the same `scope`.
- Build quiz difficulty rows from `knowledgeCheckAttempt.findMany` joined through assignment membership and question, filtered through the same `scope`.
- Build certificate/credential rows from `certificate.findMany` filtered by `organizationId` and scoped `membershipId`, selecting latest `credentialIssuances` ordered by `attemptedAt desc`.
- Build platform aggregate rows from `organization.findMany` with counts and aggregate inputs only; do not select learner email, names, feedback text, certificate URLs, provider URLs, or failure messages.

- [ ] **Step 4: Run the focused passing repository tests**

Run:

```powershell
npm run test -- src/modules/reports/prisma-repository.test.ts
```

Expected: pass.

- [ ] **Step 5: Run module and repository tests together**

Run:

```powershell
npm run test -- src/modules/reports/course-completion-report.test.ts src/modules/reports/scoring-report.test.ts src/modules/reports/timing-report.test.ts src/modules/reports/popularity-report.test.ts src/modules/reports/satisfaction-report.test.ts src/modules/reports/quiz-difficulty-report.test.ts src/modules/reports/certificate-credential-report.test.ts src/modules/reports/platform-aggregate-report.test.ts src/modules/reports/prisma-repository.test.ts
```

Expected: pass.

- [ ] **Step 6: Commit checkpoint**

Run:

```powershell
git add src/modules/reports/prisma-repository.ts src/modules/reports/prisma-repository.test.ts
git commit -m "feat: add reporting repository queries"
```

Expected: commit succeeds.

## Task 9: Add CSV Export Routes

**Files:**
- Create: `src/app/api/org/[slug]/reports/completions.csv/route.ts`
- Create: `src/app/api/org/[slug]/reports/scoring.csv/route.ts`
- Create: `src/app/api/org/[slug]/reports/timing.csv/route.ts`
- Create: `src/app/api/org/[slug]/reports/satisfaction.csv/route.ts`
- Create: `src/app/api/org/[slug]/reports/quiz-difficulty.csv/route.ts`
- Create: `src/app/api/org/[slug]/reports/certificates.csv/route.ts`
- Modify: `src/modules/reports/export-route.test.ts`

- [ ] **Step 1: Write route failing tests**

Extend `src/modules/reports/export-route.test.ts` with route tests for:

- `GET /api/org/[slug]/reports/completions.csv`
- `GET /api/org/[slug]/reports/scoring.csv`
- `GET /api/org/[slug]/reports/timing.csv`
- `GET /api/org/[slug]/reports/satisfaction.csv`
- `GET /api/org/[slug]/reports/quiz-difficulty.csv`
- `GET /api/org/[slug]/reports/certificates.csv`

Each test must mock `requireOrganizationMemberBySlug`, direct-report lookup, and `createPrismaReportsRepository`. Assert the route passes the same `{ organizationId, scope }` shape as the page for learner, manager, and admin. Assert status `200`, `Content-Type: text/csv; charset=utf-8`, the expected `Content-Disposition`, and quoted CSV content from the module formatter.

Also add one unauthenticated case that mocks `requireOrganizationMemberBySlug` throwing a redirect error with `digest: "NEXT_REDIRECT;replace;/login;307;"` and asserts `401` with `{ error: "Authentication required" }`. Add one forbidden case that mocks the guard throwing `Object.assign(new Error("Forbidden"), { status: 403 })` and asserts `403` with `{ error: "Forbidden" }`.

- [ ] **Step 2: Run the focused failing route tests**

Run:

```powershell
npm run test -- src/modules/reports/export-route.test.ts
```

Expected: fail because the six CSV route modules do not exist.

- [ ] **Step 3: Implement CSV routes**

For each new route:

- call `requireOrganizationMemberBySlug(slug)`.
- import `prisma` dynamically from `@/lib/prisma`.
- load manager direct-report targets with:

```ts
prisma.organizationMembership.findMany({
  where: {
    organizationId,
    status: "ACTIVE",
    managerMembershipId: activeManagerMembership.id,
  },
  select: { id: true, organizationId: true },
});
```
- call `resolveProgressReportScope(context, organizationId, directReports)`.
- call the matching repository method:
  - completions route: `createPrismaReportsRepository(prisma).listCourseCompletionRows({ organizationId, scope })`
  - scoring route: `createPrismaReportsRepository(prisma).listScoringRows({ organizationId, scope })`
  - timing route: `createPrismaReportsRepository(prisma).listTimingRows({ organizationId, scope })`
  - satisfaction route: `createPrismaReportsRepository(prisma).listSatisfactionRows({ organizationId, scope })`
  - quiz difficulty route: `createPrismaReportsRepository(prisma).listQuizDifficultyRows({ organizationId, scope })`
  - certificates route: `createPrismaReportsRepository(prisma).listCertificateCredentialRows({ organizationId, scope })`
- format rows with the matching module CSV formatter.
- return the response with the report-specific filename.

Use these filenames:

- `learnhub-completions.csv`
- `learnhub-scoring.csv`
- `learnhub-timing.csv`
- `learnhub-satisfaction.csv`
- `learnhub-quiz-difficulty.csv`
- `learnhub-certificates.csv`

- [ ] **Step 4: Run the focused passing route tests**

Run:

```powershell
npm run test -- src/modules/reports/export-route.test.ts
```

Expected: pass.

- [ ] **Step 5: Commit checkpoint**

Run:

```powershell
git add src/app/api/org/[slug]/reports/completions.csv/route.ts src/app/api/org/[slug]/reports/scoring.csv/route.ts src/app/api/org/[slug]/reports/timing.csv/route.ts src/app/api/org/[slug]/reports/satisfaction.csv/route.ts src/app/api/org/[slug]/reports/quiz-difficulty.csv/route.ts src/app/api/org/[slug]/reports/certificates.csv/route.ts src/modules/reports/export-route.test.ts
git commit -m "feat: add reporting csv exports"
```

Expected: commit succeeds.

## Task 10: Update Organization And Platform Report Pages

**Files:**
- Modify: `src/modules/reports/page-shells.test.ts`
- Modify: `src/app/org/[slug]/admin/reports/page.tsx`
- Modify: `src/app/org/[slug]/reports/page.tsx`
- Modify: `src/app/platform/page.tsx`

- [ ] **Step 1: Write page shell failing tests**

Extend `src/modules/reports/page-shells.test.ts` so it asserts:

- `src/app/org/[slug]/admin/reports/page.tsx` calls `requireOrganizationUsersAdminBySlug`, `createPrismaReportsRepository`, and renders sections named `Course completion`, `Scoring`, `Timing`, `Popularity`, `Satisfaction`, `Quiz difficulty`, and `Certificates and credentials`.
- Admin page CSV links include `/api/org/${encodeURIComponent(slug)}/reports/completions.csv`, `/scoring.csv`, `/timing.csv`, `/satisfaction.csv`, `/quiz-difficulty.csv`, and `/certificates.csv`.
- Admin page contains the empty state strings `No completion data for this organization yet.`, `No scoring data for this organization yet.`, `No timing data for this organization yet.`, `No popularity data for this organization yet.`, `No satisfaction feedback for this organization yet.`, `No quiz attempts for this organization yet.`, and `No certificates issued for this organization yet.`.
- `src/app/org/[slug]/reports/page.tsx` calls `requireOrganizationMemberBySlug`, `resolveProgressReportScope`, and `createPrismaReportsRepository`.
- Organization member page renders scoped `Course completion`, `Scoring`, `Timing`, `Satisfaction`, `Quiz difficulty`, and `Certificates and credentials` sections with the same CSV links.
- `src/app/platform/page.tsx` calls `requirePlatformOwner`, `createPrismaReportsRepository`, and `listPlatformAggregateRows`.
- Platform page renders `Platform aggregate`, `Organization`, `Active learners`, `Completion rate`, `Certificates`, `Average rating`, and `Last activity`.
- Platform page source does not contain any organization CSV route path.
- None of the three page files contain a report document export link or button.

- [ ] **Step 2: Run the focused failing page tests**

Run:

```powershell
npm run test -- src/modules/reports/page-shells.test.ts
```

Expected: fail until pages are updated.

- [ ] **Step 3: Update admin reports page**

Modify `src/app/org/[slug]/admin/reports/page.tsx`:

- use `requireOrganizationUsersAdminBySlug(slug)`.
- create repository with `createPrismaReportsRepository(prisma)`.
- load all organization-wide rows with `scope: { kind: "admin" }`.
- render report sections as compact tables with stable headings and empty states from Step 1.
- render CSV links for completions, scoring, timing, satisfaction, quiz difficulty, and certificates.
- render popularity on-screen only.
- avoid report document export controls.

- [ ] **Step 4: Update organization member reports page**

Modify `src/app/org/[slug]/reports/page.tsx`:

- keep `requireOrganizationMemberBySlug(slug)`.
- load manager direct reports with `organizationMembership.findMany({ where: { organizationId, status: "ACTIVE", managerMembershipId: activeManagerMembership.id }, select: { id: true, organizationId: true } })`.
- call `resolveProgressReportScope(context, organizationId, directReports)`.
- create repository with `createPrismaReportsRepository(prisma)`.
- load completion, scoring, timing, satisfaction, quiz difficulty, and certificate rows with the same scope.
- render empty states that describe the actor scope, such as `No completion data matches your report scope.`.
- render the same CSV export links used by the admin page.
- avoid platform aggregate data and report document export controls.

- [ ] **Step 5: Update platform page**

Modify `src/app/platform/page.tsx`:

- keep `await requirePlatformOwner()`.
- import `prisma` dynamically.
- load rows through `createPrismaReportsRepository(prisma).listPlatformAggregateRows({ requestedByPlatformOwner: true })`.
- replace the static zero cards with a platform aggregate table.
- display organization name, slug, active learners, courses, assignments, completion rate, certificates, average rating, and last activity.
- avoid learner-level rows, feedback text, certificate URLs, credential failure messages, organization CSV routes, and report document export controls.

- [ ] **Step 6: Run focused page tests and build**

Run:

```powershell
npm run test -- src/modules/reports/page-shells.test.ts
npm run build
```

Expected: page shell tests pass and Next.js build exits `0`.

- [ ] **Step 7: Commit checkpoint**

Run:

```powershell
git add src/modules/reports/page-shells.test.ts src/app/org/[slug]/admin/reports/page.tsx src/app/org/[slug]/reports/page.tsx src/app/platform/page.tsx
git commit -m "feat: complete report dashboards"
```

Expected: commit succeeds.

## Task 11: Run Focused Reporting Verification

**Files:**
- Modify: none unless a focused verification failure identifies a concrete code defect.

- [ ] **Step 1: Run all report module tests**

Run:

```powershell
npm run test -- src/modules/reports/course-completion-report.test.ts src/modules/reports/scoring-report.test.ts src/modules/reports/timing-report.test.ts src/modules/reports/popularity-report.test.ts src/modules/reports/satisfaction-report.test.ts src/modules/reports/quiz-difficulty-report.test.ts src/modules/reports/certificate-credential-report.test.ts src/modules/reports/platform-aggregate-report.test.ts
```

Expected: all report module tests pass.

- [ ] **Step 2: Run repository, route, and page shell tests**

Run:

```powershell
npm run test -- src/modules/reports/prisma-repository.test.ts src/modules/reports/export-route.test.ts src/modules/reports/page-shells.test.ts
```

Expected: repository, CSV export route, and page shell tests pass.

- [ ] **Step 3: Run reporting tests as one focused gate**

Run:

```powershell
npm run test -- src/modules/reports/course-completion-report.test.ts src/modules/reports/scoring-report.test.ts src/modules/reports/timing-report.test.ts src/modules/reports/popularity-report.test.ts src/modules/reports/satisfaction-report.test.ts src/modules/reports/quiz-difficulty-report.test.ts src/modules/reports/certificate-credential-report.test.ts src/modules/reports/platform-aggregate-report.test.ts src/modules/reports/prisma-repository.test.ts src/modules/reports/export-route.test.ts src/modules/reports/page-shells.test.ts
```

Expected: all focused reporting tests pass together.

- [ ] **Step 4: Commit checkpoint**

Run:

```powershell
git status --short
git commit --allow-empty -m "test: verify reporting analytics slice"
```

Expected: working tree is clean before the empty verification commit, and the empty commit records the focused reporting gate.

## Task 12: Run Umbrella Verification

**Files:**
- Modify: none unless verification exposes a concrete failure.

- [ ] **Step 1: Run full test suite**

Run:

```powershell
npm run test
```

Expected: Vitest exits `0`.

- [ ] **Step 2: Run lint**

Run:

```powershell
npm run lint
```

Expected: ESLint exits `0`.

- [ ] **Step 3: Validate Prisma**

Run:

```powershell
npx prisma validate
```

Expected: Prisma schema validates.

- [ ] **Step 4: Generate Prisma client**

Run:

```powershell
npm run prisma:generate
```

Expected: Prisma client generation exits `0`.

- [ ] **Step 5: Run TypeScript**

Run:

```powershell
npx tsc --noEmit --incremental false
```

Expected: TypeScript exits `0`.

- [ ] **Step 6: Run production build**

Run:

```powershell
npm run build
```

Expected: Next.js build exits `0`.

- [ ] **Step 7: Confirm branch state**

Run:

```powershell
git status --short --branch
git log --oneline -12
```

Expected: branch shows the reporting checkpoints and a clean working tree.

## Acceptance Criteria

- Course completion report includes assigned, started, completed, overdue, and completion rate by course.
- Scoring report includes average score, best score, latest score, and pass/fail rate.
- Timing report includes average time, total time, and last activity.
- Popularity report includes most viewed, most enrolled, most completed, and highest-rated courses.
- Satisfaction report uses Task 3 learner ratings and feedback.
- Quiz difficulty report uses Task 3 knowledge-check attempts.
- Certificate and credential report includes certificate URL, issued date, credential provider, credential status, and failure message.
- Platform aggregate report spans organizations and is available only to platform owners.
- Platform aggregate report never exposes tenant learner names, learner emails, feedback text, certificate URLs, provider URLs, or credential failure messages.
- Organization users never receive platform aggregate data from organization pages or CSV routes.
- CSV exports use the same visibility filters as on-screen reports.
- CSV values follow the documented escaping rules.
- Report document export is not present in pages, routes, tests, or navigation.

## Review Checklist

- Every organization-scoped repository method includes `organizationId`.
- Every learner or manager query includes `membershipId: { in: scope.membershipIds }`.
- Admin organization queries keep `organizationId` and do not add membership filters.
- Organization CSV routes call the same scope resolver as organization pages.
- Direct-report scope excludes cross-organization memberships.
- Satisfaction report rows are built from Task 3 `CourseFeedback`.
- Quiz difficulty rows are built from Task 3 `KnowledgeCheckAttempt`.
- Certificates report maps missing credential issuance to `NOT_REQUESTED`.
- Popularity rankings do not require new runtime tracking tables.
- Platform aggregate page calls `requirePlatformOwner()` before loading rows.
- Platform aggregate rows contain organization-level metrics only.
- No report page or route offers report document export.
