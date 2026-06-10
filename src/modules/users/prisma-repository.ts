import type { PrismaClient } from "@prisma/client";

import { createAndLogInvitationLink } from "../auth/prisma-repositories";

import type { CommitUserImportRepository } from "./user-import";

type PrismaUserImportClient = Pick<
  PrismaClient,
  "$transaction" | "user" | "organizationMembership" | "auditLog" | "userInvitationToken" | "passwordResetToken"
>;

export function createPrismaUserImportRepository(client: PrismaUserImportClient): CommitUserImportRepository {
  let transactionClient: PrismaUserImportClient | null = null;
  const activeClient = () => transactionClient ?? client;

  return {
    async runInTransaction(operation) {
      return client.$transaction(async (transaction) => {
        transactionClient = transaction;

        try {
          return await operation();
        } finally {
          transactionClient = null;
        }
      });
    },
    upsertUser(data) {
      return activeClient().user.upsert({
        where: { email: data.email },
        update: {
          firstName: data.firstName,
          lastName: data.lastName,
        },
        create: {
          email: data.email,
          firstName: data.firstName,
          lastName: data.lastName,
          status: data.status,
        },
        select: {
          id: true,
          email: true,
        },
      });
    },
    upsertMembership(data) {
      return activeClient().organizationMembership.upsert({
        where: {
          organizationId_userId: {
            organizationId: data.organizationId,
            userId: data.userId,
          },
        },
        update: {
          roles: data.roles,
          employeeId: data.employeeId,
          department: data.department,
          title: data.title,
          status: data.status,
        },
        create: {
          organizationId: data.organizationId,
          userId: data.userId,
          roles: data.roles,
          employeeId: data.employeeId,
          department: data.department,
          title: data.title,
          status: data.status,
        },
        select: {
          id: true,
          userId: true,
          user: {
            select: {
              email: true,
            },
          },
        },
      }).then((membership) => ({
        id: membership.id,
        userId: membership.userId,
        email: membership.user.email,
      }));
    },
    async findMembershipByOrganizationAndEmail(data) {
      const membership = await activeClient().organizationMembership.findFirst({
        where: {
          organizationId: data.organizationId,
          status: "ACTIVE",
          roles: { has: "MANAGER" },
          user: { email: data.email },
        },
        select: {
          id: true,
          userId: true,
          user: {
            select: {
              email: true,
            },
          },
        },
      });

      return membership
        ? {
            id: membership.id,
            userId: membership.userId,
            email: membership.user.email,
          }
        : null;
    },
    async setMembershipManager(data) {
      await activeClient().organizationMembership.update({
        where: { id: data.membershipId },
        data: { managerMembershipId: data.managerMembershipId },
      });
    },
    async createInvitation(data) {
      const { env } = await import("../../lib/env");

      await createAndLogInvitationLink({
        client: activeClient(),
        organizationId: data.organizationId,
        membershipId: data.membershipId,
        userId: data.userId,
        now: data.now,
        appBaseUrl: env.APP_BASE_URL,
      });
    },
    async recordAuditLog(data) {
      await activeClient().auditLog.create({
        data: {
          organizationId: data.organizationId,
          actorId: data.actorId,
          action: "users.imported",
          targetType: "organization",
          targetId: data.organizationId,
          metadata: {
            importedCount: data.importedCount,
          },
        },
      });
    },
  };
}
