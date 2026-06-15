# Global Library Copy Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a platform-managed global course library and a tenant-safe copy workflow that creates independent tenant-owned catalog, video, SCORM, and knowledge-check records.

**Architecture:** Store platform library source records in dedicated global-library tables so tenant catalog queries keep using tenant-owned `Course` rows. Put copy rules in `src/modules/library/global-library.ts`, Prisma query and transaction details in `src/modules/library/prisma-repository.ts`, and Next.js server-action parsing in `src/modules/library/server-actions.ts`. Keep learner recommendations tenant-scoped by making related-course ranking reject global-only candidates explicitly.

**Tech Stack:** Next.js App Router server components and server actions, TypeScript, Prisma 7, PostgreSQL, Vitest, existing auth guards, existing catalog validation helpers, existing audit log table.

---

## Scope Boundary

This plan implements global library management, organization access control, tenant copy, duplicate-copy decisions, copy audit logs, and tenant-safe recommendation filtering.

This plan does not implement storage-object duplication for binary video files or extracted SCORM package files. The copied tenant metadata keeps source playback URLs, provider asset ids, SCORM storage keys, content root keys, and launch paths so the tenant course is immediately usable in the current demo stack. A future storage-copy feature can rewrite those keys without changing the library copy contract.

## File Structure

Create or modify these files:

- Modify: `prisma/schema.prisma` - add global-library source models, knowledge-check metadata models, tenant copy lineage fields, and indexes.
- Create: `prisma/migrations/20260613020000_global_course_library/migration.sql` - create global-library and knowledge-check tables plus tenant course lineage columns.
- Modify: `prisma/seed.ts` - seed one published native-video global course and one published SCORM global course for the demo tenant to copy.
- Create: `src/modules/library/global-library.ts` - pure business service for global course lifecycle and tenant copy workflows.
- Create: `src/modules/library/global-library.test.ts` - service tests for lifecycle, access, duplicate policy, deep-copy shape, and audit metadata.
- Create: `src/modules/library/prisma-repository.ts` - Prisma adapter for global library reads/writes, tenant copy transactions, and audit logs.
- Create: `src/modules/library/prisma-repository.test.ts` - repository query-shape tests proving tenant scoping and transaction client use.
- Create: `src/modules/library/server-actions.ts` - pure server-action factories for platform library lifecycle and organization copy forms.
- Create: `src/modules/library/server-actions.test.ts` - action tests for parsing, access checks, duplicate action parsing, and error results.
- Create: `src/app/platform/library/page.tsx` - platform-owner global library list and create form page.
- Create: `src/app/platform/library/actions.ts` - server-action bridge guarded by `requirePlatformOwner`.
- Create: `src/app/platform/library/[courseSlug]/page.tsx` - platform-owner global course detail and lifecycle page.
- Create: `src/app/org/[slug]/admin/library/page.tsx` - organization-admin allowed-library browse and copy page.
- Create: `src/app/org/[slug]/admin/library/actions.ts` - tenant copy server-action bridge guarded by `requireOrganizationUsersAdminBySlug`.
- Modify: `src/modules/catalog/related-courses.ts` - require tenant-scoped candidates and reject global-only records.
- Modify: `src/modules/catalog/related-courses.test.ts` - add regression tests proving global-only candidates never rank.
- Modify: `src/modules/catalog/page-shells.test.ts` - add page-rendering checks for platform and organization library pages.

## Data Model Notes

Use separate global-library source tables instead of nullable `Course.organizationId`. Existing course, category, tag, assignment, video, SCORM, progress, certificate, and recommendation code assumes tenant ownership through `organizationId`; keeping that invariant lowers risk.

Add these Prisma models:

- `GlobalCourse`: source course managed by platform owners. Fields mirror copyable `Course` metadata and include `status`, `type`, `slug`, `title`, `description`, duration fields, and timestamps.
- `GlobalCourseCategory`, `GlobalCourseTag`, `GlobalCourseTagLink`: suggested taxonomy for copy only.
- `GlobalCourseModule`, `GlobalVideoLesson`, `GlobalVideoChapter`, `GlobalVideoTranscriptCue`: source native-video metadata.
- `GlobalScormPackage`: source SCORM metadata.
- `GlobalKnowledgeCheckQuestion`, `GlobalKnowledgeCheckAnswer`: source embedded knowledge-check metadata.
- `CourseKnowledgeCheckQuestion`, `CourseKnowledgeCheckAnswer`: tenant-owned copied metadata, linked to tenant `Course` and optional tenant `VideoLesson`.

Add these tenant lineage fields to `Course`:

```prisma
  sourceGlobalCourseId String?
  sourceGlobalCourse   GlobalCourse? @relation(fields: [sourceGlobalCourseId], references: [id], onDelete: SetNull)

  @@index([sourceGlobalCourseId])
  @@unique([organizationId, sourceGlobalCourseId])
```

The unique constraint blocks re-copy by default. The explicit duplicate action creates a second tenant course with `sourceGlobalCourseId = null` and a unique slug suffix, while audit metadata still records the source global course id.

## Task 1: Add Global Library Schema

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260613020000_global_course_library/migration.sql`

- [ ] **Step 1: Add schema models and Course lineage**

In `prisma/schema.prisma`, add global-library relations to `User` and `Course`:

```prisma
model User {
  // keep existing fields
  createdGlobalCourses GlobalCourse[] @relation("GlobalCourseCreatedBy")
  uploadedGlobalScormPackages GlobalScormPackage[] @relation("GlobalScormUploadedBy")
}

model Course {
  // keep existing fields
  sourceGlobalCourseId String?
  sourceGlobalCourse   GlobalCourse? @relation(fields: [sourceGlobalCourseId], references: [id], onDelete: SetNull)
  knowledgeCheckQuestions CourseKnowledgeCheckQuestion[]

  @@index([sourceGlobalCourseId])
  @@unique([organizationId, sourceGlobalCourseId])
}
```

Also add these inverse fields to existing models:

```prisma
model Organization {
  // keep existing fields
  knowledgeCheckQuestions CourseKnowledgeCheckQuestion[]
}

model VideoLesson {
  // keep existing fields
  knowledgeCheckQuestions CourseKnowledgeCheckQuestion[]
}
```

Add these models after `CourseTagLink`:

```prisma
model GlobalCourseCategory {
  id        String         @id @default(cuid())
  name      String
  slug      String         @unique
  courses   GlobalCourse[]
  createdAt DateTime       @default(now())
  updatedAt DateTime       @updatedAt
}

model GlobalCourseTag {
  id          String                @id @default(cuid())
  name        String
  slug        String                @unique
  courseLinks GlobalCourseTagLink[]
  createdAt   DateTime              @default(now())
  updatedAt   DateTime              @updatedAt
}

model GlobalCourse {
  id                              String                         @id @default(cuid())
  title                           String
  slug                            String                         @unique
  description                     String                         @default("")
  status                          CourseStatus                   @default(DRAFT)
  type                            CourseType
  estimatedCompletionBusinessDays Int                            @default(5)
  expectedDurationMinutes         Int                            @default(60)
  categoryId                      String?
  createdByUserId                 String?
  category                        GlobalCourseCategory?          @relation(fields: [categoryId], references: [id], onDelete: SetNull)
  createdBy                       User?                          @relation("GlobalCourseCreatedBy", fields: [createdByUserId], references: [id], onDelete: SetNull)
  tagLinks                        GlobalCourseTagLink[]
  tenantCopies                    Course[]
  modules                         GlobalCourseModule[]
  videoLessons                    GlobalVideoLesson[]
  scormPackage                    GlobalScormPackage?
  knowledgeCheckQuestions         GlobalKnowledgeCheckQuestion[]
  createdAt                       DateTime                       @default(now())
  updatedAt                       DateTime                       @updatedAt

  @@index([status])
  @@index([type])
}

model GlobalCourseTagLink {
  globalCourseId String
  tagId          String
  course         GlobalCourse @relation(fields: [globalCourseId], references: [id], onDelete: Cascade)
  tag            GlobalCourseTag @relation(fields: [tagId], references: [id], onDelete: Cascade)
  createdAt      DateTime @default(now())

  @@id([globalCourseId, tagId])
  @@index([tagId])
}

model GlobalCourseModule {
  id             String              @id @default(cuid())
  globalCourseId String
  title          String
  slug           String
  sortOrder      Int                 @default(0)
  course         GlobalCourse        @relation(fields: [globalCourseId], references: [id], onDelete: Cascade)
  lessons        GlobalVideoLesson[]
  createdAt      DateTime            @default(now())
  updatedAt      DateTime            @updatedAt

  @@unique([globalCourseId, slug])
  @@index([globalCourseId, sortOrder])
}

model GlobalVideoLesson {
  id                 String                         @id @default(cuid())
  globalCourseId     String
  moduleId           String?
  title              String
  slug               String
  sortOrder          Int                            @default(0)
  durationSeconds    Int
  required           Boolean                        @default(true)
  providerAssetId    String?
  playbackUrl        String?
  transcriptLanguage String                         @default("en")
  course             GlobalCourse                   @relation(fields: [globalCourseId], references: [id], onDelete: Cascade)
  module             GlobalCourseModule?            @relation(fields: [moduleId], references: [id], onDelete: SetNull)
  chapters           GlobalVideoChapter[]
  transcriptCues     GlobalVideoTranscriptCue[]
  knowledgeCheckQuestions GlobalKnowledgeCheckQuestion[]
  createdAt          DateTime                       @default(now())
  updatedAt          DateTime                       @updatedAt

  @@unique([globalCourseId, slug])
  @@index([globalCourseId, moduleId, sortOrder])
}

model GlobalVideoChapter {
  id             String            @id @default(cuid())
  lessonId       String
  title          String
  startSecond    Int
  endSecond      Int?
  sortOrder      Int               @default(0)
  lesson         GlobalVideoLesson @relation(fields: [lessonId], references: [id], onDelete: Cascade)
  createdAt      DateTime          @default(now())
  updatedAt      DateTime          @updatedAt

  @@index([lessonId, startSecond])
}

model GlobalVideoTranscriptCue {
  id          String            @id @default(cuid())
  lessonId    String
  startSecond Int
  endSecond   Int?
  text        String
  lesson      GlobalVideoLesson @relation(fields: [lessonId], references: [id], onDelete: Cascade)
  createdAt   DateTime          @default(now())

  @@index([lessonId, startSecond])
}

model GlobalScormPackage {
  id               String       @id @default(cuid())
  globalCourseId   String       @unique
  originalFileName String
  contentType      String
  byteSize         Int
  storageKey       String
  contentRootKey   String
  launchPath       String
  manifestTitle    String?
  uploadedByUserId String?
  active           Boolean      @default(true)
  course           GlobalCourse @relation(fields: [globalCourseId], references: [id], onDelete: Cascade)
  uploadedBy       User?        @relation("GlobalScormUploadedBy", fields: [uploadedByUserId], references: [id], onDelete: SetNull)
  createdAt        DateTime     @default(now())
  updatedAt        DateTime     @updatedAt
}

model GlobalKnowledgeCheckQuestion {
  id             String                       @id @default(cuid())
  globalCourseId String
  lessonId       String?
  prompt         String
  questionType   String
  sortOrder      Int                          @default(0)
  explanation    String?
  course         GlobalCourse                 @relation(fields: [globalCourseId], references: [id], onDelete: Cascade)
  lesson         GlobalVideoLesson?           @relation(fields: [lessonId], references: [id], onDelete: SetNull)
  answers        GlobalKnowledgeCheckAnswer[]
  createdAt      DateTime                     @default(now())
  updatedAt      DateTime                     @updatedAt

  @@index([globalCourseId, lessonId, sortOrder])
}

model GlobalKnowledgeCheckAnswer {
  id          String                       @id @default(cuid())
  questionId  String
  text        String
  correct     Boolean                      @default(false)
  feedback    String?
  sortOrder   Int                          @default(0)
  question    GlobalKnowledgeCheckQuestion @relation(fields: [questionId], references: [id], onDelete: Cascade)
  createdAt   DateTime                     @default(now())
  updatedAt   DateTime                     @updatedAt

  @@index([questionId, sortOrder])
}

model CourseKnowledgeCheckQuestion {
  id             String                       @id @default(cuid())
  organizationId String
  courseId       String
  lessonId       String?
  sourceGlobalQuestionId String?
  prompt         String
  questionType   String
  sortOrder      Int                          @default(0)
  explanation    String?
  organization   Organization                 @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  course         Course                       @relation(fields: [organizationId, courseId], references: [organizationId, id], onDelete: Cascade)
  lesson         VideoLesson?                 @relation(fields: [organizationId, lessonId], references: [organizationId, id], onDelete: NoAction)
  answers        CourseKnowledgeCheckAnswer[]
  createdAt      DateTime                     @default(now())
  updatedAt      DateTime                     @updatedAt

  @@index([organizationId, courseId, lessonId, sortOrder])
  @@index([sourceGlobalQuestionId])
}

model CourseKnowledgeCheckAnswer {
  id         String                       @id @default(cuid())
  questionId String
  text       String
  correct    Boolean                      @default(false)
  feedback   String?
  sortOrder  Int                          @default(0)
  question   CourseKnowledgeCheckQuestion @relation(fields: [questionId], references: [id], onDelete: Cascade)
  createdAt  DateTime                     @default(now())
  updatedAt  DateTime                     @updatedAt

  @@index([questionId, sortOrder])
}
```

- [ ] **Step 2: Create migration SQL**

Create `prisma/migrations/20260613020000_global_course_library/migration.sql` with this full SQL body:

```sql
CREATE TABLE "GlobalCourseCategory" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GlobalCourseCategory_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GlobalCourseCategory_slug_key"
ON "GlobalCourseCategory"("slug");

CREATE TABLE "GlobalCourseTag" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GlobalCourseTag_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GlobalCourseTag_slug_key"
ON "GlobalCourseTag"("slug");

CREATE TABLE "GlobalCourse" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "status" "CourseStatus" NOT NULL DEFAULT 'DRAFT',
  "type" "CourseType" NOT NULL,
  "estimatedCompletionBusinessDays" INTEGER NOT NULL DEFAULT 5,
  "expectedDurationMinutes" INTEGER NOT NULL DEFAULT 60,
  "categoryId" TEXT,
  "createdByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GlobalCourse_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GlobalCourse_slug_key"
ON "GlobalCourse"("slug");

CREATE INDEX "GlobalCourse_status_idx"
ON "GlobalCourse"("status");

CREATE INDEX "GlobalCourse_type_idx"
ON "GlobalCourse"("type");

ALTER TABLE "GlobalCourse"
ADD CONSTRAINT "GlobalCourse_categoryId_fkey"
FOREIGN KEY ("categoryId") REFERENCES "GlobalCourseCategory"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "GlobalCourse"
ADD CONSTRAINT "GlobalCourse_createdByUserId_fkey"
FOREIGN KEY ("createdByUserId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "GlobalCourseTagLink" (
  "globalCourseId" TEXT NOT NULL,
  "tagId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GlobalCourseTagLink_pkey" PRIMARY KEY ("globalCourseId", "tagId")
);

CREATE INDEX "GlobalCourseTagLink_tagId_idx"
ON "GlobalCourseTagLink"("tagId");

