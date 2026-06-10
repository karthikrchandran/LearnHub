# Native Video Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add native video course content, transcript parsing/search, learner resume state, and native progress events.

**Architecture:** Add tenant-scoped video content models to Prisma, keep domain logic in `src/modules/video`, and reuse the existing `recordLearningEvent` progress boundary for course completion. Pages remain non-destructive shells while services and repositories establish the runtime contract.

**Tech Stack:** Next.js App Router, TypeScript, Prisma 7, PostgreSQL, Vitest, existing progress/certificate foundation.

---

## Scope Boundary

This plan implements native video runtime foundations only. It does not implement real upload/transcoding, Mux callbacks, SCORM, quizzes, browser player JavaScript controls, notification jobs, reports, or certificate UI changes.

## File Structure

Create or modify:

- `prisma/schema.prisma`: add `CourseModule`, `VideoLesson`, `VideoChapter`, `VideoTranscriptCue`, `VideoLessonProgress`.
- `prisma/migrations/20260610010000_native_video_runtime/migration.sql`: SQL migration for the new models.
- `prisma/seed.ts`: add demo modules, lessons, chapters, and transcript cues for the existing Acme native video course.
- `src/modules/video/transcript-parser.ts`: parse uploaded transcript text into timestamped cues.
- `src/modules/video/transcript-parser.test.ts`: parser tests.
- `src/modules/video/video-validation.ts`: validate lesson, chapter, position, and duration inputs.
- `src/modules/video/video-validation.test.ts`: validation tests.
- `src/modules/video/video-content-service.ts`: module/lesson/chapter/transcript replacement service.
- `src/modules/video/video-content-service.test.ts`: service tests with fake repository.
- `src/modules/video/video-runtime.ts`: runtime launch and progress recording service.
- `src/modules/video/video-runtime.test.ts`: runtime tests with fake repository and progress recorder.
- `src/modules/video/transcript-search.ts`: deterministic transcript search.
- `src/modules/video/transcript-search.test.ts`: search tests.
- `src/modules/video/prisma-repository.ts`: Prisma repository adapter for video content/runtime/search.
- `src/modules/video/prisma-repository.test.ts`: query-shape tests using mocked delegates.
- `src/modules/video/page-shells.test.ts`: page shell smoke tests.
- `src/app/org/[slug]/admin/courses/[courseSlug]/content/page.tsx`: admin content shell.
- `src/app/org/[slug]/learn/[courseSlug]/page.tsx`: learner video runtime shell.

## Task 1: Add Native Video Schema And Seed Data

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260610010000_native_video_runtime/migration.sql`
- Modify: `prisma/seed.ts`

- [ ] **Step 1: Add Prisma models**

Add these relations:

```prisma
model Course {
  modules      CourseModule[]
  videoLessons VideoLesson[]
}

model CourseAssignment {
  videoProgress VideoLessonProgress[]
}
```

Add new models:

```prisma
model CourseModule {
  id             String        @id @default(cuid())
  organizationId String
  courseId       String
  title          String
  slug           String
  sortOrder      Int           @default(0)
  organization   Organization  @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  course         Course        @relation(fields: [organizationId, courseId], references: [organizationId, id], onDelete: Cascade)
  lessons        VideoLesson[]
  createdAt      DateTime      @default(now())
  updatedAt      DateTime      @updatedAt

  @@unique([organizationId, courseId, slug])
  @@unique([organizationId, id])
  @@unique([organizationId, courseId, id])
  @@index([organizationId, courseId, sortOrder])
}

model VideoLesson {
  id                 String                @id @default(cuid())
  organizationId     String
  courseId           String
  moduleId           String?
  title              String
  slug               String
  sortOrder          Int                   @default(0)
  durationSeconds    Int
  required           Boolean               @default(true)
  providerAssetId    String?
  playbackUrl        String?
  transcriptLanguage String                @default("en")
  organization        Organization          @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  course              Course                @relation(fields: [organizationId, courseId], references: [organizationId, id], onDelete: Cascade)
  module              CourseModule?         @relation(fields: [organizationId, courseId, moduleId], references: [organizationId, courseId, id], onDelete: SetNull)
  chapters            VideoChapter[]
  transcriptCues      VideoTranscriptCue[]
  progress            VideoLessonProgress[]
  createdAt           DateTime              @default(now())
  updatedAt           DateTime              @updatedAt

  @@unique([organizationId, courseId, slug])
  @@unique([organizationId, id])
  @@unique([organizationId, courseId, id])
  @@index([organizationId, courseId, moduleId, sortOrder])
}

