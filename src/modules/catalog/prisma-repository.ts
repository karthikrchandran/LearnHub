import type { PrismaClient } from "@prisma/client";

import type { CatalogTaxonomyRepository } from "./category-tag-service";
import type { CourseCatalogRepository } from "./course-service";

type PrismaCatalogClient = Pick<
  PrismaClient,
  "$transaction" | "courseCategory" | "courseTag" | "course" | "courseTagLink" | "auditLog"
>;

export function createPrismaCatalogRepository(
  client: PrismaCatalogClient,
): CourseCatalogRepository & CatalogTaxonomyRepository {
  let transactionClient: PrismaCatalogClient | null = null;
  const activeClient = () => transactionClient ?? client;

  return {
    async runInTransaction(operation) {
      return client.$transaction(async (transaction) => {
        transactionClient = transaction as PrismaCatalogClient;

        try {
          return await operation();
        } finally {
          transactionClient = null;
        }
      });
    },
    createCategory(data) {
      return activeClient().courseCategory.create({
        data,
        select: { id: true, slug: true },
      });
    },
    createTag(data) {
      return activeClient().courseTag.create({
        data,
        select: { id: true, slug: true },
      });
    },
    findCategoryById(input) {
      return activeClient().courseCategory.findFirst({
        where: {
          id: input.categoryId,
          organizationId: input.organizationId,
        },
        select: { id: true },
      });
    },
    findTagsByIds(input) {
      return activeClient().courseTag.findMany({
        where: {
          organizationId: input.organizationId,
          id: { in: input.tagIds },
        },
        select: { id: true },
      });
    },
    createCourse(data) {
      return activeClient().course.create({
        data,
        select: { id: true, slug: true },
      });
    },
    async replaceCourseTags(input) {
      await activeClient().courseTagLink.deleteMany({
        where: {
          organizationId: input.organizationId,
          courseId: input.courseId,
        },
      });

      if (input.tagIds.length === 0) {
        return;
      }

      await activeClient().courseTagLink.createMany({
        data: input.tagIds.map((tagId) => ({
          organizationId: input.organizationId,
          courseId: input.courseId,
          tagId,
        })),
      });
    },
    async findCoursePublishReadiness(input) {
      const course = await activeClient().course.findFirst({
        where: {
          id: input.courseId,
          organizationId: input.organizationId,
        },
        select: {
          type: true,
          videoLessons: {
            select: {
              playbackUrl: true,
              providerPlaybackId: true,
              providerStatus: true,
              providerError: true,
            },
          },
          scormPackages: {
            where: { active: true },
            orderBy: { updatedAt: "desc" },
            take: 1,
            select: {
              launchPath: true,
              extractionStatus: true,
              malwareScanStatus: true,
            },
          },
        },
      });

      if (!course) {
        return null;
      }

      if (course.type === "NATIVE_VIDEO") {
        const readyLessonCount = course.videoLessons.filter((lesson) => {
          const hasPlayableSource = Boolean(lesson.playbackUrl?.trim() || lesson.providerPlaybackId?.trim());

          return hasPlayableSource && lesson.providerStatus === "READY" && !lesson.providerError;
        }).length;

        return {
          type: course.type,
          ready: readyLessonCount > 0,
          blockers: readyLessonCount > 0 ? [] : ["Add at least one ready video lesson."],
        };
      }

      const activePackage = course.scormPackages[0];
      const packageReady = Boolean(
        activePackage?.launchPath?.trim() &&
          activePackage.extractionStatus === "READY" &&
          activePackage.malwareScanStatus === "PASSED",
      );

      return {
        type: course.type,
        ready: packageReady,
        blockers: packageReady ? [] : ["Upload an active SCORM package with completed extraction and passed malware scan."],
      };
    },
    async updateCourseLifecycle(input) {
      await activeClient().course.update({
        where: {
          organizationId_id: {
            organizationId: input.organizationId,
            id: input.courseId,
          },
        },
        data: { status: input.status },
      });
    },
    async recordAuditLog(input) {
      await activeClient().auditLog.create({
        data: {
          organizationId: input.organizationId,
          actorId: input.actorId,
          action: input.action,
          targetType: input.targetType,
          targetId: input.targetId,
        },
      });
    },
  };
}
