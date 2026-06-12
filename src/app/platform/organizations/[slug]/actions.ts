"use server";

import { requirePlatformOwner } from "@/lib/auth/guards";
import { createPrismaOrganizationSettingsRepository } from "@/modules/organizations/prisma-repository";
import { createUpdateOrganizationSettingsAction } from "@/modules/organizations/server-actions";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

async function getOrganizationIdBySlug(slug: string): Promise<string | null> {
  const { prisma } = await import("@/lib/prisma");
  const organization = await prisma.organization.findUnique({
    where: { slug },
    select: { id: true },
  });

  return organization?.id ?? null;
}

export async function updatePlatformOrganizationSettingsFormAction(
  slug: string,
  formData: FormData,
) {
  const { prisma } = await import("@/lib/prisma");
  const action = createUpdateOrganizationSettingsAction({
    getActor: requirePlatformOwner,
    getOrganizationIdBySlug,
    repository: createPrismaOrganizationSettingsRepository(prisma),
  });
  const result = await action(slug, formData);

  if (result.status === "success") {
    revalidatePath("/platform");
    revalidatePath(`/platform/organizations/${slug}`);
    revalidatePath(`/platform/organizations/${result.organizationSlug}`);

    if (result.organizationSlug !== slug) {
      redirect(`/platform/organizations/${result.organizationSlug}`);
    }
  }

  return result;
}
