CREATE TYPE "NotificationJobType" AS ENUM ('ASSIGNMENT_ASSIGNED', 'ASSIGNMENT_DUE_SOON', 'ASSIGNMENT_OVERDUE', 'MANAGER_ESCALATION', 'CERTIFICATE_ISSUED');
CREATE TYPE "NotificationJobStatus" AS ENUM ('PENDING', 'PROCESSING', 'SENT', 'FAILED', 'SKIPPED');
CREATE TYPE "NotificationEnqueueFailureStatus" AS ENUM ('PENDING', 'PROCESSING', 'RESOLVED');

CREATE TABLE "NotificationJob" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "assignmentId" TEXT NOT NULL,
  "certificateId" TEXT,
  "type" "NotificationJobType" NOT NULL,
  "status" "NotificationJobStatus" NOT NULL DEFAULT 'PENDING',
  "recipientEmail" TEXT NOT NULL,
  "recipientName" TEXT,
  "subject" TEXT NOT NULL,
  "html" TEXT NOT NULL,
  "text" TEXT NOT NULL,
  "scheduledForDate" TIMESTAMP(3) NOT NULL,
  "nextRunAt" TIMESTAMP(3) NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "providerMessageId" TEXT,
  "lastError" TEXT,
  "sentAt" TIMESTAMP(3),
  "claimedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "NotificationJob_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "NotificationEnqueueFailure" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "assignmentId" TEXT NOT NULL,
  "certificateId" TEXT,
  "operation" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "status" "NotificationEnqueueFailureStatus" NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "lastError" TEXT,
  "failedAt" TIMESTAMP(3) NOT NULL,
  "retryAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "NotificationEnqueueFailure_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "NotificationJob_organizationId_assignmentId_type_scheduledForDate_key"
ON "NotificationJob"("organizationId", "assignmentId", "type", "scheduledForDate");

CREATE UNIQUE INDEX "Certificate_organizationId_id_key"
ON "Certificate"("organizationId", "id");

CREATE INDEX "NotificationJob_status_nextRunAt_idx"
ON "NotificationJob"("status", "nextRunAt");

CREATE INDEX "NotificationJob_organizationId_status_nextRunAt_idx"
ON "NotificationJob"("organizationId", "status", "nextRunAt");

CREATE INDEX "NotificationJob_organizationId_type_idx"
ON "NotificationJob"("organizationId", "type");

CREATE INDEX "NotificationJob_certificateId_idx"
ON "NotificationJob"("certificateId");

CREATE INDEX "NotificationEnqueueFailure_organizationId_status_retryAt_idx"
ON "NotificationEnqueueFailure"("organizationId", "status", "retryAt");

CREATE INDEX "NotificationEnqueueFailure_status_retryAt_idx"
ON "NotificationEnqueueFailure"("status", "retryAt");

CREATE INDEX "NotificationEnqueueFailure_assignmentId_idx"
ON "NotificationEnqueueFailure"("assignmentId");

CREATE INDEX "NotificationEnqueueFailure_certificateId_idx"
ON "NotificationEnqueueFailure"("certificateId");

ALTER TABLE "NotificationJob"
ADD CONSTRAINT "NotificationJob_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "NotificationJob"
ADD CONSTRAINT "NotificationJob_organizationId_assignmentId_fkey"
FOREIGN KEY ("organizationId", "assignmentId") REFERENCES "CourseAssignment"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "NotificationJob"
ADD CONSTRAINT "NotificationJob_organizationId_certificateId_fkey"
FOREIGN KEY ("organizationId", "certificateId") REFERENCES "Certificate"("organizationId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

ALTER TABLE "NotificationEnqueueFailure"
ADD CONSTRAINT "NotificationEnqueueFailure_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "NotificationEnqueueFailure"
ADD CONSTRAINT "NotificationEnqueueFailure_organizationId_assignmentId_fkey"
FOREIGN KEY ("organizationId", "assignmentId") REFERENCES "CourseAssignment"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
