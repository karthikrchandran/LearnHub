# Knowledge Checks Scoring And Feedback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add tenant-scoped embedded native-video knowledge checks, quiz scoring, learner answer feedback, course ratings, and reporting inputs for scoring, difficulty, and satisfaction reports.

**Architecture:** Knowledge checks live in a new assessments module with pure scoring rules, a Prisma repository, and guarded server actions plus one learner submit route. The video runtime remains the launch surface, `recordLearningEvent` remains the progress boundary, and report modules consume normalized attempt and feedback records through tenant-scoped query helpers.

**Tech Stack:** Next.js App Router pages, route handlers, and server actions; TypeScript; Prisma 7; PostgreSQL; Vitest; existing auth guards and progress/video modules.

---

## Planning Prep And Start Gate

This plan is prep-ready but not implementation-ready until the upstream parallel lanes finish.

Start Task 3 only after all of the following are true:

- Task 2, global library copy workflow, is merged into the base branch and its focused tests plus `npm run lint`, `npx prisma validate`, `npm run prisma:generate`, `npx tsc --noEmit --incremental false`, and `npm run build` passed.
- Task 4, notifications/jobs/email providers, is merged into the base branch and has passed spec review, code quality review, focused tests, and the same shared gates.
- Task 5, production media/storage/SCORM operations, is merged into the base branch and has passed spec review, code quality review, focused tests, and the same shared gates.
- `main` has been updated to include Tasks 2, 4, and 5 before creating `feature/knowledge-checks-scoring-feedback`.

Current repo context captured during planning prep:

- `main` has no `src/modules/assessments` or `src/modules/feedback` modules yet.
- `prisma/schema.prisma` has no knowledge-check or course-feedback models on `main`.
- `src/app/org/[slug]/learn/[courseSlug]/page.tsx` currently renders only `VideoPlayer` for assigned native-video learners.
- `src/modules/video/video-runtime.ts` currently calculates native completion from required lessons only.
- `src/modules/progress/progress.ts` accepts opaque `rawPayload`; Task 3 should add knowledge-check counts in native raw payload without changing SCORM capping rules.
- `src/modules/reports/progress-report.ts` and `src/modules/reports/prisma-repository.ts` currently expose progress rows without assessment score fields.
- Task 2 branch currently adds global-library lineage fields but not Task 3 knowledge-check schema; its copy workflow tolerates an empty `knowledgeChecks` payload so Task 3 can extend copy behavior later if needed.

Before implementation, run this preflight in the Task 3 worktree:

```powershell
git status --short --branch
rg "KnowledgeCheck|CourseFeedback|knowledgeCheck|courseFeedback" prisma src
rg "globalLibrary|isGlobalLibraryCourse|sourceGlobal" prisma/schema.prisma src/modules/library
rg "NotificationJob|Mux|R2|ScormPackageJob|contentRootKey" prisma/schema.prisma src/modules src/app/api
npm run test -- src/modules/video/video-runtime.test.ts src/modules/progress/progress.test.ts src/modules/reports/progress-report.test.ts src/modules/reports/prisma-repository.test.ts
npm run lint
npx prisma validate
npm run prisma:generate
npx tsc --noEmit --incremental false
npm run build
```

Expected preflight result:

- Branch is clean before edits.
- Any knowledge-check or feedback models introduced by Task 2 merge are identified before schema work starts.
- Task 4 and Task 5 provider/job models are visible before adding report and operations-adjacent reads.
- Existing video, progress, and report tests pass before Task 3 changes them.

Recommended worktree creation after upstream merge:

```powershell
git worktree add .worktrees/knowledge-checks-scoring-feedback -b feature/knowledge-checks-scoring-feedback main
```

## Scope Boundary

This plan implements MVP knowledge checks and learner course feedback for native video courses. It does not add SCORM quiz parsing, timed exams, attempt limits, proctoring, question banks, randomized answer order, rubric grading, PDF exports, chart libraries, or notification jobs.

The global-library copy plan may add `CourseKnowledgeCheckQuestion` and `CourseKnowledgeCheckAnswer` first. If those models already exist when this plan is executed, preserve their compatible fields and extend them with the `required`, `active`, and attempt relations described below instead of creating duplicate models.

## File Structure

Create or modify these files:

- Modify: `prisma/schema.prisma` - add assessment enums, tenant-owned knowledge-check question/answer fields, attempt history, course ratings, and report indexes.
- Create: `prisma/migrations/20260613030000_knowledge_checks_feedback/migration.sql` - SQL migration for assessment and feedback tables plus enum creation.
- Create: `src/modules/assessments/knowledge-checks.ts` - pure domain rules for validation, reorder, activation, completion requirements, and progress summary.
- Create: `src/modules/assessments/knowledge-checks.test.ts` - tests for question validation, answer validation, activation rules, completion requirements, and tenant-safe launch payloads.
- Create: `src/modules/assessments/scoring.ts` - pure answer scoring, score percentage, correctness, feedback selection, and difficulty aggregation helpers.
- Create: `src/modules/assessments/scoring.test.ts` - scoring and difficulty tests for single-answer, multiple-answer, and true/false questions.
- Create: `src/modules/assessments/prisma-repository.ts` - Prisma adapter for admin check writes, learner submit reads/writes, attempt history, and report queries.
- Create: `src/modules/assessments/prisma-repository.test.ts` - query-shape tests proving organization filters, assignment filters, and transaction boundaries.
- Create: `src/modules/assessments/server-actions.ts` - pure action factories for admin create/edit/reorder/activate/deactivate workflows.
- Create: `src/modules/assessments/server-actions.test.ts` - FormData parsing and authorization-adapter tests for admin actions.
- Create: `src/modules/feedback/course-feedback.ts` - course rating validation, feedback submission rules, and satisfaction aggregation helpers.
- Create: `src/modules/feedback/course-feedback.test.ts` - tests for one-to-five stars, optional text, tenant course filtering, and aggregate metrics.
- Create: `src/modules/feedback/prisma-repository.ts` - Prisma adapter for assignment-scoped feedback upsert and satisfaction report reads.
- Create: `src/modules/feedback/prisma-repository.test.ts` - query-shape tests for assignment ownership, tenant isolation, and feedback persistence.
- Create: `src/app/api/org/[slug]/assignments/[assignmentId]/feedback/route.ts` - learner course rating submission route.
- Create: `src/app/api/org/[slug]/assignments/[assignmentId]/feedback/route.test.ts` - route-helper tests for feedback validation, ownership, and persistence.
- Create: `src/app/org/[slug]/admin/courses/[courseSlug]/checks/page.tsx` - admin checks management page.
- Create: `src/app/org/[slug]/admin/courses/[courseSlug]/checks/actions.ts` - server-action bridge guarded by `requireOrganizationUsersAdminBySlug`.
- Create: `src/app/api/org/[slug]/assignments/[assignmentId]/checks/[checkId]/submit/route.ts` - learner answer submission route guarded by org membership and assignment ownership checks.
- Modify: `src/modules/video/video-runtime.ts` - include active checks in launch output and require required checks in native course completion progress.
- Modify: `src/modules/progress/progress.ts` - accept native completion events that include completed check counts in raw payload without changing SCORM caps.
- Modify: `src/modules/reports/progress-report.ts` - add score fields and CSV columns for best/latest knowledge-check score.
- Modify: `src/modules/reports/prisma-repository.ts` - select assessment attempts for report rows.
- Create: `src/modules/reports/scoring-report.ts` - scoring report rows and quiz difficulty report aggregation.
- Create: `src/modules/reports/scoring-report.test.ts` - scoring report and difficulty aggregation tests.
- Modify: `src/app/org/[slug]/learn/[courseSlug]/page.tsx` - render embedded knowledge-check shell and course rating form in the native video learning flow.
- Create: `src/app/org/[slug]/learn/[courseSlug]/knowledge-check-panel.tsx` - client component that posts selected answers and ratings, then renders returned feedback.
- Create: `src/app/org/[slug]/learn/[courseSlug]/knowledge-check-panel.test.tsx` - client interaction tests for answer submit and rating submit.
- Modify: `src/app/org/[slug]/admin/courses/[courseSlug]/content/page.tsx` - link admin content tooling to the checks management page.

## Data Model

Add these enums:

```prisma
enum KnowledgeCheckQuestionType {
  SINGLE_CHOICE
  MULTIPLE_CHOICE
  TRUE_FALSE
}
```

Add or extend these relations:

```prisma
model Organization {
  knowledgeCheckQuestions CourseKnowledgeCheckQuestion[]
  knowledgeCheckAttempts  KnowledgeCheckAttempt[]
  courseFeedback          CourseFeedback[]
}

model Course {
  knowledgeCheckQuestions CourseKnowledgeCheckQuestion[]
  feedback                CourseFeedback[]
}

model VideoLesson {
  knowledgeCheckQuestions CourseKnowledgeCheckQuestion[]
}

model CourseAssignment {
  knowledgeCheckAttempts KnowledgeCheckAttempt[]
  courseFeedback         CourseFeedback?
}
```

Add or extend these models:

```prisma
model CourseKnowledgeCheckQuestion {
  id                     String                         @id @default(cuid())
  organizationId         String
  courseId               String
  lessonId               String?
  sourceGlobalQuestionId String?
  prompt                 String
  questionType           KnowledgeCheckQuestionType
  sortOrder              Int                            @default(0)
  required               Boolean                        @default(true)
  active                 Boolean                        @default(true)
  explanation            String?
  organization           Organization                   @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  course                 Course                         @relation(fields: [organizationId, courseId], references: [organizationId, id], onDelete: Cascade)
  lesson                 VideoLesson?                   @relation(fields: [organizationId, courseId, lessonId], references: [organizationId, courseId, id], onDelete: NoAction)
  answers                CourseKnowledgeCheckAnswer[]
  attempts               KnowledgeCheckAttempt[]
  createdAt              DateTime                       @default(now())
  updatedAt              DateTime                       @updatedAt

  @@unique([organizationId, id])
  @@index([organizationId, courseId, lessonId, sortOrder])
  @@index([organizationId, courseId, active])
  @@index([sourceGlobalQuestionId])
}

model CourseKnowledgeCheckAnswer {
  id             String                       @id @default(cuid())
  organizationId String
  questionId     String
  text           String
  correct        Boolean                      @default(false)
  feedback       String?
  sortOrder      Int                          @default(0)
  question       CourseKnowledgeCheckQuestion @relation(fields: [organizationId, questionId], references: [organizationId, id], onDelete: Cascade)
  createdAt      DateTime                     @default(now())
  updatedAt      DateTime                     @updatedAt

  @@index([organizationId, questionId, sortOrder])
}

model KnowledgeCheckAttempt {
  id                String                       @id @default(cuid())
  organizationId    String
  assignmentId      String
  questionId        String
  attemptNumber     Int
  selectedAnswerIds String[]
  correct           Boolean
  scorePercent      Int
  submittedAt       DateTime
  organization      Organization                 @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  assignment        CourseAssignment             @relation(fields: [organizationId, assignmentId], references: [organizationId, id], onDelete: Cascade)
  question          CourseKnowledgeCheckQuestion @relation(fields: [organizationId, questionId], references: [organizationId, id], onDelete: Cascade)

  @@unique([organizationId, assignmentId, questionId, attemptNumber])
  @@index([organizationId, assignmentId])
  @@index([organizationId, questionId])
  @@index([organizationId, submittedAt])
}

model CourseFeedback {
  id             String           @id @default(cuid())
  organizationId String
  courseId       String
  assignmentId   String
  membershipId   String
  stars          Int
  text           String?
  submittedAt    DateTime         @default(now())
  organization   Organization     @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  course         Course           @relation(fields: [organizationId, courseId], references: [organizationId, id], onDelete: Cascade)
  assignment     CourseAssignment @relation(fields: [organizationId, courseId, assignmentId], references: [organizationId, courseId, id], onDelete: Cascade)

  @@unique([organizationId, assignmentId])
  @@unique([organizationId, courseId, assignmentId])
  @@index([organizationId, courseId])
  @@index([organizationId, membershipId])
  @@index([organizationId, submittedAt])
}
```

## Tenant-Safety Rules

- Every assessment query includes `organizationId`.
- Learner submit route resolves the organization by `slug`, then loads the assignment by `{ organizationId, assignmentId }`.
- Learner submit route calls `canLaunchRuntimeAssignment(context, assignment)` before scoring.
- Question submit rejects checks whose `courseId` does not match the assignment course.
- Question submit rejects inactive checks and checks from other organizations.
- Admin actions use `requireOrganizationUsersAdminBySlug` and mutate only courses with matching `organizationId` and `courseSlug`.
- Feedback submissions require the assignment learner membership to match the signed-in learner.
- Reports use organization-scoped attempt and feedback queries; managers receive only direct-report rows through existing progress report scope rules.

