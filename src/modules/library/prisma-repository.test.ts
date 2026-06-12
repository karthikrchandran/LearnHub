import { describe, expect, it, vi } from "vitest";

import { createPrismaGlobalLibraryRepository } from "./prisma-repository";

function createModelMocks() {
  return {
    organization: {
      upsert: vi.fn(async () => ({ id: "global_org" })),
      findUnique: vi.fn(async () => ({ id: "tenant_org_1", globalLibraryEnabled: true })),
    },
    course: {
      create: vi.fn(async ({ data }) => ({ id: "course_1", slug: data.slug })),
      updateMany: vi.fn(async () => ({ count: 1 })),
      findFirst: vi.fn(async () => null),
    },
    courseCategory: {
      upsert: vi.fn(async () => ({ id: "category_1" })),
    },
    courseTag: {
      upsert: vi.fn(async ({ create }) => ({ id: `tag_${create.slug}` })),
    },
    courseTagLink: {
      createMany: vi.fn(async () => ({ count: 2 })),
    },
    courseModule: {
      create: vi.fn(async ({ data }) => ({ id: `module_${data.slug}` })),
    },
    videoLesson: {
      create: vi.fn(async ({ data }) => ({ id: `lesson_${data.slug}` })),
    },
    videoChapter: {
      createMany: vi.fn(async () => ({ count: 1 })),
    },
    videoTranscriptCue: {
      createMany: vi.fn(async () => ({ count: 1 })),
    },
    scormPackage: {
      create: vi.fn(async () => ({ id: "scorm_package_1" })),
    },
    auditLog: {
      create: vi.fn(async () => ({ id: "audit_1" })),
    },
  };
}

function createClient() {
  const root = createModelMocks();
  const transaction = createModelMocks();

  return {
    root: {
      ...root,
      $transaction: vi.fn(async (operation) => operation(transaction)),
    },
    transaction,
  };
}