ALTER TABLE "GlobalCourseTagLink"
ADD CONSTRAINT "GlobalCourseTagLink_globalCourseId_fkey"
FOREIGN KEY ("globalCourseId") REFERENCES "GlobalCourse"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GlobalCourseTagLink"
ADD CONSTRAINT "GlobalCourseTagLink_tagId_fkey"
FOREIGN KEY ("tagId") REFERENCES "GlobalCourseTag"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "GlobalCourseModule" (
  "id" TEXT NOT NULL,
  "globalCourseId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GlobalCourseModule_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GlobalCourseModule_globalCourseId_slug_key"
ON "GlobalCourseModule"("globalCourseId", "slug");

CREATE INDEX "GlobalCourseModule_globalCourseId_sortOrder_idx"
ON "GlobalCourseModule"("globalCourseId", "sortOrder");

ALTER TABLE "GlobalCourseModule"
ADD CONSTRAINT "GlobalCourseModule_globalCourseId_fkey"
FOREIGN KEY ("globalCourseId") REFERENCES "GlobalCourse"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "GlobalVideoLesson" (
  "id" TEXT NOT NULL,
  "globalCourseId" TEXT NOT NULL,
  "moduleId" TEXT,
  "title" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "durationSeconds" INTEGER NOT NULL,
  "required" BOOLEAN NOT NULL DEFAULT true,
  "providerAssetId" TEXT,
  "playbackUrl" TEXT,
  "transcriptLanguage" TEXT NOT NULL DEFAULT 'en',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GlobalVideoLesson_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GlobalVideoLesson_globalCourseId_slug_key"
ON "GlobalVideoLesson"("globalCourseId", "slug");

CREATE INDEX "GlobalVideoLesson_globalCourseId_moduleId_sortOrder_idx"
ON "GlobalVideoLesson"("globalCourseId", "moduleId", "sortOrder");

ALTER TABLE "GlobalVideoLesson"
ADD CONSTRAINT "GlobalVideoLesson_globalCourseId_fkey"
FOREIGN KEY ("globalCourseId") REFERENCES "GlobalCourse"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GlobalVideoLesson"
ADD CONSTRAINT "GlobalVideoLesson_moduleId_fkey"
FOREIGN KEY ("moduleId") REFERENCES "GlobalCourseModule"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "GlobalVideoChapter" (
  "id" TEXT NOT NULL,
  "lessonId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "startSecond" INTEGER NOT NULL,
  "endSecond" INTEGER,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GlobalVideoChapter_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "GlobalVideoChapter_lessonId_startSecond_idx"
ON "GlobalVideoChapter"("lessonId", "startSecond");

ALTER TABLE "GlobalVideoChapter"
ADD CONSTRAINT "GlobalVideoChapter_lessonId_fkey"
FOREIGN KEY ("lessonId") REFERENCES "GlobalVideoLesson"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "GlobalVideoTranscriptCue" (
  "id" TEXT NOT NULL,
  "lessonId" TEXT NOT NULL,
  "startSecond" INTEGER NOT NULL,
  "endSecond" INTEGER,
  "text" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GlobalVideoTranscriptCue_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "GlobalVideoTranscriptCue_lessonId_startSecond_idx"
ON "GlobalVideoTranscriptCue"("lessonId", "startSecond");

ALTER TABLE "GlobalVideoTranscriptCue"
ADD CONSTRAINT "GlobalVideoTranscriptCue_lessonId_fkey"
FOREIGN KEY ("lessonId") REFERENCES "GlobalVideoLesson"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "GlobalScormPackage" (
  "id" TEXT NOT NULL,
  "globalCourseId" TEXT NOT NULL,
  "originalFileName" TEXT NOT NULL,
  "contentType" TEXT NOT NULL,
  "byteSize" INTEGER NOT NULL,
  "storageKey" TEXT NOT NULL,
  "contentRootKey" TEXT NOT NULL,
  "launchPath" TEXT NOT NULL,
  "manifestTitle" TEXT,
  "uploadedByUserId" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GlobalScormPackage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GlobalScormPackage_globalCourseId_key"
ON "GlobalScormPackage"("globalCourseId");

ALTER TABLE "GlobalScormPackage"
ADD CONSTRAINT "GlobalScormPackage_globalCourseId_fkey"
FOREIGN KEY ("globalCourseId") REFERENCES "GlobalCourse"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GlobalScormPackage"
ADD CONSTRAINT "GlobalScormPackage_uploadedByUserId_fkey"
FOREIGN KEY ("uploadedByUserId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "GlobalKnowledgeCheckQuestion" (
  "id" TEXT NOT NULL,
  "globalCourseId" TEXT NOT NULL,
  "lessonId" TEXT,
  "prompt" TEXT NOT NULL,
  "questionType" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "explanation" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GlobalKnowledgeCheckQuestion_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "GlobalKnowledgeCheckQuestion_globalCourseId_lessonId_sortOrder_idx"
ON "GlobalKnowledgeCheckQuestion"("globalCourseId", "lessonId", "sortOrder");

ALTER TABLE "GlobalKnowledgeCheckQuestion"
ADD CONSTRAINT "GlobalKnowledgeCheckQuestion_globalCourseId_fkey"
FOREIGN KEY ("globalCourseId") REFERENCES "GlobalCourse"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GlobalKnowledgeCheckQuestion"
ADD CONSTRAINT "GlobalKnowledgeCheckQuestion_lessonId_fkey"
FOREIGN KEY ("lessonId") REFERENCES "GlobalVideoLesson"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "GlobalKnowledgeCheckAnswer" (
  "id" TEXT NOT NULL,
  "questionId" TEXT NOT NULL,
  "text" TEXT NOT NULL,
  "correct" BOOLEAN NOT NULL DEFAULT false,
  "feedback" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GlobalKnowledgeCheckAnswer_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "GlobalKnowledgeCheckAnswer_questionId_sortOrder_idx"
ON "GlobalKnowledgeCheckAnswer"("questionId", "sortOrder");

ALTER TABLE "GlobalKnowledgeCheckAnswer"
ADD CONSTRAINT "GlobalKnowledgeCheckAnswer_questionId_fkey"
FOREIGN KEY ("questionId") REFERENCES "GlobalKnowledgeCheckQuestion"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Course" ADD COLUMN "sourceGlobalCourseId" TEXT;

CREATE UNIQUE INDEX "Course_organizationId_sourceGlobalCourseId_key"
ON "Course"("organizationId", "sourceGlobalCourseId");

CREATE INDEX "Course_sourceGlobalCourseId_idx"
ON "Course"("sourceGlobalCourseId");

ALTER TABLE "Course"
ADD CONSTRAINT "Course_sourceGlobalCourseId_fkey"
FOREIGN KEY ("sourceGlobalCourseId") REFERENCES "GlobalCourse"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "CourseKnowledgeCheckQuestion" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "courseId" TEXT NOT NULL,
  "lessonId" TEXT,
  "sourceGlobalQuestionId" TEXT,
  "prompt" TEXT NOT NULL,
  "questionType" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "explanation" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CourseKnowledgeCheckQuestion_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CourseKnowledgeCheckQuestion_organizationId_courseId_lessonId_sortOrder_idx"
ON "CourseKnowledgeCheckQuestion"("organizationId", "courseId", "lessonId", "sortOrder");

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
ADD CONSTRAINT "CourseKnowledgeCheckQuestion_organizationId_lessonId_fkey"
FOREIGN KEY ("organizationId", "lessonId") REFERENCES "VideoLesson"("organizationId", "id")
ON DELETE NO ACTION ON UPDATE CASCADE;

CREATE TABLE "CourseKnowledgeCheckAnswer" (
  "id" TEXT NOT NULL,
  "questionId" TEXT NOT NULL,
  "text" TEXT NOT NULL,
  "correct" BOOLEAN NOT NULL DEFAULT false,
  "feedback" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CourseKnowledgeCheckAnswer_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CourseKnowledgeCheckAnswer_questionId_sortOrder_idx"
ON "CourseKnowledgeCheckAnswer"("questionId", "sortOrder");

ALTER TABLE "CourseKnowledgeCheckAnswer"
ADD CONSTRAINT "CourseKnowledgeCheckAnswer_questionId_fkey"
FOREIGN KEY ("questionId") REFERENCES "CourseKnowledgeCheckQuestion"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
```

- [ ] **Step 3: Verify schema**

Run:

```powershell
npx prisma validate
npm run prisma:generate
```

Expected: both commands exit `0`.

- [ ] **Step 4: Commit schema changes**

Run:

```powershell
git add prisma/schema.prisma prisma/migrations/20260613020000_global_course_library/migration.sql
git commit -m "feat: add global course library schema"
```

Expected: commit succeeds.

## Task 2: Add Global Library Business Service

**Files:**
- Create: `src/modules/library/global-library.test.ts`
- Create: `src/modules/library/global-library.ts`

- [ ] **Step 1: Write lifecycle and access tests**

Create `src/modules/library/global-library.test.ts` with tests for:

- platform owner can create a draft global course.
- platform owner can publish, deprecate, and retire a global course.
- missing `organization.globalLibraryEnabled` blocks tenant copy with `Global library is not enabled for this organization`.
- only published global courses can be copied.
- duplicate copy is blocked with `Global course is already copied into this organization`.
- explicit duplicate action creates a tenant copy with `sourceGlobalCourseId: null`.

Use this fake repository shape:

```ts
type FakeLibraryRepository = GlobalLibraryRepository & {
  globalCourse: GlobalCourseCopySource | null;
  organization: { id: string; globalLibraryEnabled: boolean } | null;
  existingCopy: { id: string; slug: string } | null;
  createdTenantCourse: { id: string; slug: string } | null;
  auditLogs: Array<{ action: string; targetId: string; metadata: Record<string, string> }>;
};
```

Use this executable test body:

```ts
import { describe, expect, it } from "vitest";

import {
  copyGlobalCourseToOrganization,
  createGlobalCourse,
  RetryableTenantCourseSlugCollisionError,
  updateGlobalCourseLifecycle,
  type GlobalCourseCopySource,
  type GlobalLibraryRepository,
  type TenantCourseCopyData,
} from "./global-library";

const publishedSource: GlobalCourseCopySource = {
  id: "global_course_1",
  title: "Global Coaching Basics",
  slug: "global-coaching-basics",
  description: "Library course",
  status: "PUBLISHED",
  type: "NATIVE_VIDEO",
  estimatedCompletionBusinessDays: 3,
  expectedDurationMinutes: 30,
  category: { id: "global_cat_1", name: "Leadership", slug: "leadership" },
  tags: [{ id: "global_tag_1", name: "Coaching", slug: "coaching" }],
  modules: [{ id: "global_module_1", title: "Foundation", slug: "foundation", sortOrder: 0 }],
  videoLessons: [{
    id: "global_lesson_1",
    moduleId: "global_module_1",
    title: "Ask Better Questions",
    slug: "ask-better-questions",
    sortOrder: 0,
    durationSeconds: 180,
    required: true,
    providerAssetId: "mux_asset_1",
    playbackUrl: "https://video.learnhub.local/global/ask-better-questions.mp4",
    transcriptLanguage: "en",
    chapters: [{ title: "Open", startSecond: 0, endSecond: 60, sortOrder: 0 }],
    transcriptCues: [{ startSecond: 0, endSecond: 30, text: "Start with context." }],
  }],
  scormPackage: null,
  knowledgeCheckQuestions: [{
    id: "global_question_1",
    lessonId: "global_lesson_1",
    prompt: "Which question invites context?",
    questionType: "SINGLE_CHOICE",
    sortOrder: 0,
    explanation: "Open questions reveal blockers.",
    answers: [
      { text: "What happened?", correct: true, feedback: "Correct.", sortOrder: 0 },
      { text: "Why did you fail?", correct: false, feedback: "This closes conversation.", sortOrder: 1 },
    ],
  }],
};

function createFakeRepository(overrides: Partial<FakeLibraryRepository> = {}): FakeLibraryRepository {
  const repository: FakeLibraryRepository = {
    globalCourse: publishedSource,
    organization: { id: "org_1", globalLibraryEnabled: true },
    existingCopy: null,
    createdTenantCourse: { id: "tenant_course_1", slug: "global-coaching-basics" },
    copiedData: null,
    auditLogs: [],
    allocatedSlugs: [],
    copyFailures: [],
    transactionCount: 0,
    async runInTransaction(operation) {
      this.transactionCount += 1;
      return operation(this);
    },
    async findOrganization() {
      return this.organization;
    },
    async findGlobalCourseForCopy() {
      return this.globalCourse;
    },
    async findTenantCopy() {
      return this.existingCopy;
    },
    async findTenantCatalogCourses() {
      return [];
    },
    async createGlobalCourse(input) {
      this.createdGlobalCourse = input;
      return { id: "global_created_1", slug: input.course.slug };
    },
    async replaceGlobalCourseTags() {},
    async updateGlobalCourseLifecycle(input) {
      this.updatedLifecycle = input;
    },
    async copyGlobalCourseToTenant(input) {
      this.copiedData = input;
      const copyFailure = this.copyFailures.shift();

      if (copyFailure) {
        throw copyFailure;
      }

      const allocatedSlug = this.allocatedSlugs.shift() ?? input.course.baseSlug;

      return { courseId: this.createdTenantCourse!.id, slug: allocatedSlug };
    },
    async recordAuditLog(input) {
      this.auditLogs.push(input);
    },
    ...overrides,
  };

  return repository;
}

type FakeLibraryRepository = GlobalLibraryRepository & {
  globalCourse: GlobalCourseCopySource | null;
  organization: { id: string; globalLibraryEnabled: boolean } | null;
  existingCopy: { id: string; slug: string } | null;
  createdTenantCourse: { id: string; slug: string } | null;
  copiedData: TenantCourseCopyData | null;
  createdGlobalCourse?: Parameters<GlobalLibraryRepository["createGlobalCourse"]>[0];
  updatedLifecycle?: Parameters<GlobalLibraryRepository["updateGlobalCourseLifecycle"]>[0];
  auditLogs: Array<Parameters<GlobalLibraryRepository["recordAuditLog"]>[0]>;
  allocatedSlugs: string[];
  copyFailures: Error[];
  transactionCount: number;
};

describe("global library service", () => {
  it("creates a draft global course with normalized catalog fields and audit", async () => {
    const repository = createFakeRepository();

    await expect(createGlobalCourse({
      actorId: "owner_1",
      title: "  New Library Course  ",
      slug: "new-library-course",
      description: "Global source",
      type: "SCORM_1_2",
      categoryId: "global_cat_1",
      tagIds: ["tag_1", "tag_2"],
      estimatedCompletionBusinessDays: 4,
      expectedDurationMinutes: 45,
    }, repository)).resolves.toEqual({ id: "global_created_1", slug: "new-library-course" });

    expect(repository.transactionCount).toBe(1);
    expect(repository.createdGlobalCourse).toEqual({
      course: {
        title: "New Library Course",
        slug: "new-library-course",
        description: "Global source",
        status: "DRAFT",
        type: "SCORM_1_2",
        categoryId: "global_cat_1",
        estimatedCompletionBusinessDays: 4,
        expectedDurationMinutes: 45,
        createdByUserId: "owner_1",
      },
      tagIds: ["tag_1", "tag_2"],
    });
    expect(repository.auditLogs).toContainEqual({
      organizationId: null,
      actorId: "owner_1",
      action: "global_course.created",
      targetType: "global_course",
      targetId: "global_created_1",
      metadata: {},
    });
  });

  it("updates global lifecycle and records audit", async () => {
    const repository = createFakeRepository();

    await updateGlobalCourseLifecycle({
      actorId: "owner_1",
      globalCourseId: "global_course_1",
      status: "DEPRECATED",
    }, repository);

    expect(repository.updatedLifecycle).toEqual({ globalCourseId: "global_course_1", status: "DEPRECATED" });
    expect(repository.auditLogs[0]).toMatchObject({
      organizationId: null,
      actorId: "owner_1",
      action: "global_course.lifecycle_updated",
      targetType: "global_course",
      targetId: "global_course_1",
      metadata: { status: "DEPRECATED" },
    });
  });

  it("blocks copy when organization global library access is disabled", async () => {
    const repository = createFakeRepository({
      organization: { id: "org_1", globalLibraryEnabled: false },
    });

    await expect(copyGlobalCourseToOrganization({
      actorId: "admin_1",
      organizationId: "org_1",
      globalCourseId: "global_course_1",
      duplicateAction: "block",
    }, repository)).rejects.toThrow("Global library is not enabled for this organization");
  });

  it("blocks copy when the global course is not published", async () => {
    const repository = createFakeRepository({
      globalCourse: { ...publishedSource, status: "DEPRECATED" },
    });

    await expect(copyGlobalCourseToOrganization({
      actorId: "admin_1",
      organizationId: "org_1",
      globalCourseId: "global_course_1",
      duplicateAction: "block",
    }, repository)).rejects.toThrow("Only published global courses can be copied");
  });

  it("blocks normal re-copy when an existing tenant copy is present", async () => {
    const repository = createFakeRepository({
      existingCopy: { id: "tenant_course_existing", slug: "global-coaching-basics" },
    });

    await expect(copyGlobalCourseToOrganization({
      actorId: "admin_1",
      organizationId: "org_1",
      globalCourseId: "global_course_1",
      duplicateAction: "block",
    }, repository)).rejects.toThrow("Global course is already copied into this organization");
  });

  it("normalizes deep copy data and records source and created tenant ids in audit", async () => {
    const repository = createFakeRepository();

    await copyGlobalCourseToOrganization({
      actorId: "admin_1",
      organizationId: "org_1",
      globalCourseId: "global_course_1",
      duplicateAction: "block",
    }, repository);

    expect(repository.copiedData).toEqual({
      organizationId: "org_1",
      sourceGlobalCourseId: "global_course_1",
      category: { name: "Leadership", slug: "leadership" },
      tags: [{ name: "Coaching", slug: "coaching" }],
      course: {
        title: "Global Coaching Basics",
        baseSlug: "global-coaching-basics",
        description: "Library course",
        type: "NATIVE_VIDEO",
        estimatedCompletionBusinessDays: 3,
        expectedDurationMinutes: 30,
        sourceGlobalCourseId: "global_course_1",
      },
      modules: [{ sourceGlobalModuleId: "global_module_1", title: "Foundation", slug: "foundation", sortOrder: 0 }],
      videoLessons: [{
        sourceGlobalLessonId: "global_lesson_1",
        sourceGlobalModuleId: "global_module_1",
        title: "Ask Better Questions",
        slug: "ask-better-questions",
        sortOrder: 0,
        durationSeconds: 180,
        required: true,
        providerAssetId: "mux_asset_1",
        playbackUrl: "https://video.learnhub.local/global/ask-better-questions.mp4",
        transcriptLanguage: "en",
        chapters: [{ title: "Open", startSecond: 0, endSecond: 60, sortOrder: 0 }],
        transcriptCues: [{ startSecond: 0, endSecond: 30, text: "Start with context." }],
      }],
      scormPackage: null,
      knowledgeCheckQuestions: [{
        sourceGlobalQuestionId: "global_question_1",
        sourceGlobalLessonId: "global_lesson_1",
        prompt: "Which question invites context?",
        questionType: "SINGLE_CHOICE",
        sortOrder: 0,
        explanation: "Open questions reveal blockers.",
        answers: [
          { text: "What happened?", correct: true, feedback: "Correct.", sortOrder: 0 },
          { text: "Why did you fail?", correct: false, feedback: "This closes conversation.", sortOrder: 1 },
        ],
      }],
    });
    expect(repository.auditLogs).toContainEqual({
      organizationId: "org_1",
      actorId: "admin_1",
      action: "global_course.copied_to_tenant",
      targetType: "course",
      targetId: "tenant_course_1",
      metadata: {
        sourceGlobalCourseId: "global_course_1",
        createdTenantCourseId: "tenant_course_1",
      },
    });
  });

  it("allows explicit duplicate action by clearing lineage and suffixing the slug", async () => {
    const repository = createFakeRepository({
      existingCopy: { id: "tenant_course_existing", slug: "global-coaching-basics" },
      allocatedSlugs: ["global-coaching-basics-copy-1"],
    });

    await copyGlobalCourseToOrganization({
      actorId: "admin_1",
      organizationId: "org_1",
      globalCourseId: "global_course_1",
      duplicateAction: "duplicate",
    }, repository);

    expect(repository.copiedData?.course.sourceGlobalCourseId).toBeNull();
    expect(repository.copiedData?.course.baseSlug).toBe("global-coaching-basics-copy");
  });

  it("keeps lineage for normal first copy when the repository resolves a tenant slug collision", async () => {
    const repository = createFakeRepository({
      allocatedSlugs: ["global-coaching-basics-1"],
    });

    await expect(copyGlobalCourseToOrganization({
      actorId: "admin_1",
      organizationId: "org_1",
      globalCourseId: "global_course_1",
      duplicateAction: "block",
    }, repository)).resolves.toEqual({ courseId: "tenant_course_1", slug: "global-coaching-basics-1" });

    expect(repository.copiedData?.course.baseSlug).toBe("global-coaching-basics");
    expect(repository.copiedData?.course.sourceGlobalCourseId).toBe("global_course_1");
  });

  it("re-enters the repository transaction once for a retryable course slug collision", async () => {
    const repository = createFakeRepository({
      allocatedSlugs: ["global-coaching-basics-2"],
      copyFailures: [new RetryableTenantCourseSlugCollisionError()],
    });

    await expect(copyGlobalCourseToOrganization({
      actorId: "admin_1",
      organizationId: "org_1",
      globalCourseId: "global_course_1",
      duplicateAction: "block",
    }, repository)).resolves.toEqual({ courseId: "tenant_course_1", slug: "global-coaching-basics-2" });

    expect(repository.transactionCount).toBe(2);
    expect(repository.copiedData?.course.baseSlug).toBe("global-coaching-basics");
    expect(repository.copiedData?.course.sourceGlobalCourseId).toBe("global_course_1");
  });

  it("returns distinct slugs for repeated explicit duplicate copies allocated inside repository copy", async () => {
    const repository = createFakeRepository({
      existingCopy: { id: "tenant_course_existing", slug: "global-coaching-basics" },
      allocatedSlugs: ["global-coaching-basics-copy-1", "global-coaching-basics-copy-2"],
    });

    const firstResult = await copyGlobalCourseToOrganization({
      actorId: "admin_1",
      organizationId: "org_1",
      globalCourseId: "global_course_1",
      duplicateAction: "duplicate",
    }, repository);

    const secondResult = await copyGlobalCourseToOrganization({
      actorId: "admin_1",
      organizationId: "org_1",
      globalCourseId: "global_course_1",
      duplicateAction: "duplicate",
    }, repository);

    expect(firstResult.slug).toBe("global-coaching-basics-copy-1");
    expect(secondResult.slug).toBe("global-coaching-basics-copy-2");
    expect(firstResult.slug).not.toBe(secondResult.slug);
  });
});
```

Run:

```powershell
npm run test -- src/modules/library/global-library.test.ts
```

Expected: fail because `src/modules/library/global-library.ts` does not exist.

- [ ] **Step 2: Implement service types**

Create `src/modules/library/global-library.ts` and export:

```ts
import type { CourseStatus, CourseType } from "@prisma/client";

export type DuplicateGlobalCourseAction = "block" | "duplicate";

export class RetryableTenantCourseSlugCollisionError extends Error {
  constructor() {
    super("Tenant course slug collision; retry the copy operation");
    this.name = "RetryableTenantCourseSlugCollisionError";
  }
}

export type CreateGlobalCourseInput = {
  actorId: string;
  title: string;
  slug: string;
  description?: string;
  type: CourseType;
  categoryId?: string | null;
  tagIds?: string[];
  estimatedCompletionBusinessDays: number;
  expectedDurationMinutes: number;
};

export type UpdateGlobalCourseLifecycleInput = {
  actorId: string;
  globalCourseId: string;
  status: CourseStatus;
};

export type CopyGlobalCourseInput = {
  actorId: string;
  organizationId: string;
  globalCourseId: string;
  duplicateAction: DuplicateGlobalCourseAction;
};
```

Also export source shapes:

```ts
export type GlobalCourseCopySource = {
  id: string;
  title: string;
  slug: string;
  description: string;
  status: CourseStatus;
  type: CourseType;
  estimatedCompletionBusinessDays: number;
  expectedDurationMinutes: number;
  category: { id: string; name: string; slug: string } | null;
  tags: Array<{ id: string; name: string; slug: string }>;
  modules: Array<{ id: string; title: string; slug: string; sortOrder: number }>;
  videoLessons: Array<{
    id: string;
    moduleId: string | null;
    title: string;
    slug: string;
    sortOrder: number;
    durationSeconds: number;
    required: boolean;
    providerAssetId: string | null;
    playbackUrl: string | null;
    transcriptLanguage: string;
    chapters: Array<{ title: string; startSecond: number; endSecond: number | null; sortOrder: number }>;
    transcriptCues: Array<{ startSecond: number; endSecond: number | null; text: string }>;
  }>;
  scormPackage: {
    originalFileName: string;
    contentType: string;
    byteSize: number;
    storageKey: string;
    contentRootKey: string;
    launchPath: string;
    manifestTitle: string | null;
    active: boolean;
  } | null;
  knowledgeCheckQuestions: Array<{
    id: string;
    lessonId: string | null;
    prompt: string;
    questionType: string;
    sortOrder: number;
    explanation: string | null;
    answers: Array<{ text: string; correct: boolean; feedback: string | null; sortOrder: number }>;
  }>;
};
```

- [ ] **Step 3: Implement repository interface and service functions**

In `global-library.ts`, export:

```ts
export type CreateGlobalCourseData = {
  course: {
    title: string;
    slug: string;
    description: string;
    status: CourseStatus;
    type: CourseType;
    categoryId: string | null;
    estimatedCompletionBusinessDays: number;
    expectedDurationMinutes: number;
    createdByUserId: string;
  };
  tagIds: string[];
};

export type TenantCourseCopyData = {
  organizationId: string;
  sourceGlobalCourseId: string;
  category: { name: string; slug: string } | null;
  tags: Array<{ name: string; slug: string }>;
  course: {
    title: string;
    baseSlug: string;
    description: string;
    type: CourseType;
    estimatedCompletionBusinessDays: number;
    expectedDurationMinutes: number;
    sourceGlobalCourseId: string | null;
  };
  modules: Array<{ sourceGlobalModuleId: string; title: string; slug: string; sortOrder: number }>;
  videoLessons: Array<{
    sourceGlobalLessonId: string;
    sourceGlobalModuleId: string | null;
    title: string;
    slug: string;
    sortOrder: number;
    durationSeconds: number;
    required: boolean;
    providerAssetId: string | null;
    playbackUrl: string | null;
    transcriptLanguage: string;
    chapters: Array<{ title: string; startSecond: number; endSecond: number | null; sortOrder: number }>;
    transcriptCues: Array<{ startSecond: number; endSecond: number | null; text: string }>;
  }>;
  scormPackage: {
    originalFileName: string;
    contentType: string;
    byteSize: number;
    storageKey: string;
    contentRootKey: string;
    launchPath: string;
    manifestTitle: string | null;
    active: boolean;
  } | null;
  knowledgeCheckQuestions: Array<{
    sourceGlobalQuestionId: string;
    sourceGlobalLessonId: string | null;
    prompt: string;
    questionType: string;
    sortOrder: number;
    explanation: string | null;
    answers: Array<{ text: string; correct: boolean; feedback: string | null; sortOrder: number }>;
  }>;
};

export type GlobalLibraryRepository = {
  runInTransaction<T>(operation: (repository: GlobalLibraryRepository) => Promise<T>): Promise<T>;
  findOrganization(input: { organizationId: string }): Promise<{ id: string; globalLibraryEnabled: boolean } | null>;
  findGlobalCourseForCopy(input: { globalCourseId: string }): Promise<GlobalCourseCopySource | null>;
  findTenantCopy(input: { organizationId: string; globalCourseId: string }): Promise<{ id: string; slug: string } | null>;
  findTenantCatalogCourses(input: { organizationId: string }): Promise<Array<{ id: string; title: string; slug: string; sourceGlobalCourseId: string | null }>>;
  createGlobalCourse(input: CreateGlobalCourseData): Promise<{ id: string; slug: string }>;
  replaceGlobalCourseTags(input: { globalCourseId: string; tagIds: string[] }): Promise<void>;
  updateGlobalCourseLifecycle(input: { globalCourseId: string; status: CourseStatus }): Promise<void>;
  copyGlobalCourseToTenant(input: TenantCourseCopyData): Promise<{ courseId: string; slug: string }>;
  recordAuditLog(input: {
    organizationId: string | null;
    actorId: string;
    action: string;
    targetType: string;
    targetId: string;
    metadata: Record<string, string>;
  }): Promise<void>;
};
```

Implement:

```ts
export async function createGlobalCourse(input: CreateGlobalCourseInput, repository: GlobalLibraryRepository)
export async function updateGlobalCourseLifecycle(input: UpdateGlobalCourseLifecycleInput, repository: GlobalLibraryRepository)
export async function copyGlobalCourseToOrganization(input: CopyGlobalCourseInput, repository: GlobalLibraryRepository)
```

Rules:

- `createGlobalCourse` validates title and slug with existing catalog helpers and records audit action `global_course.created`.
- `updateGlobalCourseLifecycle` accepts only `DRAFT`, `PUBLISHED`, `DEPRECATED`, and `RETIRED`; it records `global_course.lifecycle_updated`.
- `copyGlobalCourseToOrganization` requires an existing organization with `globalLibraryEnabled === true`.
- Copy requires `GlobalCourse.status === "PUBLISHED"`.
- Copy with `duplicateAction: "block"` rejects an existing tenant copy.
- Normal first copy and explicit duplicate copy both pass a base slug to the repository; the repository allocates the final tenant-unique slug inside the transaction-scoped copy write.
- Normal re-copy is still blocked by `sourceGlobalCourseId` before the repository copy transaction starts.
- Copy with `duplicateAction: "duplicate"` creates a separate tenant copy with `sourceGlobalCourseId: null`.
- If the repository reports a retryable tenant course slug collision, the service retries the whole repository copy transaction once by calling `runInTransaction` again.
- Copy audit action is `global_course.copied_to_tenant`.
- Copy audit metadata includes `sourceGlobalCourseId` and `createdTenantCourseId`.

Use these concrete service implementations:

```ts
import {
  normalizeCatalogSlug,
  requireCatalogTitle,
  requireNonNegativeBusinessDays,
  requirePositiveDurationMinutes,
} from "@/modules/catalog/catalog-validation";

const allowedLifecycleStatuses: CourseStatus[] = ["DRAFT", "PUBLISHED", "DEPRECATED", "RETIRED"];

export async function createGlobalCourse(
  input: CreateGlobalCourseInput,
  repository: GlobalLibraryRepository,
): Promise<{ id: string; slug: string }> {
  const actorId = requireNonEmptyValue(input.actorId, "Actor id is required");
  const data: CreateGlobalCourseData = {
    course: {
      title: requireCatalogTitle(input.title),
      slug: normalizeCatalogSlug(input.slug),
      description: input.description?.trim() ?? "",
      status: "DRAFT",
      type: input.type,
      categoryId: normalizeNullableValue(input.categoryId),
      estimatedCompletionBusinessDays: requireNonNegativeBusinessDays(input.estimatedCompletionBusinessDays),
      expectedDurationMinutes: requirePositiveDurationMinutes(input.expectedDurationMinutes),
      createdByUserId: actorId,
    },
    tagIds: input.tagIds?.map((tagId) => requireNonEmptyValue(tagId, "Tag id is required")) ?? [],
  };

  return repository.runInTransaction(async (transactionRepository) => {
    const course = await transactionRepository.createGlobalCourse(data);
    await transactionRepository.recordAuditLog({
      organizationId: null,
      actorId,
      action: "global_course.created",
      targetType: "global_course",
      targetId: course.id,
      metadata: {},
    });

    return course;
  });
}

export async function updateGlobalCourseLifecycle(
  input: UpdateGlobalCourseLifecycleInput,
  repository: GlobalLibraryRepository,
): Promise<void> {
  const actorId = requireNonEmptyValue(input.actorId, "Actor id is required");
  const globalCourseId = requireNonEmptyValue(input.globalCourseId, "Global course id is required");

  if (!allowedLifecycleStatuses.includes(input.status)) {
    throw new Error("Unsupported global course lifecycle status");
  }

  await repository.runInTransaction(async (transactionRepository) => {
    await transactionRepository.updateGlobalCourseLifecycle({ globalCourseId, status: input.status });
    await transactionRepository.recordAuditLog({
      organizationId: null,
      actorId,
      action: "global_course.lifecycle_updated",
      targetType: "global_course",
      targetId: globalCourseId,
      metadata: { status: input.status },
    });
  });
}

export async function copyGlobalCourseToOrganization(
  input: CopyGlobalCourseInput,
  repository: GlobalLibraryRepository,
): Promise<{ courseId: string; slug: string }> {
  const actorId = requireNonEmptyValue(input.actorId, "Actor id is required");
  const organizationId = requireNonEmptyValue(input.organizationId, "Organization id is required");
  const globalCourseId = requireNonEmptyValue(input.globalCourseId, "Global course id is required");
  const organization = await repository.findOrganization({ organizationId });

  if (!organization?.globalLibraryEnabled) {
    throw new Error("Global library is not enabled for this organization");
  }

  const source = await repository.findGlobalCourseForCopy({ globalCourseId });

  if (!source) {
    throw new Error("Global course not found");
  }

  if (source.status !== "PUBLISHED") {
    throw new Error("Only published global courses can be copied");
  }

  const existingCopy = await repository.findTenantCopy({ organizationId, globalCourseId });

  if (existingCopy && input.duplicateAction === "block") {
    throw new Error("Global course is already copied into this organization");
  }

  const duplicate = input.duplicateAction === "duplicate";
  const copyData = normalizeTenantCourseCopyData({ organizationId, source, duplicate });

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await repository.runInTransaction(async (transactionRepository) => {
        const createdCourse = await transactionRepository.copyGlobalCourseToTenant(copyData);
        await transactionRepository.recordAuditLog({
          organizationId,
          actorId,
          action: "global_course.copied_to_tenant",
          targetType: "course",
          targetId: createdCourse.courseId,
          metadata: {
            sourceGlobalCourseId: source.id,
            createdTenantCourseId: createdCourse.courseId,
          },
        });

        return createdCourse;
      });
    } catch (error) {
      if (error instanceof RetryableTenantCourseSlugCollisionError && attempt === 0) {
        continue;
      }

      throw error;
    }
  }

  throw new Error("Global course copy failed after slug collision retry");
}

function normalizeTenantCourseCopyData(input: {
  organizationId: string;
  source: GlobalCourseCopySource;
  duplicate: boolean;
}): TenantCourseCopyData {
  return {
    organizationId: input.organizationId,
    sourceGlobalCourseId: input.source.id,
    category: input.source.category ? { name: input.source.category.name, slug: input.source.category.slug } : null,
    tags: input.source.tags.map((tag) => ({ name: tag.name, slug: tag.slug })),
    course: {
      title: input.source.title,
      baseSlug: input.duplicate ? `${input.source.slug}-copy` : input.source.slug,
      description: input.source.description,
      type: input.source.type,
      estimatedCompletionBusinessDays: input.source.estimatedCompletionBusinessDays,
      expectedDurationMinutes: input.source.expectedDurationMinutes,
      sourceGlobalCourseId: input.duplicate ? null : input.source.id,
    },
    modules: input.source.modules.map((module) => ({
      sourceGlobalModuleId: module.id,
      title: module.title,
      slug: module.slug,
      sortOrder: module.sortOrder,
    })),
    videoLessons: input.source.videoLessons.map((lesson) => ({
      sourceGlobalLessonId: lesson.id,
      sourceGlobalModuleId: lesson.moduleId,
      title: lesson.title,
      slug: lesson.slug,
      sortOrder: lesson.sortOrder,
      durationSeconds: lesson.durationSeconds,
      required: lesson.required,
      providerAssetId: lesson.providerAssetId,
      playbackUrl: lesson.playbackUrl,
      transcriptLanguage: lesson.transcriptLanguage,
      chapters: lesson.chapters,
      transcriptCues: lesson.transcriptCues,
    })),
    scormPackage: input.source.scormPackage,
    knowledgeCheckQuestions: input.source.knowledgeCheckQuestions.map((question) => ({
      sourceGlobalQuestionId: question.id,
      sourceGlobalLessonId: question.lessonId,
      prompt: question.prompt,
      questionType: question.questionType,
      sortOrder: question.sortOrder,
      explanation: question.explanation,
      answers: question.answers,
    })),
  };
}

function requireNonEmptyValue(value: string, message: string): string {
  const normalized = value.trim();

  if (!normalized) {
    throw new Error(message);
  }

  return normalized;
}

function normalizeNullableValue(value: string | null | undefined): string | null {
  const normalized = value?.trim() ?? "";

  return normalized || null;
}
```

- [ ] **Step 4: Add deep-copy tests**

Extend `global-library.test.ts` to assert `copyGlobalCourseToOrganization` passes a normalized `TenantCourseCopyData` to the repository containing:

- tenant `Course` title, slug, description, status `DRAFT`, type, duration fields, and `sourceGlobalCourseId` for normal copy.
- tenant category copied from source category when present.
- tenant tags copied from source tags.
- tenant modules copied with source-to-new module mapping keys.
- video lessons, chapters, transcript cues, SCORM metadata, and knowledge-check questions with answers.

Use this expected source fixture:

```ts
const sourceCourse: GlobalCourseCopySource = {
  id: "global_course_1",
  title: "Global Coaching Basics",
  slug: "global-coaching-basics",
  description: "Library course",
  status: "PUBLISHED",
  type: "NATIVE_VIDEO",
  estimatedCompletionBusinessDays: 3,
  expectedDurationMinutes: 30,
  category: { id: "global_cat_1", name: "Leadership", slug: "leadership" },
  tags: [{ id: "global_tag_1", name: "Coaching", slug: "coaching" }],
  modules: [{ id: "global_module_1", title: "Foundation", slug: "foundation", sortOrder: 0 }],
  videoLessons: [{
    id: "global_lesson_1",
    moduleId: "global_module_1",
    title: "Ask Better Questions",
    slug: "ask-better-questions",
    sortOrder: 0,
    durationSeconds: 180,
    required: true,
    providerAssetId: "mux_asset_1",
    playbackUrl: "https://video.learnhub.local/global/ask-better-questions.mp4",
    transcriptLanguage: "en",
    chapters: [{ title: "Open", startSecond: 0, endSecond: 60, sortOrder: 0 }],
    transcriptCues: [{ startSecond: 0, endSecond: 30, text: "Start with context." }],
  }],
  scormPackage: null,
  knowledgeCheckQuestions: [{
    id: "global_question_1",
    lessonId: "global_lesson_1",
    prompt: "Which question invites context?",
    questionType: "SINGLE_CHOICE",
    sortOrder: 0,
    explanation: "Open questions reveal blockers.",
    answers: [
      { text: "What happened?", correct: true, feedback: "Correct.", sortOrder: 0 },
      { text: "Why did you fail?", correct: false, feedback: "This closes conversation.", sortOrder: 1 },
    ],
  }],
};
```

- [ ] **Step 5: Verify and commit**

Run:

```powershell
npm run test -- src/modules/library/global-library.test.ts
git add src/modules/library/global-library.ts src/modules/library/global-library.test.ts
git commit -m "feat: add global library copy service"
```

Expected: tests pass and commit succeeds.

## Task 3: Add Prisma Repository

**Files:**
- Create: `src/modules/library/prisma-repository.test.ts`
- Create: `src/modules/library/prisma-repository.ts`

- [ ] **Step 1: Write repository tests**

Create `src/modules/library/prisma-repository.test.ts` proving:

- `findOrganization` selects `id` and `globalLibraryEnabled` by `id`.
- `findGlobalCourseForCopy` loads only one global course by id and includes category, tags, modules, video lessons, chapters, transcript cues, SCORM package, and knowledge-check answers.
- `findTenantCopy` filters by `organizationId` and `sourceGlobalCourseId`.
- `copyGlobalCourseToTenant` creates category and tag records with tenant `organizationId`.
- `copyGlobalCourseToTenant` creates a tenant `Course` before child rows.
- `copyGlobalCourseToTenant` creates `CourseModule`, `VideoLesson`, `VideoChapter`, `VideoTranscriptCue`, `ScormPackage`, `CourseKnowledgeCheckQuestion`, and `CourseKnowledgeCheckAnswer` with tenant `organizationId` where the model has that field.
- `runInTransaction` creates a transaction-scoped repository instance for nested calls.
- `recordAuditLog` persists metadata JSON containing `sourceGlobalCourseId` and `createdTenantCourseId`.
- tenant catalog reads query only `Course` by `organizationId`, so global source rows never appear in tenant catalog pages.

Use this executable test body:

```ts
import { describe, expect, it, vi } from "vitest";

import { createPrismaGlobalLibraryRepository } from "./prisma-repository";
import { RetryableTenantCourseSlugCollisionError, type TenantCourseCopyData } from "./global-library";

function createDelegate(methods: string[]) {
  return Object.fromEntries(methods.map((method) => [method, vi.fn()]));
}

function createPrismaMock() {
  return {
    $transaction: vi.fn(async (operation: (client: unknown) => Promise<unknown>) => operation(transactionPrismaMock)),
    organization: createDelegate(["findUnique"]),
    globalCourse: createDelegate(["findUnique", "findMany", "create", "update"]),
    globalCourseTagLink: createDelegate(["createMany", "deleteMany"]),
    courseCategory: createDelegate(["upsert"]),
    courseTag: createDelegate(["upsert"]),
    course: createDelegate(["findFirst", "findUnique", "findMany", "create"]),
    courseTagLink: createDelegate(["createMany"]),
    courseModule: createDelegate(["create"]),
    videoLesson: createDelegate(["create"]),
    videoChapter: createDelegate(["createMany"]),
    videoTranscriptCue: createDelegate(["createMany"]),
    scormPackage: createDelegate(["create"]),
    courseKnowledgeCheckQuestion: createDelegate(["create"]),
    courseKnowledgeCheckAnswer: createDelegate(["createMany"]),
    auditLog: createDelegate(["create"]),
  };
}

const transactionPrismaMock = createPrismaMock();

const copyData: TenantCourseCopyData = {
  organizationId: "org_1",
  sourceGlobalCourseId: "global_course_1",
  category: { name: "Leadership", slug: "leadership" },
  tags: [{ name: "Coaching", slug: "coaching" }],
  course: {
    title: "Global Coaching Basics",
    baseSlug: "global-coaching-basics",
    description: "Library course",
    type: "NATIVE_VIDEO",
    estimatedCompletionBusinessDays: 3,
    expectedDurationMinutes: 30,
    sourceGlobalCourseId: "global_course_1",
  },
  modules: [{ sourceGlobalModuleId: "global_module_1", title: "Foundation", slug: "foundation", sortOrder: 0 }],
  videoLessons: [{
    sourceGlobalLessonId: "global_lesson_1",
    sourceGlobalModuleId: "global_module_1",
    title: "Ask Better Questions",
    slug: "ask-better-questions",
    sortOrder: 0,
    durationSeconds: 180,
    required: true,
    providerAssetId: "mux_asset_1",
    playbackUrl: "https://video.learnhub.local/global/ask-better-questions.mp4",
    transcriptLanguage: "en",
    chapters: [{ title: "Open", startSecond: 0, endSecond: 60, sortOrder: 0 }],
    transcriptCues: [{ startSecond: 0, endSecond: 30, text: "Start with context." }],
  }],
  scormPackage: {
    originalFileName: "global-policy.zip",
    contentType: "application/zip",
    byteSize: 4096,
    storageKey: "global/scorm/global-policy.zip",
    contentRootKey: "global/scorm/content",
    launchPath: "index.html",
    manifestTitle: "Global Policy",
    active: true,
  },
  knowledgeCheckQuestions: [{
    sourceGlobalQuestionId: "global_question_1",
    sourceGlobalLessonId: "global_lesson_1",
    prompt: "Which question invites context?",
    questionType: "SINGLE_CHOICE",
    sortOrder: 0,
    explanation: "Open questions reveal blockers.",
    answers: [{ text: "What happened?", correct: true, feedback: "Correct.", sortOrder: 0 }],
  }],
};

describe("global library prisma repository", () => {
  it("uses tenant-safe query shapes for organization, global source, and existing copy lookup", async () => {
    const prisma = createPrismaMock();
    prisma.globalCourse.findUnique.mockResolvedValue({
      id: "global_course_1",
      title: "Global Coaching Basics",
      slug: "global-coaching-basics",
      description: "Library course",
      status: "PUBLISHED",
      type: "NATIVE_VIDEO",
      estimatedCompletionBusinessDays: 3,
      expectedDurationMinutes: 30,
      category: { id: "global_cat_1", name: "Leadership", slug: "leadership" },
      tagLinks: [{ tag: { id: "global_tag_1", name: "Coaching", slug: "coaching" } }],
      modules: [],
      videoLessons: [],
      scormPackage: null,
      knowledgeCheckQuestions: [],
    });
    const repository = createPrismaGlobalLibraryRepository(prisma as never);

    await repository.findOrganization({ organizationId: "org_1" });
    const source = await repository.findGlobalCourseForCopy({ globalCourseId: "global_course_1" });
    await repository.findTenantCopy({ organizationId: "org_1", globalCourseId: "global_course_1" });

    expect(prisma.organization.findUnique).toHaveBeenCalledWith({
      where: { id: "org_1" },
      select: { id: true, globalLibraryEnabled: true },
    });
    expect(prisma.globalCourse.findUnique).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "global_course_1" },
      include: expect.objectContaining({
        category: true,
        tagLinks: expect.objectContaining({ include: { tag: true } }),
        modules: { orderBy: { sortOrder: "asc" } },
        videoLessons: expect.objectContaining({
          include: expect.objectContaining({
            chapters: { orderBy: { sortOrder: "asc" } },
            transcriptCues: { orderBy: { startSecond: "asc" } },
          }),
        }),
        scormPackage: true,
        knowledgeCheckQuestions: expect.objectContaining({ include: { answers: { orderBy: { sortOrder: "asc" } } } }),
      }),
    }));
    expect(prisma.course.findFirst).toHaveBeenCalledWith({
      where: { organizationId: "org_1", sourceGlobalCourseId: "global_course_1" },
      select: { id: true, slug: true },
    });
    expect(source).toMatchObject({
      id: "global_course_1",
      tags: [{ id: "global_tag_1", name: "Coaching", slug: "coaching" }],
    });
    expect(source).not.toHaveProperty("tagLinks");
  });

  it("uses a transaction-scoped repository instance for nested writes", async () => {
    const prisma = createPrismaMock();
    transactionPrismaMock.globalCourse.update.mockResolvedValue({});
    const repository = createPrismaGlobalLibraryRepository(prisma as never);

    await repository.runInTransaction(async (transactionRepository) => {
      await transactionRepository.updateGlobalCourseLifecycle({ globalCourseId: "global_course_1", status: "PUBLISHED" });
    });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(transactionPrismaMock.globalCourse.update).toHaveBeenCalledWith({
      where: { id: "global_course_1" },
      data: { status: "PUBLISHED" },
    });
    expect(prisma.globalCourse.update).not.toHaveBeenCalled();
  });

  it("keeps tenant catalog reads isolated from global source rows", async () => {
    const prisma = createPrismaMock();
    prisma.course.findMany = vi.fn();
    const repository = createPrismaGlobalLibraryRepository(prisma as never);

    await repository.findTenantCatalogCourses({ organizationId: "org_1" });

    expect(prisma.course.findMany).toHaveBeenCalledWith({
      where: { organizationId: "org_1" },
      orderBy: { title: "asc" },
      select: { id: true, title: true, slug: true, sourceGlobalCourseId: true },
    });
    expect(prisma.globalCourse.findMany).not.toHaveBeenCalled();
  });

  it("copies tenant-owned catalog, media, SCORM, knowledge-check, and audit records", async () => {
    const prisma = createPrismaMock();
    prisma.courseCategory.upsert.mockResolvedValue({ id: "tenant_cat_1" });
    prisma.courseTag.upsert.mockResolvedValue({ id: "tenant_tag_1" });
    prisma.course.findUnique
      .mockResolvedValueOnce({ id: "existing_course_1" })
      .mockResolvedValueOnce(null);
    prisma.course.create.mockResolvedValue({ id: "tenant_course_1", slug: "global-coaching-basics-2" });
    prisma.courseModule.create.mockResolvedValue({ id: "tenant_module_1" });
    prisma.videoLesson.create.mockResolvedValue({ id: "tenant_lesson_1" });
    prisma.courseKnowledgeCheckQuestion.create.mockResolvedValue({ id: "tenant_question_1" });
    const repository = createPrismaGlobalLibraryRepository(prisma as never);

    await expect(repository.copyGlobalCourseToTenant(copyData)).resolves.toEqual({
      courseId: "tenant_course_1",
      slug: "global-coaching-basics-2",
    });

    expect(prisma.courseCategory.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { organizationId_slug: { organizationId: "org_1", slug: "leadership" } },
      create: { organizationId: "org_1", name: "Leadership", slug: "leadership" },
    }));
    expect(prisma.course.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        organizationId: "org_1",
        title: "Global Coaching Basics",
        slug: "global-coaching-basics-2",
        status: "DRAFT",
        categoryId: "tenant_cat_1",
        sourceGlobalCourseId: "global_course_1",
      }),
    }));
    expect(prisma.course.findUnique).toHaveBeenNthCalledWith(1, {
      where: { organizationId_slug: { organizationId: "org_1", slug: "global-coaching-basics" } },
      select: { id: true },
    });
    expect(prisma.course.findUnique).toHaveBeenNthCalledWith(2, {
      where: { organizationId_slug: { organizationId: "org_1", slug: "global-coaching-basics-2" } },
      select: { id: true },
    });
    expect(prisma.courseTagLink.createMany).toHaveBeenCalledWith({
      data: [{ organizationId: "org_1", courseId: "tenant_course_1", tagId: "tenant_tag_1" }],
    });
    expect(prisma.courseModule.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ organizationId: "org_1", courseId: "tenant_course_1" }),
    }));
    expect(prisma.videoLesson.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ organizationId: "org_1", courseId: "tenant_course_1", moduleId: "tenant_module_1" }),
    }));
    expect(prisma.videoChapter.createMany).toHaveBeenCalledWith({
      data: [{ organizationId: "org_1", lessonId: "tenant_lesson_1", title: "Open", startSecond: 0, endSecond: 60, sortOrder: 0 }],
    });
    expect(prisma.videoTranscriptCue.createMany).toHaveBeenCalledWith({
      data: [{ organizationId: "org_1", lessonId: "tenant_lesson_1", startSecond: 0, endSecond: 30, text: "Start with context." }],
    });
    expect(prisma.scormPackage.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ organizationId: "org_1", courseId: "tenant_course_1" }),
    }));
    expect(prisma.courseKnowledgeCheckQuestion.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        organizationId: "org_1",
        courseId: "tenant_course_1",
        lessonId: "tenant_lesson_1",
        sourceGlobalQuestionId: "global_question_1",
      }),
    }));
    expect(prisma.courseKnowledgeCheckAnswer.createMany).toHaveBeenCalledWith({
      data: [{ questionId: "tenant_question_1", text: "What happened?", correct: true, feedback: "Correct.", sortOrder: 0 }],
    });
  });

  it("maps source lineage unique violations to already copied", async () => {
    const prisma = createPrismaMock();
    prisma.course.findUnique.mockResolvedValue(null);
    prisma.course.create.mockRejectedValue({
      code: "P2002",
      meta: { target: ["organizationId", "sourceGlobalCourseId"] },
    });
    const repository = createPrismaGlobalLibraryRepository(prisma as never);

    await expect(repository.copyGlobalCourseToTenant(copyData))
      .rejects.toThrow("Global course is already copied into this organization");

    expect(prisma.course.create).toHaveBeenCalledTimes(1);
  });

  it("surfaces retryable slug collisions without issuing a second course.create", async () => {
    const prisma = createPrismaMock();
    prisma.course.findUnique.mockResolvedValue(null);
    prisma.course.create.mockRejectedValue({
      code: "P2002",
      meta: { target: ["organizationId", "slug"] },
    });
    const repository = createPrismaGlobalLibraryRepository(prisma as never);

    await expect(repository.copyGlobalCourseToTenant(copyData))
      .rejects.toBeInstanceOf(RetryableTenantCourseSlugCollisionError);

    expect(prisma.course.create).toHaveBeenCalledTimes(1);
    expect(prisma.course.findUnique).toHaveBeenCalledTimes(1);
  });

  it("writes audit metadata as JSON-compatible data", async () => {
    const prisma = createPrismaMock();
    const repository = createPrismaGlobalLibraryRepository(prisma as never);

    await repository.recordAuditLog({
      organizationId: "org_1",
      actorId: "admin_1",
      action: "global_course.copied_to_tenant",
      targetType: "course",
      targetId: "tenant_course_1",
      metadata: {
        sourceGlobalCourseId: "global_course_1",
        createdTenantCourseId: "tenant_course_1",
      },
    });

    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: {
        organizationId: "org_1",
        actorId: "admin_1",
        action: "global_course.copied_to_tenant",
        targetType: "course",
        targetId: "tenant_course_1",
        metadata: {
          sourceGlobalCourseId: "global_course_1",
          createdTenantCourseId: "tenant_course_1",
        },
      },
    });
  });
});
```

Run:

```powershell
npm run test -- src/modules/library/prisma-repository.test.ts
```

Expected: fail because repository file does not exist.

- [ ] **Step 2: Implement repository factory**

Create `src/modules/library/prisma-repository.ts`:

```ts
import type { PrismaClient } from "@prisma/client";
import {
  RetryableTenantCourseSlugCollisionError,
  type GlobalLibraryRepository,
  type TenantCourseCopyData,
} from "./global-library";

