import type { PrismaClient } from "@prisma/client";

import { createInvitation, type InvitationRepository } from "./invitations";
import type { PasswordResetRepository } from "./password-resets";

type PrismaAuthClient = Pick<
  PrismaClient,
  "$transaction" | "user" | "organizationMembership" | "userInvitationToken" | "passwordResetToken"
>;

export function createPrismaInvitationRepository(client: PrismaAuthClient): InvitationRepository {
  return {
    async createInvitationToken(data) {
      await client.userInvitationToken.create({ data });
    },
    findInvitationByTokenHash(tokenHash) {
      return client.userInvitationToken.findUnique({
        where: { tokenHash },
        select: {
          id: true,
          userId: true,
          membershipId: true,
          expiresAt: true,
          usedAt: true,
        },
      });
    },
    async activateInvitation(data) {
      return client.$transaction(async (transaction) => {
        const consumed = await transaction.userInvitationToken.updateMany({
          where: {
            id: data.invitationId,
            userId: data.userId,
            membershipId: data.membershipId,
            usedAt: null,
            expiresAt: { gt: data.usedAt },
          },
          data: { usedAt: data.usedAt },
        });

        if (consumed.count !== 1) {
          return false;
        }

        await transaction.user.update({
          where: { id: data.userId },
          data: {
            passwordHash: data.passwordHash,
            status: "ACTIVE",
          },
        });
        await transaction.organizationMembership.update({
          where: { id: data.membershipId },
          data: { status: "ACTIVE" },
        });

        return true;
      });
    },
  };
}

export function createPrismaPasswordResetRepository(client: PrismaAuthClient): PasswordResetRepository {
  return {
    findUserByEmail(email) {
      return client.user.findUnique({
        where: { email },
        select: { id: true },
      });
    },
    async createPasswordResetToken(data) {
      await client.passwordResetToken.create({ data });
    },
    findPasswordResetByTokenHash(tokenHash) {
      return client.passwordResetToken.findUnique({
        where: { tokenHash },
        select: {
          id: true,
          userId: true,
          expiresAt: true,
          usedAt: true,
        },
      });
    },
    async completePasswordReset(data) {
      return client.$transaction(async (transaction) => {
        const consumed = await transaction.passwordResetToken.updateMany({
          where: {
            id: data.resetTokenId,
            userId: data.userId,
            usedAt: null,
            expiresAt: { gt: data.usedAt },
          },
          data: { usedAt: data.usedAt },
        });

        if (consumed.count !== 1) {
          return false;
        }

        await transaction.user.update({
          where: { id: data.userId },
          data: { passwordHash: data.passwordHash },
        });

        return true;
      });
    },
  };
}

export async function createAndLogInvitationLink(input: {
  client: PrismaAuthClient;
  organizationId: string;
  membershipId: string;
  userId: string;
  now: Date;
  appBaseUrl: string;
}): Promise<void> {
  const invitation = await createInvitation(
    {
      organizationId: input.organizationId,
      membershipId: input.membershipId,
      userId: input.userId,
      now: input.now,
    },
    createPrismaInvitationRepository(input.client),
  );

  console.info("LearnHub invitation link", {
    userId: input.userId,
    membershipId: input.membershipId,
    expiresAt: invitation.expiresAt,
    url: `${input.appBaseUrl}/invite/${invitation.rawToken}`,
  });
}
