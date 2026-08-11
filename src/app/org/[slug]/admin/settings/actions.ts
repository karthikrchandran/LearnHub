"use server";

import { requireOrganizationUsersAdminBySlug } from "@/lib/auth/guards";
import { createPrismaOrganizationSettingsRepository } from "@/modules/organizations/prisma-repository";
import {
  createUpdateOrganizationBrandingAction,
  createUpdateOrganizationReportAccessAction,
} from "@/modules/organizations/server-actions";
import { revalidatePath } from "next/cache";

async function getOrganizationIdBySlug(slug: string): Promise<string | null> {
  const { prisma } = await import("@/lib/prisma");
  const organization = await prisma.organization.findUnique({
    where: { slug },
    select: { id: true },
  });

  return organization?.id ?? null;
}

export async function updateOrganizationBrandingFormAction(
  slug: string,
  formData: FormData,
) {
  const { prisma } = await import("@/lib/prisma");
  const action = createUpdateOrganizationBrandingAction({
    getActor: async () => {
      const { context } = await requireOrganizationUsersAdminBySlug(slug);

      return context;
    },
    getOrganizationIdBySlug,
    repository: createPrismaOrganizationSettingsRepository(prisma),
  });
  const result = await action(slug, formData);

  if (result.status === "success") {
    revalidatePath(`/org/${slug}`);
    revalidatePath(`/org/${slug}/admin/settings`);
  }

  return result;
}

export async function updateOrganizationReportAccessFormAction(
  slug: string,
  formData: FormData,
) {
  const { prisma } = await import("@/lib/prisma");
  const action = createUpdateOrganizationReportAccessAction({
    getActor: async () => {
      const { context } = await requireOrganizationUsersAdminBySlug(slug);

      return context;
    },
    getOrganizationIdBySlug,
    repository: createPrismaOrganizationSettingsRepository(prisma),
  });
  const result = await action(slug, formData);

  if (result.status === "success") {
    revalidatePath(`/org/${slug}`);
    revalidatePath(`/org/${slug}/reports`);
    revalidatePath(`/org/${slug}/manager/reports`);
    revalidatePath(`/org/${slug}/admin/reports`);
    revalidatePath(`/org/${slug}/admin/settings`);
  }

  return result;
}
