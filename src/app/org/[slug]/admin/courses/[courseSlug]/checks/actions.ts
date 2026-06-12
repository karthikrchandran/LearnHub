"use server";

import { requireOrganizationUsersAdminBySlug } from "@/lib/auth/guards";
import { createPrismaKnowledgeCheckRepository } from "@/modules/assessments/prisma-repository";
import { createKnowledgeCheckAdminActions } from "@/modules/assessments/server-actions";

async function getActorAndCourse(slug: string, courseSlug: string) {
  const { context, organizationId } = await requireOrganizationUsersAdminBySlug(slug);
  const { prisma } = await import("@/lib/prisma");
  const course = await prisma.course.findFirst({
    where: { organizationId, slug: courseSlug },
    select: { id: true },
  });

  if (!course) {
    throw new Error("Course was not found");
  }

  return { organizationId, courseId: course.id, actorId: context.userId };
}

async function createActions() {
  const { prisma } = await import("@/lib/prisma");

  return createKnowledgeCheckAdminActions({
    getActorAndCourse,
    repository: createPrismaKnowledgeCheckRepository(prisma),
  });
}

export async function createCheckFormAction(slug: string, courseSlug: string, formData: FormData) {
  return (await createActions()).createCheck(slug, courseSlug, formData);
}

export async function updateCheckFormAction(slug: string, courseSlug: string, checkId: string, formData: FormData) {
  return (await createActions()).updateCheck(slug, courseSlug, checkId, formData);
}

export async function reorderChecksFormAction(slug: string, courseSlug: string, formData: FormData) {
  return (await createActions()).reorderChecks(slug, courseSlug, formData);
}

export async function activateCheckFormAction(slug: string, courseSlug: string, checkId: string) {
  return (await createActions()).activateCheck(slug, courseSlug, checkId);
}

export async function deactivateCheckFormAction(slug: string, courseSlug: string, checkId: string) {
  return (await createActions()).deactivateCheck(slug, courseSlug, checkId);
}
