import type { CourseStatus, CourseType } from "@prisma/client";

import {
  normalizeCatalogSlug,
  requireCatalogTitle,
  requireNonNegativeBusinessDays,
  requirePositiveDurationMinutes,
} from "../catalog/catalog-validation";

export type DuplicateCopyAction = "BLOCK" | "CREATE_DUPLICATE";

export type CreateGlobalLibraryCourseInput = {
  actorId: string;
  title: string;
  slug: string;
  description?: string;
  type: CourseType;
  status?: CourseStatus;
  estimatedCompletionBusinessDays: number;
  expectedDurationMinutes: number;
};

export type GlobalLibraryCourseData = {
  title: string;
  slug: string;
  description: string;
  type: CourseType;
  status: CourseStatus;
  estimatedCompletionBusinessDays: number;
  expectedDurationMinutes: number;
  isGlobalLibraryCourse: true;
  globalLibrarySourceCourseId: null;
};

export type UpdateGlobalLibraryCourseLifecycleInput = {
  actorId: string;
  courseId: string;
  status: CourseStatus;
};

export type CopyGlobalCourseToTenantInput = {
  actorId: string;
  organizationId: string;
  globalCourseId: string;
  duplicateAction: DuplicateCopyAction;
  targetTitle?: string | null;
  targetSlug?: string | null;
};

export type GlobalLibraryTaxonomy = {
  id: string;
  name: string;
  slug: string;
};

export type GlobalLibraryModuleSnapshot = {
  id: string;
  title: string;
  slug: string;
  sortOrder: number;
};

export type GlobalLibraryVideoChapterSnapshot = {
  id: string;
  title: string;
  startSecond: number;
  endSecond: number | null;
  sortOrder: number;
};

export type GlobalLibraryVideoTranscriptCueSnapshot = {
  id: string;
  startSecond: number;
  endSecond: number | null;
  text: string;
};

export type GlobalLibraryVideoLessonSnapshot = {
  id: string;
  moduleId: string | null;
  title: string;
  slug: string;
  sortOrder: number;
  durationSeconds: number;
  required: boolean;
  providerAssetId: string | null;
  playbackUrl: string | null;
  transcriptLanguage: string;
  chapters: GlobalLibraryVideoChapterSnapshot[];
  transcriptCues: GlobalLibraryVideoTranscriptCueSnapshot[];
};

export type GlobalLibraryScormPackageSnapshot = {
  id: string;
  originalFileName: string;
  contentType: string;
  byteSize: number;
  storageKey: string;
  contentRootKey: string;
  launchPath: string;
  manifestTitle: string | null;
  active: boolean;
};

export type GlobalLibraryCourseSnapshot = {
  id: string;
  organizationId: string;
  title: string;
  slug: string;
  description: string;
  status: CourseStatus;
  type: CourseType;
  estimatedCompletionBusinessDays: number;
  expectedDurationMinutes: number;
  category: GlobalLibraryTaxonomy | null;
  tags: GlobalLibraryTaxonomy[];
  modules: GlobalLibraryModuleSnapshot[];
  videoLessons: GlobalLibraryVideoLessonSnapshot[];
  scormPackage: GlobalLibraryScormPackageSnapshot | null;
  knowledgeChecks?: unknown[];
};

export type TenantCourseCopyData = {
  organizationId: string;
  title: string;
  slug: string;
  description: string;
  status: CourseStatus;
  type: CourseType;
  estimatedCompletionBusinessDays: number;
  expectedDurationMinutes: number;
  categoryId: string | null;
  isGlobalLibraryCourse: false;
  globalLibrarySourceCourseId: string;
};

export type TenantModuleCopyData = {
  sourceModuleId: string;
  organizationId: string;
  courseId: string;
  title: string;
  slug: string;
  sortOrder: number;
};

export type TenantVideoLessonCopyData = {
  sourceLessonId: string;
  organizationId: string;
  courseId: string;
  moduleId: string | null;
  title: string;
  slug: string;
  sortOrder: number;
  durationSeconds: number;
  required: boolean;
  providerAssetId: string | null;
  playbackUrl: string | null;
  transcriptLanguage: string;
};

export type TenantVideoChapterCopyData = Omit<GlobalLibraryVideoChapterSnapshot, "id">;
export type TenantVideoTranscriptCueCopyData = Omit<GlobalLibraryVideoTranscriptCueSnapshot, "id">;

export type TenantScormPackageCopyData = Omit<GlobalLibraryScormPackageSnapshot, "id"> & {
  organizationId: string;
  courseId: string;
  uploadedByUserId: string;
};

