ALTER TYPE "VideoAssetStatus" ADD VALUE IF NOT EXISTS 'DRAFT';

ALTER TABLE "VideoLesson"
  ADD COLUMN "authoringPrompt" TEXT,
  ADD COLUMN "narrationScript" TEXT,
  ADD COLUMN "videoGenerationPrompt" TEXT;