type PrismaLibraryClient = Pick<
  PrismaClient,
  | "$transaction"
  | "organization"
  | "globalCourse"
  | "globalCourseTag"
  | "courseCategory"
  | "courseTag"
  | "course"
  | "courseTagLink"
  | "courseModule"
  | "videoLesson"
  | "videoChapter"
  | "videoTranscriptCue"
  | "scormPackage"
  | "courseKnowledgeCheckQuestion"
  | "courseKnowledgeCheckAnswer"
  | "auditLog"
>;

export function createPrismaGlobalLibraryRepository(client: PrismaLibraryClient): GlobalLibraryRepository {
  return createRepositoryForClient(client, client);
}

function createRepositoryForClient(
  rootClient: PrismaLibraryClient,
  activeClient: PrismaLibraryClient,
): GlobalLibraryRepository {
  return {
    async runInTransaction(operation) {
      return rootClient.$transaction(async (transaction) =>
        operation(createRepositoryForClient(rootClient, transaction as PrismaLibraryClient)),
      );
    },
    findOrganization(input) {
      return activeClient.organization.findUnique({
        where: { id: input.organizationId },
        select: { id: true, globalLibraryEnabled: true },
      });
    },
    async findGlobalCourseForCopy(input) {
      const result = await activeClient.globalCourse.findUnique({
        where: { id: input.globalCourseId },
        include: {
          category: true,
          tagLinks: { include: { tag: true }, orderBy: { tag: { name: "asc" } } },
          modules: { orderBy: { sortOrder: "asc" } },
          videoLessons: {
            include: {
              chapters: { orderBy: { sortOrder: "asc" } },
              transcriptCues: { orderBy: { startSecond: "asc" } },
            },
            orderBy: { sortOrder: "asc" },
          },
          scormPackage: true,
          knowledgeCheckQuestions: {
            include: { answers: { orderBy: { sortOrder: "asc" } } },
            orderBy: { sortOrder: "asc" },
          },
        },
      });

      if (!result) {
        return null;
      }

      return {
        id: result.id,
        title: result.title,
        slug: result.slug,
        description: result.description,
        status: result.status,
        type: result.type,
        estimatedCompletionBusinessDays: result.estimatedCompletionBusinessDays,
        expectedDurationMinutes: result.expectedDurationMinutes,
        category: result.category,
        tags: result.tagLinks.map((link) => link.tag),
        modules: result.modules,
        videoLessons: result.videoLessons,
        scormPackage: result.scormPackage,
        knowledgeCheckQuestions: result.knowledgeCheckQuestions,
      };
    },
    findTenantCopy(input) {
      return activeClient.course.findFirst({
        where: {
          organizationId: input.organizationId,
          sourceGlobalCourseId: input.globalCourseId,
        },
        select: { id: true, slug: true },
      });
    },
    findTenantCatalogCourses(input) {
      return activeClient.course.findMany({
        where: { organizationId: input.organizationId },
        orderBy: { title: "asc" },
        select: { id: true, title: true, slug: true, sourceGlobalCourseId: true },
      });
    },
    async createGlobalCourse(input) {
      const course = await activeClient.globalCourse.create({
        data: input.course,
        select: { id: true, slug: true },
      });
      await activeClient.globalCourseTagLink.createMany({
        data: input.tagIds.map((tagId) => ({ globalCourseId: course.id, tagId })),
      });
      return course;
    },
    async replaceGlobalCourseTags(input) {
      await activeClient.globalCourseTagLink.deleteMany({ where: { globalCourseId: input.globalCourseId } });
      await activeClient.globalCourseTagLink.createMany({
        data: input.tagIds.map((tagId) => ({ globalCourseId: input.globalCourseId, tagId })),
      });
    },
    async updateGlobalCourseLifecycle(input) {
      await activeClient.globalCourse.update({
        where: { id: input.globalCourseId },
        data: { status: input.status },
      });
    },
    async copyGlobalCourseToTenant(data) {
      const finalSlug = await allocateTenantCourseSlug(activeClient, {
        organizationId: data.organizationId,
        baseSlug: data.course.baseSlug,
      });
      const category = data.category
        ? await activeClient.courseCategory.upsert({
            where: {
              organizationId_slug: {
                organizationId: data.organizationId,
                slug: data.category.slug,
              },
            },
            update: { name: data.category.name },
            create: {
              organizationId: data.organizationId,
              name: data.category.name,
              slug: data.category.slug,
            },
            select: { id: true },
          })
        : null;
      const tags = [];
      for (const tag of data.tags) {
        tags.push(await activeClient.courseTag.upsert({
          where: {
            organizationId_slug: {
              organizationId: data.organizationId,
              slug: tag.slug,
            },
          },
          update: { name: tag.name },
          create: {
            organizationId: data.organizationId,
            name: tag.name,
            slug: tag.slug,
          },
          select: { id: true },
        }));
      }
      const course = await createTenantCourseOnce(activeClient, data, category?.id ?? null, finalSlug);
      await activeClient.courseTagLink.createMany({
        data: tags.map((tag) => ({
          organizationId: data.organizationId,
          courseId: course.id,
          tagId: tag.id,
        })),
      });
      const moduleIdBySourceId = new Map<string, string>();
      for (const module of data.modules) {
        const createdModule = await activeClient.courseModule.create({
          data: {
            organizationId: data.organizationId,
            courseId: course.id,
            title: module.title,
            slug: module.slug,
            sortOrder: module.sortOrder,
          },
          select: { id: true },
        });
        moduleIdBySourceId.set(module.sourceGlobalModuleId, createdModule.id);
      }
      const lessonIdBySourceId = new Map<string, string>();
      for (const lesson of data.videoLessons) {
        const createdLesson = await activeClient.videoLesson.create({
          data: {
            organizationId: data.organizationId,
            courseId: course.id,
            moduleId: lesson.sourceGlobalModuleId ? moduleIdBySourceId.get(lesson.sourceGlobalModuleId) ?? null : null,
            title: lesson.title,
            slug: lesson.slug,
            sortOrder: lesson.sortOrder,
            durationSeconds: lesson.durationSeconds,
            required: lesson.required,
            providerAssetId: lesson.providerAssetId,
            playbackUrl: lesson.playbackUrl,
            transcriptLanguage: lesson.transcriptLanguage,
          },
          select: { id: true },
        });
        lessonIdBySourceId.set(lesson.sourceGlobalLessonId, createdLesson.id);
        await activeClient.videoChapter.createMany({
          data: lesson.chapters.map((chapter) => ({
            organizationId: data.organizationId,
            lessonId: createdLesson.id,
            title: chapter.title,
            startSecond: chapter.startSecond,
            endSecond: chapter.endSecond,
            sortOrder: chapter.sortOrder,
          })),
        });
        await activeClient.videoTranscriptCue.createMany({
          data: lesson.transcriptCues.map((cue) => ({
            organizationId: data.organizationId,
            lessonId: createdLesson.id,
            startSecond: cue.startSecond,
            endSecond: cue.endSecond,
            text: cue.text,
          })),
        });
      }
      if (data.scormPackage) {
        await activeClient.scormPackage.create({
          data: {
            organizationId: data.organizationId,
            courseId: course.id,
            originalFileName: data.scormPackage.originalFileName,
            contentType: data.scormPackage.contentType,
            byteSize: data.scormPackage.byteSize,
            storageKey: data.scormPackage.storageKey,
            contentRootKey: data.scormPackage.contentRootKey,
            launchPath: data.scormPackage.launchPath,
            manifestTitle: data.scormPackage.manifestTitle,
            active: data.scormPackage.active,
          },
        });
      }
      for (const question of data.knowledgeCheckQuestions) {
        const createdQuestion = await activeClient.courseKnowledgeCheckQuestion.create({
          data: {
            organizationId: data.organizationId,
            courseId: course.id,
            lessonId: question.sourceGlobalLessonId ? lessonIdBySourceId.get(question.sourceGlobalLessonId) ?? null : null,
            sourceGlobalQuestionId: question.sourceGlobalQuestionId,
            prompt: question.prompt,
            questionType: question.questionType,
            sortOrder: question.sortOrder,
            explanation: question.explanation,
          },
          select: { id: true },
        });
        await activeClient.courseKnowledgeCheckAnswer.createMany({
          data: question.answers.map((answer) => ({
            questionId: createdQuestion.id,
            text: answer.text,
            correct: answer.correct,
            feedback: answer.feedback,
            sortOrder: answer.sortOrder,
          })),
        });
      }
      return { courseId: course.id, slug: course.slug };
    },
    async recordAuditLog(input) {
      await activeClient.auditLog.create({
        data: {
          organizationId: input.organizationId,
          actorId: input.actorId,
          action: input.action,
          targetType: input.targetType,
          targetId: input.targetId,
          metadata: input.metadata,
        },
      });
    },
  };
}