model VideoChapter {
  id             String      @id @default(cuid())
  organizationId String
  lessonId       String
  title          String
  startSecond    Int
  endSecond      Int?
  sortOrder      Int         @default(0)
  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  lesson         VideoLesson @relation(fields: [organizationId, lessonId], references: [organizationId, id], onDelete: Cascade)
  createdAt      DateTime    @default(now())
  updatedAt      DateTime    @updatedAt

  @@index([organizationId, lessonId, startSecond])
}

model VideoTranscriptCue {
  id             String       @id @default(cuid())
  organizationId String
  lessonId       String
  startSecond    Int
  endSecond      Int?
  text           String
  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  lesson         VideoLesson  @relation(fields: [organizationId, lessonId], references: [organizationId, id], onDelete: Cascade)
  createdAt      DateTime     @default(now())

  @@index([organizationId, lessonId, startSecond])
}

model VideoLessonProgress {
  id                String           @id @default(cuid())
  organizationId    String
  assignmentId      String
  lessonId          String
  lastPositionSecond Int             @default(0)
  maxWatchedSecond   Int             @default(0)
  completed          Boolean         @default(false)
  lastWatchedAt      DateTime?
  assignment         CourseAssignment @relation(fields: [organizationId, assignmentId], references: [organizationId, id], onDelete: Cascade)
  lesson             VideoLesson      @relation(fields: [organizationId, lessonId], references: [organizationId, id], onDelete: Cascade)
  organization       Organization     @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  createdAt          DateTime         @default(now())
  updatedAt          DateTime         @updatedAt

  @@unique([organizationId, assignmentId, lessonId])
  @@index([organizationId, assignmentId])
  @@index([organizationId, lessonId])
}
```

- [ ] **Step 2: Create migration SQL**

Create `prisma/migrations/20260610010000_native_video_runtime/migration.sql` with `CREATE TABLE` statements matching the Prisma models, foreign keys using composite tenant-scoped references, unique indexes, and lookup indexes.

- [ ] **Step 3: Extend seed data**

In `prisma/seed.ts`, after the demo native video course exists, seed:

- module slug `manager-foundations`
- lesson slug `coaching-conversation-basics`, duration `180`, playback URL `https://video.learnhub.local/demo/coaching-conversation-basics.mp4`
- chapters at `0`, `45`, and `120`
- transcript cues at `0`, `30`, `90`, and `150`

Use upsert patterns with stable slugs/compound keys where possible.

- [ ] **Step 4: Validate and commit**

Run:

```powershell
npx prisma validate
npm run prisma:generate
```

Commit:

```powershell
git add prisma/schema.prisma prisma/migrations/20260610010000_native_video_runtime/migration.sql prisma/seed.ts
git commit -m "feat: add native video content schema"
```

## Task 2: Add Transcript Parser And Validation Helpers

**Files:**
- Create: `src/modules/video/transcript-parser.test.ts`
- Create: `src/modules/video/transcript-parser.ts`
- Create: `src/modules/video/video-validation.test.ts`
- Create: `src/modules/video/video-validation.ts`

- [ ] **Step 1: Write transcript parser tests**

Tests must prove:

- `[00:00] Welcome` parses to start `0`, end `null`, text `Welcome`.
- `[01:15 - 01:45] Segment text` parses to start `75`, end `105`.
- `01:02:03` timestamps parse to `3723`.
- Empty text line throws `Transcript line 1 must include cue text`.
- Bad timestamp throws `Transcript line 1 has an invalid timestamp`.
- End before start throws `Transcript line 1 end time must be after start time`.

- [ ] **Step 2: Implement transcript parser**

Export:

```ts
export type ParsedTranscriptCue = {
  startSecond: number;
  endSecond: number | null;
  text: string;
};

export function parseTranscriptText(input: string): ParsedTranscriptCue[];
export function parseTimestampToSeconds(timestamp: string): number;
```

- [ ] **Step 3: Write validation tests**

Tests must prove:

- `requirePositiveDurationSeconds(180)` returns `180`; `0` throws `Video duration seconds must be positive`.
- `requireNonNegativeSecond(0, "Position")` returns `0`; `-1` throws `Position cannot be negative`.
- `clampVideoSecond(200, 180)` returns `180`.
- `validateChapterRange({ startSecond: 45, endSecond: 30, durationSeconds: 180 })` throws `Chapter end time must be after start time`.
- `validateChapterRange({ startSecond: 200, endSecond: null, durationSeconds: 180 })` throws `Chapter start time cannot exceed lesson duration`.

- [ ] **Step 4: Implement validation helpers**

Export:

```ts
export function requirePositiveDurationSeconds(seconds: number): number;
export function requireNonNegativeSecond(seconds: number, label: string): number;
export function clampVideoSecond(seconds: number, durationSeconds: number): number;
export function validateChapterRange(input: {
  startSecond: number;
  endSecond: number | null;
  durationSeconds: number;
}): void;
```

