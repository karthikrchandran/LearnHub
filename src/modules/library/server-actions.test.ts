import { describe, expect, it, vi } from "vitest";

import { createPlatformLibraryActions, createTenantLibraryActions } from "./server-actions";
import type { GlobalLibraryCourseSnapshot, GlobalLibraryRepository } from "./global-library";

function formData(entries: Record<string, string>): FormData {
  const data = new FormData();

  for (const [key, value] of Object.entries(entries)) {
    data.set(key, value);
  }

  return data;
}

function createRepository(): GlobalLibraryRepository {
  const globalCourse: GlobalLibraryCourseSnapshot = {
    id: "global_course_1",
    organizationId: "global_org",
    title: "Workplace Safety",
    slug: "workplace-safety",
    description: "",
    status: "PUBLISHED",
    type: "NATIVE_VIDEO",
    estimatedCompletionBusinessDays: 3,
    expectedDurationMinutes: 45,
    category: null,
    tags: [],
    modules: [],
    videoLessons: [],
    scormPackage: null,
  };

  return {
    runInTransaction: vi.fn(async (operation) => operation()),
    createGlobalLibraryCourse: vi.fn(async ({ slug }) => ({ id: "global_course_created", slug })),
    updateGlobalLibraryCourseLifecycle: vi.fn(async () => ({ changed: true })),
    findGlobalLibraryCourseById: vi.fn(async () => globalCourse),
    findGlobalLibraryCourseBySlug: vi.fn(async () => globalCourse),
    findOrganizationLibraryAccess: vi.fn(async () => ({ id: "tenant_org_1", globalLibraryEnabled: true })),
    findTenantCopyForGlobalCourse: vi.fn(async () => null),
    upsertTenantCategory: vi.fn(async () => ({ id: "category_1" })),
    upsertTenantTag: vi.fn(async () => ({ id: "tag_1" })),
    createTenantCourse: vi.fn(async ({ slug }) => ({ id: "tenant_course_1", slug })),
    createTenantCourseTagLinks: vi.fn(async () => {}),
    createTenantCourseModule: vi.fn(async ({ sourceModuleId }) => ({ sourceModuleId, id: `tenant_${sourceModuleId}` })),
    createTenantVideoLesson: vi.fn(async ({ sourceLessonId }) => ({ sourceLessonId, id: `tenant_${sourceLessonId}` })),
    createTenantVideoChapters: vi.fn(async () => {}),
    createTenantVideoTranscriptCues: vi.fn(async () => {}),
    createTenantScormPackage: vi.fn(async () => {}),
    recordAuditLog: vi.fn(async () => {}),
  };
}

describe("platform library server actions", () => {
  it("parses global course create form fields after resolving the platform actor", async () => {
    const repository = createRepository();
    const getActor = vi.fn(async () => ({ userId: "owner_1", isPlatformOwner: true }));
    const actions = createPlatformLibraryActions({ getActor, repository });

    await expect(
      actions.createCourse(
        formData({
          title: "Workplace Safety",
          slug: "workplace-safety",
          description: "Shared course",
          type: "SCORM_1_2",
          status: "PUBLISHED",
          estimatedCompletionBusinessDays: "5",
          expectedDurationMinutes: "60",
        }),
      ),
    ).resolves.toEqual({
      status: "success",
      message: "Global library course created.",
      courseSlug: "workplace-safety",
    });

    expect(getActor).toHaveBeenCalledTimes(1);
    expect(repository.createGlobalLibraryCourse).toHaveBeenCalledWith({
      title: "Workplace Safety",
      slug: "workplace-safety",
      description: "Shared course",
      type: "SCORM_1_2",
      status: "PUBLISHED",
      estimatedCompletionBusinessDays: 5,
      expectedDurationMinutes: 60,
      isGlobalLibraryCourse: true,
      globalLibrarySourceCourseId: null,
    });
  });

  it("parses global course lifecycle form fields", async () => {
    const repository = createRepository();
    const actions = createPlatformLibraryActions({
      getActor: async () => ({ userId: "owner_1", isPlatformOwner: true }),
      repository,
    });

    await expect(
      actions.updateLifecycle(formData({ courseId: "global_course_1", status: "DEPRECATED" })),
    ).resolves.toEqual({ status: "success", message: "Global library course lifecycle updated." });

    expect(repository.updateGlobalLibraryCourseLifecycle).toHaveBeenCalledWith({
      courseId: "global_course_1",
      status: "DEPRECATED",
    });
  });
});

describe("tenant library server actions", () => {
  it("parses tenant copy form fields after resolving tenant context", async () => {
    const repository = createRepository();
    const getActorAndOrganization = vi.fn(async (slug: string) => ({
      actorId: `actor_for_${slug}`,
      organizationId: "tenant_org_1",
    }));
    const actions = createTenantLibraryActions({ getActorAndOrganization, repository });

    await expect(
      actions.copyCourse(
        "acme",
        formData({
          globalCourseId: "global_course_1",
          duplicateAction: "CREATE_DUPLICATE",
          targetTitle: "Acme Safety",
          targetSlug: "acme-safety",
        }),
      ),
    ).resolves.toEqual({
      status: "success",
      message: "Global library course copied.",
      courseSlug: "acme-safety",
    });

    expect(getActorAndOrganization).toHaveBeenCalledWith("acme");
    expect(repository.createTenantCourse).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "tenant_org_1",
        title: "Acme Safety",
        slug: "acme-safety",
        globalLibrarySourceCourseId: "global_course_1",
      }),
    );
  });

  it("returns domain errors without throwing through the action boundary", async () => {
    const repository = createRepository();
    vi.mocked(repository.findOrganizationLibraryAccess).mockResolvedValueOnce({
      id: "tenant_org_1",
      globalLibraryEnabled: false,
    });
    const actions = createTenantLibraryActions({
      getActorAndOrganization: async () => ({ actorId: "admin_1", organizationId: "tenant_org_1" }),
      repository,
    });

    await expect(actions.copyCourse("acme", formData({ globalCourseId: "global_course_1" }))).resolves.toEqual({
      status: "error",
      message: "Global library access is disabled for this organization",
    });
  });
});