async function createTenantCourseOnce(
  client: PrismaLibraryClient,
  data: TenantCourseCopyData,
  categoryId: string | null,
  finalSlug: string,
): Promise<{ id: string; slug: string }> {
  try {
    return await client.course.create({
      data: {
        organizationId: data.organizationId,
        title: data.course.title,
        slug: finalSlug,
        description: data.course.description,
        status: "DRAFT",
        type: data.course.type,
        estimatedCompletionBusinessDays: data.course.estimatedCompletionBusinessDays,
        expectedDurationMinutes: data.course.expectedDurationMinutes,
        categoryId,
        sourceGlobalCourseId: data.course.sourceGlobalCourseId,
      },
      select: { id: true, slug: true },
    });
  } catch (error) {
    throw mapCourseCreateError(error);
  }
}

function mapCourseCreateError(error: unknown): Error {
  if (!isPrismaUniqueViolation(error)) {
    return error instanceof Error ? error : new Error("Failed to create tenant course");
  }

  const targets = readPrismaUniqueTargets(error);

  if (targets.includes("organizationId") && targets.includes("sourceGlobalCourseId")) {
    return new Error("Global course is already copied into this organization");
  }

  if (targets.includes("organizationId") && targets.includes("slug")) {
    return new RetryableTenantCourseSlugCollisionError();
  }

  return error instanceof Error ? error : new Error("Tenant course unique constraint failed");
}

function isPrismaUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}

function readPrismaUniqueTargets(error: unknown): string[] {
  if (typeof error !== "object" || error === null || !("meta" in error)) {
    return [];
  }

  const meta = error.meta;

  if (typeof meta !== "object" || meta === null || !("target" in meta)) {
    return [];
  }

  return Array.isArray(meta.target) ? meta.target.filter((target): target is string => typeof target === "string") : [];
}

async function allocateTenantCourseSlug(
  client: PrismaLibraryClient,
  input: { organizationId: string; baseSlug: string },
): Promise<string> {
  for (let suffix = 0; suffix <= 1000; suffix += 1) {
    const slug = suffix === 0 ? input.baseSlug : `${input.baseSlug}-${suffix + 1}`;
    const existingCourse = await client.course.findUnique({
      where: {
        organizationId_slug: {
          organizationId: input.organizationId,
          slug,
        },
      },
      select: { id: true },
    });

    if (!existingCourse) {
      return slug;
    }
  }

  throw new Error("Could not allocate a unique tenant course slug");
}
```

Repository instances are request-scoped. Do not store a mutable transaction client in closure state; every nested write inside `runInTransaction` must use the `transactionRepository` argument provided to the callback.

Implement `copyGlobalCourseToTenant(data: TenantCourseCopyData)` with these ordering rules inside the transaction-scoped repository. Allocate the final slug inside the transaction and attempt tenant `course.create` once. If that create fails with Prisma P2002 for `[organizationId, slug]`, surface `RetryableTenantCourseSlugCollisionError` so the service can re-enter the whole repository transaction. If it fails with P2002 for `[organizationId, sourceGlobalCourseId]`, throw `Global course is already copied into this organization`.

1. Upsert tenant category by `[organizationId, slug]` when source category exists.
2. Upsert each tenant tag by `[organizationId, slug]`.
3. Allocate the tenant course slug by checking `[organizationId, slug]` with the transaction client.
4. Create tenant course with `status: "DRAFT"` and the allocated slug.
5. Create tenant tag links.
6. Create modules and keep `Map<globalModuleId, tenantModuleId>`.
7. Create video lessons and keep `Map<globalLessonId, tenantLessonId>`.
8. Create chapters and transcript cues for each tenant lesson.
9. Create SCORM package when source exists, using tenant `organizationId` and tenant `courseId`.
10. Create knowledge-check questions and answers, resolving tenant lesson ids from the lesson map.

- [ ] **Step 3: Verify and commit**

Run:

```powershell
npm run test -- src/modules/library/prisma-repository.test.ts
git add src/modules/library/prisma-repository.ts src/modules/library/prisma-repository.test.ts
git commit -m "feat: add global library prisma repository"
```

Expected: tests pass and commit succeeds.

## Task 4: Add Server Action Factories

**Files:**
- Create: `src/modules/library/server-actions.test.ts`
- Create: `src/modules/library/server-actions.ts`

- [ ] **Step 1: Write action tests**

Create `src/modules/library/server-actions.test.ts` proving:

- platform create action parses `title`, `slug`, `description`, `type`, `categoryId`, `tagIds`, `estimatedCompletionBusinessDays`, and `expectedDurationMinutes`.
- platform lifecycle action parses `globalCourseId` and `status`.
- tenant copy action parses `globalCourseId` and `duplicateAction`.
- missing duplicate action defaults to `"block"`.
- domain errors return `{ status: "error", message }`.
- successes return `{ status: "success", message }`.

Use this executable test body:

```ts
import { describe, expect, it } from "vitest";