## Task 1: Add Schema And Migration

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260613030000_knowledge_checks_feedback/migration.sql`

- [ ] **Step 1: Add Prisma schema**

Add `KnowledgeCheckQuestionType`, assessment relations, `CourseKnowledgeCheckQuestion`, `CourseKnowledgeCheckAnswer`, `KnowledgeCheckAttempt`, and `CourseFeedback` exactly as shown in the Data Model section.

If `CourseKnowledgeCheckQuestion` or `CourseKnowledgeCheckAnswer` already exists from the global-library copy plan, change `questionType String` to `questionType KnowledgeCheckQuestionType`, preserve `sourceGlobalQuestionId`, and add only missing fields and indexes.

- [ ] **Step 2: Create migration SQL**

Create `prisma/migrations/20260613030000_knowledge_checks_feedback/migration.sql` with:

```sql
CREATE TYPE "KnowledgeCheckQuestionType" AS ENUM ('SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'TRUE_FALSE');

CREATE TABLE "CourseKnowledgeCheckQuestion" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "courseId" TEXT NOT NULL,
  "lessonId" TEXT,
  "sourceGlobalQuestionId" TEXT,
  "prompt" TEXT NOT NULL,
  "questionType" "KnowledgeCheckQuestionType" NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "required" BOOLEAN NOT NULL DEFAULT true,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "explanation" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CourseKnowledgeCheckQuestion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CourseKnowledgeCheckQuestion_organizationId_id_key"
ON "CourseKnowledgeCheckQuestion"("organizationId", "id");

CREATE INDEX "CourseKnowledgeCheckQuestion_organizationId_courseId_lessonId_sortOrder_idx"
ON "CourseKnowledgeCheckQuestion"("organizationId", "courseId", "lessonId", "sortOrder");

CREATE INDEX "CourseKnowledgeCheckQuestion_organizationId_courseId_active_idx"
ON "CourseKnowledgeCheckQuestion"("organizationId", "courseId", "active");

CREATE INDEX "CourseKnowledgeCheckQuestion_sourceGlobalQuestionId_idx"
ON "CourseKnowledgeCheckQuestion"("sourceGlobalQuestionId");

ALTER TABLE "CourseKnowledgeCheckQuestion"
ADD CONSTRAINT "CourseKnowledgeCheckQuestion_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CourseKnowledgeCheckQuestion"
ADD CONSTRAINT "CourseKnowledgeCheckQuestion_organizationId_courseId_fkey"
FOREIGN KEY ("organizationId", "courseId") REFERENCES "Course"("organizationId", "id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CourseKnowledgeCheckQuestion"
ADD CONSTRAINT "CourseKnowledgeCheckQuestion_organizationId_courseId_lessonId_fkey"
FOREIGN KEY ("organizationId", "courseId", "lessonId") REFERENCES "VideoLesson"("organizationId", "courseId", "id")
ON DELETE NO ACTION ON UPDATE CASCADE;

CREATE TABLE "CourseKnowledgeCheckAnswer" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "questionId" TEXT NOT NULL,
  "text" TEXT NOT NULL,
  "correct" BOOLEAN NOT NULL DEFAULT false,
  "feedback" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CourseKnowledgeCheckAnswer_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CourseKnowledgeCheckAnswer_organizationId_questionId_sortOrder_idx"
ON "CourseKnowledgeCheckAnswer"("organizationId", "questionId", "sortOrder");

ALTER TABLE "CourseKnowledgeCheckAnswer"
ADD CONSTRAINT "CourseKnowledgeCheckAnswer_organizationId_questionId_fkey"
FOREIGN KEY ("organizationId", "questionId") REFERENCES "CourseKnowledgeCheckQuestion"("organizationId", "id")
ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "KnowledgeCheckAttempt" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "assignmentId" TEXT NOT NULL,
  "questionId" TEXT NOT NULL,
  "attemptNumber" INTEGER NOT NULL,
  "selectedAnswerIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "correct" BOOLEAN NOT NULL,
  "scorePercent" INTEGER NOT NULL,
  "submittedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "KnowledgeCheckAttempt_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "KnowledgeCheckAttempt_organizationId_assignmentId_questionId_attemptNumber_key"
ON "KnowledgeCheckAttempt"("organizationId", "assignmentId", "questionId", "attemptNumber");

CREATE INDEX "KnowledgeCheckAttempt_organizationId_assignmentId_idx"
ON "KnowledgeCheckAttempt"("organizationId", "assignmentId");

CREATE INDEX "KnowledgeCheckAttempt_organizationId_questionId_idx"
ON "KnowledgeCheckAttempt"("organizationId", "questionId");

CREATE INDEX "KnowledgeCheckAttempt_organizationId_submittedAt_idx"
ON "KnowledgeCheckAttempt"("organizationId", "submittedAt");

ALTER TABLE "KnowledgeCheckAttempt"
ADD CONSTRAINT "KnowledgeCheckAttempt_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "KnowledgeCheckAttempt"
ADD CONSTRAINT "KnowledgeCheckAttempt_organizationId_assignmentId_fkey"
FOREIGN KEY ("organizationId", "assignmentId") REFERENCES "CourseAssignment"("organizationId", "id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "KnowledgeCheckAttempt"
ADD CONSTRAINT "KnowledgeCheckAttempt_organizationId_questionId_fkey"
FOREIGN KEY ("organizationId", "questionId") REFERENCES "CourseKnowledgeCheckQuestion"("organizationId", "id")
ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "CourseFeedback" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "courseId" TEXT NOT NULL,
  "assignmentId" TEXT NOT NULL,
  "membershipId" TEXT NOT NULL,
  "stars" INTEGER NOT NULL,
  "text" TEXT,
  "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CourseFeedback_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CourseFeedback_organizationId_assignmentId_key"
ON "CourseFeedback"("organizationId", "assignmentId");

CREATE UNIQUE INDEX "CourseFeedback_organizationId_courseId_assignmentId_key"
ON "CourseFeedback"("organizationId", "courseId", "assignmentId");

CREATE INDEX "CourseFeedback_organizationId_courseId_idx"
ON "CourseFeedback"("organizationId", "courseId");

CREATE INDEX "CourseFeedback_organizationId_membershipId_idx"
ON "CourseFeedback"("organizationId", "membershipId");

CREATE INDEX "CourseFeedback_organizationId_submittedAt_idx"
ON "CourseFeedback"("organizationId", "submittedAt");

ALTER TABLE "CourseFeedback"
ADD CONSTRAINT "CourseFeedback_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CourseFeedback"
ADD CONSTRAINT "CourseFeedback_organizationId_courseId_fkey"
FOREIGN KEY ("organizationId", "courseId") REFERENCES "Course"("organizationId", "id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CourseFeedback"
ADD CONSTRAINT "CourseFeedback_organizationId_assignmentId_fkey"
FOREIGN KEY ("organizationId", "courseId", "assignmentId") REFERENCES "CourseAssignment"("organizationId", "courseId", "id")
ON DELETE CASCADE ON UPDATE CASCADE;
```

If the tables already exist from another merged branch, convert the migration to `ALTER TABLE` statements that add the missing fields, enum cast, indexes, attempts, feedback table, and `CourseKnowledgeCheckAnswer.organizationId` backfilled from the parent question before adding the composite answer foreign key.

- [ ] **Step 3: Verify schema**

Run:

```powershell
npx prisma validate
npm run prisma:generate
```

Expected: Prisma schema validates and client generation exits `0`.

- [ ] **Step 4: Run migration relationship smoke**

Run this schema-level smoke before writing repository code:

```powershell
npx prisma validate
npm run prisma:generate
npx tsc --noEmit --incremental false
```

Expected: composite relations for `CourseKnowledgeCheckAnswer`, `KnowledgeCheckAttempt`, and `CourseFeedback` validate against generated Prisma types. If this fails, fix schema or migration SQL before continuing to repository tasks; repository tests cannot prove invalid relation metadata is deployable.

- [ ] **Step 5: Commit**

Run:

```powershell
git add prisma/schema.prisma prisma/migrations/20260613030000_knowledge_checks_feedback/migration.sql
git commit -m "feat: add knowledge check schema"
```

Expected: commit succeeds.

## Task 2: Add Scoring Domain

**Files:**
- Create: `src/modules/assessments/scoring.test.ts`
- Create: `src/modules/assessments/scoring.ts`

- [ ] **Step 1: Write scoring tests**

Create `src/modules/assessments/scoring.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
  aggregateQuizDifficulty,
  scoreKnowledgeCheck,
  type ScoreableKnowledgeCheck,
} from "./scoring";

const singleChoice: ScoreableKnowledgeCheck = {
  id: "check_1",
  questionType: "SINGLE_CHOICE",
  explanation: "Choose the answer that opens the conversation.",
  answers: [
    { id: "answer_1", correct: true, feedback: "Correct. Open questions invite context." },
    { id: "answer_2", correct: false, feedback: "This can sound accusatory." },
  ],
};

describe("scoreKnowledgeCheck", () => {
  it("scores single-answer multiple choice as correct when exactly one correct answer is selected", () => {
    expect(scoreKnowledgeCheck(singleChoice, ["answer_1"])).toEqual({
      correct: true,
      scorePercent: 100,
      selectedAnswerFeedback: ["Correct. Open questions invite context."],
      explanation: "Choose the answer that opens the conversation.",
    });
  });

  it("scores single-answer multiple choice as wrong when more than one answer is selected", () => {
    expect(scoreKnowledgeCheck(singleChoice, ["answer_1", "answer_2"])).toMatchObject({
      correct: false,
      scorePercent: 0,
      selectedAnswerFeedback: [
        "Correct. Open questions invite context.",
        "This can sound accusatory.",
      ],
    });
  });

  it("requires all and only correct answers for multiple-answer checks", () => {
    const check: ScoreableKnowledgeCheck = {
      id: "check_2",
      questionType: "MULTIPLE_CHOICE",
      explanation: null,
      answers: [
        { id: "a", correct: true, feedback: null },
        { id: "b", correct: true, feedback: null },
        { id: "c", correct: false, feedback: "Distractor." },
      ],
    };

    expect(scoreKnowledgeCheck(check, ["a", "b"])).toMatchObject({ correct: true, scorePercent: 100 });
    expect(scoreKnowledgeCheck(check, ["a", "c"])).toMatchObject({ correct: false, scorePercent: 0 });
  });

  it("scores true false checks through the same selected answer contract", () => {
    const check: ScoreableKnowledgeCheck = {
      id: "check_tf",
      questionType: "TRUE_FALSE",
      explanation: "The statement is true.",
      answers: [
        { id: "true", correct: true, feedback: "Right." },
        { id: "false", correct: false, feedback: "Review the lesson context." },
      ],
    };

    expect(scoreKnowledgeCheck(check, ["false"])).toEqual({
      correct: false,
      scorePercent: 0,
      selectedAnswerFeedback: ["Review the lesson context."],
      explanation: "The statement is true.",
    });
  });
});

describe("aggregateQuizDifficulty", () => {
  it("ranks harder questions by lower correct rate and includes commonly missed answers", () => {
    const rows = aggregateQuizDifficulty([
      { questionId: "q1", selectedAnswerIds: ["a"], correct: true },
      { questionId: "q1", selectedAnswerIds: ["b"], correct: false },
      { questionId: "q1", selectedAnswerIds: ["b"], correct: false },
      { questionId: "q2", selectedAnswerIds: ["x"], correct: true },
    ]);

    expect(rows[0]).toEqual({
      questionId: "q1",
      attempts: 3,
      correctAttempts: 1,
      incorrectAttempts: 2,
      correctRate: 33,
      commonlyMissedAnswerIds: ["b"],
    });
  });
});
```

Run:

```powershell
npm run test -- src/modules/assessments/scoring.test.ts
```

Expected: fail because the scoring module does not exist.

- [ ] **Step 2: Implement scoring**

Create `src/modules/assessments/scoring.ts`:

```ts
export type KnowledgeCheckQuestionType = "SINGLE_CHOICE" | "MULTIPLE_CHOICE" | "TRUE_FALSE";

export type ScoreableAnswer = {
  id: string;
  correct: boolean;
  feedback: string | null;
};

export type ScoreableKnowledgeCheck = {
  id: string;
  questionType: KnowledgeCheckQuestionType;
  explanation: string | null;
  answers: ScoreableAnswer[];
};

export type KnowledgeCheckScore = {
  correct: boolean;
  scorePercent: number;
  selectedAnswerFeedback: string[];
  explanation: string | null;
};

export type DifficultyAttempt = {
  questionId: string;
  selectedAnswerIds: string[];
  correct: boolean;
};

export type QuizDifficultyRow = {
  questionId: string;
  attempts: number;
  correctAttempts: number;
  incorrectAttempts: number;
  correctRate: number;
  commonlyMissedAnswerIds: string[];
};

export function scoreKnowledgeCheck(
  check: ScoreableKnowledgeCheck,
  selectedAnswerIds: string[],
): KnowledgeCheckScore {
  const selected = unique(selectedAnswerIds);
  const correctAnswerIds = check.answers.filter((answer) => answer.correct).map((answer) => answer.id).sort();
  const selectedSorted = [...selected].sort();
  const correct =
    selectedSorted.length === correctAnswerIds.length &&
    selectedSorted.every((answerId, index) => answerId === correctAnswerIds[index]) &&
    selectionCountIsValid(check.questionType, selectedSorted.length);

  return {
    correct,
    scorePercent: correct ? 100 : 0,
    selectedAnswerFeedback: check.answers
      .filter((answer) => selected.includes(answer.id) && answer.feedback)
      .sort((left, right) => selected.indexOf(left.id) - selected.indexOf(right.id))
      .map((answer) => answer.feedback as string),
    explanation: check.explanation,
  };
}

export function aggregateQuizDifficulty(attempts: DifficultyAttempt[]): QuizDifficultyRow[] {
  const byQuestion = new Map<string, DifficultyAttempt[]>();

  for (const attempt of attempts) {
    byQuestion.set(attempt.questionId, [...(byQuestion.get(attempt.questionId) ?? []), attempt]);
  }

  return [...byQuestion.entries()]
    .map(([questionId, questionAttempts]) => {
      const correctAttempts = questionAttempts.filter((attempt) => attempt.correct).length;
      const missedCounts = new Map<string, number>();

      for (const attempt of questionAttempts.filter((candidate) => !candidate.correct)) {
        for (const answerId of attempt.selectedAnswerIds) {
          missedCounts.set(answerId, (missedCounts.get(answerId) ?? 0) + 1);
        }
      }

      return {
        questionId,
        attempts: questionAttempts.length,
        correctAttempts,
        incorrectAttempts: questionAttempts.length - correctAttempts,
        correctRate: Math.round((correctAttempts / questionAttempts.length) * 100),
        commonlyMissedAnswerIds: [...missedCounts.entries()]
          .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
          .slice(0, 3)
          .map(([answerId]) => answerId),
      };
    })
    .sort((left, right) => left.correctRate - right.correctRate || right.attempts - left.attempts);
}

function selectionCountIsValid(questionType: KnowledgeCheckQuestionType, selectedCount: number): boolean {
  if (questionType === "MULTIPLE_CHOICE") {
    return selectedCount > 0;
  }

  return selectedCount === 1;
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
```

- [ ] **Step 3: Verify and commit**

Run:

```powershell
npm run test -- src/modules/assessments/scoring.test.ts
git add src/modules/assessments/scoring.ts src/modules/assessments/scoring.test.ts
git commit -m "feat: add knowledge check scoring"
```

Expected: tests pass and commit succeeds.

## Task 3: Add Knowledge Check Domain Rules

**Files:**
- Create: `src/modules/assessments/knowledge-checks.test.ts`
- Create: `src/modules/assessments/knowledge-checks.ts`

- [ ] **Step 1: Write domain tests**

Create tests that cover validation, reordering, activation, completion, and launch payloads:

```ts
import { describe, expect, it } from "vitest";

import {
  buildLearnerKnowledgeCheckView,
  calculateNativeCompletionWithChecks,
  normalizeKnowledgeCheckDraft,
  reorderKnowledgeChecks,
  requireCanActivateKnowledgeCheck,
  type KnowledgeCheckDraft,
} from "./knowledge-checks";

const validDraft: KnowledgeCheckDraft = {
  organizationId: "org_1",
  courseId: "course_1",
  lessonId: "lesson_1",
  prompt: "Which response is best?",
  questionType: "SINGLE_CHOICE",
  required: true,
  active: true,
  explanation: "Use neutral language.",
  answers: [
    { text: "What happened?", correct: true, feedback: "Correct.", sortOrder: 0 },
    { text: "Why did you fail?", correct: false, feedback: "Too accusatory.", sortOrder: 1 },
  ],
};

describe("normalizeKnowledgeCheckDraft", () => {
  it("accepts single-answer multiple choice with exactly one correct answer", () => {
    expect(normalizeKnowledgeCheckDraft(validDraft)).toMatchObject({
      prompt: "Which response is best?",
      answers: [{ sortOrder: 0 }, { sortOrder: 1 }],
    });
  });

  it("requires at least two answers", () => {
    expect(() =>
      normalizeKnowledgeCheckDraft({
        ...validDraft,
        answers: [{ text: "Only one", correct: true, feedback: null, sortOrder: 0 }],
      }),
    ).toThrow("Knowledge check must have at least two answers");
  });

  it("requires true false checks to have one correct and one incorrect answer", () => {
    expect(() =>
      normalizeKnowledgeCheckDraft({
        ...validDraft,
        questionType: "TRUE_FALSE",
        answers: [
          { text: "True", correct: true, feedback: null, sortOrder: 0 },
          { text: "False", correct: true, feedback: null, sortOrder: 1 },
        ],
      }),
    ).toThrow("True/false checks must have one correct answer");
  });
});

describe("activation and ordering", () => {
  it("rejects activation without a correct answer", () => {
    expect(() =>
      requireCanActivateKnowledgeCheck({
        ...validDraft,
        answers: validDraft.answers.map((answer) => ({ ...answer, correct: false })),
      }),
    ).toThrow("Active knowledge checks require at least one correct answer");
  });

  it("assigns stable zero-based sort order", () => {
    expect(reorderKnowledgeChecks(["check_c", "check_a"])).toEqual([
      { id: "check_c", sortOrder: 0 },
      { id: "check_a", sortOrder: 1 },
    ]);
  });
});

describe("learner view and completion", () => {
  it("does not expose correct answer flags before submission", () => {
    const view = buildLearnerKnowledgeCheckView({
      id: "check_1",
      lessonId: "lesson_1",
      prompt: "Question",
      questionType: "SINGLE_CHOICE",
      required: true,
      explanation: "Context",
      answers: [
        { id: "a", text: "A", correct: true },
        { id: "b", text: "B", correct: false },
      ],
      latestAttempt: null,
    });

    expect(view.answers).toEqual([
      { id: "a", text: "A" },
      { id: "b", text: "B" },
    ]);
  });

  it("requires required lessons and required active checks for native completion", () => {
    expect(
      calculateNativeCompletionWithChecks({
        requiredLessonCount: 2,
        completedRequiredLessonCount: 2,
        requiredCheckCount: 2,
        completedRequiredCheckCount: 1,
      }),
    ).toEqual({
      completed: false,
      progressPercent: 75,
    });
  });
});
```

Run:

```powershell
npm run test -- src/modules/assessments/knowledge-checks.test.ts
```

Expected: fail because the module does not exist.

- [ ] **Step 2: Implement domain rules**

Create `src/modules/assessments/knowledge-checks.ts`:

```ts
import type { KnowledgeCheckQuestionType } from "./scoring";

export type KnowledgeCheckAnswerDraft = {
  text: string;
  correct: boolean;
  feedback: string | null;
  sortOrder: number;
};

export type KnowledgeCheckDraft = {
  organizationId: string;
  courseId: string;
  lessonId: string | null;
  prompt: string;
  questionType: KnowledgeCheckQuestionType;
  required: boolean;
  active: boolean;
  explanation: string | null;
  answers: KnowledgeCheckAnswerDraft[];
};

export type NativeCompletionInput = {
  requiredLessonCount: number;
  completedRequiredLessonCount: number;
  requiredCheckCount: number;
  completedRequiredCheckCount: number;
};

export function normalizeKnowledgeCheckDraft(draft: KnowledgeCheckDraft): KnowledgeCheckDraft {
  const prompt = draft.prompt.trim();

  if (!prompt) {
    throw new Error("Knowledge check prompt is required");
  }

  const answers = draft.answers
    .map((answer, index) => ({
      ...answer,
      text: answer.text.trim(),
      feedback: answer.feedback?.trim() || null,
      sortOrder: index,
    }))
    .filter((answer) => answer.text.length > 0);

  if (answers.length < 2) {
    throw new Error("Knowledge check must have at least two answers");
  }

  validateCorrectAnswerCount(draft.questionType, answers);

  return {
    ...draft,
    prompt,
    explanation: draft.explanation?.trim() || null,
    answers,
  };
}

export function requireCanActivateKnowledgeCheck(draft: KnowledgeCheckDraft): void {
  const normalized = normalizeKnowledgeCheckDraft(draft);

  if (!normalized.answers.some((answer) => answer.correct)) {
    throw new Error("Active knowledge checks require at least one correct answer");
  }
}

export function reorderKnowledgeChecks(ids: string[]): Array<{ id: string; sortOrder: number }> {
  return ids.map((id, sortOrder) => ({ id, sortOrder }));
}

export function buildLearnerKnowledgeCheckView(input: {
  id: string;
  lessonId: string | null;
  prompt: string;
  questionType: KnowledgeCheckQuestionType;
  required: boolean;
  explanation: string | null;
  answers: Array<{ id: string; text: string; correct: boolean }>;
  latestAttempt: null | { correct: boolean; scorePercent: number; selectedAnswerIds: string[] };
}) {
  return {
    id: input.id,
    lessonId: input.lessonId,
    prompt: input.prompt,
    questionType: input.questionType,
    required: input.required,
    explanation: input.latestAttempt ? input.explanation : null,
    latestAttempt: input.latestAttempt,
    answers: input.answers.map((answer) => ({ id: answer.id, text: answer.text })),
  };
}

export function calculateNativeCompletionWithChecks(input: NativeCompletionInput): {
  completed: boolean;
  progressPercent: number;
} {
  const requiredItems = input.requiredLessonCount + input.requiredCheckCount;

  if (requiredItems === 0) {
    return { completed: true, progressPercent: 100 };
  }

  const completedItems = input.completedRequiredLessonCount + input.completedRequiredCheckCount;
  const progressPercent = Math.round((completedItems / requiredItems) * 100);

  return {
    completed: progressPercent >= 100,
    progressPercent,
  };
}

function validateCorrectAnswerCount(
  questionType: KnowledgeCheckQuestionType,
  answers: KnowledgeCheckAnswerDraft[],
): void {
  const correctCount = answers.filter((answer) => answer.correct).length;

  if (correctCount < 1) {
    throw new Error("Active knowledge checks require at least one correct answer");
  }

  if (questionType === "SINGLE_CHOICE" && correctCount !== 1) {
    throw new Error("Single-answer checks must have exactly one correct answer");
  }

  if (questionType === "TRUE_FALSE" && (answers.length !== 2 || correctCount !== 1)) {
    throw new Error("True/false checks must have one correct answer");
  }
}
```

- [ ] **Step 3: Verify and commit**

Run:

```powershell
npm run test -- src/modules/assessments/knowledge-checks.test.ts
git add src/modules/assessments/knowledge-checks.ts src/modules/assessments/knowledge-checks.test.ts
git commit -m "feat: add knowledge check domain rules"
```

Expected: tests pass and commit succeeds.

## Task 4: Add Prisma Assessment Repository

**Files:**
- Create: `src/modules/assessments/prisma-repository.test.ts`
- Create: `src/modules/assessments/prisma-repository.ts`

- [ ] **Step 1: Write repository query-shape tests**

Tests must use mocked Prisma delegates and assert:

- `listChecksForCourse` filters by `organizationId` and `course.slug`.
- `findCheckForSubmission` filters by `organizationId`, `questionId`, `active: true`, and assignment course id.
- `createAttempt` runs inside `$transaction`, computes next attempt number from existing attempts, writes `assignmentId`, and retries the entire transaction once when the unique key `[organizationId, assignmentId, questionId, attemptNumber]` collides.
- admin create/edit/reorder/activate/deactivate writes include `organizationId`.
- answer replacement deletes answers with `{ organizationId, questionId }`, never by unscoped `questionId`.
- activating an invalid tenant-scoped check fetches the question and answers, runs `requireCanActivateKnowledgeCheck`, and rejects invalid answer structure.
- difficulty report query filters by `organizationId` and course id.

Add this concurrency regression test:

```ts
it("retries createAttempt once after an attempt-number unique conflict", async () => {
  const uniqueConflict = Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
  const secondCreate = vi.fn().mockResolvedValue({ id: "attempt_2" });
  const transaction = vi
    .fn()
    .mockRejectedValueOnce(uniqueConflict)
    .mockImplementationOnce(async (operation) =>
      operation({
        knowledgeCheckAttempt: {
          findFirst: vi.fn().mockResolvedValue({ attemptNumber: 1 }),
          create: secondCreate,
        },
      }),
    );
  const repository = createPrismaKnowledgeCheckRepository({
    $transaction: transaction,
    courseAssignment: {},
    courseKnowledgeCheckQuestion: {},
    courseKnowledgeCheckAnswer: {},
    knowledgeCheckAttempt: {},
  } as never);

  await expect(repository.createAttempt({
    organizationId: "org_1",
    assignmentId: "assignment_1",
    questionId: "check_1",
    selectedAnswerIds: ["answer_1"],
    score: { correct: true, scorePercent: 100, selectedAnswerFeedback: [], explanation: null },
    submittedAt: new Date("2026-06-13T03:00:00.000Z"),
  })).resolves.toEqual({ attemptNumber: 2 });
  expect(transaction).toHaveBeenCalledTimes(2);
  expect(secondCreate).toHaveBeenCalledWith(expect.objectContaining({
    data: expect.objectContaining({ attemptNumber: 2 }),
  }));
});
```

Use this test skeleton:

```ts
import { describe, expect, it, vi } from "vitest";

import { createPrismaKnowledgeCheckRepository } from "./prisma-repository";

describe("createPrismaKnowledgeCheckRepository", () => {
  it("filters course checks by organization and course slug", async () => {
    const client = {
      courseKnowledgeCheckQuestion: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    };
    const repository = createPrismaKnowledgeCheckRepository(client as never);

    await repository.listChecksForCourse({
      organizationId: "org_1",
      courseSlug: "manager-basics",
    });

    expect(client.courseKnowledgeCheckQuestion.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organizationId: "org_1",
          course: { slug: "manager-basics" },
        },
      }),
    );
  });
});
```

Run:

```powershell
npm run test -- src/modules/assessments/prisma-repository.test.ts
```

Expected: fail because the repository module does not exist.

- [ ] **Step 2: Implement repository contract**

Create `src/modules/assessments/prisma-repository.ts` exporting:

```ts
import type { Prisma, PrismaClient } from "@prisma/client";

import { requireCanActivateKnowledgeCheck, type KnowledgeCheckDraft } from "./knowledge-checks";
import type { KnowledgeCheckScore, ScoreableKnowledgeCheck } from "./scoring";

type PrismaKnowledgeCheckClient = Pick<
  PrismaClient,
  "$transaction" | "course" | "courseAssignment" | "courseKnowledgeCheckQuestion" | "courseKnowledgeCheckAnswer" | "knowledgeCheckAttempt"
>;

export type KnowledgeCheckSubmissionAssignment = {
  id: string;
  organizationId: string;
  membershipId: string;
  courseId: string;
  learner: {
    id: string;
    userId: string;
    organizationId: string;
    managerMembershipId: string | null;
  };
};

export type CreateAttemptInput = {
  organizationId: string;
  assignmentId: string;
  questionId: string;
  selectedAnswerIds: string[];
  score: KnowledgeCheckScore;
  submittedAt: Date;
};

export type KnowledgeCheckRepository = {
  listChecksForCourse(input: { organizationId: string; courseSlug: string }): Promise<unknown[]>;
  findAssignmentForSubmission(input: {
    organizationId: string;
    assignmentId: string;
  }): Promise<KnowledgeCheckSubmissionAssignment | null>;
  findCheckForSubmission(input: {
    organizationId: string;
    courseId: string;
    checkId: string;
  }): Promise<ScoreableKnowledgeCheck | null>;
  createAttempt(input: CreateAttemptInput): Promise<{ attemptNumber: number }>;
  createCheck(input: KnowledgeCheckDraft): Promise<{ id: string }>;
  replaceCheck(input: { id: string; draft: KnowledgeCheckDraft }): Promise<void>;
  reorderChecks(input: { organizationId: string; orderedIds: Array<{ id: string; sortOrder: number }> }): Promise<void>;
  setCheckActive(input: { organizationId: string; id: string; active: boolean }): Promise<void>;
};

export function createPrismaKnowledgeCheckRepository(
  client: PrismaKnowledgeCheckClient,
): KnowledgeCheckRepository {
  return {
    async listChecksForCourse(input) {
      return client.courseKnowledgeCheckQuestion.findMany({
        where: {
          organizationId: input.organizationId,
          course: { slug: input.courseSlug },
        },
        orderBy: [{ lessonId: "asc" }, { sortOrder: "asc" }],
        include: { answers: { orderBy: { sortOrder: "asc" } } },
      });
    },
    async findAssignmentForSubmission(input) {
      return client.courseAssignment.findFirst({
        where: {
          id: input.assignmentId,
          organizationId: input.organizationId,
        },
        select: {
          id: true,
          organizationId: true,
          membershipId: true,
          courseId: true,
          learner: {
            select: {
              id: true,
              userId: true,
              organizationId: true,
              managerMembershipId: true,
            },
          },
        },
      }) as Promise<KnowledgeCheckSubmissionAssignment | null>;
    },
    async findCheckForSubmission(input) {
      const question = await client.courseKnowledgeCheckQuestion.findFirst({
        where: {
          id: input.checkId,
          organizationId: input.organizationId,
          courseId: input.courseId,
          active: true,
        },
        select: {
          id: true,
          questionType: true,
          explanation: true,
          answers: {
            orderBy: { sortOrder: "asc" },
            select: { id: true, correct: true, feedback: true },
          },
        },
      });

      return question as ScoreableKnowledgeCheck | null;
    },
    async createAttempt(input) {
      return createAttemptWithUniqueRetry(() => client.$transaction(async (transaction) => {
        const latest = await transaction.knowledgeCheckAttempt.findFirst({
          where: {
            organizationId: input.organizationId,
            assignmentId: input.assignmentId,
            questionId: input.questionId,
          },
          orderBy: { attemptNumber: "desc" },
          select: { attemptNumber: true },
        });
        const attemptNumber = (latest?.attemptNumber ?? 0) + 1;

        await transaction.knowledgeCheckAttempt.create({
          data: {
            organizationId: input.organizationId,
            assignmentId: input.assignmentId,
            questionId: input.questionId,
            attemptNumber,
            selectedAnswerIds: input.selectedAnswerIds,
            correct: input.score.correct,
            scorePercent: input.score.scorePercent,
            submittedAt: input.submittedAt,
          },
        });

        return { attemptNumber };
      }));
    },
    async createCheck(input) {
      return client.courseKnowledgeCheckQuestion.create({
        data: {
          organizationId: input.organizationId,
          courseId: input.courseId,
          lessonId: input.lessonId,
          prompt: input.prompt,
          questionType: input.questionType,
          required: input.required,
          active: input.active,
          explanation: input.explanation,
          answers: {
            create: input.answers.map((answer) => ({
              organizationId: input.organizationId,
              text: answer.text,
              correct: answer.correct,
              feedback: answer.feedback,
              sortOrder: answer.sortOrder,
            })),
          },
        },
        select: { id: true },
      });
    },
    async replaceCheck(input) {
      await client.$transaction(async (transaction) => {
        const existing = await transaction.courseKnowledgeCheckQuestion.findFirst({
          where: {
            id: input.id,
            organizationId: input.draft.organizationId,
          },
          select: { id: true },
        });

        if (!existing) {
          throw new Error("Knowledge check was not found");
        }

        await transaction.courseKnowledgeCheckAnswer.deleteMany({
          where: {
            organizationId: input.draft.organizationId,
            questionId: input.id,
          },
        });
        await transaction.courseKnowledgeCheckQuestion.update({
          where: {
            organizationId_id: {
              organizationId: input.draft.organizationId,
              id: input.id,
            },
          },
          data: {
            prompt: input.draft.prompt,
            lessonId: input.draft.lessonId,
            questionType: input.draft.questionType,
            required: input.draft.required,
            active: input.draft.active,
            explanation: input.draft.explanation,
            answers: {
              create: input.draft.answers.map((answer) => ({
                organizationId: input.draft.organizationId,
                text: answer.text,
                correct: answer.correct,
                feedback: answer.feedback,
                sortOrder: answer.sortOrder,
              })),
            },
          },
        });
      });
    },
    async reorderChecks(input) {
      await client.$transaction(
        input.orderedIds.map((item) =>
          client.courseKnowledgeCheckQuestion.update({
            where: { organizationId_id: { organizationId: input.organizationId, id: item.id } },
            data: { sortOrder: item.sortOrder },
          }),
        ),
      );
    },
    async setCheckActive(input) {
      if (input.active) {
        const check = await client.courseKnowledgeCheckQuestion.findFirst({
          where: {
            id: input.id,
            organizationId: input.organizationId,
          },
          select: {
            organizationId: true,
            courseId: true,
            lessonId: true,
            prompt: true,
            questionType: true,
            required: true,
            active: true,
            explanation: true,
            answers: {
              where: { organizationId: input.organizationId },
              orderBy: { sortOrder: "asc" },
              select: {
                text: true,
                correct: true,
                feedback: true,
                sortOrder: true,
              },
            },
          },
        });

        if (!check) {
          throw new Error("Knowledge check was not found");
        }

        requireCanActivateKnowledgeCheck(check);
      }

      await client.courseKnowledgeCheckQuestion.update({
        where: { organizationId_id: { organizationId: input.organizationId, id: input.id } },
        data: { active: input.active },
      });
    },
  };
}

async function createAttemptWithUniqueRetry(
  operation: () => Promise<{ attemptNumber: number }>,
): Promise<{ attemptNumber: number }> {
  try {
    return await operation();
  } catch (error) {
    if (!isUniqueConstraintError(error)) {
      throw error;
    }

    return operation();
  }
}

function isUniqueConstraintError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}
```

Adjust `PrismaKnowledgeCheckClient` after `npm run prisma:generate` if Prisma delegate names differ because an upstream branch merged compatible models first.

Repository transaction note: the retry starts a new `$transaction` after the first transaction fails on the unique constraint. Do not catch the unique conflict inside the transaction callback; in Prisma/PostgreSQL the failed write aborts that transaction.

- [ ] **Step 3: Verify and commit**

Run:

```powershell
npm run test -- src/modules/assessments/prisma-repository.test.ts
git add src/modules/assessments/prisma-repository.ts src/modules/assessments/prisma-repository.test.ts
git commit -m "feat: add knowledge check prisma repository"
```

Expected: tests pass and commit succeeds.

## Task 5: Add Admin Server Actions

**Files:**
- Create: `src/modules/assessments/server-actions.test.ts`
- Create: `src/modules/assessments/server-actions.ts`

- [ ] **Step 1: Write action tests**

Tests must prove:

- `createCheck` parses `questionType`, `prompt`, `lessonId`, `required`, `active`, `explanation`, and answer rows from `FormData`.
- invalid drafts return `{ ok: false, message }`.
- `reorderChecks` parses a JSON array of ids and calls `reorderKnowledgeChecks`.
- `activateCheck` and `deactivateCheck` call repository with the authenticated `organizationId`.
- `activateCheck` returns the repository validation error when the tenant-scoped check has no valid correct answer structure.
- action factories receive `slug` and `courseSlug` from the route bridge instead of trusting hidden organization ids.

Use this skeleton:

```ts
import { describe, expect, it, vi } from "vitest";

