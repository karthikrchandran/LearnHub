import { describe, expect, it, vi } from "vitest";

import {
  createCourse,
  updateCourseLifecycle,
  type CourseCatalogRepository,
  type CreateCourseData,
  type CreateCourseInput,
} from "./course-service";

type TestRepository = CourseCatalogRepository & {
  calls: string[];
  categoriesByOrganization: Set<string>;
  tagsByOrganization: Set<string>;
  createdCourses: CreateCourseData[];
};

function createRepository(): TestRepository {
  const calls: string[] = [];
  const categoriesByOrganization = new Set<string>();
  const tagsByOrganization = new Set<string>();
  const createdCourses: CreateCourseData[] = [];

  return {
    calls,
    categoriesByOrganization,
    tagsByOrganization,
    createdCourses,
    runInTransaction: vi.fn(async (operation) => {
      calls.push("transaction:start");
      const result = await operation();
      calls.push("transaction:end");

      return result;
    }),
    findCategoryById: vi.fn(async ({ organizationId, categoryId }) => {
      calls.push(`category:${categoryId}`);

      return categoriesByOrganization.has(`${organizationId}:${categoryId}`) ? { id: categoryId } : null;
    }),
    findTagsByIds: vi.fn(async ({ organizationId, tagIds }: { organizationId: string; tagIds: string[] }) => {
      calls.push(`tags:${tagIds.join(",")}`);

      return tagIds
        .filter((tagId: string) => tagsByOrganization.has(`${organizationId}:${tagId}`))
        .map((id: string) => ({ id }));
    }),
    createCourse: vi.fn(async (data) => {
      calls.push(`course:${data.slug}`);
      createdCourses.push(data);

      return { id: `course_${createdCourses.length}`, slug: data.slug };
    }),
    replaceCourseTags: vi.fn(async ({ courseId, tagIds }) => {
      calls.push(`replace-tags:${courseId}:${tagIds.join(",")}`);
    }),
    updateCourseLifecycle: vi.fn(async ({ courseId, status }) => {
      calls.push(`lifecycle:${courseId}:${status}`);
    }),
    recordAuditLog: vi.fn(async ({ action, targetId }) => {
      calls.push(`audit:${action}:${targetId}`);
    }),
  };
}

const validCreateCourseInput: CreateCourseInput = {
  organizationId: "org_1",
  actorId: "actor_1",
  title: "Workplace Safety",
  slug: "workplace-safety",
  type: "NATIVE_VIDEO",
  estimatedCompletionBusinessDays: 5,
  expectedDurationMinutes: 45,
};

