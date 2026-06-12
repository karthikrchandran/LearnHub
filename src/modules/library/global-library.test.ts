import { describe, expect, it, vi } from "vitest";

import {
  copyGlobalCourseToTenant,
  createGlobalLibraryCourse,
  updateGlobalLibraryCourseLifecycle,
  type CopyGlobalCourseToTenantInput,
  type GlobalLibraryCourseSnapshot,
  type GlobalLibraryRepository,
  type TenantCourseCopyData,
} from "./global-library";

type TestRepository = GlobalLibraryRepository & {
  calls: string[];
  organizationAccess: { id: string; globalLibraryEnabled: boolean } | null;
  globalCourse: GlobalLibraryCourseSnapshot | null;
  existingCopy: { id: string; slug: string } | null;
  createdTenantCourses: TenantCourseCopyData[];
  auditLogs: Parameters<GlobalLibraryRepository["recordAuditLog"]>[0][];
};

const publishedGlobalCourse: GlobalLibraryCourseSnapshot = {
  id: "global_course_1",
  organizationId: "global_org",
  title: "Workplace Safety Essentials",
  slug: "workplace-safety-essentials",
  description: "Global safety course.",
  status: "PUBLISHED",
  type: "NATIVE_VIDEO",
  estimatedCompletionBusinessDays: 4,
  expectedDurationMinutes: 35,
  category: {
    id: "global_category_1",
    name: "Compliance",
    slug: "compliance",
  },
  tags: [
    {
      id: "global_tag_1",
      name: "Safety",
      slug: "safety",
    },
    {
      id: "global_tag_2",
      name: "Onboarding",
      slug: "onboarding",
    },
  ],
  modules: [
    {
      id: "global_module_1",
      title: "Foundations",
      slug: "foundations",
      sortOrder: 0,
    },
  ],
  videoLessons: [
    {
      id: "global_lesson_1",
      moduleId: "global_module_1",
      title: "Stay Alert",
      slug: "stay-alert",
      sortOrder: 0,
      durationSeconds: 180,
      required: true,
      providerAssetId: "asset_123",
      playbackUrl: null,
      transcriptLanguage: "en",
      chapters: [
        {
          id: "global_chapter_1",
          title: "Open",
          startSecond: 0,
          endSecond: 60,
          sortOrder: 0,
        },
      ],
      transcriptCues: [
        {
          id: "global_cue_1",
          startSecond: 0,
          endSecond: 20,
          text: "Welcome to safety essentials.",
        },
      ],
    },
  ],
  scormPackage: {
    id: "global_package_1",
    originalFileName: "safety.zip",
    contentType: "application/zip",
    byteSize: 4096,
    storageKey: "global/scorm/safety.zip",
    contentRootKey: "global/scorm/safety/content",
    launchPath: "index.html",
    manifestTitle: "Workplace Safety Essentials",
    active: true,
  },
};

