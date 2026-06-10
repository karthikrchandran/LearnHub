CREATE TYPE "LearningEventSource" AS ENUM ('NATIVE', 'SCORM');
CREATE TYPE "LearningEventType" AS ENUM ('PROGRESS', 'COMPLETED', 'PASSED', 'FAILED');
CREATE TYPE "CredentialProviderName" AS ENUM ('CREDLY');
CREATE TYPE "CredentialIssuanceStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED');

CREATE UNIQUE INDEX "CourseAssignment_organizationId_id_key" ON "CourseAssignment"("organizationId", "id");

CREATE TABLE "AssignmentProgress" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "assignmentId" TEXT NOT NULL,
  "progressPercent" INTEGER NOT NULL DEFAULT 0,
  "lastEventAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AssignmentProgress_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LearningProgressEvent" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "assignmentId" TEXT NOT NULL,
  "source" "LearningEventSource" NOT NULL,
  "type" "LearningEventType" NOT NULL,
  "progressPercent" INTEGER,
  "rawPayload" JSONB NOT NULL DEFAULT '{}',
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LearningProgressEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Certificate" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "assignmentId" TEXT NOT NULL,
  "courseId" TEXT NOT NULL,
  "membershipId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "learnerName" TEXT NOT NULL,
  "learnerEmail" TEXT NOT NULL,
  "courseTitle" TEXT NOT NULL,
  "verificationCode" TEXT NOT NULL,
  "verificationUrl" TEXT NOT NULL,
  "issuedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Certificate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CredentialIssuance" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "certificateId" TEXT NOT NULL,
  "provider" "CredentialProviderName" NOT NULL,
  "status" "CredentialIssuanceStatus" NOT NULL DEFAULT 'PENDING',
  "providerCredentialId" TEXT,
  "providerUrl" TEXT,
  "errorMessage" TEXT,
  "attemptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CredentialIssuance_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AssignmentProgress_organizationId_assignmentId_key" ON "AssignmentProgress"("organizationId", "assignmentId");
CREATE INDEX "AssignmentProgress_organizationId_idx" ON "AssignmentProgress"("organizationId");

CREATE INDEX "LearningProgressEvent_organizationId_assignmentId_idx" ON "LearningProgressEvent"("organizationId", "assignmentId");
CREATE INDEX "LearningProgressEvent_organizationId_occurredAt_idx" ON "LearningProgressEvent"("organizationId", "occurredAt");

CREATE UNIQUE INDEX "Certificate_verificationCode_key" ON "Certificate"("verificationCode");
CREATE UNIQUE INDEX "Certificate_organizationId_assignmentId_key" ON "Certificate"("organizationId", "assignmentId");
CREATE INDEX "Certificate_organizationId_idx" ON "Certificate"("organizationId");
CREATE INDEX "Certificate_organizationId_membershipId_idx" ON "Certificate"("organizationId", "membershipId");
CREATE INDEX "Certificate_organizationId_courseId_idx" ON "Certificate"("organizationId", "courseId");
CREATE INDEX "Certificate_userId_idx" ON "Certificate"("userId");

CREATE INDEX "CredentialIssuance_organizationId_idx" ON "CredentialIssuance"("organizationId");
CREATE INDEX "CredentialIssuance_certificateId_idx" ON "CredentialIssuance"("certificateId");
CREATE INDEX "CredentialIssuance_organizationId_provider_status_idx" ON "CredentialIssuance"("organizationId", "provider", "status");

ALTER TABLE "AssignmentProgress"
ADD CONSTRAINT "AssignmentProgress_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AssignmentProgress"
ADD CONSTRAINT "AssignmentProgress_organizationId_assignmentId_fkey"
FOREIGN KEY ("organizationId", "assignmentId") REFERENCES "CourseAssignment"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LearningProgressEvent"
ADD CONSTRAINT "LearningProgressEvent_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LearningProgressEvent"
ADD CONSTRAINT "LearningProgressEvent_organizationId_assignmentId_fkey"
FOREIGN KEY ("organizationId", "assignmentId") REFERENCES "CourseAssignment"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Certificate"
ADD CONSTRAINT "Certificate_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Certificate"
ADD CONSTRAINT "Certificate_organizationId_assignmentId_fkey"
FOREIGN KEY ("organizationId", "assignmentId") REFERENCES "CourseAssignment"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Certificate"
ADD CONSTRAINT "Certificate_organizationId_courseId_fkey"
FOREIGN KEY ("organizationId", "courseId") REFERENCES "Course"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Certificate"
ADD CONSTRAINT "Certificate_organizationId_membershipId_fkey"
FOREIGN KEY ("organizationId", "membershipId") REFERENCES "OrganizationMembership"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CredentialIssuance"
ADD CONSTRAINT "CredentialIssuance_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CredentialIssuance"
ADD CONSTRAINT "CredentialIssuance_certificateId_fkey"
FOREIGN KEY ("certificateId") REFERENCES "Certificate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
