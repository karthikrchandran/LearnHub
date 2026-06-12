import type { Prisma, PrismaClient } from "@prisma/client";

import type {
  GlobalLibraryCourseSnapshot,
  GlobalLibraryRepository,
} from "./global-library";

type PrismaGlobalLibraryClient = Pick<
  PrismaClient,
  | "$transaction"
  | "organization"
  | "course"
  | "courseCategory"
  | "courseTag"
  | "courseTagLink"
  | "courseModule"
  | "videoLesson"
  | "videoChapter"
  | "videoTranscriptCue"
  | "scormPackage"
  | "auditLog"
>;

const globalLibraryOrganization = {
  name: "LearnHub Global Library",
  slug: "learnhub-global-library",
  status: "ACTIVE" as const,
  allowedEmailDomains: [] as string[],
  globalLibraryEnabled: false,
};

const globalCourseSelect = {
  id: true,
  organizationId: true,
  title: true,
  slug: true,
  description: true,
  status: true,
  type: true,
  estimatedCompletionBusinessDays: true,
  expectedDurationMinutes: true,
  category: {
    select: {
      id: true,
      name: true,
      slug: true,
    },
  },
  tagLinks: {
    orderBy: { tag: { name: "asc" } },
    select: {
      tag: {
        select: {
          id: true,
          name: true,
          slug: true,
        },
      },
    },
  },
  modules: {
    orderBy: { sortOrder: "asc" },
    select: {
      id: true,
      title: true,
      slug: true,
      sortOrder: true,
    },
  },
  videoLessons: {
    orderBy: { sortOrder: "asc" },
    select: {
      id: true,
      moduleId: true,
      title: true,
      slug: true,
      sortOrder: true,
      durationSeconds: true,
      required: true,
      providerAssetId: true,
      playbackUrl: true,
      transcriptLanguage: true,
      chapters: {
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          title: true,
          startSecond: true,
          endSecond: true,
          sortOrder: true,
        },
      },
      transcriptCues: {
        orderBy: { startSecond: "asc" },
        select: {
          id: true,
          startSecond: true,
          endSecond: true,
          text: true,
        },
      },
    },
  },
  scormPackages: {
    where: { active: true },
    take: 1,
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      originalFileName: true,
      contentType: true,
      byteSize: true,
      storageKey: true,
      contentRootKey: true,
      launchPath: true,
      manifestTitle: true,
      active: true,
    },
  },
} as const;

type GlobalCourseRecord = Prisma.CourseGetPayload<{ select: typeof globalCourseSelect }>;

type GlobalLibraryOrganizationClient = Pick<PrismaGlobalLibraryClient, "organization">;

export async function ensureGlobalLibraryOrganization(
  client: GlobalLibraryOrganizationClient,
): Promise<{ id: string }> {
  return client.organization.upsert({
    where: { slug: globalLibraryOrganization.slug },
    update: {},
    create: globalLibraryOrganization,
    select: { id: true },
  });
}

