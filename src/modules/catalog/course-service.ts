import type { CourseStatus, CourseType } from "@prisma/client";

import {
  normalizeCatalogSlug,
  requireCatalogTitle,
  requireNonNegativeBusinessDays,
  requirePositiveDurationMinutes,
} from "./catalog-validation";

export type CreateCourseInput = {
  organizationId: string;
  actorId: string;
  title: string;
  slug: string;
  description?: string;
  type: CourseType;
  status?: CourseStatus;
  categoryId?: string | null;
  tagIds?: string[];
  estimatedCompletionBusinessDays: number;
  expectedDurationMinutes: number;
};

export type CreateCourseData = Omit<CreateCourseInput, "actorId" | "tagIds"> & {
  title: string;
  slug: string;
  description: string;
  status: CourseStatus;
  categoryId: string | null;
};

export type UpdateCourseLifecycleInput = {
  organizationId: string;
  actorId: string;
  courseId: string;
  status: CourseStatus;
};

export type CoursePublishReadiness = {
  type: CourseType;
  ready: boolean;
  blockers: string[];
};

export type CourseCatalogRepository = {
  runInTransaction<T>(operation: () => Promise<T>): Promise<T>;
  findCategoryById(input: { organizationId: string; categoryId: string }): Promise<{ id: string } | null>;
  findTagsByIds(input: { organizationId: string; tagIds: string[] }): Promise<Array<{ id: string }>>;
  createCourse(data: CreateCourseData): Promise<{ id: string; slug: string }>;
  replaceCourseTags(data: { organizationId: string; courseId: string; tagIds: string[] }): Promise<void>;
  findCoursePublishReadiness(input: {
    organizationId: string;
    courseId: string;
  }): Promise<CoursePublishReadiness | null>;
  updateCourseLifecycle(data: {
    organizationId: string;
    courseId: string;
    status: CourseStatus;
  }): Promise<void>;
  recordAuditLog(data: {
    organizationId: string;
    actorId: string;
    action: string;
    targetType: string;
    targetId: string;
  }): Promise<void>;
};

export async function createCourse(
  input: CreateCourseInput,
  repository: CourseCatalogRepository,
): Promise<{ id: string; slug: string }> {
  const data: CreateCourseData = {
    organizationId: requireNonEmptyValue(input.organizationId, "Organization id is required"),
    title: requireCatalogTitle(input.title),
    slug: normalizeCatalogSlug(input.slug),
    description: input.description ?? "",
    type: input.type,
    status: input.status ?? "DRAFT",
    categoryId: input.categoryId ?? null,
    estimatedCompletionBusinessDays: requireNonNegativeBusinessDays(input.estimatedCompletionBusinessDays),
    expectedDurationMinutes: requirePositiveDurationMinutes(input.expectedDurationMinutes),
  };
  const actorId = requireNonEmptyValue(input.actorId, "Actor id is required");
  const tagIds = input.tagIds ?? [];

  if (data.categoryId) {
    const category = await repository.findCategoryById({
      organizationId: data.organizationId,
      categoryId: data.categoryId,
    });

    if (!category) {
      throw new Error("Course category does not belong to this organization");
    }
  }

  if (tagIds.length > 0) {
    const tags = await repository.findTagsByIds({
      organizationId: data.organizationId,
      tagIds,
    });
    const foundTagIds = new Set(tags.map((tag) => tag.id));

    if (tagIds.some((tagId) => !foundTagIds.has(tagId))) {
      throw new Error("Course tags do not belong to this organization");
    }
  }

  return repository.runInTransaction(async () => {
    const course = await repository.createCourse(data);

    await repository.replaceCourseTags({
      organizationId: data.organizationId,
      courseId: course.id,
      tagIds,
    });
    await repository.recordAuditLog({
      organizationId: data.organizationId,
      actorId,
      action: "course.created",
      targetType: "course",
      targetId: course.id,
    });

    return course;
  });
}

export async function updateCourseLifecycle(
  input: UpdateCourseLifecycleInput,
  repository: CourseCatalogRepository,
): Promise<void> {
  const organizationId = requireNonEmptyValue(input.organizationId, "Organization id is required");
  const actorId = requireNonEmptyValue(input.actorId, "Actor id is required");
  const courseId = requireNonEmptyValue(input.courseId, "Course id is required");

  if (input.status === "PUBLISHED") {
    await requirePublishReadiness({ organizationId, courseId }, repository);
  }

  await repository.runInTransaction(async () => {
    await repository.updateCourseLifecycle({
      organizationId,
      courseId,
      status: input.status,
    });
    await repository.recordAuditLog({
      organizationId,
      actorId,
      action: "course.lifecycle_updated",
      targetType: "course",
      targetId: courseId,
    });
  });
}

async function requirePublishReadiness(
  input: { organizationId: string; courseId: string },
  repository: CourseCatalogRepository,
): Promise<void> {
  const readiness = await repository.findCoursePublishReadiness(input);

  if (!readiness) {
    throw new Error("Course was not found");
  }

  if (!readiness.ready) {
    throw new Error(`Course cannot be published until content is ready: ${readiness.blockers.join(" ")}`);
  }
}

function requireNonEmptyValue(value: string, message: string): string {
  const normalized = value.trim();

  if (!normalized) {
    throw new Error(message);
  }

  return normalized;
}
