import type { CourseStatus, CourseType } from "@prisma/client";

import {
  copyGlobalCourseToTenant,
  createGlobalLibraryCourse,
  updateGlobalLibraryCourseLifecycle,
  type DuplicateCopyAction,
  type GlobalLibraryRepository,
} from "./global-library";

export type LibraryActionResult = {
  status: "success" | "error";
  message: string;
  courseSlug?: string;
};

export type PlatformLibraryActionDependencies = {
  getActor(): Promise<{ userId: string }>;
  repository: GlobalLibraryRepository;
};

export type TenantLibraryActionContext = {
  actorId: string;
  organizationId: string;
};

export type TenantLibraryActionDependencies = {
  getActorAndOrganization(slug: string): Promise<TenantLibraryActionContext>;
  repository: GlobalLibraryRepository;
};

export function createPlatformLibraryActions(dependencies: PlatformLibraryActionDependencies): {
  createCourse(formData: FormData): Promise<LibraryActionResult>;
  updateLifecycle(formData: FormData): Promise<LibraryActionResult>;
} {
  return {
    async createCourse(formData) {
      return runLibraryAction(async () => {
        const actor = await dependencies.getActor();
        const course = await createGlobalLibraryCourse(
          {
            actorId: actor.userId,
            title: readFormString(formData, "title"),
            slug: readFormString(formData, "slug"),
            description: readFormString(formData, "description"),
            type: readCourseType(formData),
            status: readCourseStatus(formData),
            estimatedCompletionBusinessDays: readInteger(formData, "estimatedCompletionBusinessDays"),
            expectedDurationMinutes: readInteger(formData, "expectedDurationMinutes"),
          },
          dependencies.repository,
        );

        return {
          message: "Global library course created.",
          courseSlug: course.slug,
        };
      });
    },
    async updateLifecycle(formData) {
      return runLibraryAction(async () => {
        const actor = await dependencies.getActor();

        await updateGlobalLibraryCourseLifecycle(
          {
            actorId: actor.userId,
            courseId: readFormString(formData, "courseId"),
            status: readCourseStatus(formData),
          },
          dependencies.repository,
        );

        return {
          message: "Global library course lifecycle updated.",
        };
      });
    },
  };
}

export function createTenantLibraryActions(dependencies: TenantLibraryActionDependencies): {
  copyCourse(slug: string, formData: FormData): Promise<LibraryActionResult>;
} {
  return {
    async copyCourse(slug, formData) {
      return runLibraryAction(async () => {
        const context = await dependencies.getActorAndOrganization(slug);
        const course = await copyGlobalCourseToTenant(
          {
            actorId: context.actorId,
            organizationId: context.organizationId,
            globalCourseId: readFormString(formData, "globalCourseId"),
            duplicateAction: readDuplicateAction(formData),
            targetTitle: readOptionalFormString(formData, "targetTitle"),
            targetSlug: readOptionalFormString(formData, "targetSlug"),
          },
          dependencies.repository,
        );

        return {
          message: "Global library course copied.",
          courseSlug: course.slug,
        };
      });
    },
  };
}

async function runLibraryAction(
  operation: () => Promise<{ message: string; courseSlug?: string }>,
): Promise<LibraryActionResult> {
  try {
    const result = await operation();

    return { status: "success", ...result };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "Library action failed",
    };
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

function readDuplicateAction(formData: FormData): DuplicateCopyAction {
  return readFormString(formData, "duplicateAction") === "CREATE_DUPLICATE" ? "CREATE_DUPLICATE" : "BLOCK";
}
