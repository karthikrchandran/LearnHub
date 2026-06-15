import { requireOrganizationUsersAdminBySlug } from "@/lib/auth/guards";
import { notFound } from "next/navigation";

export async function getAdminWorkspace(slug: string) {
  const { organizationId } = await requireOrganizationUsersAdminBySlug(slug);
  const { prisma } = await import("@/lib/prisma");
  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { id: true, name: true, slug: true },
  });

  if (!organization) {
    notFound();
  }

  return {
    organizationId,
    organizationName: organization.name,
    prisma,
  };
}