import { createKnowledgeCheckAdminActions } from "./server-actions";

describe("createKnowledgeCheckAdminActions", () => {
  it("creates a normalized check from form data", async () => {
    const repository = { createCheck: vi.fn().mockResolvedValue({ id: "check_1" }) };
    const actions = createKnowledgeCheckAdminActions({
      getActorAndCourse: vi.fn().mockResolvedValue({
        organizationId: "org_1",
        courseId: "course_1",
        actorId: "user_1",
      }),
      repository: repository as never,
    });
    const formData = new FormData();
    formData.set("prompt", "Which response is best?");
    formData.set("questionType", "SINGLE_CHOICE");
    formData.set("lessonId", "lesson_1");
    formData.set("required", "on");
    formData.set("active", "on");
    formData.set("explanation", "Use neutral language.");
    formData.set("answers", JSON.stringify([
      { text: "What happened?", correct: true, feedback: "Correct." },
      { text: "Why did you fail?", correct: false, feedback: "Too accusatory." },
    ]));

    await expect(actions.createCheck("acme", "manager-basics", formData)).resolves.toEqual({
      ok: true,
      id: "check_1",
    });
    expect(repository.createCheck).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: "org_1",
      courseId: "course_1",
    }));
  });
});
```

Run:

```powershell
npm run test -- src/modules/assessments/server-actions.test.ts
```

Expected: fail because the server-actions module does not exist.

- [ ] **Step 2: Implement action factories**

Create `src/modules/assessments/server-actions.ts`:

```ts
import { normalizeKnowledgeCheckDraft, reorderKnowledgeChecks } from "./knowledge-checks";
import type { KnowledgeCheckRepository } from "./prisma-repository";
import type { KnowledgeCheckQuestionType } from "./scoring";

