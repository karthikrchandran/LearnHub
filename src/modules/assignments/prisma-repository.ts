import { Prisma, type PrismaClient } from "@prisma/client";

import type { AssignmentRepository } from "./assignment-service";

type PrismaAssignmentClient = Pick<
  PrismaClient,
  | "$transaction"
  | "course"
  | "organizationMembership"
  | "organization"
  | "courseAssignment"
  | "auditLog"
  | "notificationEnqueueFailure"
>;

export function createPrismaAssignmentRepository(client: PrismaAssignmentClient): AssignmentRepository {
  let transactionClient: PrismaAssignmentClient | null = null;
  const activeClient = () => transactionClient ?? client;

  return {
    async runInTransaction(operation) {
      return client.$transaction(async (transaction) => {
        transactionClient = transaction as PrismaAssignmentClient;

        try {
          return await operation();
        } finally {
          transactionClient = null;
        }
      });
    },
    findCourse(input) {
      return activeClient().course.findFirst({
        where: { id: input.courseId, organizationId: input.organizationId },
        select: {
          id: true,
          organizationId: true,
          title: true,
          status: true,
          estimatedCompletionBusinessDays: true,
        },
      });
    },
    async findMembership(input) {
      const membership = await activeClient().organizationMembership.findFirst({
        where: { id: input.membershipId, organizationId: input.organizationId },
        select: {
          id: true,
          userId: true,
          organizationId: true,
          managerMembershipId: true,
          status: true,
          roles: true,
          user: {
            select: {
              email: true,
              firstName: true,
              lastName: true,
            },
          },
          managerMembership: {
            select: {
              user: {
                select: {
                  email: true,
                  firstName: true,
                  lastName: true,
                },
              },
            },
          },
        },
      });

      if (!membership) {
        return null;
      }

      return {
        id: membership.id,
        userId: membership.userId,
        organizationId: membership.organizationId,
        managerMembershipId: membership.managerMembershipId,
        learnerEmail: membership.user.email,
        learnerName: formatName(membership.user.firstName, membership.user.lastName, membership.user.email),
        managerEmail: membership.managerMembership?.user.email ?? null,
        managerName: membership.managerMembership
          ? formatName(
              membership.managerMembership.user.firstName,
              membership.managerMembership.user.lastName,
              membership.managerMembership.user.email,
            )
          : null,
        status: membership.status,
        roles: membership.roles,
      };
    },
    findOrganization(input) {
      return activeClient().organization.findUnique({
        where: { id: input.organizationId },
        select: { id: true, enrollmentPolicy: true },
      });
    },
    async assignmentExists(input) {
      const assignment = await activeClient().courseAssignment.findFirst({
        where: {
          organizationId: input.organizationId,
          courseId: input.courseId,
          membershipId: input.membershipId,
        },
        select: { id: true },
      });

      return Boolean(assignment);
    },
    createAssignment(data) {
      return activeClient().courseAssignment.create({
        data,
        select: { id: true },
      });
    },
    async recordAuditLog(input) {
      await activeClient().auditLog.create({
        data: {
          organizationId: input.organizationId,
          actorId: input.actorId,
          action: input.action,
          targetType: input.targetType,
          targetId: input.targetId,
        },
      });
    },
    async recordNotificationEnqueueFailure(input) {
      await activeClient().notificationEnqueueFailure.create({
        data: {
          ...input,
          payload: input.payload as Prisma.InputJsonValue,
        },
      });
    },
  };
}

function formatName(firstName: string, lastName: string, fallback: string): string {
  return `${firstName} ${lastName}`.trim() || fallback;
}
