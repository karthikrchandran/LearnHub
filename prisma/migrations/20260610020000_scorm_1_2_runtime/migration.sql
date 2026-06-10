-- CreateTable
CREATE TABLE "ScormPackage" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "originalFileName" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "launchPath" TEXT NOT NULL,
    "manifestTitle" TEXT,
    "uploadedByUserId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScormPackage_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ScormPackage_byteSize_check" CHECK ("byteSize" > 0)
);

-- CreateTable
CREATE TABLE "ScormRegistration" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    "cmiData" JSONB NOT NULL DEFAULT '{}',
    "lessonStatus" TEXT NOT NULL DEFAULT 'not attempted',
    "scoreRaw" INTEGER,
    "sessionTimeSeconds" INTEGER NOT NULL DEFAULT 0,
    "totalTimeSeconds" INTEGER NOT NULL DEFAULT 0,
    "launchCount" INTEGER NOT NULL DEFAULT 0,
    "lastLaunchedAt" TIMESTAMP(3),
    "lastCommittedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScormRegistration_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ScormRegistration_scoreRaw_check" CHECK ("scoreRaw" IS NULL OR ("scoreRaw" >= 0 AND "scoreRaw" <= 100)),
    CONSTRAINT "ScormRegistration_time_check" CHECK ("sessionTimeSeconds" >= 0 AND "totalTimeSeconds" >= 0),
    CONSTRAINT "ScormRegistration_launchCount_check" CHECK ("launchCount" >= 0)
);

-- CreateIndex
CREATE UNIQUE INDEX "ScormPackage_organizationId_courseId_key" ON "ScormPackage"("organizationId", "courseId");

-- CreateIndex
CREATE UNIQUE INDEX "ScormPackage_organizationId_id_key" ON "ScormPackage"("organizationId", "id");

-- CreateIndex
CREATE INDEX "ScormPackage_organizationId_courseId_idx" ON "ScormPackage"("organizationId", "courseId");

-- CreateIndex
CREATE INDEX "ScormPackage_uploadedByUserId_idx" ON "ScormPackage"("uploadedByUserId");

-- CreateIndex
CREATE UNIQUE INDEX "ScormRegistration_organizationId_assignmentId_key" ON "ScormRegistration"("organizationId", "assignmentId");

-- CreateIndex
CREATE INDEX "ScormRegistration_organizationId_packageId_idx" ON "ScormRegistration"("organizationId", "packageId");

-- AddForeignKey
ALTER TABLE "ScormPackage" ADD CONSTRAINT "ScormPackage_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScormPackage" ADD CONSTRAINT "ScormPackage_organizationId_courseId_fkey" FOREIGN KEY ("organizationId", "courseId") REFERENCES "Course"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScormPackage" ADD CONSTRAINT "ScormPackage_uploadedByUserId_fkey" FOREIGN KEY ("uploadedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScormRegistration" ADD CONSTRAINT "ScormRegistration_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScormRegistration" ADD CONSTRAINT "ScormRegistration_organizationId_assignmentId_fkey" FOREIGN KEY ("organizationId", "assignmentId") REFERENCES "CourseAssignment"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScormRegistration" ADD CONSTRAINT "ScormRegistration_organizationId_packageId_fkey" FOREIGN KEY ("organizationId", "packageId") REFERENCES "ScormPackage"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