export type KnowledgeCheckActionResult =
  | { ok: true; id?: string }
  | { ok: false; message: string };

export type KnowledgeCheckAdminActionDeps = {
  getActorAndCourse(slug: string, courseSlug: string): Promise<{
    organizationId: string;
    courseId: string;
    actorId: string;
  }>;
  repository: Pick<KnowledgeCheckRepository, "createCheck" | "replaceCheck" | "reorderChecks" | "setCheckActive">;
};

export function createKnowledgeCheckAdminActions(deps: KnowledgeCheckAdminActionDeps) {
  return {
    async createCheck(slug: string, courseSlug: string, formData: FormData): Promise<KnowledgeCheckActionResult> {
      try {
        const course = await deps.getActorAndCourse(slug, courseSlug);
        const draft = normalizeKnowledgeCheckDraft(parseDraftForm(course.organizationId, course.courseId, formData));
        const created = await deps.repository.createCheck(draft);

        return { ok: true, id: created.id };
      } catch (error) {
        return { ok: false, message: error instanceof Error ? error.message : "Knowledge check could not be saved" };
      }
    },
    async updateCheck(slug: string, courseSlug: string, checkId: string, formData: FormData): Promise<KnowledgeCheckActionResult> {
      try {
        const course = await deps.getActorAndCourse(slug, courseSlug);
        const draft = normalizeKnowledgeCheckDraft(parseDraftForm(course.organizationId, course.courseId, formData));
        await deps.repository.replaceCheck({ id: checkId, draft });

        return { ok: true, id: checkId };
      } catch (error) {
        return { ok: false, message: error instanceof Error ? error.message : "Knowledge check could not be saved" };
      }
    },
    async reorderChecks(slug: string, courseSlug: string, formData: FormData): Promise<KnowledgeCheckActionResult> {
      const course = await deps.getActorAndCourse(slug, courseSlug);
      const ids = JSON.parse(String(formData.get("ids") ?? "[]")) as string[];
      await deps.repository.reorderChecks({
        organizationId: course.organizationId,
        orderedIds: reorderKnowledgeChecks(ids),
      });

      return { ok: true };
    },
    async activateCheck(slug: string, courseSlug: string, checkId: string): Promise<KnowledgeCheckActionResult> {
      try {
        const course = await deps.getActorAndCourse(slug, courseSlug);
        await deps.repository.setCheckActive({ organizationId: course.organizationId, id: checkId, active: true });

        return { ok: true, id: checkId };
      } catch (error) {
        return { ok: false, message: error instanceof Error ? error.message : "Knowledge check could not be activated" };
      }
    },
    async deactivateCheck(slug: string, courseSlug: string, checkId: string): Promise<KnowledgeCheckActionResult> {
      try {
        const course = await deps.getActorAndCourse(slug, courseSlug);
        await deps.repository.setCheckActive({ organizationId: course.organizationId, id: checkId, active: false });

        return { ok: true, id: checkId };
      } catch (error) {
        return { ok: false, message: error instanceof Error ? error.message : "Knowledge check could not be deactivated" };
      }
    },
  };
}

function parseDraftForm(organizationId: string, courseId: string, formData: FormData) {
  return {
    organizationId,
    courseId,
    lessonId: emptyToNull(formData.get("lessonId")),
    prompt: String(formData.get("prompt") ?? ""),
    questionType: String(formData.get("questionType") ?? "SINGLE_CHOICE") as KnowledgeCheckQuestionType,
    required: formData.get("required") === "on",
    active: formData.get("active") === "on",
    explanation: emptyToNull(formData.get("explanation")),
    answers: parseAnswers(String(formData.get("answers") ?? "[]")),
  };
}

function parseAnswers(raw: string): Array<{ text: string; correct: boolean; feedback: string | null; sortOrder: number }> {
  const parsed = JSON.parse(raw) as Array<{ text: string; correct: boolean; feedback?: string | null }>;

  return parsed.map((answer, index) => ({
    text: answer.text,
    correct: answer.correct,
    feedback: answer.feedback ?? null,
    sortOrder: index,
  }));
}

function emptyToNull(value: FormDataEntryValue | null): string | null {
  const text = String(value ?? "").trim();
  return text ? text : null;
}
```

- [ ] **Step 3: Verify and commit**

Run:

```powershell
npm run test -- src/modules/assessments/server-actions.test.ts
git add src/modules/assessments/server-actions.ts src/modules/assessments/server-actions.test.ts
git commit -m "feat: add knowledge check admin actions"
```

Expected: tests pass and commit succeeds.

## Task 6: Add Learner Submit Route

**Files:**
- Create: `src/app/api/org/[slug]/assignments/[assignmentId]/checks/[checkId]/submit/route.ts`
- Create: `src/app/api/org/[slug]/assignments/[assignmentId]/checks/[checkId]/submit/route.test.ts`

- [ ] **Step 1: Write route tests**

Create route tests that assert:

- unauthenticated requests are redirected or return `401` according to current guard test conventions.
- a learner from another organization cannot submit.
- assignment owner can submit selected answer ids and receives correctness, score, answer feedback, explanation, and attempt number.
- inactive or mismatched course checks return `404`.
- unlimited retries create attempt numbers `1`, then `2`.
- malformed JSON or a body where `selectedAnswerIds` is not an array returns `400` with a controlled validation message.

Use route-handler dependency tests if existing route tests are direct imports; otherwise test the helper exported from the route file:

```ts
import { describe, expect, it, vi } from "vitest";

