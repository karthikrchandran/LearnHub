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

export type TargetRuntimeAssignment = {
  id: string;
  organizationId: string;
  membershipId: string;
  learner: TargetMembership;
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

export function canManageCatalog(context: MembershipAuthContext, organizationId: string): boolean {
  return canManageOrganization(context, organizationId);
}

export function canManageOrganizationUsers(context: MembershipAuthContext, organizationId: string): boolean {
  return canManageOrganization(context, organizationId);
}

export function canAssignDirectReport(context: MembershipAuthContext, target: TargetMembership): boolean {
  if (context.isPlatformOwner || hasOrganizationRole(context, target.organizationId, "ADMIN")) {
    return true;
  }

  const membership = membershipForOrganization(context, target.organizationId);

  return Boolean(membership?.roles.includes("MANAGER") && target.managerMembershipId === membership.id);
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

export function canLaunchRuntimeAssignment(
  context: MembershipAuthContext,
  assignment: TargetRuntimeAssignment,
): boolean {
  const membership = membershipForOrganization(context, assignment.organizationId);

  return Boolean(
    membership &&
      assignment.learner.organizationId === assignment.organizationId &&
      membership.id === assignment.membershipId &&
      membership.id === assignment.learner.id &&
      assignment.learner.userId === context.userId &&
      membership.roles.includes("LEARNER"),
  );
}

export function canViewRuntimeProgress(
  context: MembershipAuthContext,
  assignment: TargetRuntimeAssignment,
): boolean {
  if (assignment.learner.organizationId !== assignment.organizationId) {
    return false;
  }

  return canViewMembershipProgress(context, assignment.learner);
}

export function canInspectRuntimeAssignment(
  context: MembershipAuthContext,
  assignment: TargetRuntimeAssignment,
): boolean {
  return canManageOrganization(context, assignment.organizationId);
}