export function createPrismaGlobalLibraryRepository(client: PrismaGlobalLibraryClient): GlobalLibraryRepository {
  let transactionClient: PrismaGlobalLibraryClient | null = null;
  const activeClient = () => transactionClient ?? client;

  return {
    async runInTransaction(operation) {
      return client.$transaction(
        async (transaction) => {
          transactionClient = transaction as PrismaGlobalLibraryClient;

          try {
            return await operation();
          } finally {
            transactionClient = null;
          }
        },
        { isolationLevel: "Serializable" },
      );
    },
    async createGlobalLibraryCourse(data) {
      const organization = await ensureGlobalLibraryOrganization(activeClient());

      return activeClient().course.create({
        data: {
          organizationId: organization.id,
          title: data.title,
          slug: data.slug,
          description: data.description,
          type: data.type,
          status: data.status,
          estimatedCompletionBusinessDays: data.estimatedCompletionBusinessDays,
          expectedDurationMinutes: data.expectedDurationMinutes,
          isGlobalLibraryCourse: data.isGlobalLibraryCourse,
          globalLibrarySourceCourseId: data.globalLibrarySourceCourseId,
        },
        select: { id: true, slug: true },
      });
    },
    async updateGlobalLibraryCourseLifecycle(input) {
      const organization = await ensureGlobalLibraryOrganization(activeClient());
      const result = await activeClient().course.updateMany({
        where: {
          id: input.courseId,
          organizationId: organization.id,
          isGlobalLibraryCourse: true,
        },
        data: { status: input.status },
      });

      return { changed: result.count === 1 };
    },
    async findGlobalLibraryCourseById(input) {
      const organization = await ensureGlobalLibraryOrganization(activeClient());
      const course = await activeClient().course.findFirst({
        where: { id: input.courseId, organizationId: organization.id, isGlobalLibraryCourse: true },
        select: globalCourseSelect,
      });

      return course ? mapGlobalCourse(course) : null;
    },
    async findGlobalLibraryCourseBySlug(input) {
      const organization = await ensureGlobalLibraryOrganization(activeClient());
      const course = await activeClient().course.findFirst({
        where: { slug: input.slug, organizationId: organization.id, isGlobalLibraryCourse: true },
        select: globalCourseSelect,
      });

      return course ? mapGlobalCourse(course) : null;
    },
    findOrganizationLibraryAccess(input) {
      return activeClient().organization.findUnique({
        where: { id: input.organizationId },
        select: {
          id: true,
          globalLibraryEnabled: true,
        },
      });
    },
    findTenantCopyForGlobalCourse(input) {
      return activeClient().course.findFirst({
        where: {
          organizationId: input.organizationId,
          globalLibrarySourceCourseId: input.globalCourseId,
        },
        select: { id: true, slug: true },
        orderBy: { createdAt: "asc" },
      });
    },
    upsertTenantCategory(input) {
      return activeClient().courseCategory.upsert({
        where: {
          organizationId_slug: {
            organizationId: input.organizationId,
            slug: input.slug,
          },
        },
        update: {
          name: input.name,
        },
        create: {
          organizationId: input.organizationId,
          name: input.name,
          slug: input.slug,
        },
        select: { id: true },
      });
    },
    upsertTenantTag(input) {
      return activeClient().courseTag.upsert({
        where: {
          organizationId_slug: {
            organizationId: input.organizationId,
            slug: input.slug,
          },
        },
        update: {
          name: input.name,
        },
        create: {
          organizationId: input.organizationId,
          name: input.name,
          slug: input.slug,
        },
        select: { id: true },
      });
    },
    createTenantCourse(data) {
      return activeClient().course.create({
        data,
        select: { id: true, slug: true },
      });
    },
    async createTenantCourseTagLinks(input) {
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
    async createTenantCourseModule(data) {
      const createdModule = await activeClient().courseModule.create({
        data: {
          organizationId: data.organizationId,
          courseId: data.courseId,
          title: data.title,
          slug: data.slug,
          sortOrder: data.sortOrder,
        },
        select: { id: true },
      });

      return { sourceModuleId: data.sourceModuleId, id: createdModule.id };
    },
    async createTenantVideoLesson(data) {
      const lesson = await activeClient().videoLesson.create({
        data: {
          organizationId: data.organizationId,
          courseId: data.courseId,
          moduleId: data.moduleId,
          title: data.title,
          slug: data.slug,
          sortOrder: data.sortOrder,
          durationSeconds: data.durationSeconds,
          required: data.required,
          providerAssetId: data.providerAssetId,
          playbackUrl: data.playbackUrl,
          transcriptLanguage: data.transcriptLanguage,
        },
        select: { id: true },
      });

      return { sourceLessonId: data.sourceLessonId, id: lesson.id };
    },
    async createTenantVideoChapters(input) {
      if (input.chapters.length === 0) {
        return;
      }

      await activeClient().videoChapter.createMany({
        data: input.chapters.map((chapter) => ({
          organizationId: input.organizationId,
          lessonId: input.lessonId,
          title: chapter.title,
          startSecond: chapter.startSecond,
          endSecond: chapter.endSecond,
          sortOrder: chapter.sortOrder,
        })),
      });
    },
    async createTenantVideoTranscriptCues(input) {
      if (input.cues.length === 0) {
        return;
      }

      await activeClient().videoTranscriptCue.createMany({
        data: input.cues.map((cue) => ({
          organizationId: input.organizationId,
          lessonId: input.lessonId,
          startSecond: cue.startSecond,
          endSecond: cue.endSecond,
          text: cue.text,
        })),
      });
    },
    async createTenantScormPackage(data) {
      await activeClient().scormPackage.create({
        data: {
          organizationId: data.organizationId,
          courseId: data.courseId,
          originalFileName: data.originalFileName,
          contentType: data.contentType,
          byteSize: data.byteSize,
          storageKey: data.storageKey,
          contentRootKey: data.contentRootKey,
          launchPath: data.launchPath,
          manifestTitle: data.manifestTitle,
          active: data.active,
          uploadedByUserId: data.uploadedByUserId,
        },
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
          metadata: (input.metadata ?? {}) as Prisma.InputJsonObject,
        },
      });
    },
  };
}

function mapGlobalCourse(course: GlobalCourseRecord): GlobalLibraryCourseSnapshot {
  return {
    id: course.id,
    organizationId: course.organizationId,
    title: course.title,
    slug: course.slug,
    description: course.description,
    status: course.status,
    type: course.type,
    estimatedCompletionBusinessDays: course.estimatedCompletionBusinessDays,
    expectedDurationMinutes: course.expectedDurationMinutes,
    category: course.category,
    tags: course.tagLinks.map((link) => link.tag),
    modules: course.modules,
    videoLessons: course.videoLessons,
    scormPackage: course.scormPackages[0] ?? null,
    knowledgeChecks: [],
  };
}