import { POST, parseSelectedAnswerIds, submitKnowledgeCheckForLearner } from "./route";

describe("submitKnowledgeCheckForLearner", () => {
  it("scores and stores a learner attempt", async () => {
    const repository = {
      findAssignmentForSubmission: vi.fn().mockResolvedValue({
        id: "assignment_1",
        organizationId: "org_1",
        membershipId: "membership_1",
        courseId: "course_1",
        learner: {
          id: "membership_1",
          userId: "user_1",
          organizationId: "org_1",
          managerMembershipId: null,
        },
      }),
      findCheckForSubmission: vi.fn().mockResolvedValue({
        id: "check_1",
        questionType: "SINGLE_CHOICE",
        explanation: "Open questions reveal blockers.",
        answers: [
          { id: "answer_1", correct: true, feedback: "Correct." },
          { id: "answer_2", correct: false, feedback: "Review the lesson." },
        ],
      }),
      createAttempt: vi.fn().mockResolvedValue({ attemptNumber: 1 }),
    };

    await expect(
      submitKnowledgeCheckForLearner({
        context: {
          userId: "user_1",
          isPlatformOwner: false,
          memberships: [{ id: "membership_1", organizationId: "org_1", roles: ["LEARNER"], status: "ACTIVE", managerMembershipId: null }],
        },
        organizationId: "org_1",
        assignmentId: "assignment_1",
        checkId: "check_1",
        selectedAnswerIds: ["answer_1"],
        submittedAt: new Date("2026-06-13T03:00:00.000Z"),
        repository: repository as never,
      }),
    ).resolves.toEqual({
      correct: true,
      scorePercent: 100,
      attemptNumber: 1,
      selectedAnswerFeedback: ["Correct."],
      explanation: "Open questions reveal blockers.",
    });
  });

  it("rejects non-array selectedAnswerIds with a controlled validation error", async () => {
    expect(() => parseSelectedAnswerIds({ selectedAnswerIds: "answer_1" })).toThrow(
      "selectedAnswerIds must be an array",
    );
  });

  it("returns 400 when the JSON body is malformed", async () => {
    const response = await POST(
      { json: async () => { throw new SyntaxError("Unexpected token"); } } as never,
      { params: Promise.resolve({ slug: "acme", assignmentId: "assignment_1", checkId: "check_1" }) },
    );

    expect(response.status).toBe(400);
  });
});
```

Run:

```powershell
npm run test -- src/app/api/org/[slug]/assignments/[assignmentId]/checks/[checkId]/submit/route.test.ts
```

Expected: fail because the route helper does not exist.

- [ ] **Step 2: Implement submit route**

Create the route file with a pure helper and `POST` bridge:

```ts
import { NextResponse } from "next/server";

import { requireOrganizationMemberBySlug } from "@/lib/auth/guards";
import { canLaunchRuntimeAssignment, type MembershipAuthContext } from "@/modules/auth/permissions";
import { createPrismaKnowledgeCheckRepository, type KnowledgeCheckRepository } from "@/modules/assessments/prisma-repository";
import { scoreKnowledgeCheck } from "@/modules/assessments/scoring";

export const dynamic = "force-dynamic";

export type SubmitKnowledgeCheckInput = {
  context: MembershipAuthContext;
  organizationId: string;
  assignmentId: string;
  checkId: string;
  selectedAnswerIds: string[];
  submittedAt: Date;
  repository: KnowledgeCheckRepository;
};

export async function submitKnowledgeCheckForLearner(input: SubmitKnowledgeCheckInput) {
  const assignment = await input.repository.findAssignmentForSubmission({
    organizationId: input.organizationId,
    assignmentId: input.assignmentId,
  });

  if (!assignment || !canLaunchRuntimeAssignment(input.context, assignment)) {
    throw new Error("Assignment was not found");
  }

  const check = await input.repository.findCheckForSubmission({
    organizationId: input.organizationId,
    courseId: assignment.courseId,
    checkId: input.checkId,
  });

  if (!check) {
    throw new Error("Knowledge check was not found");
  }

  const score = scoreKnowledgeCheck(check, input.selectedAnswerIds);
  const attempt = await input.repository.createAttempt({
    organizationId: input.organizationId,
    assignmentId: assignment.id,
    questionId: check.id,
    selectedAnswerIds: input.selectedAnswerIds,
    score,
    submittedAt: input.submittedAt,
  });

  return {
    correct: score.correct,
    scorePercent: score.scorePercent,
    attemptNumber: attempt.attemptNumber,
    selectedAnswerFeedback: score.selectedAnswerFeedback,
    explanation: score.explanation,
  };
}

export function parseSelectedAnswerIds(body: unknown): string[] {
  if (!body || typeof body !== "object" || !("selectedAnswerIds" in body)) {
    return [];
  }

  const selectedAnswerIds = (body as { selectedAnswerIds: unknown }).selectedAnswerIds;

  if (!Array.isArray(selectedAnswerIds) || !selectedAnswerIds.every((value) => typeof value === "string")) {
    throw new Error("selectedAnswerIds must be an array");
  }

  return selectedAnswerIds;
}

type RouteContext = {
  params: Promise<{
    slug: string;
    assignmentId: string;
    checkId: string;
  }>;
};

export async function POST(request: Request, { params }: RouteContext) {
  const { slug, assignmentId, checkId } = await params;
  const { context, organizationId } = await requireOrganizationMemberBySlug(slug);
  const { prisma } = await import("@/lib/prisma");

  try {
    const body = await request.json();
    const selectedAnswerIds = parseSelectedAnswerIds(body);
    const result = await submitKnowledgeCheckForLearner({
      context,
      organizationId,
      assignmentId,
      checkId,
      selectedAnswerIds,
      submittedAt: new Date(),
      repository: createPrismaKnowledgeCheckRepository(prisma),
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Knowledge check could not be submitted";
    const status = message.includes("not found") ? 404 : 400;

    return NextResponse.json({ message }, { status });
  }
}
```

- [ ] **Step 3: Verify and commit**

Run:

```powershell
npm run test -- src/app/api/org/[slug]/assignments/[assignmentId]/checks/[checkId]/submit/route.test.ts
npm run build
git add src/app/api/org/[slug]/assignments/[assignmentId]/checks/[checkId]/submit/route.ts src/app/api/org/[slug]/assignments/[assignmentId]/checks/[checkId]/submit/route.test.ts
git commit -m "feat: add knowledge check submit route"
```

Expected: focused tests and build pass, then commit succeeds.

## Task 7: Integrate Checks With Video Runtime And Progress

**Files:**
- Modify: `src/modules/video/video-runtime.ts`
- Modify: `src/modules/video/video-runtime.test.ts`
- Modify: `src/modules/progress/progress.ts`
- Modify: `src/modules/progress/progress.test.ts`

- [ ] **Step 1: Extend runtime tests**

Add tests proving:

- launch output includes active checks grouped by lesson.
- inactive checks are excluded.
- learner launch view does not expose answer correctness.
- course progress uses required lessons plus required active checks.
- native completion event fires only when all required lessons and checks are completed.
- raw payload contains `requiredChecksCompleted` and `requiredChecksTotal`.

Add this representative assertion to `src/modules/video/video-runtime.test.ts`:

```ts
it("requires required active knowledge checks for native course completion", async () => {
  const assignment = structuredClone(nativeAssignment);
  assignment.course.knowledgeChecks = [
    { id: "check_1", lessonId: "lesson_1", required: true, active: true },
  ];
  assignment.knowledgeCheckAttempts = [
    { questionId: "check_1", correct: true, scorePercent: 100 },
  ];
  assignment.videoProgress = assignment.course.lessons.map((lesson) => ({
    lessonId: lesson.id,
    lastPositionSecond: lesson.durationSeconds,
    maxWatchedSecond: lesson.durationSeconds,
    completed: true,
    lastWatchedAt: occurredAt,
  }));

  const repository = createRepository(assignment);

  await recordVideoProgress(
    createProgressInput({ lessonId: "lesson_2", positionSecond: 120, watchedSecond: 120 }),
    repository,
  );

  expect(repository.learningEvents[0]).toMatchObject({
    type: "COMPLETED",
    progressPercent: 100,
    rawPayload: {
      requiredChecksCompleted: 1,
      requiredChecksTotal: 1,
    },
  });
});
```

Run:

```powershell
npm run test -- src/modules/video/video-runtime.test.ts src/modules/progress/progress.test.ts
```

Expected: fail until runtime types and progress payload handling are updated.

- [ ] **Step 2: Extend video runtime types and completion calculation**

In `src/modules/video/video-runtime.ts`:

- Add `knowledgeChecks` to `VideoRuntimeAssignment.course`.
- Add `knowledgeCheckAttempts` to `VideoRuntimeAssignment`.
- Add `VideoRuntimeKnowledgeCheck` and `VideoRuntimeKnowledgeCheckAttempt` types.
- Use `buildLearnerKnowledgeCheckView` for launch output.
- Replace lesson-only `summarizeRequiredLessonProgress` with combined lesson/check summary from `calculateNativeCompletionWithChecks`.

The completion raw payload must include:

```ts
rawPayload: {
  lessonId: lesson.id,
  positionSecond,
  watchedSecond,
  requiredLessonsCompleted: progressSummary.completedRequiredLessonCount,
  requiredLessonsTotal: progressSummary.requiredLessonCount,
  requiredChecksCompleted: progressSummary.completedRequiredCheckCount,
  requiredChecksTotal: progressSummary.requiredCheckCount,
}
```

- [ ] **Step 3: Keep progress service source-compatible**

In `src/modules/progress/progress.ts`, keep `LearningEventInput.rawPayload: unknown`. Add a test proving native completion still reaches `100` when the event type is `COMPLETED` and raw payload includes check counts:

```ts
await recordLearningEvent(
  {
    organizationId: "org_1",
    assignmentId: "assignment_1",
    source: "NATIVE",
    type: "COMPLETED",
    progressPercent: 100,
    occurredAt,
    rawPayload: {
      requiredLessonsCompleted: 2,
      requiredLessonsTotal: 2,
      requiredChecksCompleted: 1,
      requiredChecksTotal: 1,
    },
  },
  repository,
);
```

- [ ] **Step 4: Verify and commit**

Run:

```powershell
npm run test -- src/modules/video/video-runtime.test.ts src/modules/progress/progress.test.ts
git add src/modules/video/video-runtime.ts src/modules/video/video-runtime.test.ts src/modules/progress/progress.ts src/modules/progress/progress.test.ts
git commit -m "feat: include knowledge checks in native completion"
```

Expected: tests pass and commit succeeds.

## Task 8: Add Feedback Domain

**Files:**
- Create: `src/modules/feedback/course-feedback.test.ts`
- Create: `src/modules/feedback/course-feedback.ts`
- Create: `src/modules/feedback/prisma-repository.test.ts`
- Create: `src/modules/feedback/prisma-repository.ts`
- Create: `src/app/api/org/[slug]/assignments/[assignmentId]/feedback/route.test.ts`
- Create: `src/app/api/org/[slug]/assignments/[assignmentId]/feedback/route.ts`

- [ ] **Step 1: Write feedback tests**

Create domain tests for rating validation, optional text, tenant isolation, and satisfaction aggregation:

```ts
import { describe, expect, it } from "vitest";

import { aggregateCourseSatisfaction, normalizeCourseFeedback } from "./course-feedback";

describe("normalizeCourseFeedback", () => {
  it("accepts one to five stars with optional text", () => {
    expect(normalizeCourseFeedback({ stars: 5, text: "Useful course." })).toEqual({
      stars: 5,
      text: "Useful course.",
    });
  });

  it("rejects stars outside the supported range", () => {
    expect(() => normalizeCourseFeedback({ stars: 0, text: null })).toThrow("Course rating must be between 1 and 5 stars");
    expect(() => normalizeCourseFeedback({ stars: 6, text: null })).toThrow("Course rating must be between 1 and 5 stars");
  });
});

describe("aggregateCourseSatisfaction", () => {
  it("aggregates ratings and feedback by tenant and course", () => {
    expect(
      aggregateCourseSatisfaction([
        { organizationId: "org_1", courseId: "course_1", stars: 5, text: "Great" },
        { organizationId: "org_1", courseId: "course_1", stars: 3, text: null },
        { organizationId: "org_2", courseId: "course_1", stars: 1, text: "Other tenant" },
      ], "org_1"),
    ).toEqual([
      {
        organizationId: "org_1",
        courseId: "course_1",
        ratingCount: 2,
        averageStars: 4,
        feedback: ["Great"],
      },
    ]);
  });
});
```

Run:

```powershell
npm run test -- src/modules/feedback/course-feedback.test.ts
```

Expected: fail because the feedback module does not exist.

- [ ] **Step 2: Implement feedback helpers**

Create `src/modules/feedback/course-feedback.ts`:

```ts
export type CourseFeedbackInput = {
  stars: number;
  text: string | null;
};

export type CourseFeedbackRow = {
  organizationId: string;
  courseId: string;
  assignmentId?: string;
  membershipId?: string;
  stars: number;
  text: string | null;
};

export function normalizeCourseFeedback(input: CourseFeedbackInput): CourseFeedbackInput {
  if (!Number.isInteger(input.stars) || input.stars < 1 || input.stars > 5) {
    throw new Error("Course rating must be between 1 and 5 stars");
  }

  return {
    stars: input.stars,
    text: input.text?.trim() || null,
  };
}

export function aggregateCourseSatisfaction(rows: CourseFeedbackRow[], organizationId: string) {
  const grouped = new Map<string, CourseFeedbackRow[]>();

  for (const row of rows.filter((candidate) => candidate.organizationId === organizationId)) {
    grouped.set(row.courseId, [...(grouped.get(row.courseId) ?? []), row]);
  }

  return [...grouped.entries()].map(([courseId, courseRows]) => ({
    organizationId,
    courseId,
    ratingCount: courseRows.length,
    averageStars: Math.round((courseRows.reduce((sum, row) => sum + row.stars, 0) / courseRows.length) * 10) / 10,
    feedback: courseRows.map((row) => row.text).filter((text): text is string => Boolean(text)),
  }));
}
```

- [ ] **Step 3: Write repository and route tests**

Create `src/modules/feedback/prisma-repository.test.ts` with tests proving:

- `findAssignmentForFeedback` filters by `{ organizationId, assignmentId }` and selects `course.type`.
- `upsertCourseFeedback` persists by `organizationId_assignmentId`.
- feedback writes include `organizationId`, `courseId`, `assignmentId`, `membershipId`, `stars`, `text`, and `submittedAt`.
- satisfaction reads filter by `organizationId`.
- non-native-video assignments are rejected by the route helper with `Course feedback is only supported for native video assignments`.

Use this skeleton:

```ts
import { describe, expect, it, vi } from "vitest";

import { createPrismaCourseFeedbackRepository } from "./prisma-repository";

describe("createPrismaCourseFeedbackRepository", () => {
  it("loads assignment ownership through tenant scope", async () => {
    const client = {
      courseAssignment: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
      courseFeedback: {
        upsert: vi.fn(),
        findMany: vi.fn(),
      },
    };
    const repository = createPrismaCourseFeedbackRepository(client as never);

    await repository.findAssignmentForFeedback({
      organizationId: "org_1",
      assignmentId: "assignment_1",
    });

    expect(client.courseAssignment.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "assignment_1",
          organizationId: "org_1",
        },
        select: expect.objectContaining({
          course: { select: { type: true } },
        }),
      }),
    );
  });

  it("upserts feedback by organization and assignment", async () => {
    const client = {
      courseAssignment: { findFirst: vi.fn() },
      courseFeedback: {
        upsert: vi.fn().mockResolvedValue({ id: "feedback_1" }),
        findMany: vi.fn(),
      },
    };
    const repository = createPrismaCourseFeedbackRepository(client as never);

    await repository.upsertCourseFeedback({
      organizationId: "org_1",
      courseId: "course_1",
      assignmentId: "assignment_1",
      membershipId: "membership_1",
      stars: 5,
      text: "Useful course.",
      submittedAt: new Date("2026-06-13T04:00:00.000Z"),
    });

    expect(client.courseFeedback.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organizationId_assignmentId: {
            organizationId: "org_1",
            assignmentId: "assignment_1",
          },
        },
      }),
    );
  });
});
```

Create `src/app/api/org/[slug]/assignments/[assignmentId]/feedback/route.test.ts` with tests proving:

- invalid stars are rejected.
- optional text is trimmed to `null` when blank.
- assignment owner can persist feedback.
- learners from another organization or membership cannot persist feedback.
- malformed JSON or a body without numeric `stars` returns `400` with a controlled validation message.

Use this route-helper skeleton:

```ts
import { describe, expect, it, vi } from "vitest";

