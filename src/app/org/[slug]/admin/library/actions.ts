"use server";

import { requireOrganizationUsersAdminBySlug } from "@/lib/auth/guards";
import { createPrismaGlobalLibraryRepository } from "@/modules/library/prisma-repository";
import { createTenantLibraryActions } from "@/modules/library/server-actions";
import { revalidatePath } from "next/cache";

async function getActorAndOrganization(slug: string) {
  const { context, organizationId } = await requireOrganizationUsersAdminBySlug(slug);

  return {
    actorId: context.userId,
    organizationId,
  };
}

async function createActions() {
  const { prisma } = await import("@/lib/prisma");

  return createTenantLibraryActions({
    getActorAndOrganization,
    repository: createPrismaGlobalLibraryRepository(prisma),
  });
}

export async function copyGlobalLibraryCourseFormAction(slug: string, formData: FormData) {
  const result = await (await createActions()).copyCourse(slug, formData);

  if (result.status === "success") {
    revalidatePath(`/org/${slug}/admin/library`);
    revalidatePath(`/org/${slug}/admin/catalog`);
  }

  return result;
}