import { createPlatformLibraryActions, createTenantLibraryActions } from "./server-actions";
import type { GlobalLibraryRepository } from "./global-library";

function createRepository(): GlobalLibraryRepository & {
  createdGlobalCourseInput?: Parameters<GlobalLibraryRepository["createGlobalCourse"]>[0];
  updatedLifecycleInput?: Parameters<GlobalLibraryRepository["updateGlobalCourseLifecycle"]>[0];
  copiedInput?: Parameters<GlobalLibraryRepository["copyGlobalCourseToTenant"]>[0];
  throwOnCreate?: Error;
} {
  return {
    async runInTransaction(operation) {
      return operation(this);
    },
    async findOrganization() {
      return { id: "org_1", globalLibraryEnabled: true };
    },
    async findGlobalCourseForCopy() {
      return {
        id: "global_course_1",
        title: "Global Coaching Basics",
        slug: "global-coaching-basics",
        description: "Library course",
        status: "PUBLISHED",
        type: "NATIVE_VIDEO",
        estimatedCompletionBusinessDays: 3,
        expectedDurationMinutes: 30,
        category: null,
        tags: [],
        modules: [],
        videoLessons: [],
        scormPackage: null,
        knowledgeCheckQuestions: [],
      };
    },
    async findTenantCopy() {
      return null;
    },
    async findTenantCatalogCourses() {
      return [];
    },
    async createGlobalCourse(input) {
      if (this.throwOnCreate) {
        throw this.throwOnCreate;
      }
      this.createdGlobalCourseInput = input;
      return { id: "global_created_1", slug: input.course.slug };
    },
    async replaceGlobalCourseTags() {},
    async updateGlobalCourseLifecycle(input) {
      this.updatedLifecycleInput = input;
    },
    async copyGlobalCourseToTenant(input) {
      this.copiedInput = input;
      return { courseId: "tenant_course_1", slug: input.course.sourceGlobalCourseId ? input.course.baseSlug : `${input.course.baseSlug}-1` };
    },
    async recordAuditLog() {},
  };
}

describe("global library server actions", () => {
  it("parses platform create course form fields and returns success", async () => {
    const repository = createRepository();
    const actions = createPlatformLibraryActions({
      getActor: async () => ({ actorId: "owner_1" }),
      repository,
    });
    const formData = new FormData();
    formData.set("title", "Global Coaching Basics");
    formData.set("slug", "global-coaching-basics");
    formData.set("description", "Library source");
    formData.set("type", "SCORM_1_2");
    formData.set("categoryId", "global_cat_1");
    formData.append("tagIds", "global_tag_1");
    formData.append("tagIds", "global_tag_2");
    formData.set("estimatedCompletionBusinessDays", "4");
    formData.set("expectedDurationMinutes", "45");

    await expect(actions.createCourse(formData)).resolves.toEqual({
      status: "success",
      message: "Global course created.",
    });
    expect(repository.createdGlobalCourseInput).toEqual({
      course: {
        title: "Global Coaching Basics",
        slug: "global-coaching-basics",
        description: "Library source",
        status: "DRAFT",
        type: "SCORM_1_2",
        categoryId: "global_cat_1",
        estimatedCompletionBusinessDays: 4,
        expectedDurationMinutes: 45,
        createdByUserId: "owner_1",
      },
      tagIds: ["global_tag_1", "global_tag_2"],
    });
  });

  it("parses platform lifecycle form fields", async () => {
    const repository = createRepository();
    const actions = createPlatformLibraryActions({
      getActor: async () => ({ actorId: "owner_1" }),
      repository,
    });
    const formData = new FormData();
    formData.set("globalCourseId", "global_course_1");
    formData.set("status", "PUBLISHED");

    await expect(actions.updateLifecycle(formData)).resolves.toEqual({
      status: "success",
      message: "Global course lifecycle updated.",
    });
    expect(repository.updatedLifecycleInput).toEqual({ globalCourseId: "global_course_1", status: "PUBLISHED" });
  });

  it("defaults tenant copy duplicate action to block", async () => {
    const repository = createRepository();
    const actions = createTenantLibraryActions({
      getActorAndOrganization: async () => ({ actorId: "admin_1", organizationId: "org_1" }),
      repository,
    });
    const formData = new FormData();
    formData.set("globalCourseId", "global_course_1");

    await expect(actions.copyCourse("acme", formData)).resolves.toEqual({
      status: "success",
      message: "Global course copied into tenant catalog.",
    });
    expect(repository.copiedInput?.course.sourceGlobalCourseId).toBe("global_course_1");
  });

  it("parses explicit duplicate action", async () => {
    const repository = createRepository();
    const actions = createTenantLibraryActions({
      getActorAndOrganization: async () => ({ actorId: "admin_1", organizationId: "org_1" }),
      repository,
    });
    const formData = new FormData();
    formData.set("globalCourseId", "global_course_1");
    formData.set("duplicateAction", "duplicate");

    await actions.copyCourse("acme", formData);

    expect(repository.copiedInput?.course.sourceGlobalCourseId).toBeNull();
    expect(repository.copiedInput?.course.baseSlug).toBe("global-coaching-basics-copy");
  });

  it("maps domain errors into error results", async () => {
    const repository = createRepository();
    repository.throwOnCreate = new Error("Course title is required");
    const actions = createPlatformLibraryActions({
      getActor: async () => ({ actorId: "owner_1" }),
      repository,
    });

    await expect(actions.createCourse(new FormData())).resolves.toEqual({
      status: "error",
      message: "Course title is required",
    });
  });
});
```

Run:

```powershell
npm run test -- src/modules/library/server-actions.test.ts
```

Expected: fail because `server-actions.ts` does not exist.

- [ ] **Step 2: Implement action factories**

Create `src/modules/library/server-actions.ts`:

```ts
import type { CourseStatus, CourseType } from "@prisma/client";
import {
  copyGlobalCourseToOrganization,
  createGlobalCourse,
  updateGlobalCourseLifecycle,
  type DuplicateGlobalCourseAction,
  type GlobalLibraryRepository,
} from "./global-library";

export type LibraryActionResult = { status: "success" | "error"; message: string };

export type PlatformLibraryActionDependencies = {
  getActor(): Promise<{ actorId: string }>;
  repository: GlobalLibraryRepository;
};

export type TenantLibraryActionDependencies = {
  getActorAndOrganization(slug: string): Promise<{ actorId: string; organizationId: string }>;
  repository: GlobalLibraryRepository;
};

export function createPlatformLibraryActions(dependencies: PlatformLibraryActionDependencies) {
  return {
    createCourse(formData: FormData): Promise<LibraryActionResult> {
      return runLibraryAction(async () => {
        const { actorId } = await dependencies.getActor();
        await createGlobalCourse({
          actorId,
          title: readFormString(formData, "title"),
          slug: readFormString(formData, "slug"),
          description: readFormString(formData, "description"),
          type: readCourseType(formData),
          categoryId: readOptionalFormString(formData, "categoryId"),
          tagIds: readFormStringList(formData, "tagIds"),
          estimatedCompletionBusinessDays: readInteger(formData, "estimatedCompletionBusinessDays"),
          expectedDurationMinutes: readInteger(formData, "expectedDurationMinutes"),
        }, dependencies.repository);
        return "Global course created.";
      });
    },
    updateLifecycle(formData: FormData): Promise<LibraryActionResult> {
      return runLibraryAction(async () => {
        const { actorId } = await dependencies.getActor();
        await updateGlobalCourseLifecycle({
          actorId,
          globalCourseId: readFormString(formData, "globalCourseId"),
          status: readCourseStatus(formData),
        }, dependencies.repository);
        return "Global course lifecycle updated.";
      });
    },
  };
}

export function createTenantLibraryActions(dependencies: TenantLibraryActionDependencies) {
  return {
    copyCourse(slug: string, formData: FormData): Promise<LibraryActionResult> {
      return runLibraryAction(async () => {
        const context = await dependencies.getActorAndOrganization(slug);
        await copyGlobalCourseToOrganization({
          actorId: context.actorId,
          organizationId: context.organizationId,
          globalCourseId: readFormString(formData, "globalCourseId"),
          duplicateAction: readDuplicateAction(formData),
        }, dependencies.repository);
        return "Global course copied into tenant catalog.";
      });
    },
  };
}
```

Add local helper functions `runLibraryAction`, `readFormString`, `readOptionalFormString`, `readFormStringList`, `readInteger`, `readCourseType`, `readCourseStatus`, and `readDuplicateAction`. `readDuplicateAction` returns `"duplicate"` only when the form value is exactly `"duplicate"`; otherwise it returns `"block"`.

Append these helper implementations in `src/modules/library/server-actions.ts`:

```ts
async function runLibraryAction(operation: () => Promise<string>): Promise<LibraryActionResult> {
  try {
    return { status: "success", message: await operation() };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "Global library action failed" };
  }
}

function readFormString(formData: FormData, key: string): string {
  const value = formData.get(key);

  return typeof value === "string" ? value : "";
}

function readOptionalFormString(formData: FormData, key: string): string | null {
  const value = readFormString(formData, key).trim();

  return value || null;
}

function readFormStringList(formData: FormData, key: string): string[] {
  return formData
    .getAll(key)
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter(Boolean);
}

function readInteger(formData: FormData, key: string): number {
  return Number(readFormString(formData, key));
}

function readCourseType(formData: FormData): CourseType {
  return readFormString(formData, "type") === "SCORM_1_2" ? "SCORM_1_2" : "NATIVE_VIDEO";
}

function readCourseStatus(formData: FormData): CourseStatus {
  const status = readFormString(formData, "status");

  if (status === "PUBLISHED" || status === "DEPRECATED" || status === "RETIRED") {
    return status;
  }

  return "DRAFT";
}

function readDuplicateAction(formData: FormData): DuplicateGlobalCourseAction {
  return readFormString(formData, "duplicateAction") === "duplicate" ? "duplicate" : "block";
}
```

- [ ] **Step 3: Verify and commit**

Run:

```powershell
npm run test -- src/modules/library/server-actions.test.ts
git add src/modules/library/server-actions.ts src/modules/library/server-actions.test.ts
git commit -m "feat: add global library server actions"
```

Expected: tests pass and commit succeeds.

## Task 5: Wire Platform Library Pages

**Files:**
- Create: `src/app/platform/library/page.tsx`
- Create: `src/app/platform/library/actions.ts`
- Create: `src/app/platform/library/[courseSlug]/page.tsx`
- Modify: `src/modules/catalog/page-shells.test.ts`

- [ ] **Step 1: Add page tests**

Extend `src/modules/catalog/page-shells.test.ts` to assert:

- `/platform/library` renders only after platform-owner guard resolution in the component.
- platform library page lists global courses with title, type, lifecycle, and copied tenant count.
- create form includes `title`, `slug`, `description`, `type`, `estimatedCompletionBusinessDays`, and `expectedDurationMinutes`.
- `/platform/library/[courseSlug]` renders lifecycle buttons for `DRAFT`, `PUBLISHED`, `DEPRECATED`, and `RETIRED`.

Add these tests to `src/modules/catalog/page-shells.test.ts`:

```ts
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/guards", () => ({
  requirePlatformOwner: vi.fn(async () => ({ userId: "owner_1", isPlatformOwner: true, memberships: [] })),
  requireOrganizationUsersAdminBySlug: vi.fn(async () => ({ context: { userId: "admin_1", isPlatformOwner: false, memberships: [] }, organizationId: "org_1" })),
}));

const prismaMock = {
  globalCourse: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
  },
  organization: {
    findUnique: vi.fn(),
  },
  course: {
    findMany: vi.fn(),
  },
};

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("next/navigation", () => ({ notFound: vi.fn(() => { throw new Error("NEXT_NOT_FOUND"); }) }));