import { POST, parseCourseFeedbackBody, submitCourseFeedbackForLearner } from "./route";

describe("submitCourseFeedbackForLearner", () => {
  it("validates, scopes, and persists learner feedback", async () => {
    const repository = {
      findAssignmentForFeedback: vi.fn().mockResolvedValue({
        id: "assignment_1",
        organizationId: "org_1",
        courseId: "course_1",
        courseType: "NATIVE_VIDEO",
        membershipId: "membership_1",
        learner: {
          id: "membership_1",
          userId: "user_1",
          organizationId: "org_1",
          managerMembershipId: null,
        },
      }),
      upsertCourseFeedback: vi.fn().mockResolvedValue({ id: "feedback_1" }),
    };

    await expect(
      submitCourseFeedbackForLearner({
        context: {
          userId: "user_1",
          isPlatformOwner: false,
          memberships: [{ id: "membership_1", organizationId: "org_1", roles: ["LEARNER"], status: "ACTIVE", managerMembershipId: null }],
        },
        organizationId: "org_1",
        assignmentId: "assignment_1",
        stars: 5,
        text: "  Useful course.  ",
        submittedAt: new Date("2026-06-13T04:00:00.000Z"),
        repository: repository as never,
      }),
    ).resolves.toEqual({ ok: true, id: "feedback_1" });

    expect(repository.upsertCourseFeedback).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: "org_1",
      assignmentId: "assignment_1",
      courseId: "course_1",
      membershipId: "membership_1",
      stars: 5,
      text: "Useful course.",
    }));
  });

  it("rejects feedback for non-native-video assignments", async () => {
    const repository = {
      findAssignmentForFeedback: vi.fn().mockResolvedValue({
        id: "assignment_1",
        organizationId: "org_1",
        courseId: "course_1",
        courseType: "SCORM_1_2",
        membershipId: "membership_1",
        learner: {
          id: "membership_1",
          userId: "user_1",
          organizationId: "org_1",
          managerMembershipId: null,
        },
      }),
      upsertCourseFeedback: vi.fn(),
    };

    await expect(
      submitCourseFeedbackForLearner({
        context: {
          userId: "user_1",
          isPlatformOwner: false,
          memberships: [{ id: "membership_1", organizationId: "org_1", roles: ["LEARNER"], status: "ACTIVE", managerMembershipId: null }],
        },
        organizationId: "org_1",
        assignmentId: "assignment_1",
        stars: 4,
        text: null,
        submittedAt: new Date("2026-06-13T04:00:00.000Z"),
        repository: repository as never,
      }),
    ).rejects.toThrow("Course feedback is only supported for native video assignments");
  });

  it("rejects feedback bodies without numeric stars", () => {
    expect(() => parseCourseFeedbackBody({ stars: "5", text: null })).toThrow(
      "stars must be a number",
    );
  });

  it("returns 400 when the feedback JSON body is malformed", async () => {
    const response = await POST(
      { json: async () => { throw new SyntaxError("Unexpected token"); } } as never,
      { params: Promise.resolve({ slug: "acme", assignmentId: "assignment_1" }) },
    );

    expect(response.status).toBe(400);
  });
});
```

Run:

```powershell
npm run test -- src/modules/feedback/prisma-repository.test.ts src/app/api/org/[slug]/assignments/[assignmentId]/feedback/route.test.ts
```

Expected: fail because the repository and route do not exist.

- [ ] **Step 4: Implement feedback repository**

Create `src/modules/feedback/prisma-repository.ts`:

```ts
import type { PrismaClient } from "@prisma/client";

export type FeedbackAssignment = {
  id: string;
  organizationId: string;
  courseId: string;
  courseType: "NATIVE_VIDEO" | "SCORM_1_2";
  membershipId: string;
  learner: {
    id: string;
    userId: string;
    organizationId: string;
    managerMembershipId: string | null;
  };
};

export type UpsertCourseFeedbackInput = {
  organizationId: string;
  courseId: string;
  assignmentId: string;
  membershipId: string;
  stars: number;
  text: string | null;
  submittedAt: Date;
};

type PrismaCourseFeedbackClient = Pick<PrismaClient, "courseAssignment" | "courseFeedback">;

export type CourseFeedbackRepository = {
  findAssignmentForFeedback(input: { organizationId: string; assignmentId: string }): Promise<FeedbackAssignment | null>;
  upsertCourseFeedback(input: UpsertCourseFeedbackInput): Promise<{ id: string }>;
  listSatisfactionRows(input: { organizationId: string }): Promise<Array<{
    organizationId: string;
    courseId: string;
    assignmentId: string;
    membershipId: string;
    stars: number;
    text: string | null;
  }>>;
};

export function createPrismaCourseFeedbackRepository(
  client: PrismaCourseFeedbackClient,
): CourseFeedbackRepository {
  return {
    async findAssignmentForFeedback(input) {
      const assignment = await client.courseAssignment.findFirst({
        where: {
          id: input.assignmentId,
          organizationId: input.organizationId,
        },
        select: {
          id: true,
          organizationId: true,
          courseId: true,
          membershipId: true,
          course: {
            select: {
              type: true,
            },
          },
          learner: {
            select: {
              id: true,
              userId: true,
              organizationId: true,
              managerMembershipId: true,
            },
          },
        },
      });

      return assignment
        ? {
            id: assignment.id,
            organizationId: assignment.organizationId,
            courseId: assignment.courseId,
            courseType: assignment.course.type,
            membershipId: assignment.membershipId,
            learner: assignment.learner,
          }
        : null;
    },
    async upsertCourseFeedback(input) {
      return client.courseFeedback.upsert({
        where: {
          organizationId_assignmentId: {
            organizationId: input.organizationId,
            assignmentId: input.assignmentId,
          },
        },
        update: {
          stars: input.stars,
          text: input.text,
          submittedAt: input.submittedAt,
        },
        create: {
          organizationId: input.organizationId,
          courseId: input.courseId,
          assignmentId: input.assignmentId,
          membershipId: input.membershipId,
          stars: input.stars,
          text: input.text,
          submittedAt: input.submittedAt,
        },
        select: { id: true },
      });
    },
    async listSatisfactionRows(input) {
      return client.courseFeedback.findMany({
        where: { organizationId: input.organizationId },
        select: {
          organizationId: true,
          courseId: true,
          assignmentId: true,
          membershipId: true,
          stars: true,
          text: true,
        },
      });
    },
  };
}
```

- [ ] **Step 5: Implement feedback route**

Create `src/app/api/org/[slug]/assignments/[assignmentId]/feedback/route.ts`:

```ts
import { NextResponse } from "next/server";

import { requireOrganizationMemberBySlug } from "@/lib/auth/guards";
import { canLaunchRuntimeAssignment, type MembershipAuthContext } from "@/modules/auth/permissions";
import { normalizeCourseFeedback } from "@/modules/feedback/course-feedback";
import { createPrismaCourseFeedbackRepository, type CourseFeedbackRepository } from "@/modules/feedback/prisma-repository";

export const dynamic = "force-dynamic";

export type SubmitCourseFeedbackInput = {
  context: MembershipAuthContext;
  organizationId: string;
  assignmentId: string;
  stars: number;
  text: string | null;
  submittedAt: Date;
  repository: CourseFeedbackRepository;
};

export async function submitCourseFeedbackForLearner(input: SubmitCourseFeedbackInput) {
  const normalized = normalizeCourseFeedback({ stars: input.stars, text: input.text });
  const assignment = await input.repository.findAssignmentForFeedback({
    organizationId: input.organizationId,
    assignmentId: input.assignmentId,
  });

  if (!assignment || !canLaunchRuntimeAssignment(input.context, assignment)) {
    throw new Error("Assignment was not found");
  }

  if (assignment.courseType !== "NATIVE_VIDEO") {
    throw new Error("Course feedback is only supported for native video assignments");
  }

  const saved = await input.repository.upsertCourseFeedback({
    organizationId: input.organizationId,
    courseId: assignment.courseId,
    assignmentId: assignment.id,
    membershipId: assignment.membershipId,
    stars: normalized.stars,
    text: normalized.text,
    submittedAt: input.submittedAt,
  });

  return { ok: true, id: saved.id };
}

export function parseCourseFeedbackBody(body: unknown): { stars: number; text: string | null } {
  if (!body || typeof body !== "object") {
    throw new Error("stars must be a number");
  }

  const candidate = body as { stars?: unknown; text?: unknown };

  if (typeof candidate.stars !== "number") {
    throw new Error("stars must be a number");
  }

  return {
    stars: candidate.stars,
    text: typeof candidate.text === "string" ? candidate.text : null,
  };
}

type RouteContext = {
  params: Promise<{ slug: string; assignmentId: string }>;
};

