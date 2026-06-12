CREATE TYPE "VideoAssetStatus" AS ENUM ('UPLOAD_CREATED', 'PROCESSING', 'READY', 'FAILED');
CREATE TYPE "ScormExtractionStatus" AS ENUM ('PENDING', 'PROCESSING', 'READY', 'FAILED');
CREATE TYPE "MalwareScanStatus" AS ENUM ('PENDING', 'PASSED', 'FAILED');

ALTER TABLE "VideoLesson"
ADD COLUMN "providerUploadId" TEXT,
ADD COLUMN "providerPlaybackId" TEXT,
ADD COLUMN "providerStatus" "VideoAssetStatus" NOT NULL DEFAULT 'READY',
ADD COLUMN "providerError" TEXT;

ALTER TABLE "ScormPackage"
ADD COLUMN "extractionStatus" "ScormExtractionStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN "extractionError" TEXT,
ADD COLUMN "malwareScanStatus" "MalwareScanStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN "malwareScanError" TEXT;

UPDATE "ScormPackage"
SET "extractionStatus" = 'READY',
    "malwareScanStatus" = 'PASSED';

CREATE INDEX "VideoLesson_organizationId_providerUploadId_idx" ON "VideoLesson"("organizationId", "providerUploadId");
CREATE INDEX "VideoLesson_organizationId_providerAssetId_idx" ON "VideoLesson"("organizationId", "providerAssetId");
CREATE INDEX "ScormPackage_organizationId_extractionStatus_idx" ON "ScormPackage"("organizationId", "extractionStatus");
CREATE INDEX "ScormPackage_organizationId_malwareScanStatus_idx" ON "ScormPackage"("organizationId", "malwareScanStatus");
