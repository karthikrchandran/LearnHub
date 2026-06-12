ALTER TABLE "Course"
ADD COLUMN "isGlobalLibraryCourse" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "globalLibrarySourceCourseId" TEXT;

CREATE INDEX "Course_isGlobalLibraryCourse_status_idx" ON "Course"("isGlobalLibraryCourse", "status");
CREATE INDEX "Course_organizationId_globalLibrarySourceCourseId_idx" ON "Course"("organizationId", "globalLibrarySourceCourseId");

ALTER TABLE "Course"
ADD CONSTRAINT "Course_globalLibrarySourceCourseId_fkey"
FOREIGN KEY ("globalLibrarySourceCourseId") REFERENCES "Course"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Course"
ADD CONSTRAINT "Course_global_library_source_check"
CHECK (NOT "isGlobalLibraryCourse" OR "globalLibrarySourceCourseId" IS NULL);