export async function POST(request: Request, { params }: RouteContext) {
  const { slug, assignmentId } = await params;
  const { context, organizationId } = await requireOrganizationMemberBySlug(slug);
  const { prisma } = await import("@/lib/prisma");

  try {
    const body = parseCourseFeedbackBody(await request.json());
    const result = await submitCourseFeedbackForLearner({
      context,
      organizationId,
      assignmentId,
      stars: body.stars,
      text: body.text,
      submittedAt: new Date(),
      repository: createPrismaCourseFeedbackRepository(prisma),
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Course feedback could not be submitted";
    const status = message.includes("not found") ? 404 : 400;

    return NextResponse.json({ message }, { status });
  }
}
```

- [ ] **Step 6: Verify and commit**

Run:

```powershell
npm run test -- src/modules/feedback/course-feedback.test.ts src/modules/feedback/prisma-repository.test.ts src/app/api/org/[slug]/assignments/[assignmentId]/feedback/route.test.ts
git add src/modules/feedback/course-feedback.ts src/modules/feedback/course-feedback.test.ts src/modules/feedback/prisma-repository.ts src/modules/feedback/prisma-repository.test.ts src/app/api/org/[slug]/assignments/[assignmentId]/feedback/route.ts src/app/api/org/[slug]/assignments/[assignmentId]/feedback/route.test.ts
git commit -m "feat: add course feedback domain"
```

Expected: tests pass and commit succeeds.

## Task 9: Add Admin Checks Page And Action Bridge

**Files:**
- Create: `src/app/org/[slug]/admin/courses/[courseSlug]/checks/page.tsx`
- Create: `src/app/org/[slug]/admin/courses/[courseSlug]/checks/actions.ts`
- Modify: `src/app/org/[slug]/admin/courses/[courseSlug]/content/page.tsx`
- Modify: `src/modules/video/page-shells.test.ts`

- [ ] **Step 1: Write page shell tests**

Update `src/modules/video/page-shells.test.ts` or create `src/modules/assessments/page-shells.test.ts` to assert:

- checks page contains `Knowledge checks`, `Single answer`, `Multiple answer`, `True/false`, `Explanation`, `Answer feedback`, `Activate`, `Deactivate`, and `Reorder`.
- checks page imports `requireOrganizationUsersAdminBySlug`.
- content page links to `/org/${slug}/admin/courses/${courseSlug}/checks`.
- learner page contains the checks submission path pattern `/checks/`.

Run:

```powershell
npm run test -- src/modules/video/page-shells.test.ts
```

Expected: fail until pages are updated.

- [ ] **Step 2: Implement action bridge**

Create `src/app/org/[slug]/admin/courses/[courseSlug]/checks/actions.ts`:

```ts
"use server";

import { requireOrganizationUsersAdminBySlug } from "@/lib/auth/guards";
import { createPrismaKnowledgeCheckRepository } from "@/modules/assessments/prisma-repository";
import { createKnowledgeCheckAdminActions } from "@/modules/assessments/server-actions";

async function getActorAndCourse(slug: string, courseSlug: string) {
  const { context, organizationId } = await requireOrganizationUsersAdminBySlug(slug);
  const { prisma } = await import("@/lib/prisma");
  const course = await prisma.course.findFirst({
    where: { organizationId, slug: courseSlug },
    select: { id: true },
  });

  if (!course) {
    throw new Error("Course was not found");
  }

  return { organizationId, courseId: course.id, actorId: context.userId };
}

async function createActions() {
  const { prisma } = await import("@/lib/prisma");
  return createKnowledgeCheckAdminActions({
    getActorAndCourse,
    repository: createPrismaKnowledgeCheckRepository(prisma),
  });
}

export async function createCheckFormAction(slug: string, courseSlug: string, formData: FormData) {
  return (await createActions()).createCheck(slug, courseSlug, formData);
}

export async function updateCheckFormAction(slug: string, courseSlug: string, checkId: string, formData: FormData) {
  return (await createActions()).updateCheck(slug, courseSlug, checkId, formData);
}

export async function reorderChecksFormAction(slug: string, courseSlug: string, formData: FormData) {
  return (await createActions()).reorderChecks(slug, courseSlug, formData);
}

export async function activateCheckFormAction(slug: string, courseSlug: string, checkId: string) {
  return (await createActions()).activateCheck(slug, courseSlug, checkId);
}

export async function deactivateCheckFormAction(slug: string, courseSlug: string, checkId: string) {
  return (await createActions()).deactivateCheck(slug, courseSlug, checkId);
}
```

- [ ] **Step 3: Implement checks page**

Create `src/app/org/[slug]/admin/courses/[courseSlug]/checks/page.tsx` as a server component that:

- calls `requireOrganizationUsersAdminBySlug(slug)`.
- loads course by `{ organizationId, slug: courseSlug }`.
- loads checks through `createPrismaKnowledgeCheckRepository(prisma).listChecksForCourse`.
- renders existing checks sorted by lesson and sort order.
- renders create/edit fields for prompt, question type, required, active, explanation, answers, answer feedback, and reorder controls.
- renders activate/deactivate forms for each check.

Use the same restrained admin shell style as the content page: `max-w-6xl`, `rounded-md`, `border-slate-200`, compact forms, and no nested cards.

- [ ] **Step 4: Link content page**

Modify `src/app/org/[slug]/admin/courses/[courseSlug]/content/page.tsx` so the `Video lessons` or `Content status` section includes:

```tsx
<a
  href={`/org/${encodeURIComponent(slug)}/admin/courses/${encodeURIComponent(courseSlug)}/checks`}
  className="rounded-md border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700"
>
  Manage knowledge checks
</a>
```

- [ ] **Step 5: Verify and commit**

Run:

```powershell
npm run test -- src/modules/video/page-shells.test.ts
npm run build
git add src/app/org/[slug]/admin/courses/[courseSlug]/checks/page.tsx src/app/org/[slug]/admin/courses/[courseSlug]/checks/actions.ts src/app/org/[slug]/admin/courses/[courseSlug]/content/page.tsx src/modules/video/page-shells.test.ts
git commit -m "feat: add knowledge check admin page"
```

Expected: tests and build pass, then commit succeeds.

## Task 10: Update Learner Flow Page

**Files:**
- Modify: `src/app/org/[slug]/learn/[courseSlug]/page.tsx`
- Create: `src/app/org/[slug]/learn/[courseSlug]/knowledge-check-panel.tsx`
- Create: `src/app/org/[slug]/learn/[courseSlug]/knowledge-check-panel.test.tsx`
- Modify: `src/modules/video/page-shells.test.ts`

- [ ] **Step 1: Add learner page tests**

Extend page shell tests to assert:

- learner page includes `Knowledge checks`.
- learner page includes `Submit answer`.
- learner page includes `Course rating`.
- learner page includes stars `1`, `2`, `3`, `4`, `5`.
- page uses `/api/org/${slug}/assignments/${assignment.id}/checks/${checkId}/submit` path construction.
- page uses `/api/org/${slug}/assignments/${assignment.id}/feedback` path construction.
- page does not render correct answer flags in static HTML.

Create `src/app/org/[slug]/learn/[courseSlug]/knowledge-check-panel.test.tsx` with client tests proving:

- selecting one answer and clicking `Submit answer` posts to the check submit API.
- returned correctness, score, selected answer feedback, and explanation render in the panel.
- selecting stars and submitting course rating posts to the feedback API.
- blank rating text is sent as `null`.

Use this skeleton:

```tsx
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { KnowledgeCheckPanel } from "./knowledge-check-panel";

describe("KnowledgeCheckPanel", () => {
  it("submits selected answers and renders returned feedback", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        correct: true,
        scorePercent: 100,
        attemptNumber: 1,
        selectedAnswerFeedback: ["Correct."],
        explanation: "Open questions reveal blockers.",
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <KnowledgeCheckPanel
        slug="acme"
        assignmentId="assignment_1"
        checks={[
          {
            id: "check_1",
            prompt: "Which response is best?",
            questionType: "SINGLE_CHOICE",
            answers: [
              { id: "answer_1", text: "What happened?" },
              { id: "answer_2", text: "Why did you fail?" },
            ],
          },
        ]}
        feedbackEndpoint="/api/org/acme/assignments/assignment_1/feedback"
      />,
    );

    fireEvent.click(screen.getByLabelText("What happened?"));
    fireEvent.click(screen.getByRole("button", { name: "Submit answer" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      "/api/org/acme/assignments/assignment_1/checks/check_1/submit",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ selectedAnswerIds: ["answer_1"] }),
      }),
    ));
    expect(await screen.findByText("Score: 100%")).toBeInTheDocument();
    expect(screen.getByText("Correct.")).toBeInTheDocument();
    expect(screen.getByText("Open questions reveal blockers.")).toBeInTheDocument();
  });

  it("submits one-to-five star course feedback", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <KnowledgeCheckPanel
        slug="acme"
        assignmentId="assignment_1"
        checks={[]}
        feedbackEndpoint="/api/org/acme/assignments/assignment_1/feedback"
      />,
    );

    fireEvent.click(screen.getByLabelText("5 stars"));
    fireEvent.change(screen.getByLabelText("Optional feedback"), { target: { value: "  Helpful.  " } });
    fireEvent.click(screen.getByRole("button", { name: "Submit rating" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      "/api/org/acme/assignments/assignment_1/feedback",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ stars: 5, text: "Helpful." }),
      }),
    ));
  });
});
```

Run:

```powershell
npm run test -- src/app/org/[slug]/learn/[courseSlug]/knowledge-check-panel.test.tsx src/modules/video/page-shells.test.ts
```

Expected: fail until the component and page integration exist.

- [ ] **Step 2: Implement answerable learner client component**

Create `src/app/org/[slug]/learn/[courseSlug]/knowledge-check-panel.tsx`:

```tsx
"use client";

import { useState, type FormEvent } from "react";

type LearnerCheck = {
  id: string;
  prompt: string;
  questionType: "SINGLE_CHOICE" | "MULTIPLE_CHOICE" | "TRUE_FALSE";
  answers: Array<{ id: string; text: string }>;
};

type SubmitResult = {
  correct: boolean;
  scorePercent: number;
  attemptNumber: number;
  selectedAnswerFeedback: string[];
  explanation: string | null;
};

export function KnowledgeCheckPanel({
  slug,
  assignmentId,
  checks,
  feedbackEndpoint,
}: {
  slug: string;
  assignmentId: string;
  checks: LearnerCheck[];
  feedbackEndpoint: string;
}) {
  const [selectedByCheck, setSelectedByCheck] = useState<Record<string, string[]>>({});
  const [resultByCheck, setResultByCheck] = useState<Record<string, SubmitResult>>({});
  const [stars, setStars] = useState<number | null>(null);
  const [feedbackText, setFeedbackText] = useState("");
  const [ratingSaved, setRatingSaved] = useState(false);

  async function submitAnswer(check: LearnerCheck) {
    const selectedAnswerIds = selectedByCheck[check.id] ?? [];
    const response = await fetch(`/api/org/${encodeURIComponent(slug)}/assignments/${encodeURIComponent(assignmentId)}/checks/${encodeURIComponent(check.id)}/submit`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ selectedAnswerIds }),
    });

    if (!response.ok) {
      throw new Error("Knowledge check could not be submitted");
    }

    const result = (await response.json()) as SubmitResult;
    setResultByCheck((current) => ({ ...current, [check.id]: result }));
  }

  async function submitRating(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!stars) {
      return;
    }

    const response = await fetch(feedbackEndpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ stars, text: feedbackText.trim() || null }),
    });

    if (!response.ok) {
      throw new Error("Course rating could not be submitted");
    }

    setRatingSaved(true);
  }

  function toggleAnswer(check: LearnerCheck, answerId: string) {
    setSelectedByCheck((current) => {
      const existing = current[check.id] ?? [];

      if (check.questionType === "MULTIPLE_CHOICE") {
        return {
          ...current,
          [check.id]: existing.includes(answerId)
            ? existing.filter((candidate) => candidate !== answerId)
            : [...existing, answerId],
        };
      }

      return { ...current, [check.id]: [answerId] };
    });
  }

  return (
    <section className="rounded-md border border-slate-200 p-4">
      <h2 className="text-lg font-semibold text-slate-950">Knowledge checks</h2>
      <div className="mt-4 space-y-4">
        {checks.map((check) => {
          const selected = selectedByCheck[check.id] ?? [];
          const result = resultByCheck[check.id];
          const inputType = check.questionType === "MULTIPLE_CHOICE" ? "checkbox" : "radio";

          return (
            <form key={check.id} className="space-y-3" onSubmit={(event) => { event.preventDefault(); void submitAnswer(check); }}>
              <p className="text-sm font-medium text-slate-900">{check.prompt}</p>
              {check.answers.map((answer) => (
                <label key={answer.id} className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type={inputType}
                    name={`check-${check.id}`}
                    checked={selected.includes(answer.id)}
                    onChange={() => toggleAnswer(check, answer.id)}
                  />
                  {answer.text}
                </label>
              ))}
              <button type="submit" className="rounded-md bg-slate-950 px-3 py-2 text-sm font-medium text-white">
                Submit answer
              </button>
              {result ? (
                <div className="rounded-md bg-slate-50 p-3 text-sm text-slate-700">
                  <p>{result.correct ? "Correct" : "Review needed"}</p>
                  <p>Score: {result.scorePercent}%</p>
                  {result.selectedAnswerFeedback.map((feedback) => <p key={feedback}>{feedback}</p>)}
                  {result.explanation ? <p>{result.explanation}</p> : null}
                </div>
              ) : null}
            </form>
          );
        })}
      </div>

      <form className="mt-6 space-y-3 border-t border-slate-200 pt-4" onSubmit={submitRating}>
        <h3 className="text-base font-semibold text-slate-950">Course rating</h3>
        <div className="flex flex-wrap gap-3">
          {[1, 2, 3, 4, 5].map((value) => (
            <label key={value} className="text-sm text-slate-700">
              <input type="radio" name="stars" checked={stars === value} onChange={() => setStars(value)} />
              {value} stars
            </label>
          ))}
        </div>
        <label className="block text-sm text-slate-700">
          Optional feedback
          <textarea value={feedbackText} onChange={(event) => setFeedbackText(event.target.value)} className="mt-1 block w-full rounded-md border border-slate-200 p-2" />
        </label>
        <button type="submit" className="rounded-md border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700">
          Submit rating
        </button>
        {ratingSaved ? <p className="text-sm text-slate-600">Rating saved</p> : null}
      </form>
    </section>
  );
}
```

- [ ] **Step 3: Integrate the client component into the learner page**

Modify `src/app/org/[slug]/learn/[courseSlug]/page.tsx` so assigned native-video learners see:

- a `Knowledge checks` panel next to chapters/transcript.
- active checks with prompt, answer options, and enabled submit controls from `KnowledgeCheckPanel`.
- the check submit API path pattern scoped to `slug`, `assignment.id`, and each `check.id`.
- the course feedback API path `/api/org/${slug}/assignments/${assignment.id}/feedback`.

The page must keep its existing assignment lookup scoped to `organizationId` and learner membership id. It must load only active checks for `assignment.courseId` and pass learner-safe answer DTOs that do not include `correct`.

Use this integration shape:

```tsx
import { KnowledgeCheckPanel } from "./knowledge-check-panel";

const checks = await prisma.courseKnowledgeCheckQuestion.findMany({
  where: {
    organizationId,
    courseId: assignment.courseId,
    active: true,
  },
  orderBy: [{ lessonId: "asc" }, { sortOrder: "asc" }],
  select: {
    id: true,
    prompt: true,
    questionType: true,
    answers: {
      where: { organizationId },
      orderBy: { sortOrder: "asc" },
      select: { id: true, text: true },
    },
  },
});

<KnowledgeCheckPanel
  slug={slug}
  assignmentId={assignment.id}
  checks={checks}
  feedbackEndpoint={`/api/org/${encodeURIComponent(slug)}/assignments/${encodeURIComponent(assignment.id)}/feedback`}
