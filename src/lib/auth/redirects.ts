import type { UserStatus } from "@prisma/client";

export type PostLoginRedirectContext = {
  isPlatformOwner: boolean;
  memberships: {
    organizationSlug: string;
    status: UserStatus;
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

  return activeMembership ? `/org/${activeMembership.organizationSlug}` : "/platform";
}