- [ ] **Step 5: Run tests and commit**

Run:

```powershell
npm run test -- src/modules/video/transcript-parser.test.ts src/modules/video/video-validation.test.ts
```

Commit:

```powershell
git add src/modules/video/transcript-parser.ts src/modules/video/transcript-parser.test.ts src/modules/video/video-validation.ts src/modules/video/video-validation.test.ts
git commit -m "feat: add video transcript parsing and validation"
```

## Task 3: Add Video Content Service

**Files:**
- Create: `src/modules/video/video-content-service.test.ts`
- Create: `src/modules/video/video-content-service.ts`

- [ ] **Step 1: Write service tests**

Tests must prove:

- Creating a lesson rejects non-native courses with `Video lessons can only be added to native video courses`.
- Creating a lesson requires playback URL or provider asset id with `Video lesson requires playback URL or provider asset id`.
- Creating a lesson validates duration and sort order.
- Creating a lesson rejects a module from another course with `Module does not belong to this course`.
- Replacing chapters validates ranges and runs inside `repository.runInTransaction`.
- Replacing transcript text parses cues and runs inside `repository.runInTransaction`.
- Audit actions are `video.lesson_created`, `video.chapters_replaced`, and `video.transcript_replaced`.

- [ ] **Step 2: Implement service**

Export:

```ts
export type VideoContentCourse = { id: string; organizationId: string; type: "NATIVE_VIDEO" | "SCORM_1_2" };
export type VideoContentModule = { id: string; organizationId: string; courseId: string };
export type CreateVideoLessonInput = {
  organizationId: string;
  courseId: string;
  moduleId?: string | null;
  actorId: string;
  title: string;
  slug: string;
  sortOrder: number;
  durationSeconds: number;
  required?: boolean;
  providerAssetId?: string | null;
  playbackUrl?: string | null;
  transcriptLanguage?: string;
};
```

Repository methods:

```ts
runInTransaction<T>(operation: () => Promise<T>): Promise<T>;
findCourse(input: { organizationId: string; courseId: string }): Promise<VideoContentCourse | null>;
findModule(input: { organizationId: string; courseId: string; moduleId: string }): Promise<VideoContentModule | null>;
createLesson(data: CreateVideoLessonData): Promise<{ id: string; slug: string }>;
replaceChapters(input: { organizationId: string; lessonId: string; chapters: VideoChapterInput[] }): Promise<void>;
replaceTranscriptCues(input: { organizationId: string; lessonId: string; cues: ParsedTranscriptCue[] }): Promise<void>;
findLesson(input: { organizationId: string; lessonId: string }): Promise<{ id: string; durationSeconds: number } | null>;
recordAuditLog(input: { organizationId: string; actorId: string; action: string; targetType: string; targetId: string }): Promise<void>;
```

- [ ] **Step 3: Run tests and commit**

Run:

```powershell
npm run test -- src/modules/video/video-content-service.test.ts
```

Commit:

```powershell
git add src/modules/video/video-content-service.ts src/modules/video/video-content-service.test.ts
git commit -m "feat: add native video content service"
```

## Task 4: Add Video Runtime Progress Service

**Files:**
- Create: `src/modules/video/video-runtime.test.ts`
- Create: `src/modules/video/video-runtime.ts`

- [ ] **Step 1: Write runtime tests**

Tests must prove:

- Launch rejects missing assignment with `Assignment was not found`.
- Launch rejects non-native course with `Assignment is not for a native video course`.
- Launch returns modules, lessons, current lesson, chapters, transcript cues, and progress.
- Recording progress clamps position and watched seconds to duration.
- Recording progress marks a lesson complete at 100 percent watched.
- Course progress is required lessons completed divided by required lesson count.
- Native `PROGRESS` event is sent below 100 percent.
- Native `COMPLETED` event is sent at 100 percent.

- [ ] **Step 2: Implement runtime service**

Export:

```ts
export type LaunchVideoRuntimeInput = {
  organizationId: string;
  assignmentId: string;
  lessonId?: string;
};

export type RecordVideoProgressInput = {
  organizationId: string;
  assignmentId: string;
  lessonId: string;
  positionSecond: number;
  watchedSecond: number;
  occurredAt: Date;
};
```

The repository loads assignment/course/lesson content and upserts `VideoLessonProgress`. The service accepts a `recordLearningEvent` callback so tests can verify native progress events without a real Prisma adapter.

- [ ] **Step 3: Run tests and commit**

Run:

```powershell
npm run test -- src/modules/video/video-runtime.test.ts
```

Commit:

