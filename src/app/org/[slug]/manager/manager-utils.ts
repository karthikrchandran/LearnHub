import type { PrismaClient } from "@prisma/client";
import { notFound } from "next/navigation";

import { requireOrganizationMemberBySlug } from "@/lib/auth/guards";

type LearnHubPrisma = PrismaClient;

export type ManagerWorkspace = Awaited<ReturnType<typeof getManagerWorkspace>>;
export type ManagerDirectReport = Awaited<ReturnType<typeof listManagerDirectReports>>[number];
export type ManagerDirectReportDetail = Awaited<ReturnType<typeof listManagerDirectReportDetail>>;
export type ManagerDirectReportTarget = Awaited<ReturnType<typeof listManagerDirectReportTargets>>[number];

export async function getManagerWorkspace(slug: string) {
  const { context, organizationId } = await requireOrganizationMemberBySlug(slug);
  const { prisma } = await import("@/lib/prisma");
  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { name: true },
  });

  if (!organization) {
    notFound();
  }

  const managerMembership = context.memberships.find(
    (membership) =>
      membership.organizationId === organizationId &&
      membership.status === "ACTIVE" &&
      membership.roles.includes("MANAGER") &&
      !membership.roles.includes("ADMIN"),
  );

  return { context, managerMembership, organization, organizationId, prisma };
}

export function hasManagerAccess(workspace: ManagerWorkspace): workspace is ManagerWorkspace & {
  managerMembership: NonNullable<ManagerWorkspace["managerMembership"]>;
} {
  return Boolean(workspace.managerMembership);
}

export function listManagerDirectReports(
  prisma: LearnHubPrisma,
  input: { organizationId: string; managerMembershipId: string },
) {
  return prisma.organizationMembership.findMany({
    where: {
      organizationId: input.organizationId,
      status: "ACTIVE",
      managerMembershipId: input.managerMembershipId,
      roles: { has: "LEARNER" },
    },
    orderBy: { user: { lastName: "asc" } },
    select: {
      id: true,
      employeeId: true,
      department: true,
      title: true,
      user: {
        select: {
          email: true,
          firstName: true,
          lastName: true,
        },
      },
      learningAssignments: {
        select: {
          id: true,
          status: true,
          progress: {
            select: {
              progressPercent: true,
            },
          },
        },
      },
      certificates: {
        select: {
          id: true,
        },
      },
    },
  });
}

export function listManagerDirectReportDetail(
  prisma: LearnHubPrisma,
  input: { organizationId: string; managerMembershipId: string; membershipId: string },
) {
  return prisma.organizationMembership.findFirst({
    where: {
      id: input.membershipId,
      organizationId: input.organizationId,
      status: "ACTIVE",
      managerMembershipId: input.managerMembershipId,
      roles: { has: "LEARNER" },
    },
    select: {
      id: true,
      employeeId: true,
      department: true,
      title: true,
      user: {
        select: {
          email: true,
          firstName: true,
          lastName: true,
        },
      },
      learningAssignments: {
        orderBy: { dueDate: "asc" },
        select: {
          id: true,
          status: true,
          startDate: true,
          dueDate: true,
          progress: {
            select: {
              progressPercent: true,
              lastEventAt: true,
            },
          },
          course: {
            select: {
              title: true,
              slug: true,
              type: true,
              expectedDurationMinutes: true,
            },
          },
          certificate: {
            select: {
              id: true,
              courseTitle: true,
              verificationCode: true,
              verificationUrl: true,
              issuedAt: true,
            },
          },
        },
      },
      certificates: {
        orderBy: { issuedAt: "desc" },
        select: {
          id: true,
          courseTitle: true,
          verificationCode: true,
          verificationUrl: true,
          issuedAt: true,
        },
      },
    },
  });
}

export function listManagerDirectReportTargets(
  prisma: LearnHubPrisma,
  input: { organizationId: string; managerMembershipId: string },
) {
  return prisma.organizationMembership.findMany({
    where: {
      organizationId: input.organizationId,
      status: "ACTIVE",
      managerMembershipId: input.managerMembershipId,
    },
    select: {
      id: true,
      organizationId: true,
    },
  });
}
