"use server";

import { requirePlatformOwner } from "@/lib/auth/guards";
import { createPrismaProvisionOrganizationRepository } from "@/modules/organizations/prisma-repository";
import { createProvisionOrganizationAction } from "@/modules/organizations/server-actions";

export async function provisionOrganizationFormAction(_previousState: unknown, formData: FormData) {
  const { prisma } = await import("@/lib/prisma");

  return createProvisionOrganizationAction({
    getActor: async () => {
      const context = await requirePlatformOwner();

      return {
        userId: context.userId,
        isPlatformOwner: context.isPlatformOwner,
      };
    },
    repository: createPrismaProvisionOrganizationRepository(prisma),
  })(formData);
}
