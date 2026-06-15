import { describe, expect, it, vi } from "vitest";

import { createCatalogActions, type CatalogActionDependencies } from "./server-actions";
import type { CatalogTaxonomyRepository } from "./category-tag-service";
import type { CourseCatalogRepository } from "./course-service";

function formData(entries: Record<string, string | string[]>): FormData {
  const data = new FormData();

  for (const [key, value] of Object.entries(entries)) {
    for (const item of Array.isArray(value) ? value : [value]) {
      data.append(key, item);
    }
  }

  return data;
}

function createRepository(): CourseCatalogRepository & CatalogTaxonomyRepository {
  return {
    runInTransaction: vi.fn(async (operation) => operation()),
    findCategoryById: vi.fn(async ({ categoryId }) => (categoryId === "category_1" ? { id: categoryId } : null)),
    findTagsByIds: vi.fn(async ({ tagIds }) => tagIds.map((id: string) => ({ id }))),
    createCategory: vi.fn(async ({ slug }) => ({ id: "category_1", slug })),
    createTag: vi.fn(async ({ slug }) => ({ id: "tag_1", slug })),
    createCourse: vi.fn(async ({ slug }) => ({ id: "course_1", slug })),
    replaceCourseTags: vi.fn(async () => {}),
    findCoursePublishReadiness: vi.fn(async () => ({
      type: "NATIVE_VIDEO" as const,
      ready: true,
      blockers: [],
    })),
    updateCourseLifecycle: vi.fn(async () => {}),
    recordAuditLog: vi.fn(async () => {}),
  };
}

function createDependencies(): CatalogActionDependencies & {
  calls: string[];
  repository: CourseCatalogRepository & CatalogTaxonomyRepository;
} {
  const calls: string[] = [];
  const repository = createRepository();

  return {
    calls,
    repository,
    getActorAndOrganization: vi.fn(async (slug) => {
      calls.push(`context:${slug}`);

      return { actorId: "actor_1", organizationId: "org_1" };
    }),
  };
}

describe("catalog server actions", () => {
  it("parses create category and create tag form fields after resolving context", async () => {
    const dependencies = createDependencies();
    const actions = createCatalogActions(dependencies);

    await expect(
      actions.createCategory("acme", formData({ name: "Safety", slug: "safety" })),
    ).resolves.toEqual({ status: "success", message: "Category created." });
    await expect(
      actions.createTag("acme", formData({ name: "Leadership", slug: "leadership" })),
    ).resolves.toEqual({ status: "success", message: "Tag created." });

    expect(dependencies.getActorAndOrganization).toHaveBeenCalledWith("acme");
    expect(dependencies.repository.createCategory).toHaveBeenCalledWith({
      organizationId: "org_1",
      name: "Safety",
      slug: "safety",
    });
    expect(dependencies.repository.createTag).toHaveBeenCalledWith({
      organizationId: "org_1",
      name: "Leadership",
      slug: "leadership",
    });
    expect(dependencies.calls[0]).toBe("context:acme");
  });

  it("parses create course and lifecycle update form fields", async () => {
    const dependencies = createDependencies();
    const actions = createCatalogActions(dependencies);

    await expect(
      actions.createCourse(
        "acme",
        formData({
          title: "Manager Coaching",
          slug: "manager-coaching",
          description: "Demo course",
          type: "SCORM_1_2",
          status: "PUBLISHED",
          categoryId: "category_1",
          tagIds: ["tag_1", "tag_2"],
          estimatedCompletionBusinessDays: "3",
          expectedDurationMinutes: "45",
        }),
      ),
    ).resolves.toEqual({ status: "success", message: "Course created." });

    await expect(
      actions.updateLifecycle("acme", formData({ courseId: "course_1", status: "DEPRECATED" })),
    ).resolves.toEqual({ status: "success", message: "Course lifecycle updated." });

    expect(dependencies.repository.createCourse).toHaveBeenCalledWith({
      organizationId: "org_1",
      title: "Manager Coaching",
      slug: "manager-coaching",
      description: "Demo course",
      type: "SCORM_1_2",
      status: "PUBLISHED",
      categoryId: "category_1",
      estimatedCompletionBusinessDays: 3,
      expectedDurationMinutes: 45,
    });
    expect(dependencies.repository.replaceCourseTags).toHaveBeenCalledWith({
      organizationId: "org_1",
      courseId: "course_1",
      tagIds: ["tag_1", "tag_2"],
    });
    expect(dependencies.repository.updateCourseLifecycle).toHaveBeenCalledWith({
      organizationId: "org_1",
      courseId: "course_1",
      status: "DEPRECATED",
    });
  });

  it("returns domain errors without throwing through the action boundary", async () => {
    const dependencies = createDependencies();
    const actions = createCatalogActions(dependencies);

    await expect(actions.createCategory("acme", formData({ name: " ", slug: "bad slug" }))).resolves.toEqual({
      status: "error",
      message: "Course title is required",
    });
  });
});
