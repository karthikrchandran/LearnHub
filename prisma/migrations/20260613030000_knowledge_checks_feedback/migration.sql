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
