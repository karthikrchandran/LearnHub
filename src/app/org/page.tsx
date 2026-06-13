import { getServerSession } from "next-auth/next";
import { redirect } from "next/navigation";

import { authOptions } from "@/lib/auth/next-auth";
import { resolvePostLoginRedirect } from "@/lib/auth/redirects";

export const dynamic = "force-dynamic";

export default async function OrganizationRedirectPage() {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;

  if (!userId) {
    redirect("/login");
  }

  const { prisma } = await import("@/lib/prisma");
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      isPlatformOwner: true,
      memberships: {
        orderBy: { createdAt: "asc" },
        select: {
          roles: true,
          status: true,
          organization: {
            select: {
              slug: true,
            },
          },
        },
      },
    },
  });

  redirect(
    resolvePostLoginRedirect(
      user
        ? {
            isPlatformOwner: user.isPlatformOwner,
            memberships: user.memberships.map((membership) => ({
              organizationSlug: membership.organization.slug,
              roles: membership.roles,
              status: membership.status,
            })),
          }
        : null,
    ),
  );
}