export type GlobalLibraryRepository = {
  runInTransaction<T>(operation: () => Promise<T>): Promise<T>;
  createGlobalLibraryCourse(data: GlobalLibraryCourseData): Promise<{ id: string; slug: string }>;
  updateGlobalLibraryCourseLifecycle(input: { courseId: string; status: CourseStatus }): Promise<void>;
  findGlobalLibraryCourseById(input: { courseId: string }): Promise<GlobalLibraryCourseSnapshot | null>;
  findGlobalLibraryCourseBySlug(input: { slug: string }): Promise<GlobalLibraryCourseSnapshot | null>;
  findOrganizationLibraryAccess(input: {
    organizationId: string;
  }): Promise<{ id: string; globalLibraryEnabled: boolean } | null>;
  findTenantCopyForGlobalCourse(input: {
    organizationId: string;
    globalCourseId: string;
  }): Promise<{ id: string; slug: string } | null>;
  upsertTenantCategory(input: { organizationId: string; name: string; slug: string }): Promise<{ id: string }>;
  upsertTenantTag(input: { organizationId: string; name: string; slug: string }): Promise<{ id: string }>;
  createTenantCourse(data: TenantCourseCopyData): Promise<{ id: string; slug: string }>;
  createTenantCourseTagLinks(input: { organizationId: string; courseId: string; tagIds: string[] }): Promise<void>;
  createTenantCourseModule(data: TenantModuleCopyData): Promise<{ sourceModuleId: string; id: string }>;
  createTenantVideoLesson(data: TenantVideoLessonCopyData): Promise<{ sourceLessonId: string; id: string }>;
  createTenantVideoChapters(input: {
    organizationId: string;
    lessonId: string;
    chapters: TenantVideoChapterCopyData[];
  }): Promise<void>;
  createTenantVideoTranscriptCues(input: {
    organizationId: string;
    lessonId: string;
    cues: TenantVideoTranscriptCueCopyData[];
  }): Promise<void>;
  createTenantScormPackage(data: TenantScormPackageCopyData): Promise<void>;
  recordAuditLog(input: {
    organizationId?: string;
    actorId?: string;
    action: string;
    targetType: string;
    targetId: string;
    metadata?: Record<string, unknown>;
  }): Promise<void>;
};

export async function createGlobalLibraryCourse(
  input: CreateGlobalLibraryCourseInput,
  repository: GlobalLibraryRepository,
): Promise<{ id: string; slug: string }> {
  const actorId = requireNonEmptyValue(input.actorId, "Actor id is required");
  const data: GlobalLibraryCourseData = {
    title: requireCatalogTitle(input.title),
    slug: normalizeCatalogSlug(input.slug),
    description: input.description ?? "",
    type: input.type,
    status: input.status ?? "DRAFT",
    estimatedCompletionBusinessDays: requireNonNegativeBusinessDays(input.estimatedCompletionBusinessDays),
    expectedDurationMinutes: requirePositiveDurationMinutes(input.expectedDurationMinutes),
    isGlobalLibraryCourse: true,
    globalLibrarySourceCourseId: null,
  };

  return repository.runInTransaction(async () => {
    const course = await repository.createGlobalLibraryCourse(data);

    await repository.recordAuditLog({
      actorId,
      action: "global_library.course_created",
      targetType: "global_library_course",
      targetId: course.id,
      metadata: {
        status: data.status,
      },
    });

    return course;
  });
}

export async function updateGlobalLibraryCourseLifecycle(
  input: UpdateGlobalLibraryCourseLifecycleInput,
  repository: GlobalLibraryRepository,
): Promise<void> {
  const actorId = requireNonEmptyValue(input.actorId, "Actor id is required");
  const courseId = requireNonEmptyValue(input.courseId, "Course id is required");

  await repository.runInTransaction(async () => {
    await repository.updateGlobalLibraryCourseLifecycle({
      courseId,
      status: input.status,
    });
    await repository.recordAuditLog({
      actorId,
      action: "global_library.course_lifecycle_updated",
      targetType: "global_library_course",
      targetId: courseId,
      metadata: {
        status: input.status,
      },
    });
  });
}

