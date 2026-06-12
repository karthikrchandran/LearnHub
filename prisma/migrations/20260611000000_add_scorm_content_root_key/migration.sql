ALTER TABLE "ScormPackage" ADD COLUMN "contentRootKey" TEXT;

UPDATE "ScormPackage"
SET "contentRootKey" = 'org/' || "organizationId" || '/courses/' || "courseId" || '/scorm/' || "id" || '/content';

ALTER TABLE "ScormPackage" ALTER COLUMN "contentRootKey" SET NOT NULL;
