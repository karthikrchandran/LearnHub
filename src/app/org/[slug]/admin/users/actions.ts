"use server";

import { requireOrganizationUsersAdminBySlug } from "@/lib/auth/guards";
import { createPrismaUserImportRepository } from "@/modules/users/prisma-repository";
import {
  createCommitUserImportAction,
  createValidateUserImportAction,
  type OrganizationImportContext,
} from "@/modules/users/server-actions";

async function getOrganizationImportContext(slug: string): Promise<OrganizationImportContext | null> {
  await requireOrganizationUsersAdminBySlug(slug);
  const { prisma } = await import("@/lib/prisma");

  const organization = await prisma.organization.findUnique({
    where: { slug },
    select: {
      id: true,
      allowedEmailDomains: true,
      memberships: {
        where: {
          status: "ACTIVE",
          roles: { has: "MANAGER" },
        },
        select: {
          user: {
            select: {
              email: true,
            },
          },
        },
      },
    },
  });

  if (!organization) {
    return null;
  }

  return {
    organizationId: organization.id,
    allowedEmailDomains: organization.allowedEmailDomains,
    existingManagerEmails: organization.memberships.map((membership) => membership.user.email),
  };
}

export async function validateUserImportFormAction(slug: string, _previousState: unknown, formData: FormData) {
  return createValidateUserImportAction({
    getOrganizationImportContext,
  })(slug, formData);
}

export async function commitUserImportFormAction(slug: string, _previousState: unknown, formData: FormData) {
  const { prisma } = await import("@/lib/prisma");

  return createCommitUserImportAction({
    getActor: async () => {
      const { context } = await requireOrganizationUsersAdminBySlug(slug);

      return { userId: context.userId };
    },
    getOrganizationImportContext,
    repository: createPrismaUserImportRepository(prisma),
    now: () => new Date(),
  })(slug, formData);
}
