CREATE TYPE "NotificationJobType" AS ENUM ('ASSIGNMENT_ASSIGNED', 'ASSIGNMENT_DUE_SOON', 'ASSIGNMENT_OVERDUE', 'MANAGER_ESCALATION', 'CERTIFICATE_ISSUED');
CREATE TYPE "NotificationJobStatus" AS ENUM ('PENDING', 'PROCESSING', 'SENT', 'FAILED');

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
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "NotificationJob_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "NotificationJob_organizationId_assignmentId_type_scheduledForDate_key"
ON "NotificationJob"("organizationId", "assignmentId", "type", "scheduledForDate");

CREATE INDEX "NotificationJob_status_nextRunAt_idx"
ON "NotificationJob"("status", "nextRunAt");

CREATE INDEX "NotificationJob_organizationId_status_nextRunAt_idx"
ON "NotificationJob"("organizationId", "status", "nextRunAt");

CREATE INDEX "NotificationJob_organizationId_type_idx"
ON "NotificationJob"("organizationId", "type");

CREATE INDEX "NotificationJob_certificateId_idx"
ON "NotificationJob"("certificateId");

ALTER TABLE "NotificationJob"
ADD CONSTRAINT "NotificationJob_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "NotificationJob"
ADD CONSTRAINT "NotificationJob_organizationId_assignmentId_fkey"
FOREIGN KEY ("organizationId", "assignmentId") REFERENCES "CourseAssignment"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "NotificationJob"
ADD CONSTRAINT "NotificationJob_certificateId_fkey"
FOREIGN KEY ("certificateId") REFERENCES "Certificate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