describe("createCourse", () => {
  it("validates title, slug, duration, and estimated business days before writes", async () => {
    const invalidCases: Array<{
      input: CreateCourseInput;
      error: string;
    }> = [
      {
        input: { ...validCreateCourseInput, title: " " },
        error: "Course title is required",
      },
      {
        input: { ...validCreateCourseInput, slug: "Workplace Safety" },
        error: "Slug must use lowercase letters, numbers, and hyphens",
      },
      {
        input: { ...validCreateCourseInput, expectedDurationMinutes: 0 },
        error: "Expected duration minutes must be positive",
      },
      {
        input: { ...validCreateCourseInput, estimatedCompletionBusinessDays: -1 },
        error: "Estimated completion business days cannot be negative",
      },
    ];

    for (const invalidCase of invalidCases) {
      const repository = createRepository();

      await expect(createCourse(invalidCase.input, repository)).rejects.toThrow(invalidCase.error);

      expect(repository.runInTransaction).not.toHaveBeenCalled();
      expect(repository.createCourse).not.toHaveBeenCalled();
      expect(repository.replaceCourseTags).not.toHaveBeenCalled();
      expect(repository.recordAuditLog).not.toHaveBeenCalled();
    }
  });

  it("rejects category ids that do not belong to the same organization", async () => {
    const repository = createRepository();

    await expect(
      createCourse({ ...validCreateCourseInput, categoryId: "category_other_org" }, repository),
    ).rejects.toThrow("Course category does not belong to this organization");

    expect(repository.findCategoryById).toHaveBeenCalledWith({
      organizationId: "org_1",
      categoryId: "category_other_org",
    });
    expect(repository.runInTransaction).not.toHaveBeenCalled();
    expect(repository.createCourse).not.toHaveBeenCalled();
    expect(repository.replaceCourseTags).not.toHaveBeenCalled();
    expect(repository.recordAuditLog).not.toHaveBeenCalled();
  });

  it("rejects tag ids that do not belong to the same organization", async () => {
    const repository = createRepository();
    repository.tagsByOrganization.add("org_1:tag_1");

    await expect(
      createCourse({ ...validCreateCourseInput, tagIds: ["tag_1", "tag_other_org"] }, repository),
    ).rejects.toThrow("Course tags do not belong to this organization");

    expect(repository.findTagsByIds).toHaveBeenCalledWith({
      organizationId: "org_1",
      tagIds: ["tag_1", "tag_other_org"],
    });
    expect(repository.runInTransaction).not.toHaveBeenCalled();
    expect(repository.createCourse).not.toHaveBeenCalled();
    expect(repository.replaceCourseTags).not.toHaveBeenCalled();
    expect(repository.recordAuditLog).not.toHaveBeenCalled();
  });

  it("wraps course creation, tag replacement, and audit logging in one repository transaction", async () => {
    const repository = createRepository();
    repository.categoriesByOrganization.add("org_1:category_1");
    repository.tagsByOrganization.add("org_1:tag_1");
    repository.tagsByOrganization.add("org_1:tag_2");

    const result = await createCourse(
      {
        ...validCreateCourseInput,
        title: " Manager Coaching 101 ",
        slug: " manager-coaching-101 ",
        categoryId: "category_1",
        tagIds: ["tag_1", "tag_2"],
      },
      repository,
    );

    expect(result).toEqual({ id: "course_1", slug: "manager-coaching-101" });
    expect(repository.runInTransaction).toHaveBeenCalledTimes(1);
    expect(repository.createCourse).toHaveBeenCalledWith({
      organizationId: "org_1",
      title: "Manager Coaching 101",
      slug: "manager-coaching-101",
      description: "",
      type: "NATIVE_VIDEO",
      status: "DRAFT",
      categoryId: "category_1",
      estimatedCompletionBusinessDays: 5,
      expectedDurationMinutes: 45,
    });
    expect(repository.replaceCourseTags).toHaveBeenCalledWith({
      organizationId: "org_1",
      courseId: "course_1",
      tagIds: ["tag_1", "tag_2"],
    });
    expect(repository.recordAuditLog).toHaveBeenCalledWith({
      organizationId: "org_1",
      actorId: "actor_1",
      action: "course.created",
      targetType: "course",
      targetId: "course_1",
    });
    expect(repository.calls).toEqual([
      "category:category_1",
      "tags:tag_1,tag_2",
      "transaction:start",
      "course:manager-coaching-101",
      "replace-tags:course_1:tag_1,tag_2",
      "audit:course.created:course_1",
      "transaction:end",
    ]);
  });
});

describe("updateCourseLifecycle", () => {
  it("allows direct lifecycle update and records audit inside one transaction", async () => {
    const repository = createRepository();

    await updateCourseLifecycle(
      {
        organizationId: "org_1",
        actorId: "actor_1",
        courseId: "course_1",
        status: "PUBLISHED",
      },
      repository,
    );

    expect(repository.runInTransaction).toHaveBeenCalledTimes(1);
    expect(repository.updateCourseLifecycle).toHaveBeenCalledWith({
      organizationId: "org_1",
      courseId: "course_1",
      status: "PUBLISHED",
    });
    expect(repository.recordAuditLog).toHaveBeenCalledWith({
      organizationId: "org_1",
      actorId: "actor_1",
      action: "course.lifecycle_updated",
      targetType: "course",
      targetId: "course_1",
    });
    expect(repository.calls).toEqual([
      "transaction:start",
      "lifecycle:course_1:PUBLISHED",
      "audit:course.lifecycle_updated:course_1",
      "transaction:end",
    ]);
  });
});