export async function copyGlobalCourseToTenant(
  input: CopyGlobalCourseToTenantInput,
  repository: GlobalLibraryRepository,
): Promise<{ id: string; slug: string }> {
  const actorId = requireNonEmptyValue(input.actorId, "Actor id is required");
  const organizationId = requireNonEmptyValue(input.organizationId, "Organization id is required");
  const globalCourseId = requireNonEmptyValue(input.globalCourseId, "Global course id is required");
  const organization = await repository.findOrganizationLibraryAccess({ organizationId });

  if (!organization) {
    throw new Error("Organization was not found");
  }

  if (!organization.globalLibraryEnabled) {
    throw new Error("Global library access is disabled for this organization");
  }

  const source = await repository.findGlobalLibraryCourseById({ courseId: globalCourseId });

  if (!source) {
    throw new Error("Global library course was not found");
  }

  if (source.status !== "PUBLISHED") {
    throw new Error("Global library course is not available for copying");
  }

  const existingCopy = await repository.findTenantCopyForGlobalCourse({ organizationId, globalCourseId });
  const duplicateAction = input.duplicateAction;
  const targetSlug = normalizeCopySlug(input.targetSlug, source.slug);

  if (existingCopy && duplicateAction !== "CREATE_DUPLICATE") {
    throw new Error("Global library course is already copied into this organization");
  }

  if (existingCopy && targetSlug === existingCopy.slug) {
    throw new Error("Duplicate copy requires a distinct target slug");
  }

  const targetTitle = normalizeCopyTitle(input.targetTitle, source.title);

  return repository.runInTransaction(async () => {
    const categoryId = source.category
      ? (
          await repository.upsertTenantCategory({
            organizationId,
            name: source.category.name,
            slug: source.category.slug,
          })
        ).id
      : null;
    const tagIds: string[] = [];

    for (const tag of source.tags) {
      const tenantTag = await repository.upsertTenantTag({
        organizationId,
        name: tag.name,
        slug: tag.slug,
      });

      tagIds.push(tenantTag.id);
    }

    const tenantCourse = await repository.createTenantCourse({
      organizationId,
      title: targetTitle,
      slug: targetSlug,
      description: source.description,
      status: "DRAFT",
      type: source.type,
      estimatedCompletionBusinessDays: source.estimatedCompletionBusinessDays,
      expectedDurationMinutes: source.expectedDurationMinutes,
      categoryId,
      isGlobalLibraryCourse: false,
      globalLibrarySourceCourseId: source.id,
    });

    await repository.createTenantCourseTagLinks({
      organizationId,
      courseId: tenantCourse.id,
      tagIds,
    });

    const moduleIdBySourceId = new Map<string, string>();

    for (const sourceModule of source.modules) {
      const tenantModule = await repository.createTenantCourseModule({
        sourceModuleId: sourceModule.id,
        organizationId,
        courseId: tenantCourse.id,
        title: sourceModule.title,
        slug: sourceModule.slug,
        sortOrder: sourceModule.sortOrder,
      });

      moduleIdBySourceId.set(tenantModule.sourceModuleId, tenantModule.id);
    }

    let chapterCount = 0;
    let transcriptCueCount = 0;

    for (const sourceLesson of source.videoLessons) {
      const tenantLesson = await repository.createTenantVideoLesson({
        sourceLessonId: sourceLesson.id,
        organizationId,
        courseId: tenantCourse.id,
        moduleId: sourceLesson.moduleId ? moduleIdBySourceId.get(sourceLesson.moduleId) ?? null : null,
        title: sourceLesson.title,
        slug: sourceLesson.slug,
        sortOrder: sourceLesson.sortOrder,
        durationSeconds: sourceLesson.durationSeconds,
        required: sourceLesson.required,
        providerAssetId: sourceLesson.providerAssetId,
        playbackUrl: sourceLesson.playbackUrl,
        transcriptLanguage: sourceLesson.transcriptLanguage,
      });
      const chapters = sourceLesson.chapters.map((chapter) => ({
        title: chapter.title,
        startSecond: chapter.startSecond,
        endSecond: chapter.endSecond,
        sortOrder: chapter.sortOrder,
      }));
      const cues = sourceLesson.transcriptCues.map((cue) => ({
        startSecond: cue.startSecond,
        endSecond: cue.endSecond,
        text: cue.text,
      }));

      chapterCount += chapters.length;
      transcriptCueCount += cues.length;
      await repository.createTenantVideoChapters({
        organizationId,
        lessonId: tenantLesson.id,
        chapters,
      });
      await repository.createTenantVideoTranscriptCues({
        organizationId,
        lessonId: tenantLesson.id,
        cues,
      });
    }

    if (source.scormPackage) {
      await repository.createTenantScormPackage({
        organizationId,
        courseId: tenantCourse.id,
        originalFileName: source.scormPackage.originalFileName,
        contentType: source.scormPackage.contentType,
        byteSize: source.scormPackage.byteSize,
        storageKey: source.scormPackage.storageKey,
        contentRootKey: source.scormPackage.contentRootKey,
        launchPath: source.scormPackage.launchPath,
        manifestTitle: source.scormPackage.manifestTitle,
        active: source.scormPackage.active,
        uploadedByUserId: actorId,
      });
    }

    await repository.recordAuditLog({
      organizationId,
      actorId,
      action: "global_library.course_copied",
      targetType: "course",
      targetId: tenantCourse.id,
      metadata: {
        sourceGlobalCourseId: source.id,
        createdTenantCourseId: tenantCourse.id,
        duplicateAction,
        copied: {
          category: source.category !== null,
          tags: source.tags.length,
          modules: source.modules.length,
          videoLessons: source.videoLessons.length,
          videoChapters: chapterCount,
          videoTranscriptCues: transcriptCueCount,
          scormPackage: source.scormPackage !== null,
          knowledgeChecks: source.knowledgeChecks?.length ?? 0,
        },
      },
    });

    return tenantCourse;
  });
}

function normalizeCopyTitle(title: string | null | undefined, fallback: string): string {
  const normalized = title?.trim() ?? "";

  return normalized ? requireCatalogTitle(normalized) : fallback;
}

function normalizeCopySlug(slug: string | null | undefined, fallback: string): string {
  const normalized = slug?.trim() ?? "";

  return normalized ? normalizeCatalogSlug(normalized) : fallback;
}

function requireNonEmptyValue(value: string, message: string): string {
  const normalized = value.trim();

  if (!normalized) {
    throw new Error(message);
  }

  return normalized;
}