describe("createPrismaGlobalLibraryRepository", () => {
  it("creates global courses inside the hidden global library organization", async () => {
    const { root } = createClient();
    const repository = createPrismaGlobalLibraryRepository(
      root as unknown as Parameters<typeof createPrismaGlobalLibraryRepository>[0],
    );

    await repository.createGlobalLibraryCourse({
      title: "Workplace Safety",
      slug: "workplace-safety",
      description: "Shared course",
      type: "NATIVE_VIDEO",
      status: "DRAFT",
      estimatedCompletionBusinessDays: 3,
      expectedDurationMinutes: 45,
      isGlobalLibraryCourse: true,
      globalLibrarySourceCourseId: null,
    });

    expect(root.organization.upsert).toHaveBeenCalledWith({
      where: { slug: "learnhub-global-library" },
      update: {},
      create: {
        name: "LearnHub Global Library",
        slug: "learnhub-global-library",
        status: "ACTIVE",
        allowedEmailDomains: [],
        globalLibraryEnabled: false,
      },
      select: { id: true },
    });
    expect(root.course.create).toHaveBeenCalledWith({
      data: {
        organizationId: "global_org",
        title: "Workplace Safety",
        slug: "workplace-safety",
        description: "Shared course",
        type: "NATIVE_VIDEO",
        status: "DRAFT",
        estimatedCompletionBusinessDays: 3,
        expectedDurationMinutes: 45,
        isGlobalLibraryCourse: true,
        globalLibrarySourceCourseId: null,
      },
      select: { id: true, slug: true },
    });
  });

  it("filters global course reads to global-library records", async () => {
    const { root } = createClient();
    const repository = createPrismaGlobalLibraryRepository(
      root as unknown as Parameters<typeof createPrismaGlobalLibraryRepository>[0],
    );

    await repository.findGlobalLibraryCourseById({ courseId: "global_course_1" });
    await repository.findGlobalLibraryCourseBySlug({ slug: "workplace-safety" });

    expect(root.course.findFirst).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: { id: "global_course_1", organizationId: "global_org", isGlobalLibraryCourse: true },
      }),
    );
    expect(root.course.findFirst).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: { slug: "workplace-safety", organizationId: "global_org", isGlobalLibraryCourse: true },
      }),
    );
  });

  it("reports whether exactly one hidden global-library course lifecycle row changed", async () => {
    const { root } = createClient();
    const repository = createPrismaGlobalLibraryRepository(
      root as unknown as Parameters<typeof createPrismaGlobalLibraryRepository>[0],
    );

    await expect(
      repository.updateGlobalLibraryCourseLifecycle({
        courseId: "global_course_1",
        status: "RETIRED",
      }),
    ).resolves.toEqual({ changed: true });
    expect(root.course.updateMany).toHaveBeenCalledWith({
      where: {
        id: "global_course_1",
        organizationId: "global_org",
        isGlobalLibraryCourse: true,
      },
      data: { status: "RETIRED" },
    });

    root.course.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(
      repository.updateGlobalLibraryCourseLifecycle({
        courseId: "missing",
        status: "RETIRED",
      }),
    ).resolves.toEqual({ changed: false });
  });

  it("looks up existing tenant copies by target organization and global source", async () => {
    const { root } = createClient();
    const repository = createPrismaGlobalLibraryRepository(
      root as unknown as Parameters<typeof createPrismaGlobalLibraryRepository>[0],
    );

    await repository.findTenantCopyForGlobalCourse({
      organizationId: "tenant_org_1",
      globalCourseId: "global_course_1",
    });

    expect(root.course.findFirst).toHaveBeenCalledWith({
      where: {
        organizationId: "tenant_org_1",
        globalLibrarySourceCourseId: "global_course_1",
      },
      select: { id: true, slug: true },
      orderBy: { createdAt: "asc" },
    });
  });

  it("uses the active transaction client for tenant copy writes", async () => {
    const { root, transaction } = createClient();
    const repository = createPrismaGlobalLibraryRepository(
      root as unknown as Parameters<typeof createPrismaGlobalLibraryRepository>[0],
    );

    await repository.runInTransaction(async () => {
      await repository.upsertTenantCategory({
        organizationId: "tenant_org_1",
        name: "Compliance",
        slug: "compliance",
      });
      await repository.upsertTenantTag({
        organizationId: "tenant_org_1",
        name: "Safety",
        slug: "safety",
      });
      await repository.createTenantCourse({
        organizationId: "tenant_org_1",
        title: "Workplace Safety",
        slug: "workplace-safety",
        description: "",
        status: "DRAFT",
        type: "NATIVE_VIDEO",
        estimatedCompletionBusinessDays: 3,
        expectedDurationMinutes: 45,
        categoryId: "category_1",
        isGlobalLibraryCourse: false,
        globalLibrarySourceCourseId: "global_course_1",
      });
      await repository.createTenantCourseTagLinks({
        organizationId: "tenant_org_1",
        courseId: "course_1",
        tagIds: ["tag_1"],
      });
      await repository.createTenantCourseModule({
        sourceModuleId: "module_source",
        organizationId: "tenant_org_1",
        courseId: "course_1",
        title: "Intro",
        slug: "intro",
        sortOrder: 0,
      });
      await repository.createTenantVideoLesson({
        sourceLessonId: "lesson_source",
        organizationId: "tenant_org_1",
        courseId: "course_1",
        moduleId: "module_intro",
        title: "Welcome",
        slug: "welcome",
        sortOrder: 0,
        durationSeconds: 60,
        required: true,
        providerAssetId: null,
        playbackUrl: "https://video.test/welcome.mp4",
        transcriptLanguage: "en",
      });
      await repository.createTenantVideoChapters({
        organizationId: "tenant_org_1",
        lessonId: "lesson_welcome",
        chapters: [{ title: "Open", startSecond: 0, endSecond: null, sortOrder: 0 }],
      });
      await repository.createTenantVideoTranscriptCues({
        organizationId: "tenant_org_1",
        lessonId: "lesson_welcome",
        cues: [{ startSecond: 0, endSecond: null, text: "Welcome" }],
      });
      await repository.createTenantScormPackage({
        organizationId: "tenant_org_1",
        courseId: "course_1",
        originalFileName: "course.zip",
        contentType: "application/zip",
        byteSize: 1024,
        storageKey: "global/course.zip",
        contentRootKey: "global/course/content",
        launchPath: "index.html",
        manifestTitle: "Course",
        active: true,
        uploadedByUserId: "admin_1",
      });
      await repository.recordAuditLog({
        organizationId: "tenant_org_1",
        actorId: "admin_1",
        action: "global_library.course_copied",
        targetType: "course",
        targetId: "course_1",
        metadata: { sourceGlobalCourseId: "global_course_1" },
      });
    });

    expect(root.$transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: "Serializable" });
    expect(root.courseCategory.upsert).not.toHaveBeenCalled();
    expect(root.course.create).not.toHaveBeenCalled();
    expect(root.auditLog.create).not.toHaveBeenCalled();
    expect(transaction.courseCategory.upsert).toHaveBeenCalledTimes(1);
    expect(transaction.courseTag.upsert).toHaveBeenCalledTimes(1);
    expect(transaction.course.create).toHaveBeenCalledTimes(1);
    expect(transaction.courseTagLink.createMany).toHaveBeenCalledTimes(1);
    expect(transaction.courseModule.create).toHaveBeenCalledTimes(1);
    expect(transaction.videoLesson.create).toHaveBeenCalledTimes(1);
    expect(transaction.videoChapter.createMany).toHaveBeenCalledTimes(1);
    expect(transaction.videoTranscriptCue.createMany).toHaveBeenCalledTimes(1);
    expect(transaction.scormPackage.create).toHaveBeenCalledTimes(1);
    expect(transaction.auditLog.create).toHaveBeenCalledTimes(1);
  });
});
