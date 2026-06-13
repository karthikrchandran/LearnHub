import type { OrganizationRole, UserStatus } from "@prisma/client";

export type PostLoginRedirectContext = {
  isPlatformOwner: boolean;
  memberships: {
    organizationSlug: string;
    status: UserStatus;
    roles?: OrganizationRole[];
  }[];
};

export function resolvePostLoginRedirect(context: PostLoginRedirectContext | null): string {
  if (!context) {
    return "/login";
  }

  if (context.isPlatformOwner) {
    return "/platform";
  }

  const activeMembership = context.memberships.find((membership) => membership.status === "ACTIVE");

  if (!activeMembership) {
    return "/platform";
  }

  const roles = activeMembership.roles ?? [];
  const isLearnerOnly = roles.includes("LEARNER") && !roles.some((role) => role === "ADMIN" || role === "MANAGER");

  return isLearnerOnly ? `/org/${activeMembership.organizationSlug}/learn` : `/org/${activeMembership.organizationSlug}`;
}
