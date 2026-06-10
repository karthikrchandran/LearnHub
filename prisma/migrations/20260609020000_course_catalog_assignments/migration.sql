DELETE FROM "CourseAssignment"
WHERE "id" IN (
  SELECT "id"
  FROM (
    SELECT
      "id",
      ROW_NUMBER() OVER (
        PARTITION BY "organizationId", "courseId", "membershipId"
        ORDER BY "createdAt" ASC, "id" ASC
      ) AS "rowNumber"
    FROM "CourseAssignment"
  ) AS "rankedAssignments"
  WHERE "rowNumber" > 1
);

CREATE UNIQUE INDEX "CourseAssignment_organizationId_courseId_membershipId_key"
ON "CourseAssignment"("organizationId", "courseId", "membershipId");
