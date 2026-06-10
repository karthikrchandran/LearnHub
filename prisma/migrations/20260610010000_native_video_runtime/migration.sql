CREATE TABLE "CourseModule" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "courseId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CourseModule_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "VideoLesson" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "courseId" TEXT NOT NULL,
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
  CONSTRAINT "VideoLesson_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "VideoChapter" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "lessonId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "startSecond" INTEGER NOT NULL,
  "endSecond" INTEGER,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "VideoChapter_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "VideoTranscriptCue" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "lessonId" TEXT NOT NULL,
  "startSecond" INTEGER NOT NULL,
  "endSecond" INTEGER,
  "text" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "VideoTranscriptCue_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "VideoLessonProgress" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "courseId" TEXT NOT NULL,
  "assignmentId" TEXT NOT NULL,
  "lessonId" TEXT NOT NULL,
  "lastPositionSecond" INTEGER NOT NULL DEFAULT 0,
  "maxWatchedSecond" INTEGER NOT NULL DEFAULT 0,
  "completed" BOOLEAN NOT NULL DEFAULT false,
  "lastWatchedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "VideoLessonProgress_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CourseAssignment_organizationId_courseId_id_key" ON "CourseAssignment"("organizationId", "courseId", "id");

CREATE UNIQUE INDEX "CourseModule_organizationId_courseId_slug_key" ON "CourseModule"("organizationId", "courseId", "slug");
CREATE UNIQUE INDEX "CourseModule_organizationId_id_key" ON "CourseModule"("organizationId", "id");
CREATE UNIQUE INDEX "CourseModule_organizationId_courseId_id_key" ON "CourseModule"("organizationId", "courseId", "id");
CREATE INDEX "CourseModule_organizationId_courseId_sortOrder_idx" ON "CourseModule"("organizationId", "courseId", "sortOrder");

CREATE UNIQUE INDEX "VideoLesson_organizationId_courseId_slug_key" ON "VideoLesson"("organizationId", "courseId", "slug");
CREATE UNIQUE INDEX "VideoLesson_organizationId_id_key" ON "VideoLesson"("organizationId", "id");
CREATE UNIQUE INDEX "VideoLesson_organizationId_courseId_id_key" ON "VideoLesson"("organizationId", "courseId", "id");
CREATE INDEX "VideoLesson_organizationId_courseId_moduleId_sortOrder_idx" ON "VideoLesson"("organizationId", "courseId", "moduleId", "sortOrder");

CREATE INDEX "VideoChapter_organizationId_lessonId_startSecond_idx" ON "VideoChapter"("organizationId", "lessonId", "startSecond");

CREATE INDEX "VideoTranscriptCue_organizationId_lessonId_startSecond_idx" ON "VideoTranscriptCue"("organizationId", "lessonId", "startSecond");

CREATE UNIQUE INDEX "VideoLessonProgress_organizationId_assignmentId_lessonId_key" ON "VideoLessonProgress"("organizationId", "assignmentId", "lessonId");
CREATE INDEX "VideoLessonProgress_organizationId_courseId_assignmentId_idx" ON "VideoLessonProgress"("organizationId", "courseId", "assignmentId");
CREATE INDEX "VideoLessonProgress_organizationId_courseId_lessonId_idx" ON "VideoLessonProgress"("organizationId", "courseId", "lessonId");

ALTER TABLE "VideoLesson"
ADD CONSTRAINT "VideoLesson_durationSeconds_check"
CHECK ("durationSeconds" > 0);

ALTER TABLE "VideoChapter"
ADD CONSTRAINT "VideoChapter_time_range_check"
CHECK (
  "startSecond" >= 0
  AND ("endSecond" IS NULL OR "endSecond" > "startSecond")
);

ALTER TABLE "VideoTranscriptCue"
ADD CONSTRAINT "VideoTranscriptCue_time_range_check"
CHECK (
  "startSecond" >= 0
  AND ("endSecond" IS NULL OR "endSecond" > "startSecond")
);

ALTER TABLE "VideoLessonProgress"
ADD CONSTRAINT "VideoLessonProgress_seconds_check"
CHECK (
  "lastPositionSecond" >= 0
  AND "maxWatchedSecond" >= 0
);

ALTER TABLE "CourseModule"
ADD CONSTRAINT "CourseModule_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CourseModule"
ADD CONSTRAINT "CourseModule_organizationId_courseId_fkey"
FOREIGN KEY ("organizationId", "courseId") REFERENCES "Course"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "VideoLesson"
ADD CONSTRAINT "VideoLesson_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "VideoLesson"
ADD CONSTRAINT "VideoLesson_organizationId_courseId_fkey"
FOREIGN KEY ("organizationId", "courseId") REFERENCES "Course"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "VideoLesson"
ADD CONSTRAINT "VideoLesson_organizationId_courseId_moduleId_fkey"
FOREIGN KEY ("organizationId", "courseId", "moduleId") REFERENCES "CourseModule"("organizationId", "courseId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

ALTER TABLE "VideoChapter"
ADD CONSTRAINT "VideoChapter_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "VideoChapter"
ADD CONSTRAINT "VideoChapter_organizationId_lessonId_fkey"
FOREIGN KEY ("organizationId", "lessonId") REFERENCES "VideoLesson"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "VideoTranscriptCue"
ADD CONSTRAINT "VideoTranscriptCue_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "VideoTranscriptCue"
ADD CONSTRAINT "VideoTranscriptCue_organizationId_lessonId_fkey"
FOREIGN KEY ("organizationId", "lessonId") REFERENCES "VideoLesson"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "VideoLessonProgress"
ADD CONSTRAINT "VideoLessonProgress_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "VideoLessonProgress"
ADD CONSTRAINT "VideoLessonProgress_organizationId_assignmentId_fkey"
FOREIGN KEY ("organizationId", "courseId", "assignmentId") REFERENCES "CourseAssignment"("organizationId", "courseId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "VideoLessonProgress"
ADD CONSTRAINT "VideoLessonProgress_organizationId_lessonId_fkey"
FOREIGN KEY ("organizationId", "courseId", "lessonId") REFERENCES "VideoLesson"("organizationId", "courseId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
