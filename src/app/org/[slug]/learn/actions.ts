"use server";

import { requireOrganizationMemberBySlug } from "@/lib/auth/guards";
import { createPrismaAssignmentRepository } from "@/modules/assignments/prisma-repository";
import { createSelfEnrollAction } from "@/modules/assignments/server-actions";

async function getActorAndOrganization(slug: string) {
  const { context, organizationId } = await requireOrganizationMemberBySlug(slug);

  return { actor: context, organizationId };
}

export async function selfEnrollFormAction(slug: string, formData: FormData) {
  const { prisma } = await import("@/lib/prisma");

  return createSelfEnrollAction({
    getActorAndOrganization,
    repository: createPrismaAssignmentRepository(prisma),
  })(slug, formData);
}
