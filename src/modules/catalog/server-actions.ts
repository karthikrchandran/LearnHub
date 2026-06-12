import type { CourseStatus, CourseType } from "@prisma/client";

import {
  createCategory as createCatalogCategory,
  createTag as createCatalogTag,
  type CatalogTaxonomyRepository,
} from "./category-tag-service";
import {
  createCourse as createCatalogCourse,
  updateCourseLifecycle,
  type CourseCatalogRepository,
} from "./course-service";

export type CatalogActionResult = { status: "success" | "error"; message: string };

export type CatalogActionContext = {
  actorId: string;
  organizationId: string;
};

export type CatalogActionDependencies = {
  getActorAndOrganization(slug: string): Promise<CatalogActionContext>;
  repository: CourseCatalogRepository & CatalogTaxonomyRepository;
};

export function createCatalogActions(dependencies: CatalogActionDependencies): {
  createCategory(slug: string, formData: FormData): Promise<CatalogActionResult>;
  createTag(slug: string, formData: FormData): Promise<CatalogActionResult>;
  createCourse(slug: string, formData: FormData): Promise<CatalogActionResult>;
  updateLifecycle(slug: string, formData: FormData): Promise<CatalogActionResult>;
} {
  return {
    async createCategory(slug, formData) {
      return runCatalogAction(async () => {
        const context = await dependencies.getActorAndOrganization(slug);

        await createCatalogCategory(
          {
            organizationId: context.organizationId,
            actorId: context.actorId,
            name: readFormString(formData, "name"),
            slug: readFormString(formData, "slug"),
          },
          dependencies.repository,
        );

        return "Category created.";
      });
    },
    async createTag(slug, formData) {
      return runCatalogAction(async () => {
        const context = await dependencies.getActorAndOrganization(slug);

        await createCatalogTag(
          {
            organizationId: context.organizationId,
            actorId: context.actorId,
            name: readFormString(formData, "name"),
            slug: readFormString(formData, "slug"),
          },
          dependencies.repository,
        );

        return "Tag created.";
      });
    },
    async createCourse(slug, formData) {
      return runCatalogAction(async () => {
        const context = await dependencies.getActorAndOrganization(slug);

        await createCatalogCourse(
          {
            organizationId: context.organizationId,
            actorId: context.actorId,
            title: readFormString(formData, "title"),
            slug: readFormString(formData, "slug"),
            description: readFormString(formData, "description"),
            type: readCourseType(formData),
            status: readCourseStatus(formData),
            categoryId: readOptionalFormString(formData, "categoryId"),
            tagIds: readFormStringList(formData, "tagIds"),
            estimatedCompletionBusinessDays: readInteger(formData, "estimatedCompletionBusinessDays"),
            expectedDurationMinutes: readInteger(formData, "expectedDurationMinutes"),
          },
          dependencies.repository,
        );

        return "Course created.";
      });
    },
    async updateLifecycle(slug, formData) {
      return runCatalogAction(async () => {
        const context = await dependencies.getActorAndOrganization(slug);

        await updateCourseLifecycle(
          {
            organizationId: context.organizationId,
            actorId: context.actorId,
            courseId: readFormString(formData, "courseId"),
            status: readCourseStatus(formData),
          },
          dependencies.repository,
        );

        return "Course lifecycle updated.";
      });
    },
  };
}

async function runCatalogAction(operation: () => Promise<string>): Promise<CatalogActionResult> {
  try {
    return { status: "success", message: await operation() };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "Catalog action failed" };
  }
}

function readFormString(formData: FormData, key: string): string {
  const value = formData.get(key);

  return typeof value === "string" ? value : "";
}

function readOptionalFormString(formData: FormData, key: string): string | null {
  const value = readFormString(formData, key).trim();

  return value || null;
}

function readFormStringList(formData: FormData, key: string): string[] {
  return formData
    .getAll(key)
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter(Boolean);
}

function readInteger(formData: FormData, key: string): number {
  return Number(readFormString(formData, key));
}

function readCourseType(formData: FormData): CourseType {
  return readFormString(formData, "type") === "SCORM_1_2" ? "SCORM_1_2" : "NATIVE_VIDEO";
}

function readCourseStatus(formData: FormData): CourseStatus {
  const status = readFormString(formData, "status");

  if (status === "PUBLISHED" || status === "DEPRECATED" || status === "RETIRED") {
    return status;
  }

  return "DRAFT";
}
