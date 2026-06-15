import type { Prisma, PrismaClient } from "@prisma/client";

import { createInvitation } from "../auth/invitations";
import { PASSWORD_RESET_EXPIRES_IN_MINUTES } from "../auth/password-resets";
import {
  createAndLogInvitationLink,
  createPrismaInvitationRepository,
} from "../auth/prisma-repositories";
import { createExpiringToken } from "../auth/tokens";

import type { OrganizationUserLifecycleRepository } from "./lifecycle";
import type { CommitUserImportRepository } from "./user-import";
import {
  createPrismaUserSearchWhere,
  type UserSearchRepository,
} from "./user-search";

type PrismaUserImportClient = Pick<
  PrismaClient,
  "$transaction" | "user" | "organizationMembership" | "auditLog" | "userInvitationToken" | "passwordResetToken"
>;
type PrismaUserSearchClient = Pick<PrismaClient, "organizationMembership">;
type PrismaUserLifecycleClient = PrismaUserImportClient;

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

export function createPrismaUserSearchRepository(
  client: PrismaUserSearchClient,
): UserSearchRepository {
  return {
    listOrganizationUsers(input) {
      return client.organizationMembership.findMany({
        where: createPrismaUserSearchWhere(
          input.organizationId,
          input.filters,
        ) as Prisma.OrganizationMembershipWhereInput,
        orderBy: {
          user: { email: "asc" },
        },
        select: {
          id: true,
          organizationId: true,
          roles: true,
          status: true,
          managerMembershipId: true,
          employeeId: true,
          department: true,
          title: true,
          user: {
            select: {
              firstName: true,
              lastName: true,
              email: true,
            },
          },
          managerMembership: {
            select: {
              user: {
                select: {
                  firstName: true,
                  lastName: true,
                  email: true,
                },
              },
            },
          },
        },
      });
    },
  };
}

export function createPrismaUserLifecycleRepository(
  client: PrismaUserLifecycleClient,
): OrganizationUserLifecycleRepository {
  let transactionClient: PrismaUserLifecycleClient | null = null;
  const activeClient = () => transactionClient ?? client;

  return {
    async runInTransaction(operation) {
      return client.$transaction(async (transaction) => {
        transactionClient = transaction as PrismaUserLifecycleClient;

        try {
          return await operation();
        } finally {
          transactionClient = null;
        }
      });
    },
    findMembershipForLifecycle(input) {
      return activeClient().organizationMembership.findFirst({
        where: {
          id: input.membershipId,
          organizationId: input.organizationId,
        },
        select: lifecycleMembershipSelect,
      });
    },
    findManagerMembership(input) {
      return activeClient().organizationMembership.findFirst({
        where: {
          id: input.managerMembershipId,
          organizationId: input.organizationId,
          status: "ACTIVE",
          roles: { has: "MANAGER" },
        },
        select: lifecycleMembershipSelect,
      });
    },
    countActiveAdminMemberships(input) {
      return activeClient().organizationMembership.count({
        where: {
          organizationId: input.organizationId,
          status: "ACTIVE",
          roles: { has: "ADMIN" },
        },
      });
    },
    saveMembershipLifecycle(input) {
      return activeClient().organizationMembership.update({
        where: {
          organizationId_id: {
            organizationId: input.organizationId,
            id: input.membershipId,
          },
        },
        data: {
          roles: input.roles,
          managerMembershipId: input.managerMembershipId,
          employeeId: input.employeeId,
          department: input.department,
          title: input.title,
          status: input.status,
        },
        select: lifecycleMembershipSelect,
      });
    },
    async saveUserStatus(input) {
      await activeClient().user.update({
        where: { id: input.userId },
        data: { status: input.status },
      });
    },
    async createInvitation(data) {
      const [{ env }, invitation] = await Promise.all([
        import("../../lib/env"),
        createInvitation(
          {
            organizationId: data.organizationId,
            membershipId: data.membershipId,
            userId: data.userId,
            now: data.now,
          },
          createPrismaInvitationRepository(activeClient()),
        ),
      ]);

      console.info("LearnHub invitation link", {
        userId: data.userId,
        membershipId: data.membershipId,
        expiresAt: invitation.expiresAt,
        url: `${env.APP_BASE_URL}/invite/${invitation.rawToken}`,
      });

      return invitation;
    },
    async createPasswordReset(data) {
      const token = createExpiringToken(data.now, PASSWORD_RESET_EXPIRES_IN_MINUTES);

      await activeClient().passwordResetToken.create({
        data: {
          userId: data.userId,
          tokenHash: token.tokenHash,
          expiresAt: token.expiresAt,
        },
      });

      return {
        rawToken: token.rawToken,
        expiresAt: token.expiresAt,
      };
    },
    async recordAuditLog(data) {
      await activeClient().auditLog.create({
        data: {
          organizationId: data.organizationId,
          actorId: data.actorId,
          action: data.action,
          targetType: data.targetType,
          targetId: data.targetId,
          metadata: data.metadata as Prisma.InputJsonObject,
        },
      });
    },
  };
}

const lifecycleMembershipSelect = {
  id: true,
  organizationId: true,
  userId: true,
  roles: true,
  status: true,
  managerMembershipId: true,
  employeeId: true,
  department: true,
  title: true,
  user: {
    select: {
      email: true,
      status: true,
    },
  },
} satisfies Prisma.OrganizationMembershipSelect;