function createRepository(): TestRepository {
  const calls: string[] = [];
  const createdTenantCourses: TenantCourseCopyData[] = [];
  const auditLogs: Parameters<GlobalLibraryRepository["recordAuditLog"]>[0][] = [];

  return {
    calls,
    organizationAccess: { id: "tenant_org_1", globalLibraryEnabled: true },
    globalCourse: publishedGlobalCourse,
    existingCopy: null,
    createdTenantCourses,
    auditLogs,
    runInTransaction: vi.fn(async (operation) => {
      calls.push("transaction:start");
      const result = await operation();
      calls.push("transaction:end");

      return result;
    }),
    createGlobalLibraryCourse: vi.fn(async (data) => {
      calls.push(`global-course:${data.slug}`);

      return { id: "global_course_created", slug: data.slug };
    }),
    updateGlobalLibraryCourseLifecycle: vi.fn(async ({ courseId, status }) => {
      calls.push(`global-lifecycle:${courseId}:${status}`);

      return { changed: true };
    }),
    findGlobalLibraryCourseById: vi.fn(async () => publishedGlobalCourse),
    findGlobalLibraryCourseBySlug: vi.fn(async () => publishedGlobalCourse),
    findOrganizationLibraryAccess: vi.fn(async () => ({ id: "tenant_org_1", globalLibraryEnabled: true })),
    findTenantCopyForGlobalCourse: vi.fn(async () => null),
    upsertTenantCategory: vi.fn(async ({ slug }) => {
      calls.push(`category:${slug}`);

      return { id: "tenant_category_1" };
    }),
    upsertTenantTag: vi.fn(async ({ slug }) => {
      calls.push(`tag:${slug}`);

      return { id: `tenant_${slug}` };
    }),
    createTenantCourse: vi.fn(async (data) => {
      calls.push(`tenant-course:${data.slug}`);
      createdTenantCourses.push(data);

      return { id: `tenant_course_${createdTenantCourses.length}`, slug: data.slug };
    }),
    createTenantCourseTagLinks: vi.fn(async ({ tagIds }) => {
      calls.push(`tag-links:${tagIds.join(",")}`);
    }),
    createTenantCourseModule: vi.fn(async ({ sourceModuleId, slug }) => {
      calls.push(`module:${slug}`);

      return { sourceModuleId, id: `tenant_${sourceModuleId}` };
    }),
    createTenantVideoLesson: vi.fn(async ({ sourceLessonId, slug }) => {
      calls.push(`lesson:${slug}`);

      return { sourceLessonId, id: `tenant_${sourceLessonId}` };
    }),
    createTenantVideoChapters: vi.fn(async ({ chapters }) => {
      calls.push(`chapters:${chapters.length}`);
    }),
    createTenantVideoTranscriptCues: vi.fn(async ({ cues }) => {
      calls.push(`transcript:${cues.length}`);
    }),
    createTenantScormPackage: vi.fn(async ({ originalFileName }) => {
      calls.push(`scorm:${originalFileName}`);
    }),
    recordAuditLog: vi.fn(async (input) => {
      calls.push(`audit:${input.action}:${input.targetId}`);
      auditLogs.push(input);
    }),
  };
}

function createCopyInput(overrides: Partial<CopyGlobalCourseToTenantInput> = {}): CopyGlobalCourseToTenantInput {
  return {
    actorId: "admin_1",
    organizationId: "tenant_org_1",
    globalCourseId: "global_course_1",
    duplicateAction: "BLOCK",
    ...overrides,
  };
}

describe("global library course lifecycle", () => {
  it("creates global library courses as platform-owned course records and audits the write", async () => {
    const repository = createRepository();

    const result = await createGlobalLibraryCourse(
      {
        actorId: "owner_1",
        title: " Workplace Safety ",
        slug: " workplace-safety ",
        description: "Shared safety course",
        type: "NATIVE_VIDEO",
        status: "PUBLISHED",
        estimatedCompletionBusinessDays: 3,
        expectedDurationMinutes: 40,
      },
      repository,
    );

    expect(result).toEqual({ id: "global_course_created", slug: "workplace-safety" });
    expect(repository.createGlobalLibraryCourse).toHaveBeenCalledWith({
      title: "Workplace Safety",
      slug: "workplace-safety",
      description: "Shared safety course",
      type: "NATIVE_VIDEO",
      status: "PUBLISHED",
      estimatedCompletionBusinessDays: 3,
      expectedDurationMinutes: 40,
      isGlobalLibraryCourse: true,
      globalLibrarySourceCourseId: null,
    });
    expect(repository.recordAuditLog).toHaveBeenCalledWith({
      actorId: "owner_1",
      action: "global_library.course_created",
      targetType: "global_library_course",
      targetId: "global_course_created",
      metadata: {
        status: "PUBLISHED",
      },
    });
    expect(repository.calls).toEqual([
      "transaction:start",
      "global-course:workplace-safety",
      "audit:global_library.course_created:global_course_created",
      "transaction:end",
    ]);
  });

  it("updates global library lifecycle state and audits the target course", async () => {
    const repository = createRepository();

    await updateGlobalLibraryCourseLifecycle(
      {
        actorId: "owner_1",
        courseId: "global_course_1",
        status: "DEPRECATED",
      },
      repository,
    );

    expect(repository.updateGlobalLibraryCourseLifecycle).toHaveBeenCalledWith({
      courseId: "global_course_1",
      status: "DEPRECATED",
    });
    expect(repository.recordAuditLog).toHaveBeenCalledWith({
      actorId: "owner_1",
      action: "global_library.course_lifecycle_updated",
      targetType: "global_library_course",
      targetId: "global_course_1",
      metadata: {
        status: "DEPRECATED",
      },
    });
  });

  it("throws without audit when lifecycle update does not match exactly one global course", async () => {
    const repository = createRepository();
    vi.mocked(repository.updateGlobalLibraryCourseLifecycle).mockImplementationOnce(async ({ courseId, status }) => {
      repository.calls.push(`global-lifecycle:${courseId}:${status}`);

      return { changed: false };
    });

    await expect(
      updateGlobalLibraryCourseLifecycle(
        {
          actorId: "owner_1",
          courseId: "missing_global_course",
          status: "PUBLISHED",
        },
        repository,
      ),
    ).rejects.toThrow("Global library course was not found");

    expect(repository.recordAuditLog).not.toHaveBeenCalled();
    expect(repository.calls).toEqual(["transaction:start", "global-lifecycle:missing_global_course:PUBLISHED"]);
  });
});