```powershell
git add src/modules/video/video-runtime.ts src/modules/video/video-runtime.test.ts
git commit -m "feat: add native video runtime progress"
```

## Task 5: Add Transcript Search

**Files:**
- Create: `src/modules/video/transcript-search.test.ts`
- Create: `src/modules/video/transcript-search.ts`

- [ ] **Step 1: Write search tests**

Tests must prove:

- Search matches cues containing all query words case-insensitively.
- Search returns lesson id, lesson title, start second, end second, and snippet.
- Search is sorted by lesson sort order then cue start second.
- Blank query returns an empty list.

- [ ] **Step 2: Implement search**

Export:

```ts
export type TranscriptSearchCue = {
  lessonId: string;
  lessonTitle: string;
  lessonSortOrder: number;
  startSecond: number;
  endSecond: number | null;
  text: string;
};

export function searchTranscriptCues(query: string, cues: TranscriptSearchCue[]): TranscriptSearchResult[];
```

- [ ] **Step 3: Run tests and commit**

Run:

```powershell
npm run test -- src/modules/video/transcript-search.test.ts
```

Commit:

```powershell
git add src/modules/video/transcript-search.ts src/modules/video/transcript-search.test.ts
git commit -m "feat: add native video transcript search"
```

## Task 6: Add Prisma Repository Adapter

**Files:**
- Create: `src/modules/video/prisma-repository.test.ts`
- Create: `src/modules/video/prisma-repository.ts`

- [ ] **Step 1: Write repository tests**

Tests must prove:

- Runtime assignment lookup includes `organizationId`, `assignmentId`, course type, course status, modules, lessons, chapters, transcript cues, and lesson progress.
- Progress upsert uses compound `organizationId_assignmentId_lessonId`.
- Transcript search query includes `organizationId` and course lessons only.

- [ ] **Step 2: Implement repository adapter**

Export `createPrismaVideoRepository(client)` implementing the repository contracts needed by `video-content-service`, `video-runtime`, and transcript search.

- [ ] **Step 3: Run tests and commit**

Run:

```powershell
npm run test -- src/modules/video/prisma-repository.test.ts
```

Commit:

```powershell
git add src/modules/video/prisma-repository.ts src/modules/video/prisma-repository.test.ts
git commit -m "feat: add native video prisma repository"
```

## Task 7: Add Video Runtime Page Shells

**Files:**
- Create: `src/modules/video/page-shells.test.ts`
- Create: `src/app/org/[slug]/admin/courses/[courseSlug]/content/page.tsx`
- Create: `src/app/org/[slug]/learn/[courseSlug]/page.tsx`

- [ ] **Step 1: Write page shell tests**

Tests must read the page files and assert:

- Admin content page includes `Modules`, `Video lessons`, `Chapters`, `Transcript`, and disabled controls.
- Learner page includes `Video player`, `Chapters`, `Transcript`, `Search transcript`, `Resume`, and disabled controls.

- [ ] **Step 2: Implement page shells**

Create server components guarded with existing organization auth helpers:

- admin content page uses `requireOrganizationUsersAdminBySlug`
- learner page uses `requireOrganizationMemberBySlug`

- [ ] **Step 3: Run test/build and commit**

Run:

```powershell
npm run test -- src/modules/video/page-shells.test.ts
npm run build
```

Commit:

```powershell
git add src/modules/video/page-shells.test.ts 'src/app/org/[slug]/admin/courses/[courseSlug]/content/page.tsx' 'src/app/org/[slug]/learn/[courseSlug]/page.tsx'
git commit -m "feat: add native video runtime page shells"
```

## Task 8: Final Verification

**Files:**
- Modify: none unless a verification failure needs a concrete fix.

- [ ] **Step 1: Run full tests**

```powershell
npm run test
```

- [ ] **Step 2: Run lint**

```powershell
npm run lint
```

- [ ] **Step 3: Validate Prisma**

```powershell
npx prisma validate
```

- [ ] **Step 4: Run TypeScript**

```powershell
npx tsc --noEmit --incremental false
```

- [ ] **Step 5: Run build**

```powershell
npm run build
```

- [ ] **Step 6: Confirm clean branch**

```powershell
git status --short --branch
git log --oneline -12
```

## Review Checklist

- Every video query includes `organizationId`.
- Only `NATIVE_VIDEO` courses can receive video lessons.
- Chapters and transcript cues cannot exceed lesson duration.
- Runtime launch requires an assignment for the same organization.
- Progress uses lesson watched seconds and feeds existing native learning events.
- Course completion reaches 100 percent only when all required lessons are complete.
- Transcript search is deterministic and scoped to the course.
- Page shells are non-destructive and build-clean.
