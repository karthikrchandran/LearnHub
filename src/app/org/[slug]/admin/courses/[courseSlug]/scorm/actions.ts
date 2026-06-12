"use server";

import { requireOrganizationUsersAdminBySlug } from "@/lib/auth/guards";
import { createPrismaScormRepository } from "@/modules/scorm/prisma-repository";
import { createScormPackageActions } from "@/modules/scorm/server-actions";

async function getContext(slug: string, courseSlug: string) {
  const { context, organizationId } = await requireOrganizationUsersAdminBySlug(slug);
  const { prisma } = await import("@/lib/prisma");
  const course = await prisma.course.findFirst({
    where: {
      organizationId,
      slug: courseSlug,
      type: "SCORM_1_2",
    },
    select: { id: true },
  });

  if (!course) {
    throw new Error("SCORM course not found");
  }

  return {
    actorId: context.userId,
    organizationId,
    courseId: course.id,
  };
}

async function createActions() {
  const { prisma } = await import("@/lib/prisma");

  return createScormPackageActions({
    getContext,
    repository: createPrismaScormRepository(prisma),
  });
}

export async function uploadScormPackageFormAction(slug: string, courseSlug: string, formData: FormData) {
  return (await createActions()).uploadPackage(slug, courseSlug, formData);
}
