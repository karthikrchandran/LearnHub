CREATE UNIQUE INDEX "CourseAssignment_organizationId_courseId_membershipId_key"
ON "CourseAssignment"("organizationId", "courseId", "membershipId");