describe("copyGlobalCourseToTenant", () => {
  it("blocks copies when the organization has global library access disabled", async () => {
    const repository = createRepository();
    vi.mocked(repository.findOrganizationLibraryAccess).mockResolvedValueOnce({
      id: "tenant_org_1",
      globalLibraryEnabled: false,
    });

    await expect(copyGlobalCourseToTenant(createCopyInput(), repository)).rejects.toThrow(
      "Global library access is disabled for this organization",
    );

    expect(repository.findGlobalLibraryCourseById).not.toHaveBeenCalled();
    expect(repository.runInTransaction).not.toHaveBeenCalled();
  });

  it("requires an available published global course", async () => {
    const repository = createRepository();
    vi.mocked(repository.findGlobalLibraryCourseById).mockResolvedValueOnce(null);

    await expect(copyGlobalCourseToTenant(createCopyInput(), repository)).rejects.toThrow(
      "Global library course was not found",
    );

    vi.mocked(repository.findGlobalLibraryCourseById).mockResolvedValueOnce({
      ...publishedGlobalCourse,
      status: "DEPRECATED",
    });

    await expect(copyGlobalCourseToTenant(createCopyInput(), repository)).rejects.toThrow(
      "Global library course is not available for copying",
    );
  });

  it("blocks recopying the same source unless an explicit duplicate action is selected", async () => {
    const repository = createRepository();
    vi.mocked(repository.findTenantCopyForGlobalCourse).mockResolvedValueOnce({
      id: "tenant_course_existing",
      slug: "workplace-safety-essentials",
    });

    await expect(copyGlobalCourseToTenant(createCopyInput(), repository)).rejects.toThrow(
      "Global library course is already copied into this organization",
    );

    expect(repository.runInTransaction).not.toHaveBeenCalled();
  });

  it("rechecks duplicate copies inside the transaction for default BLOCK requests before course creation", async () => {
    const repository = createRepository();
    let copyLookupCount = 0;
    vi.mocked(repository.findTenantCopyForGlobalCourse).mockImplementation(async () => {
      copyLookupCount += 1;
      repository.calls.push(copyLookupCount === 1 ? "copy-check:pre" : "copy-check:transaction");

      return copyLookupCount === 1
        ? null
        : {
            id: "tenant_course_existing",
            slug: "workplace-safety-essentials",
          };
    });

    await expect(copyGlobalCourseToTenant(createCopyInput(), repository)).rejects.toThrow(
      "Global library course is already copied into this organization",
    );

    expect(repository.createTenantCourse).not.toHaveBeenCalled();
    expect(repository.recordAuditLog).not.toHaveBeenCalled();
    expect(repository.calls).toEqual([
      "copy-check:pre",
      "transaction:start",
      "category:compliance",
      "tag:safety",
      "tag:onboarding",
      "copy-check:transaction",
    ]);
  });

  it("allows an explicit duplicate copy when the admin supplies a distinct slug", async () => {
    const repository = createRepository();
    vi.mocked(repository.findTenantCopyForGlobalCourse).mockResolvedValueOnce({
      id: "tenant_course_existing",
      slug: "workplace-safety-essentials",
    });

    const result = await copyGlobalCourseToTenant(
      createCopyInput({
        duplicateAction: "CREATE_DUPLICATE",
        targetSlug: "workplace-safety-essentials-copy",
      }),
      repository,
    );

    expect(result).toEqual({ id: "tenant_course_1", slug: "workplace-safety-essentials-copy" });
    expect(repository.createTenantCourse).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "tenant_org_1",
        slug: "workplace-safety-essentials-copy",
        globalLibrarySourceCourseId: "global_course_1",
      }),
    );
  });

  it("copies taxonomy, video metadata, SCORM metadata, and audit metadata into tenant-owned records", async () => {
    const repository = createRepository();

    const result = await copyGlobalCourseToTenant(createCopyInput(), repository);

    expect(result).toEqual({ id: "tenant_course_1", slug: "workplace-safety-essentials" });
    expect(repository.createTenantCourse).toHaveBeenCalledWith({
      organizationId: "tenant_org_1",
      title: "Workplace Safety Essentials",
      slug: "workplace-safety-essentials",
      description: "Global safety course.",
      status: "DRAFT",
      type: "NATIVE_VIDEO",
      estimatedCompletionBusinessDays: 4,
      expectedDurationMinutes: 35,
      categoryId: "tenant_category_1",
      isGlobalLibraryCourse: false,
      globalLibrarySourceCourseId: "global_course_1",
    });
    expect(repository.createTenantCourseTagLinks).toHaveBeenCalledWith({
      organizationId: "tenant_org_1",
      courseId: "tenant_course_1",
      tagIds: ["tenant_safety", "tenant_onboarding"],
    });
    expect(repository.createTenantCourseModule).toHaveBeenCalledWith({
      sourceModuleId: "global_module_1",
      organizationId: "tenant_org_1",
      courseId: "tenant_course_1",
      title: "Foundations",
      slug: "foundations",
      sortOrder: 0,
    });
    expect(repository.createTenantVideoLesson).toHaveBeenCalledWith({
      sourceLessonId: "global_lesson_1",
      organizationId: "tenant_org_1",
      courseId: "tenant_course_1",
      moduleId: "tenant_global_module_1",
      title: "Stay Alert",
      slug: "stay-alert",
      sortOrder: 0,
      durationSeconds: 180,
      required: true,
      providerAssetId: "asset_123",
      playbackUrl: null,
      transcriptLanguage: "en",
    });
    expect(repository.createTenantVideoChapters).toHaveBeenCalledWith({
      organizationId: "tenant_org_1",
      lessonId: "tenant_global_lesson_1",
      chapters: [
        {
          title: "Open",
          startSecond: 0,
          endSecond: 60,
          sortOrder: 0,
        },
      ],
    });
    expect(repository.createTenantVideoTranscriptCues).toHaveBeenCalledWith({
      organizationId: "tenant_org_1",
      lessonId: "tenant_global_lesson_1",
      cues: [
        {
          startSecond: 0,
          endSecond: 20,
          text: "Welcome to safety essentials.",
        },
      ],
    });
    expect(repository.createTenantScormPackage).toHaveBeenCalledWith({
      organizationId: "tenant_org_1",
      courseId: "tenant_course_1",
      originalFileName: "safety.zip",
      contentType: "application/zip",
      byteSize: 4096,
      storageKey: "global/scorm/safety.zip",
      contentRootKey: "global/scorm/safety/content",
      launchPath: "index.html",
      manifestTitle: "Workplace Safety Essentials",
      active: true,
      uploadedByUserId: "admin_1",
    });
    expect(repository.recordAuditLog).toHaveBeenLastCalledWith({
      organizationId: "tenant_org_1",
      actorId: "admin_1",
      action: "global_library.course_copied",
      targetType: "course",
      targetId: "tenant_course_1",
      metadata: {
        sourceGlobalCourseId: "global_course_1",
        createdTenantCourseId: "tenant_course_1",
        duplicateAction: "BLOCK",
        copied: {
          category: true,
          tags: 2,
          modules: 1,
          videoLessons: 1,
          videoChapters: 1,
          videoTranscriptCues: 1,
          scormPackage: true,
          knowledgeChecks: 0,
        },
      },
    });
    expect(repository.calls).toEqual([
      "transaction:start",
      "category:compliance",
      "tag:safety",
      "tag:onboarding",
      "tenant-course:workplace-safety-essentials",
      "tag-links:tenant_safety,tenant_onboarding",
      "module:foundations",
      "lesson:stay-alert",
      "chapters:1",
      "transcript:1",
      "scorm:safety.zip",
      "audit:global_library.course_copied:tenant_course_1",
      "transaction:end",
    ]);
  });

  it("treats absent knowledge-check metadata as an empty copy set for Task 3 extension", async () => {
    const repository = createRepository();
    vi.mocked(repository.findGlobalLibraryCourseById).mockResolvedValueOnce({ ...publishedGlobalCourse });

    await copyGlobalCourseToTenant(createCopyInput(), repository);

    expect(repository.auditLogs[0].metadata).toMatchObject({
      copied: {
        knowledgeChecks: 0,
      },
    });
  });
});
