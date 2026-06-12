import type { MembershipAuthContext } from "../../modules/auth/permissions";
import { canManageOrganizationUsers } from "../../modules/auth/permissions";
import { redirect } from "next/navigation";

export type GuardAuthContext = MembershipAuthContext;

export type GuardResult =
  | {
      allowed: true;
    }
  | {
      allowed: false;
      redirectTo: string;
    };

const hasActiveMembership = (context: GuardAuthContext, organizationId: string): boolean =>
  context.memberships.some((membership) => membership.organizationId === organizationId && membership.status === "ACTIVE");

export function resolvePlatformOwnerGuard(context: GuardAuthContext | null): GuardResult {
  if (!context) {
    return { allowed: false, redirectTo: "/login" };
  }

  if (!context.isPlatformOwner) {
    return { allowed: false, redirectTo: "/org" };
  }

  return { allowed: true };
}

export function resolveOrganizationUsersAdminGuard(
  context: GuardAuthContext | null,
  organizationId: string,
): GuardResult {
  if (!context) {
    return { allowed: false, redirectTo: "/login" };
  }

  if (!canManageOrganizationUsers(context, organizationId)) {
    return { allowed: false, redirectTo: "/platform" };
  }

  return { allowed: true };
}

export function resolveOrganizationMemberGuard(context: GuardAuthContext | null, organizationId: string): GuardResult {
  if (!context) {
    return { allowed: false, redirectTo: "/login" };
  }

  if (!context.isPlatformOwner && !hasActiveMembership(context, organizationId)) {
    return { allowed: false, redirectTo: "/platform" };
  }

  return { allowed: true };
}

async function getCurrentAuthContext(): Promise<GuardAuthContext | null> {
  const [{ getServerSession }, { prisma }, { authOptions }] = await Promise.all([
    import("next-auth/next"),
    import("../prisma"),
    import("./next-auth"),
  ]);
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;

  if (!userId) {
    return null;
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      isPlatformOwner: true,
      memberships: {
        select: {
          id: true,
          organizationId: true,
          roles: true,
          status: true,
          managerMembershipId: true,
        },
      },
    },
  });

  if (!user) {
    return null;
  }

  return {
    userId: user.id,
    isPlatformOwner: user.isPlatformOwner,
    memberships: user.memberships,
  };
}

async function getOrganizationIdBySlug(slug: string): Promise<string | null> {
  const { prisma } = await import("../prisma");
  const organization = await prisma.organization.findUnique({
    where: { slug },
    select: { id: true },
  });

  return organization?.id ?? null;
}

function enforceGuard(result: GuardResult): void {
  if (!result.allowed) {
    redirect(result.redirectTo);
  }
}

export async function requirePlatformOwner(): Promise<GuardAuthContext> {
  const context = await getCurrentAuthContext();
  enforceGuard(resolvePlatformOwnerGuard(context));

  return context!;
}

export async function requireOrganizationMemberBySlug(slug: string): Promise<{ context: GuardAuthContext; organizationId: string }> {
  const context = await getCurrentAuthContext();

  if (!context) {
    redirect("/login");
  }

  const organizationId = await getOrganizationIdBySlug(slug);

  if (!organizationId) {
    redirect("/platform");
  }

  enforceGuard(resolveOrganizationMemberGuard(context, organizationId));

  return { context, organizationId };
}

export async function requireOrganizationUsersAdminBySlug(
  slug: string,
): Promise<{ context: GuardAuthContext; organizationId: string }> {
  const context = await getCurrentAuthContext();

  if (!context) {
    redirect("/login");
  }

  const organizationId = await getOrganizationIdBySlug(slug);

  if (!organizationId) {
    redirect("/platform");
  }

  enforceGuard(resolveOrganizationUsersAdminGuard(context, organizationId));

  return { context, organizationId };
}