describe("global library page shells", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders platform library list with create form fields and tenant copy count", async () => {
    const { default: PlatformLibraryPage } = await import("@/app/platform/library/page");
    prismaMock.globalCourse.findMany.mockResolvedValue([
      {
        id: "global_course_1",
        title: "Global Coaching Basics",
        slug: "global-coaching-basics",
        type: "NATIVE_VIDEO",
        status: "PUBLISHED",
        expectedDurationMinutes: 30,
        estimatedCompletionBusinessDays: 3,
        _count: { tenantCopies: 2 },
      },
    ]);

    const html = renderToStaticMarkup(await PlatformLibraryPage());

    expect(html).toContain("Global course library");
    expect(html).toContain("Global Coaching Basics");
    expect(html).toContain("2 tenant copies");
    expect(html).toContain('name="title"');
    expect(html).toContain('name="slug"');
    expect(html).toContain('name="description"');
    expect(html).toContain('name="type"');
    expect(html).toContain('name="estimatedCompletionBusinessDays"');
    expect(html).toContain('name="expectedDurationMinutes"');
  });

  it("renders platform global course detail lifecycle actions", async () => {
    const { default: PlatformGlobalCoursePage } = await import("@/app/platform/library/[courseSlug]/page");
    prismaMock.globalCourse.findUnique.mockResolvedValue({
      id: "global_course_1",
      title: "Global Coaching Basics",
      slug: "global-coaching-basics",
      description: "Library source",
      type: "NATIVE_VIDEO",
      status: "PUBLISHED",
      expectedDurationMinutes: 30,
      estimatedCompletionBusinessDays: 3,
      category: { name: "Leadership" },
      tagLinks: [{ tag: { name: "Coaching" } }],
      modules: [{ id: "module_1", title: "Foundation" }],
      videoLessons: [{ id: "lesson_1", title: "Ask Better Questions" }],
      scormPackage: null,
      _count: { knowledgeCheckQuestions: 1, tenantCopies: 2 },
    });

    const html = renderToStaticMarkup(await PlatformGlobalCoursePage({
      params: Promise.resolve({ courseSlug: "global-coaching-basics" }),
    }));

    expect(html).toContain("Global Coaching Basics");
    expect(html).toContain('name="globalCourseId"');
    expect(html).toContain('value="DRAFT"');
    expect(html).toContain('value="PUBLISHED"');
    expect(html).toContain('value="DEPRECATED"');
    expect(html).toContain('value="RETIRED"');
  });
});
```

Run:

```powershell
npm run test -- src/modules/catalog/page-shells.test.ts
```

Expected: fail because platform library pages do not exist.

- [ ] **Step 2: Implement platform action bridge**

Create `src/app/platform/library/actions.ts`:

```ts
"use server";

import { requirePlatformOwner } from "@/lib/auth/guards";
import { createPrismaGlobalLibraryRepository } from "@/modules/library/prisma-repository";
import { createPlatformLibraryActions } from "@/modules/library/server-actions";

async function getActor() {
  const context = await requirePlatformOwner();
  return { actorId: context.userId };
}

async function createActions() {
  const { prisma } = await import("@/lib/prisma");
  return createPlatformLibraryActions({
    getActor,
    repository: createPrismaGlobalLibraryRepository(prisma),
  });
}

export async function createGlobalCourseFormAction(formData: FormData) {
  return (await createActions()).createCourse(formData);
}

export async function updateGlobalCourseLifecycleFormAction(formData: FormData) {
  return (await createActions()).updateLifecycle(formData);
}
```

- [ ] **Step 3: Implement platform library list page**

Create `src/app/platform/library/page.tsx` as a server component that:

- calls `requirePlatformOwner()`.
- queries `prisma.globalCourse.findMany` ordered by title.
- includes `_count: { select: { tenantCopies: true } }`.
- renders lifecycle badges and a create global course form wired to `createGlobalCourseFormAction`.
- links each course title to `/platform/library/${course.slug}`.

Use this TSX body:

```tsx
import Link from "next/link";

import { requirePlatformOwner } from "@/lib/auth/guards";

import { createGlobalCourseFormAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function PlatformLibraryPage() {
  await requirePlatformOwner();
  const { prisma } = await import("@/lib/prisma");
  const courses = await prisma.globalCourse.findMany({
    orderBy: { title: "asc" },
    select: {
      id: true,
      title: true,
      slug: true,
      type: true,
      status: true,
      expectedDurationMinutes: true,
      estimatedCompletionBusinessDays: true,
      _count: { select: { tenantCopies: true } },
    },
  });

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-6 px-6 py-10">
      <header>
        <p className="text-sm font-medium uppercase tracking-wide text-slate-500">Platform Owner</p>
        <h1 className="text-3xl font-semibold text-slate-950">Global course library</h1>
      </header>
      <section className="rounded-md border border-slate-200 p-4">
        <h2 className="text-lg font-semibold text-slate-950">Create global course</h2>
        <form action={createGlobalCourseFormAction} className="mt-4 grid gap-3 md:grid-cols-2">
          <input name="title" aria-label="Title" className="rounded-md border border-slate-300 px-3 py-2" />
          <input name="slug" aria-label="Slug" className="rounded-md border border-slate-300 px-3 py-2" />
          <textarea name="description" aria-label="Description" className="rounded-md border border-slate-300 px-3 py-2 md:col-span-2" />
          <select name="type" aria-label="Type" className="rounded-md border border-slate-300 px-3 py-2">
            <option value="NATIVE_VIDEO">Native video</option>
            <option value="SCORM_1_2">SCORM 1.2</option>
          </select>
          <input name="expectedDurationMinutes" aria-label="Expected duration minutes" type="number" min="1" className="rounded-md border border-slate-300 px-3 py-2" />
          <input name="estimatedCompletionBusinessDays" aria-label="Estimated business days" type="number" min="0" className="rounded-md border border-slate-300 px-3 py-2" />
          <button type="submit" className="rounded-md bg-slate-950 px-3 py-2 text-sm font-medium text-white">Create global course</button>
        </form>
      </section>
      <section className="rounded-md border border-slate-200 p-4">
        <h2 className="text-lg font-semibold text-slate-950">Library courses</h2>
        <div className="mt-4 grid gap-3">
          {courses.map((course) => (
            <article key={course.id} className="rounded-md bg-slate-50 p-3">
              <Link href={`/platform/library/${course.slug}`} className="font-medium text-slate-950">{course.title}</Link>
              <p className="text-sm text-slate-600">{course.type} · {course.status} · {course._count.tenantCopies} tenant copies</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
```

- [ ] **Step 4: Implement platform library detail page**

Create `src/app/platform/library/[courseSlug]/page.tsx` as a server component that:

- calls `requirePlatformOwner()`.
- loads one global course by slug with category, tags, modules, video lessons, SCORM package, and knowledge-check question count.
- calls `notFound()` when the course does not exist.
- renders forms that post `globalCourseId` and lifecycle `status` to `updateGlobalCourseLifecycleFormAction`.

Use this TSX body:

```tsx
import { notFound } from "next/navigation";

import { requirePlatformOwner } from "@/lib/auth/guards";

import { updateGlobalCourseLifecycleFormAction } from "../actions";

export const dynamic = "force-dynamic";

type PlatformGlobalCoursePageProps = {
  params: Promise<{ courseSlug: string }>;
};

export default async function PlatformGlobalCoursePage({ params }: PlatformGlobalCoursePageProps) {
  await requirePlatformOwner();
  const { courseSlug } = await params;
  const { prisma } = await import("@/lib/prisma");
  const course = await prisma.globalCourse.findUnique({
    where: { slug: courseSlug },
    include: {
      category: true,
      tagLinks: { include: { tag: true }, orderBy: { tag: { name: "asc" } } },
      modules: { orderBy: { sortOrder: "asc" } },
      videoLessons: { orderBy: { sortOrder: "asc" } },
      scormPackage: true,
      _count: { select: { knowledgeCheckQuestions: true, tenantCopies: true } },
    },
  });

  if (!course) {
    notFound();
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-6 px-6 py-10">
      <header>
        <p className="text-sm font-medium uppercase tracking-wide text-slate-500">Global Course</p>
        <h1 className="text-3xl font-semibold text-slate-950">{course.title}</h1>
        <p className="mt-2 text-sm text-slate-600">{course.type} · {course.status} · {course._count.tenantCopies} tenant copies</p>
      </header>
      <section className="rounded-md border border-slate-200 p-4">
        <h2 className="text-lg font-semibold text-slate-950">Lifecycle</h2>
        <form action={updateGlobalCourseLifecycleFormAction} className="mt-4 flex flex-wrap gap-2">
          <input type="hidden" name="globalCourseId" value={course.id} />
          {["DRAFT", "PUBLISHED", "DEPRECATED", "RETIRED"].map((status) => (
            <button key={status} type="submit" name="status" value={status} className="rounded-md border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700">
              {status === course.status ? `${status} current` : status}
            </button>
          ))}
        </form>
      </section>
      <section className="rounded-md border border-slate-200 p-4 text-sm text-slate-700">
        <p>Category: {course.category?.name ?? "None"}</p>
        <p>Tags: {course.tagLinks.map((link) => link.tag.name).join(", ") || "None"}</p>
        <p>Modules: {course.modules.length}</p>
        <p>Video lessons: {course.videoLessons.length}</p>
        <p>SCORM package: {course.scormPackage ? course.scormPackage.originalFileName : "None"}</p>
        <p>Knowledge checks: {course._count.knowledgeCheckQuestions}</p>
      </section>
    </main>
  );
}
```

- [ ] **Step 5: Verify and commit**

Run:

```powershell
npm run test -- src/modules/catalog/page-shells.test.ts
npm run build
git add src/app/platform/library/page.tsx src/app/platform/library/actions.ts src/app/platform/library/[courseSlug]/page.tsx src/modules/catalog/page-shells.test.ts
git commit -m "feat: add platform global library pages"
```

Expected: tests pass, build exits `0`, and commit succeeds.

## Task 6: Wire Organization Library Copy Page

**Files:**
- Create: `src/app/org/[slug]/admin/library/page.tsx`
- Create: `src/app/org/[slug]/admin/library/actions.ts`
- Modify: `src/modules/catalog/page-shells.test.ts`

- [ ] **Step 1: Add organization page tests**

Extend `src/modules/catalog/page-shells.test.ts` to assert:

- organization library page uses `requireOrganizationUsersAdminBySlug`.
- when `globalLibraryEnabled` is false, page renders `Global library is not enabled for this organization`.
- when enabled, page lists published global courses only.
- each uncopied course renders a copy form with hidden `globalCourseId`.
- already copied courses explain that normal re-copy is blocked by default and render only an explicit duplicate submit button with `duplicateAction` value `duplicate`.

Add these tests to the same `global library page shells` describe block in `src/modules/catalog/page-shells.test.ts`:

```ts
it("renders disabled organization library state when access is off", async () => {
  const { default: OrganizationLibraryPage } = await import("@/app/org/[slug]/admin/library/page");
  prismaMock.organization.findUnique.mockResolvedValue({ id: "org_1", globalLibraryEnabled: false });

  const html = renderToStaticMarkup(await OrganizationLibraryPage({
    params: Promise.resolve({ slug: "acme" }),
  }));

  expect(html).toContain("Global library is not enabled for this organization");
  expect(prismaMock.globalCourse.findMany).not.toHaveBeenCalled();
});

it("renders organization library copy and duplicate controls when access is on", async () => {
  const { default: OrganizationLibraryPage } = await import("@/app/org/[slug]/admin/library/page");
  prismaMock.organization.findUnique.mockResolvedValue({ id: "org_1", globalLibraryEnabled: true });
  prismaMock.globalCourse.findMany.mockResolvedValue([
    {
      id: "global_course_1",
      title: "Global Coaching Basics",
      slug: "global-coaching-basics",
      type: "NATIVE_VIDEO",
      status: "PUBLISHED",
      expectedDurationMinutes: 30,
      estimatedCompletionBusinessDays: 3,
      category: { name: "Leadership" },
      tagLinks: [{ tag: { name: "Coaching" } }],
    },
    {
      id: "global_course_2",
      title: "Global Policy Orientation",
      slug: "global-policy-orientation",
      type: "SCORM_1_2",
      status: "PUBLISHED",
      expectedDurationMinutes: 40,
      estimatedCompletionBusinessDays: 5,
      category: null,
      tagLinks: [],
    },
  ]);
  prismaMock.course.findMany.mockResolvedValue([
    { id: "tenant_course_1", sourceGlobalCourseId: "global_course_1", title: "Global Coaching Basics" },
  ]);

  const html = renderToStaticMarkup(await OrganizationLibraryPage({
    params: Promise.resolve({ slug: "acme" }),
  }));

  expect(prismaMock.globalCourse.findMany).toHaveBeenCalledWith(expect.objectContaining({
    where: { status: "PUBLISHED" },
  }));
  expect(html).toContain("Global Coaching Basics");
  expect(html).toContain("Global Policy Orientation");
  expect(html).toContain('name="globalCourseId"');
  expect(html).toContain('value="global_course_1"');
  expect(html).toContain("Normal re-copy is blocked by default.");
  expect(html).toContain('name="duplicateAction"');
  expect(html).toContain('value="duplicate"');
  expect(html).not.toContain('value="block"');
});
```

Run:

```powershell
npm run test -- src/modules/catalog/page-shells.test.ts
```

Expected: fail because organization library page does not exist.

- [ ] **Step 2: Implement tenant action bridge**

Create `src/app/org/[slug]/admin/library/actions.ts`:

```ts
"use server";

import { requireOrganizationUsersAdminBySlug } from "@/lib/auth/guards";
import { createPrismaGlobalLibraryRepository } from "@/modules/library/prisma-repository";
import { createTenantLibraryActions } from "@/modules/library/server-actions";

async function getActorAndOrganization(slug: string) {
  const { context, organizationId } = await requireOrganizationUsersAdminBySlug(slug);
  return { actorId: context.userId, organizationId };
}

async function createActions() {
  const { prisma } = await import("@/lib/prisma");
  return createTenantLibraryActions({
    getActorAndOrganization,
    repository: createPrismaGlobalLibraryRepository(prisma),
  });
}

export async function copyGlobalCourseFormAction(slug: string, formData: FormData) {
  return (await createActions()).copyCourse(slug, formData);
}
```

- [ ] **Step 3: Implement organization admin library page**

Create `src/app/org/[slug]/admin/library/page.tsx` as a server component that:

- calls `requireOrganizationUsersAdminBySlug(slug)`.
- loads `Organization.globalLibraryEnabled`.
- returns the disabled-access message when false.
- queries `prisma.globalCourse.findMany({ where: { status: "PUBLISHED" } })`.
- queries tenant copies with `where: { organizationId, sourceGlobalCourseId: { not: null } }`.
- renders copy forms for uncopied courses.
- renders copied-course text `Normal re-copy is blocked by default.` and only sends `duplicateAction=duplicate` when the admin clicks the explicit duplicate button.

Use this TSX body:

```tsx
import { requireOrganizationUsersAdminBySlug } from "@/lib/auth/guards";

import { copyGlobalCourseFormAction } from "./actions";

export const dynamic = "force-dynamic";

type OrganizationLibraryPageProps = {
  params: Promise<{ slug: string }>;
};

export default async function OrganizationLibraryPage({ params }: OrganizationLibraryPageProps) {
  const { slug } = await params;
  const { organizationId } = await requireOrganizationUsersAdminBySlug(slug);
  const { prisma } = await import("@/lib/prisma");
  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { id: true, globalLibraryEnabled: true },
  });

  if (!organization?.globalLibraryEnabled) {
    return (
      <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-6 px-6 py-10">
        <header>
          <p className="text-sm font-medium uppercase tracking-wide text-slate-500">Catalog Admin</p>
          <h1 className="text-3xl font-semibold text-slate-950">Global library</h1>
        </header>
        <section className="rounded-md border border-slate-200 p-4 text-sm text-slate-700">
          Global library is not enabled for this organization.
        </section>
      </main>
    );
  }

  const [globalCourses, tenantCopies] = await Promise.all([
    prisma.globalCourse.findMany({
      where: { status: "PUBLISHED" },
      orderBy: { title: "asc" },
      select: {
        id: true,
        title: true,
        slug: true,
        type: true,
        status: true,
        expectedDurationMinutes: true,
        estimatedCompletionBusinessDays: true,
        category: { select: { name: true } },
        tagLinks: { select: { tag: { select: { name: true } } }, orderBy: { tag: { name: "asc" } } },
      },
    }),
    prisma.course.findMany({
      where: { organizationId, sourceGlobalCourseId: { not: null } },
      select: { id: true, title: true, sourceGlobalCourseId: true },
    }),
  ]);
  const copyByGlobalCourseId = new Map(tenantCopies.map((course) => [course.sourceGlobalCourseId, course]));
  const copyAction = async (formData: FormData) => {
    "use server";

    await copyGlobalCourseFormAction(slug, formData);
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-6 px-6 py-10">
      <header>
        <p className="text-sm font-medium uppercase tracking-wide text-slate-500">Catalog Admin</p>
        <h1 className="text-3xl font-semibold text-slate-950">Global library</h1>
      </header>
      <section className="grid gap-4 md:grid-cols-2">
        {globalCourses.map((course) => {
          const existingCopy = copyByGlobalCourseId.get(course.id);

          return (
            <article key={course.id} className="rounded-md border border-slate-200 p-4">
              <h2 className="text-lg font-semibold text-slate-950">{course.title}</h2>
              <p className="mt-1 text-sm text-slate-600">{course.type} · {course.expectedDurationMinutes}m · {course.estimatedCompletionBusinessDays} business days</p>
              <p className="mt-1 text-sm text-slate-600">Category: {course.category?.name ?? "None"}</p>
              <p className="mt-1 text-sm text-slate-600">Tags: {course.tagLinks.map((link) => link.tag.name).join(", ") || "None"}</p>
              <form action={copyAction} className="mt-4 flex flex-wrap gap-2">
                <input type="hidden" name="globalCourseId" value={course.id} />
                {existingCopy ? (
                  <>
                    <span className="text-sm text-slate-600">Copied as {existingCopy.title}</span>
                    <span className="text-sm text-slate-600">Normal re-copy is blocked by default.</span>
                    <button type="submit" name="duplicateAction" value="duplicate" className="rounded-md border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700">
                      Copy duplicate
                    </button>
                  </>
                ) : (
                  <button type="submit" className="rounded-md bg-slate-950 px-3 py-2 text-sm font-medium text-white">
                    Copy into catalog
                  </button>
                )}
              </form>
            </article>
          );
        })}
      </section>
    </main>
  );
}
```

- [ ] **Step 4: Verify and commit**

Run:

```powershell
npm run test -- src/modules/catalog/page-shells.test.ts
npm run build
git add src/app/org/[slug]/admin/library/page.tsx src/app/org/[slug]/admin/library/actions.ts src/modules/catalog/page-shells.test.ts
git commit -m "feat: add tenant global library copy page"
```

Expected: tests pass, build exits `0`, and commit succeeds.

## Task 7: Keep Related Courses Tenant-Scoped

**Files:**
- Modify: `src/modules/catalog/related-courses.ts`
- Modify: `src/modules/catalog/related-courses.test.ts`

- [ ] **Step 1: Add tenant-safety tests**

Update `src/modules/catalog/related-courses.test.ts` so candidates include `organizationId` and `globalOnly`. Add tests proving:

- candidates from another organization are excluded.
- candidates with `globalOnly: true` are excluded.
- source and candidates must share the same tenant organization to rank.

Use this source fixture:

```ts
import { describe, expect, it } from "vitest";

import { rankRelatedCourses, type RelatedCourseCandidate } from "./related-courses";

const source = {
  id: "course_source",
  organizationId: "org_1",
  title: "Source",
  status: "PUBLISHED" as const,
  categoryId: "cat_1",
  tagIds: ["tag_1"],
  globalOnly: false,
};

describe("tenant-scoped related courses", () => {
  it("excludes candidates from other tenants", () => {
    const candidates: RelatedCourseCandidate[] = [
      {
        id: "course_other_tenant",
        organizationId: "org_2",
        title: "Other Tenant Match",
        status: "PUBLISHED",
        categoryId: "cat_1",
        tagIds: ["tag_1"],
        globalOnly: false,
      },
    ];

    expect(rankRelatedCourses(source, candidates)).toEqual([]);
  });

  it("excludes global-only candidates", () => {
    const candidates: RelatedCourseCandidate[] = [
      {
        id: "global_course_1",
        organizationId: "org_1",
        title: "Global Library Source",
        status: "PUBLISHED",
        categoryId: "cat_1",
        tagIds: ["tag_1"],
        globalOnly: true,
      },
    ];

    expect(rankRelatedCourses(source, candidates)).toEqual([]);
  });

  it("still ranks same-tenant published candidates", () => {
    const candidates: RelatedCourseCandidate[] = [
      {
        id: "course_same_tenant",
        organizationId: "org_1",
        title: "Same Tenant Match",
        status: "PUBLISHED",
        categoryId: "cat_1",
        tagIds: ["tag_2"],
        globalOnly: false,
      },
      {
        id: "course_draft",
        organizationId: "org_1",
        title: "Draft Same Tenant Match",
        status: "DRAFT",
        categoryId: "cat_1",
        tagIds: ["tag_1"],
        globalOnly: false,
      },
    ];

    expect(rankRelatedCourses(source, candidates)).toEqual([candidates[0]]);
  });
});
```

Run:

```powershell
npm run test -- src/modules/catalog/related-courses.test.ts
```

Expected: fail because the current matcher does not know `organizationId` or `globalOnly`.

- [ ] **Step 2: Update matcher contract**

Modify `src/modules/catalog/related-courses.ts`:

```ts
export type RelatedCourseCandidate = {
  id: string;
  organizationId: string;
  title: string;
  status: CourseStatus;
  categoryId: string | null;
  tagIds: string[];
  globalOnly?: boolean;
};
```

Update the first filter in `rankRelatedCourses`:

```ts
.filter((candidate) =>
  candidate.id !== source.id &&
  candidate.status === "PUBLISHED" &&
  candidate.organizationId === source.organizationId &&
  candidate.globalOnly !== true,
)
```

- [ ] **Step 3: Verify and commit**

Run:

```powershell
npm run test -- src/modules/catalog/related-courses.test.ts
git add src/modules/catalog/related-courses.ts src/modules/catalog/related-courses.test.ts
git commit -m "fix: keep related courses tenant scoped"
```

Expected: tests pass and commit succeeds.

## Task 8: Seed Demo Global Library Courses

**Files:**
- Modify: `prisma/seed.ts`

- [ ] **Step 1: Add seed records**

In `prisma/seed.ts`, after the platform owner is created, add:

```ts
const globalCategory = await prisma.globalCourseCategory.upsert({
  where: { slug: "leadership" },
  update: { name: "Leadership" },
  create: { name: "Leadership", slug: "leadership" },
});

const globalTag = await prisma.globalCourseTag.upsert({
  where: { slug: "coaching" },
  update: { name: "Coaching" },
  create: { name: "Coaching", slug: "coaching" },
});

const globalCourse = await prisma.globalCourse.upsert({
  where: { slug: "global-coaching-basics" },
  update: {
    title: "Global Coaching Basics",
    description: "Platform library course for tenant copy demos.",
    status: "PUBLISHED",
    type: "NATIVE_VIDEO",
    estimatedCompletionBusinessDays: 3,
    expectedDurationMinutes: 30,
    categoryId: globalCategory.id,
    createdByUserId: platformOwner.id,
  },
  create: {
    title: "Global Coaching Basics",
    slug: "global-coaching-basics",
    description: "Platform library course for tenant copy demos.",
    status: "PUBLISHED",
    type: "NATIVE_VIDEO",
    estimatedCompletionBusinessDays: 3,
    expectedDurationMinutes: 30,
    categoryId: globalCategory.id,
    createdByUserId: platformOwner.id,
  },
});
```

Add these seed records after the `globalCourse` upsert:

```ts
await prisma.globalCourseTagLink.upsert({
  where: {
    globalCourseId_tagId: {
      globalCourseId: globalCourse.id,
      tagId: globalTag.id,
    },
  },
  update: {},
  create: {
    globalCourseId: globalCourse.id,
    tagId: globalTag.id,
  },
});

const globalModule = await prisma.globalCourseModule.upsert({
  where: {
    globalCourseId_slug: {
      globalCourseId: globalCourse.id,
      slug: "manager-foundations",
    },
  },
  update: { title: "Manager Foundations", sortOrder: 0 },
  create: {
    globalCourseId: globalCourse.id,
    title: "Manager Foundations",
    slug: "manager-foundations",
    sortOrder: 0,
  },
});

const globalLesson = await prisma.globalVideoLesson.upsert({
  where: {
    globalCourseId_slug: {
      globalCourseId: globalCourse.id,
      slug: "ask-better-questions",
    },
  },
  update: {
    moduleId: globalModule.id,
    title: "Ask Better Questions",
    sortOrder: 0,
    durationSeconds: 180,
    required: true,
    providerAssetId: null,
    playbackUrl: "https://video.learnhub.local/global/ask-better-questions.mp4",
    transcriptLanguage: "en",
  },
  create: {
    globalCourseId: globalCourse.id,
    moduleId: globalModule.id,
    title: "Ask Better Questions",
    slug: "ask-better-questions",
    sortOrder: 0,
    durationSeconds: 180,
    required: true,
    playbackUrl: "https://video.learnhub.local/global/ask-better-questions.mp4",
    transcriptLanguage: "en",
  },
});

await prisma.globalVideoChapter.deleteMany({ where: { lessonId: globalLesson.id } });
await prisma.globalVideoChapter.createMany({
  data: [
    { lessonId: globalLesson.id, title: "Open", startSecond: 0, endSecond: 60, sortOrder: 0 },
    { lessonId: globalLesson.id, title: "Practice", startSecond: 60, endSecond: null, sortOrder: 1 },
  ],
});

await prisma.globalVideoTranscriptCue.deleteMany({ where: { lessonId: globalLesson.id } });
await prisma.globalVideoTranscriptCue.createMany({
  data: [
    { lessonId: globalLesson.id, startSecond: 0, endSecond: 30, text: "Start with context." },
    { lessonId: globalLesson.id, startSecond: 30, endSecond: 90, text: "Ask open questions before offering advice." },
  ],
});

await prisma.globalKnowledgeCheckQuestion.deleteMany({
  where: { globalCourseId: globalCourse.id },
});
const globalQuestion = await prisma.globalKnowledgeCheckQuestion.create({
  data: {
    globalCourseId: globalCourse.id,
    lessonId: globalLesson.id,
    prompt: "Which question invites context?",
    questionType: "SINGLE_CHOICE",
    sortOrder: 0,
    explanation: "Open questions reveal blockers.",
  },
});
await prisma.globalKnowledgeCheckAnswer.createMany({
  data: [
    { questionId: globalQuestion.id, text: "What happened?", correct: true, feedback: "Correct.", sortOrder: 0 },
    { questionId: globalQuestion.id, text: "Why did you fail?", correct: false, feedback: "Use neutral wording.", sortOrder: 1 },
  ],
});

const globalScormCourse = await prisma.globalCourse.upsert({
  where: { slug: "global-policy-orientation" },
  update: {
    title: "Global Policy Orientation",
    description: "Platform SCORM library course for tenant copy demos.",
    status: "PUBLISHED",
    type: "SCORM_1_2",
    estimatedCompletionBusinessDays: 5,
    expectedDurationMinutes: 40,
    categoryId: globalCategory.id,
    createdByUserId: platformOwner.id,
  },
  create: {
    title: "Global Policy Orientation",
    slug: "global-policy-orientation",
    description: "Platform SCORM library course for tenant copy demos.",
    status: "PUBLISHED",
    type: "SCORM_1_2",
    estimatedCompletionBusinessDays: 5,
    expectedDurationMinutes: 40,
    categoryId: globalCategory.id,
    createdByUserId: platformOwner.id,
  },
});

await prisma.globalScormPackage.upsert({
  where: { globalCourseId: globalScormCourse.id },
  update: {
    originalFileName: "global-policy-orientation.zip",
    contentType: "application/zip",
    byteSize: 4096,
    storageKey: `global/courses/${globalScormCourse.id}/scorm/global-policy-orientation.zip`,
    contentRootKey: `global/courses/${globalScormCourse.id}/scorm/content`,
    launchPath: "index.html",
    manifestTitle: "Global Policy Orientation",
    uploadedByUserId: platformOwner.id,
    active: true,
  },
  create: {
    globalCourseId: globalScormCourse.id,
    originalFileName: "global-policy-orientation.zip",
    contentType: "application/zip",
    byteSize: 4096,
    storageKey: `global/courses/${globalScormCourse.id}/scorm/global-policy-orientation.zip`,
    contentRootKey: `global/courses/${globalScormCourse.id}/scorm/content`,
    launchPath: "index.html",
    manifestTitle: "Global Policy Orientation",
    uploadedByUserId: platformOwner.id,
    active: true,
  },
});
```

- [ ] **Step 2: Verify seed compiles through TypeScript**

Run:

```powershell
npx tsc --noEmit --incremental false
```

Expected: command exits `0`.

- [ ] **Step 3: Commit seed changes**

Run:

```powershell
git add prisma/seed.ts
git commit -m "chore: seed global library demo courses"
```

Expected: commit succeeds.

## Task 9: Final Verification

**Files:**
- Modify: none unless verification exposes a concrete failure.

- [ ] **Step 1: Run focused tests**

Run:

```powershell
npm run test -- src/modules/library/global-library.test.ts src/modules/library/prisma-repository.test.ts src/modules/library/server-actions.test.ts src/modules/catalog/related-courses.test.ts src/modules/catalog/page-shells.test.ts
```

Expected: all focused tests pass.

- [ ] **Step 2: Run full test suite**

Run:

```powershell
npm run test
```

Expected: all tests pass.

- [ ] **Step 3: Run lint**

Run:

```powershell
npm run lint
```

Expected: ESLint exits `0`.

- [ ] **Step 4: Validate Prisma**

Run:

```powershell
npx prisma validate
npm run prisma:generate
```

Expected: schema validates and Prisma client generation exits `0`.

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
git log --oneline -10
```

Expected: clean feature branch with task commits for schema, service, repository, actions, pages, related-course safety, and seed data.

## Acceptance Criteria

- Platform owner can create global library courses through `/platform/library`.
- Platform owner can publish, deprecate, and retire global library courses through `/platform/library/[courseSlug]`.
- Organization admin sees global library courses only when `Organization.globalLibraryEnabled` is true.
- Organization admin can copy a published global course into the tenant catalog.
- Copy creates tenant-owned `Course`, `CourseCategory`, `CourseTag`, `CourseTagLink`, `CourseModule`, `VideoLesson`, `VideoChapter`, `VideoTranscriptCue`, `ScormPackage`, `CourseKnowledgeCheckQuestion`, and `CourseKnowledgeCheckAnswer` records when the source contains those records.
- Copied tenant courses start as `DRAFT` and can be customized without mutating global source records.
- Normal first copy allocates a tenant-unique slug inside the repository copy transaction and keeps `sourceGlobalCourseId`.
- Normal re-copy of the same global course is blocked by service logic and by the `Course_organizationId_sourceGlobalCourseId_key` unique index.
- Explicit duplicate action allocates a distinct tenant slug inside the repository copy transaction and creates another tenant course with `sourceGlobalCourseId: null`.
- Related-course ranking filters by tenant `organizationId` and excludes `globalOnly` candidates.
- Copy audit logs use action `global_course.copied_to_tenant` and metadata keys `sourceGlobalCourseId` and `createdTenantCourseId`.
- All new organization-scoped writes include `organizationId`.

## Review Checklist

- `GlobalCourse` source records never appear in learner catalog or assignment queries.
- Tenant copy repository writes run inside one transaction.
- Category and tag copy uses tenant slug uniqueness and never reuses global ids.
- Video lesson copy maps global module ids to tenant module ids before writing lessons.
- Knowledge-check copy maps global lesson ids to tenant lesson ids before writing tenant questions.
- SCORM copy writes tenant `organizationId` and tenant `courseId`.
- Audit log metadata includes both source and created tenant ids.
- Platform actions use `requirePlatformOwner`.
- Tenant copy actions use `requireOrganizationUsersAdminBySlug`.
- No recommendation path ranks a global-only course for a learner.
