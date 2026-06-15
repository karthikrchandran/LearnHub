"use server";

import type { CourseStatus, CourseType } from "@prisma/client";
import { redirect } from "next/navigation";

import { requireOrganizationUsersAdminBySlug } from "@/lib/auth/guards";
import { createCourse } from "@/modules/catalog/course-service";
import { createPrismaCatalogRepository } from "@/modules/catalog/prisma-repository";

export async function createAdminCourseFormAction(slug: string, formData: FormData) {
  const { context, organizationId } = await requireOrganizationUsersAdminBySlug(slug);
  const { prisma } = await import("@/lib/prisma");
  const type = readCourseType(formData);
  let courseSlug = "";

  try {
    const course = await createCourse(
      {
        organizationId,
        actorId: context.userId,
        title: readFormString(formData, "title"),
        slug: readFormString(formData, "slug"),
        description: readFormString(formData, "description"),
        type,
        status: readCourseStatus(formData),
        categoryId: readOptionalFormString(formData, "categoryId"),
        tagIds: readFormStringList(formData, "tagIds"),
        estimatedCompletionBusinessDays: readInteger(formData, "estimatedCompletionBusinessDays"),
        expectedDurationMinutes: readInteger(formData, "expectedDurationMinutes"),
      },
      createPrismaCatalogRepository(prisma),
    );
    courseSlug = course.slug;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Course creation failed";

    redirect(`/org/${encodeURIComponent(slug)}/admin/courses/new?error=${encodeURIComponent(message)}`);
  }

  if (type === "SCORM_1_2") {
    redirect(`/org/${encodeURIComponent(slug)}/admin/courses/${encodeURIComponent(courseSlug)}/scorm`);
  }

  redirect(`/org/${encodeURIComponent(slug)}/admin/courses/${encodeURIComponent(courseSlug)}/content`);
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
  return readFormString(formData, "status") === "PUBLISHED" ? "PUBLISHED" : "DRAFT";
}
