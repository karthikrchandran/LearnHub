import type { OrganizationRole, UserStatus } from "@prisma/client";

export type AuthMembership = {
  id: string;
  organizationId: string;
  roles: OrganizationRole[];
  status: UserStatus;
  managerMembershipId: string | null;
};

export type MembershipAuthContext = {
  userId: string;
  isPlatformOwner: boolean;
  memberships: AuthMembership[];
};

export type TargetMembership = {
  id: string;
  userId: string;
  organizationId: string;
  managerMembershipId: string | null;
};

function membershipForOrganization(context: MembershipAuthContext, organizationId: string): AuthMembership | undefined {
  return context.memberships.find(
    (membership) => membership.organizationId === organizationId && membership.status === "ACTIVE",
  );
}

export function hasOrganizationRole(
  context: MembershipAuthContext,
  organizationId: string,
  role: OrganizationRole,
): boolean {
  return membershipForOrganization(context, organizationId)?.roles.includes(role) ?? false;
}

export function canManageOrganization(context: MembershipAuthContext, organizationId: string): boolean {
  return context.isPlatformOwner || hasOrganizationRole(context, organizationId, "ADMIN");
}

export function canManageOrganizationUsers(context: MembershipAuthContext, organizationId: string): boolean {
  return canManageOrganization(context, organizationId);
}

export function canViewMembershipProgress(context: MembershipAuthContext, target: TargetMembership): boolean {
  if (context.isPlatformOwner || hasOrganizationRole(context, target.organizationId, "ADMIN")) {
    return true;
  }

  const membership = membershipForOrganization(context, target.organizationId);

  if (!membership) {
    return false;
  }

  if (target.userId === context.userId) {
    return true;
  }

  return membership.roles.includes("MANAGER") && target.managerMembershipId === membership.id;
}
