"use server";

import { requireOrganizationUsersAdminBySlug } from "@/lib/auth/guards";
import {
  createPrismaUserImportRepository,
  createPrismaUserLifecycleRepository,
} from "@/modules/users/prisma-repository";
import {
  createCommitUserImportAction,
  createIssueOrganizationUserPasswordResetAction,
  createResendOrganizationUserInvitationAction,
  createUpdateOrganizationUserLifecycleAction,
  createValidateUserImportAction,
  type OrganizationImportContext,
} from "@/modules/users/server-actions";
import { revalidatePath } from "next/cache";

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

async function getOrganizationIdBySlug(slug: string): Promise<string | null> {
  await requireOrganizationUsersAdminBySlug(slug);
  const { prisma } = await import("@/lib/prisma");
  const organization = await prisma.organization.findUnique({
    where: { slug },
    select: { id: true },
  });

  return organization?.id ?? null;
}

async function getActorForOrganization(slug: string) {
  const { context } = await requireOrganizationUsersAdminBySlug(slug);

  return context;
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

export async function updateOrganizationUserLifecycleFormAction(
  slug: string,
  formData: FormData,
) {
  const { prisma } = await import("@/lib/prisma");
  const result = await createUpdateOrganizationUserLifecycleAction({
    getActor: () => getActorForOrganization(slug),
    getOrganizationIdBySlug,
    repository: createPrismaUserLifecycleRepository(prisma),
  })(slug, formData);

  if (result.status === "success") {
    revalidatePath(`/org/${slug}/admin/users`);
  }

  return result;
}

export async function resendOrganizationUserInvitationFormAction(
  slug: string,
  formData: FormData,
) {
  const { prisma } = await import("@/lib/prisma");
  const result = await createResendOrganizationUserInvitationAction({
    getActor: () => getActorForOrganization(slug),
    getOrganizationIdBySlug,
    repository: createPrismaUserLifecycleRepository(prisma),
    now: () => new Date(),
  })(slug, formData);

  if (result.status === "success") {
    revalidatePath(`/org/${slug}/admin/users`);
  }

  return result;
}

export async function issueOrganizationUserPasswordResetFormAction(
  slug: string,
  formData: FormData,
) {
  const [{ env }, { prisma }, { createEmailProviderFromEnv }] = await Promise.all([
    import("@/lib/env"),
    import("@/lib/prisma"),
    import("@/modules/providers/email/email-provider"),
  ]);
  const emailProvider = createEmailProviderFromEnv(env, process.env.NODE_ENV);
  const result = await createIssueOrganizationUserPasswordResetAction({
    getActor: () => getActorForOrganization(slug),
    getOrganizationIdBySlug,
    repository: createPrismaUserLifecycleRepository(prisma),
    now: () => new Date(),
    sendPasswordReset: async ({ email, rawToken, expiresAt }) => {
      const resetUrl = `${env.APP_BASE_URL}/reset-password/${rawToken}`;

      await emailProvider.send({
        to: email,
        subject: "Reset your LearnHub password",
        html: `<p>Reset your LearnHub password: <a href="${resetUrl}">${resetUrl}</a></p>`,
        text: `Reset your LearnHub password: ${resetUrl}. This link expires at ${expiresAt.toISOString()}.`,
      });
    },
  })(slug, formData);

  if (result.status === "success") {
    revalidatePath(`/org/${slug}/admin/users`);
  }

  return result;
}
