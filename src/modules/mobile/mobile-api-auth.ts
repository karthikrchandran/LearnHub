import { getToken } from "next-auth/jwt";
import { NextRequest } from "next/server";
import type { OrganizationRole, UserStatus } from "@prisma/client";

import { authOptions } from "@/lib/auth/next-auth";
import { prisma } from "@/lib/prisma";
import { canViewTenantReports } from "@/modules/reports/report-access";

export type MobileApiMembership = {
  id: string;
  organizationId: string;
  roles: OrganizationRole[];
  status: UserStatus;
  managerMembershipId: string | null;
};

export type MobileApiContext = {
  userId: string;
  sessionId: string;
  isPlatformOwner: boolean;
  organizationId: string;
  organizationSlug: string;
  membership: MobileApiMembership;
};

export class MobileApiError extends Error {
  constructor(
    public readonly status: 401 | 403 | 404,
    public readonly code: "UNAUTHENTICATED" | "FORBIDDEN" | "NOT_FOUND",
    message: string,
  ) {
    super(message);
  }
}

export async function requireMobileApiContext(
  request: Request,
  slug: string,
  role?: "LEARNER" | "MANAGER",
): Promise<MobileApiContext> {
  const { token, session } = await requireMobileSession(request);
  const userId = typeof token?.id === "string" ? token.id : typeof token?.sub === "string" ? token.sub : null;

  if (!userId) {
    throw new MobileApiError(401, "UNAUTHENTICATED", "Authentication is required.");
  }

  const organization = await prisma.organization.findUnique({
    where: { slug },
    select: {
      id: true,
      slug: true,
      status: true,
      allowManagerReports: true,
      allowUserReports: true,
      allowCsvExports: true,
    },
  });

  if (!organization || organization.status !== "ACTIVE") {
    throw new MobileApiError(404, "NOT_FOUND", "Organization was not found.");
  }

  const membership = await prisma.organizationMembership.findUnique({
    where: { organizationId_userId: { organizationId: organization.id, userId } },
    select: {
      id: true,
      organizationId: true,
      roles: true,
      status: true,
      managerMembershipId: true,
      user: { select: { status: true } },
    },
  });

  if (!membership || membership.status !== "ACTIVE" || membership.user.status !== "ACTIVE") {
    throw new MobileApiError(403, "FORBIDDEN", "You do not have access to this organization.");
  }

  if (role && !membership.roles.includes(role)) {
    throw new MobileApiError(403, "FORBIDDEN", `The ${role.toLowerCase()} role is required.`);
  }

  if (role === "MANAGER" && !canViewTenantReports("manager", organization)) {
    throw new MobileApiError(403, "FORBIDDEN", "Manager reports are disabled for this organization.");
  }

  return {
    userId,
    sessionId: session.id,
    isPlatformOwner: token?.isPlatformOwner === true,
    organizationId: organization.id,
    organizationSlug: organization.slug,
    membership,
  };
}

export function toMobileMembershipContext(context: MobileApiContext) {
  return {
    userId: context.userId,
    isPlatformOwner: context.isPlatformOwner,
    memberships: [context.membership],
  };
}

export function mobileApiErrorResponse(error: unknown): Response {
  if (error instanceof MobileApiError) {
    return Response.json({ error: { code: error.code, message: error.message } }, { status: error.status });
  }

  return Response.json({ error: { code: "INTERNAL_ERROR", message: "Unexpected mobile API error." } }, { status: 500 });
}

export async function requireMobileSession(request: Request) {
  const token = await getToken({
    req: new NextRequest(request.url, { headers: request.headers }),
    secret: authOptions.secret,
  });
  const sessionId = typeof token?.sid === "string" ? token.sid : null;

  if (!sessionId) {
    throw new MobileApiError(401, "UNAUTHENTICATED", "A mobile session is required.");
  }

  const session = await prisma.mobileSession.findUnique({
    where: { id: sessionId },
    select: { id: true, userId: true, expiresAt: true, revokedAt: true, user: { select: { status: true } } },
  });

  if (!session || session.revokedAt || session.expiresAt <= new Date() || session.user.status !== "ACTIVE") {
    throw new MobileApiError(401, "UNAUTHENTICATED", "The mobile session is no longer valid.");
  }

  await prisma.mobileSession.update({ where: { id: session.id }, data: { lastUsedAt: new Date() } });

  return { token, session };
}