/>
```

- [ ] **Step 4: Verify and commit**

Run:

```powershell
npm run test -- src/app/org/[slug]/learn/[courseSlug]/knowledge-check-panel.test.tsx src/modules/video/page-shells.test.ts
npm run build
git add src/app/org/[slug]/learn/[courseSlug]/page.tsx src/app/org/[slug]/learn/[courseSlug]/knowledge-check-panel.tsx src/app/org/[slug]/learn/[courseSlug]/knowledge-check-panel.test.tsx src/modules/video/page-shells.test.ts
git commit -m "feat: surface knowledge checks in learner flow"
```

Expected: tests and build pass, then commit succeeds.

## Task 11: Add Scoring, Difficulty, And Satisfaction Reports

**Files:**
- Modify: `src/modules/reports/progress-report.ts`
- Modify: `src/modules/reports/progress-report.test.ts`
- Modify: `src/modules/reports/prisma-repository.ts`
- Modify: `src/modules/reports/prisma-repository.test.ts`
- Create: `src/modules/reports/scoring-report.ts`
- Create: `src/modules/reports/scoring-report.test.ts`

- [ ] **Step 1: Add report tests**

Tests must prove:

- progress report rows include assignment-level `latestRequiredCheckAverageScore` and `bestRequiredCheckAverageScore`.
- latest assignment score is the average of each required active check's latest attempt score.
- best assignment score is the average of each required active check's best attempt score.
- both assignment-level score fields are `null` until at least one required active check has been attempted.
- CSV includes `Latest Required Check Average Score` and `Best Required Check Average Score`.
- scoring report aggregates average score by tenant and course.
- quiz difficulty report includes question attempts, pass/fail rates, and commonly missed answers.
- satisfaction report aggregates course ratings and feedback by tenant and course.

Create `src/modules/reports/scoring-report.test.ts` with:

```ts
import { describe, expect, it } from "vitest";

import { buildScoringReportRows, buildQuizDifficultyReportRows } from "./scoring-report";

describe("scoring reports", () => {
  it("aggregates average score by course", () => {
    expect(
      buildScoringReportRows([
        { organizationId: "org_1", courseId: "course_1", courseTitle: "Course", scorePercent: 100 },
        { organizationId: "org_1", courseId: "course_1", courseTitle: "Course", scorePercent: 0 },
        { organizationId: "org_2", courseId: "course_1", courseTitle: "Other", scorePercent: 100 },
      ], "org_1"),
    ).toEqual([
      {
        organizationId: "org_1",
        courseId: "course_1",
        courseTitle: "Course",
        attemptCount: 2,
        averageScore: 50,
      },
    ]);
  });

  it("builds quiz difficulty rows", () => {
    expect(
      buildQuizDifficultyReportRows([
        { organizationId: "org_1", courseId: "course_1", questionId: "q1", prompt: "Question", selectedAnswerIds: ["a"], correct: false },
        { organizationId: "org_1", courseId: "course_1", questionId: "q1", prompt: "Question", selectedAnswerIds: ["b"], correct: true },
      ], "org_1"),
    )[0]).toMatchObject({
      questionId: "q1",
      prompt: "Question",
      attempts: 2,
      correctRate: 50,
    });
  });
});
```

Add these `src/modules/reports/progress-report.test.ts` cases:

```ts
import { summarizeRequiredCheckScores } from "./progress-report";

it("calculates assignment-level latest and best required-check average scores", () => {
  expect(
    summarizeRequiredCheckScores({
      requiredActiveCheckIds: ["q1", "q2"],
      attempts: [
        { questionId: "q1", scorePercent: 0, submittedAt: new Date("2026-06-13T10:00:00.000Z") },
        { questionId: "q1", scorePercent: 100, submittedAt: new Date("2026-06-13T11:00:00.000Z") },
        { questionId: "q2", scorePercent: 50, submittedAt: new Date("2026-06-13T12:00:00.000Z") },
      ],
    }),
  ).toEqual({
    latestRequiredCheckAverageScore: 75,
    bestRequiredCheckAverageScore: 75,
  });
});

it("returns null assignment-level scores until a required active check is attempted", () => {
  expect(
    summarizeRequiredCheckScores({
      requiredActiveCheckIds: ["q1"],
      attempts: [{ questionId: "optional_q", scorePercent: 100, submittedAt: new Date("2026-06-13T10:00:00.000Z") }],
    }),
  ).toEqual({
    latestRequiredCheckAverageScore: null,
    bestRequiredCheckAverageScore: null,
  });
});
```

Run:

```powershell
npm run test -- src/modules/reports/progress-report.test.ts src/modules/reports/prisma-repository.test.ts src/modules/reports/scoring-report.test.ts
```

Expected: fail until report helpers and repository selections are updated.

- [ ] **Step 2: Implement scoring report helpers**

Create `src/modules/reports/scoring-report.ts`:

```ts
import { aggregateQuizDifficulty } from "@/modules/assessments/scoring";

export type ScoringAttemptRow = {
  organizationId: string;
  courseId: string;
  courseTitle: string;
  scorePercent: number;
};

export type DifficultyAttemptRow = {
  organizationId: string;
  courseId: string;
  questionId: string;
  prompt: string;
  selectedAnswerIds: string[];
  correct: boolean;
};

export function buildScoringReportRows(rows: ScoringAttemptRow[], organizationId: string) {
  const grouped = new Map<string, ScoringAttemptRow[]>();

  for (const row of rows.filter((candidate) => candidate.organizationId === organizationId)) {
    grouped.set(row.courseId, [...(grouped.get(row.courseId) ?? []), row]);
  }

  return [...grouped.entries()].map(([courseId, courseRows]) => ({
    organizationId,
    courseId,
    courseTitle: courseRows[0].courseTitle,
    attemptCount: courseRows.length,
    averageScore: Math.round(courseRows.reduce((sum, row) => sum + row.scorePercent, 0) / courseRows.length),
  }));
}

export function buildQuizDifficultyReportRows(rows: DifficultyAttemptRow[], organizationId: string) {
  const scoped = rows.filter((row) => row.organizationId === organizationId);
  const promptByQuestion = new Map(scoped.map((row) => [row.questionId, row.prompt]));

  return aggregateQuizDifficulty(scoped).map((row) => ({
    ...row,
    prompt: promptByQuestion.get(row.questionId) ?? row.questionId,
  }));
}
```

- [ ] **Step 3: Extend progress report rows**

In `src/modules/reports/progress-report.ts`, add to `ProgressReportRow`:

```ts
latestRequiredCheckAverageScore: number | null;
bestRequiredCheckAverageScore: number | null;
```

Add CSV columns:

```ts
"Latest Required Check Average Score",
"Best Required Check Average Score",
```

Map null scores to empty CSV fields. These fields are assignment-level required-check-set metrics, not a single question's score.

Add this helper and tests in `src/modules/reports/progress-report.ts`:

```ts
export type RequiredCheckAttemptSummary = {
  requiredActiveCheckIds: string[];
  attempts: Array<{
    questionId: string;
    scorePercent: number;
    submittedAt: Date;
  }>;
};

export function summarizeRequiredCheckScores(input: RequiredCheckAttemptSummary): {
  latestRequiredCheckAverageScore: number | null;
  bestRequiredCheckAverageScore: number | null;
} {
  const attemptedRequiredIds = input.requiredActiveCheckIds.filter((questionId) =>
    input.attempts.some((attempt) => attempt.questionId === questionId),
  );

  if (attemptedRequiredIds.length === 0) {
    return {
      latestRequiredCheckAverageScore: null,
      bestRequiredCheckAverageScore: null,
    };
  }

  const latestScores = attemptedRequiredIds.map((questionId) =>
    [...input.attempts]
      .filter((attempt) => attempt.questionId === questionId)
      .sort((left, right) => right.submittedAt.getTime() - left.submittedAt.getTime())[0].scorePercent,
  );
  const bestScores = attemptedRequiredIds.map((questionId) =>
    Math.max(...input.attempts
      .filter((attempt) => attempt.questionId === questionId)
      .map((attempt) => attempt.scorePercent)),
  );

  return {
    latestRequiredCheckAverageScore: averageScore(latestScores),
    bestRequiredCheckAverageScore: averageScore(bestScores),
  };
}

function averageScore(scores: number[]): number {
  return Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length);
}
```

- [ ] **Step 4: Extend Prisma report repository**

In `src/modules/reports/prisma-repository.ts`, select required active checks from the assigned course and attempts through assignment:

```ts
course: {
  select: {
    title: true,
    type: true,
    knowledgeCheckQuestions: {
      where: { active: true, required: true },
      select: { id: true },
    },
  },
},
knowledgeCheckAttempts: {
  orderBy: [{ questionId: "asc" }, { submittedAt: "desc" }],
  select: { questionId: true, scorePercent: true, submittedAt: true },
},
```

Map:

```ts
const checkScores = summarizeRequiredCheckScores({
  requiredActiveCheckIds: assignment.course.knowledgeCheckQuestions.map((question) => question.id),
  attempts: assignment.knowledgeCheckAttempts,
});

return {
  // existing report fields
  latestRequiredCheckAverageScore: checkScores.latestRequiredCheckAverageScore,
  bestRequiredCheckAverageScore: checkScores.bestRequiredCheckAverageScore,
};
```

- [ ] **Step 5: Verify and commit**

Run:

```powershell
npm run test -- src/modules/reports/progress-report.test.ts src/modules/reports/prisma-repository.test.ts src/modules/reports/scoring-report.test.ts
git add src/modules/reports/progress-report.ts src/modules/reports/progress-report.test.ts src/modules/reports/prisma-repository.ts src/modules/reports/prisma-repository.test.ts src/modules/reports/scoring-report.ts src/modules/reports/scoring-report.test.ts
git commit -m "feat: add assessment reporting helpers"
```

Expected: tests pass and commit succeeds.

## Task 12: Final Verification

**Files:**
- Modify: none unless verification exposes a concrete failure.

- [ ] **Step 1: Run focused assessment tests**

Run:

```powershell
npm run test -- src/modules/assessments/scoring.test.ts src/modules/assessments/knowledge-checks.test.ts src/modules/assessments/prisma-repository.test.ts src/modules/assessments/server-actions.test.ts src/app/api/org/[slug]/assignments/[assignmentId]/checks/[checkId]/submit/route.test.ts src/modules/feedback/course-feedback.test.ts src/modules/feedback/prisma-repository.test.ts src/app/api/org/[slug]/assignments/[assignmentId]/feedback/route.test.ts src/modules/reports/scoring-report.test.ts
```

Expected: all focused assessment, feedback, and report tests pass.

- [ ] **Step 2: Run impacted integration tests**

Run:

```powershell
npm run test -- src/modules/video/video-runtime.test.ts src/modules/video/page-shells.test.ts src/modules/progress/progress.test.ts src/modules/reports/progress-report.test.ts src/modules/reports/prisma-repository.test.ts
```

Expected: video runtime, progress, page shell, and progress report tests pass.

- [ ] **Step 3: Run full test suite**

Run:

```powershell
npm run test
```

Expected: all tests pass.

- [ ] **Step 4: Run lint**

Run:

```powershell
npm run lint
```

Expected: ESLint exits `0`.

- [ ] **Step 5: Validate Prisma and generate client sequentially**

Run:

```powershell
npx prisma validate
npm run prisma:generate
```

Expected: Prisma validates and client generation exits `0`.

- [ ] **Step 6: Run TypeScript**

Run:

```powershell
npx tsc --noEmit --incremental false
```

Expected: TypeScript exits `0`.

- [ ] **Step 7: Run production build**

Run:

```powershell
npm run build
```

Expected: Next.js build exits `0`.

- [ ] **Step 8: Confirm branch state**

Run:

```powershell
git status --short --branch
git log --oneline -12
```

Expected: feature branch has task commits for schema, scoring, domain rules, repository, actions, submit route, runtime integration, feedback, pages, reports, and final verification.

## Acceptance Criteria

- Admin can create, edit, reorder, activate, and deactivate knowledge checks for a tenant course.
- Admin can attach checks to a course or a specific native video lesson.
- Supported question types are `SINGLE_CHOICE`, `MULTIPLE_CHOICE`, and `TRUE_FALSE`.
- Each answer supports optional feedback.
- Each question supports optional explanation or context feedback.
- Learners answer active checks from the native video learning flow.
- Learner check submission is scoped to the assignment, course, organization, and signed-in learner.
- Learner answer forms are enabled, post to `/api/org/[slug]/assignments/[assignmentId]/checks/[checkId]/submit`, and render returned correctness, score, answer feedback, and explanation.
- Retry behavior is unlimited; every submit creates a new `KnowledgeCheckAttempt` with incrementing `attemptNumber`.
- Attempt history stores selected answers, correctness, score, attempt number, submitted at, and assignment id.
- Learner feedback response includes correctness, score, selected answer feedback, and question explanation after submission.
- Native video course completion requires all required video lessons and all required active knowledge checks.
- Scores feed progress reports as assignment-level required-check averages, plus scoring reports and quiz difficulty report helpers.
- Course ratings accept one to five stars plus optional text feedback.
- Course ratings persist through `/api/org/[slug]/assignments/[assignmentId]/feedback` using the unique `{ organizationId, assignmentId }` key.
- Course ratings are accepted only for native-video assignments in this MVP scope.
- Satisfaction aggregation groups ratings and feedback by tenant and course.
- Every organization-scoped read and write includes `organizationId`.

## Review Checklist

- No learner response exposes `correct` answer flags before submission.
- Submit route uses `requireOrganizationMemberBySlug` and `canLaunchRuntimeAssignment`.
- Admin routes use `requireOrganizationUsersAdminBySlug`.
- Repository methods never query checks, attempts, feedback, or reports without `organizationId`.
- Answer replacement deletes by `{ organizationId, questionId }` and creates answers with `organizationId`.
- Attempt writes are append-only and do not overwrite prior attempts.
- Activating checks fetches tenant-scoped answers and rejects invalid answer structure before setting `active: true`.
- True/false checks have exactly two answers and one correct answer.
- Multiple-answer checks require exact selected-answer set matching for correctness.
- Course completion uses required lessons plus required active checks, not all inactive or optional checks.
- Progress report CSV includes both latest and best assignment-level required-check average scores.
- Difficulty reports rank lower correct-rate questions first and include commonly missed answer ids.
- Satisfaction reports never mix organizations.
