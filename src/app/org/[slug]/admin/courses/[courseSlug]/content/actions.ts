"use server";

import { requireOrganizationUsersAdminBySlug } from "@/lib/auth/guards";
import { createPrismaVideoRepository } from "@/modules/video/prisma-repository";
import { createVideoContentActions } from "@/modules/video/server-actions";

async function getContext(slug: string, courseSlug: string) {
  const { context, organizationId } = await requireOrganizationUsersAdminBySlug(slug);
  const { prisma } = await import("@/lib/prisma");
  const course = await prisma.course.findFirst({
    where: {
      organizationId,
      slug: courseSlug,
      type: "NATIVE_VIDEO",
    },
    select: { id: true },
  });

  if (!course) {
    throw new Error("Native video course not found");
  }

  return {
    actorId: context.userId,
    organizationId,
    courseId: course.id,
  };
}

async function createActions() {
  const { prisma } = await import("@/lib/prisma");

  return createVideoContentActions({
    getContext,
    repository: createPrismaVideoRepository(prisma),
  });
}

export async function createLessonFormAction(slug: string, courseSlug: string, formData: FormData) {
  return (await createActions()).createLesson(slug, courseSlug, formData);
}

export async function replaceChaptersFormAction(slug: string, courseSlug: string, formData: FormData) {
  return (await createActions()).replaceChapters(slug, courseSlug, formData);
}

export async function replaceTranscriptFormAction(slug: string, courseSlug: string, formData: FormData) {
  return (await createActions()).replaceTranscript(slug, courseSlug, formData);
}
