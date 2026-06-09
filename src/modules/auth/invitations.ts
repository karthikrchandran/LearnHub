import { hashPassword } from "../../lib/auth/password";
import { createExpiringToken, hashToken, tokenIsUsable } from "./tokens";

export const INVITATION_EXPIRES_IN_MINUTES = 60 * 24 * 7;

export type CreateInvitationInput = {
  organizationId: string;
  membershipId: string;
  userId: string;
  now: Date;
};

export type ActivateInvitationInput = {
  rawToken: string;
  password: string;
  now: Date;
};

export type InvitationRepository = {
  createInvitationToken(data: {
    organizationId: string;
    membershipId: string;
    userId: string;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<void>;
  findInvitationByTokenHash(tokenHash: string): Promise<{
    id: string;
    userId: string;
    membershipId: string;
    expiresAt: Date;
    usedAt: Date | null;
  } | null>;
  activateInvitation(data: {
    invitationId: string;
    userId: string;
    membershipId: string;
    passwordHash: string;
    usedAt: Date;
  }): Promise<void>;
};

export async function createInvitation(
  input: CreateInvitationInput,
  repository: InvitationRepository,
): Promise<{ rawToken: string; expiresAt: Date }> {
  const token = createExpiringToken(input.now, INVITATION_EXPIRES_IN_MINUTES);

  await repository.createInvitationToken({
    organizationId: input.organizationId,
    membershipId: input.membershipId,
    userId: input.userId,
    tokenHash: token.tokenHash,
    expiresAt: token.expiresAt,
  });

  return {
    rawToken: token.rawToken,
    expiresAt: token.expiresAt,
  };
}

export async function activateInvitation(
  input: ActivateInvitationInput,
  repository: InvitationRepository,
): Promise<void> {
  const tokenHash = hashToken(input.rawToken);
  const invitation = await repository.findInvitationByTokenHash(tokenHash);

  if (!invitation || !tokenIsUsable(invitation, input.now)) {
    throw new Error("Invitation token is invalid or expired");
  }

  const passwordHash = await hashPassword(input.password);

  await repository.activateInvitation({
    invitationId: invitation.id,
    userId: invitation.userId,
    membershipId: invitation.membershipId,
    passwordHash,
    usedAt: input.now,
  });
}
