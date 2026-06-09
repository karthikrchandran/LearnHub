import { hashPassword } from "../../lib/auth/password";
import { normalizeEmail } from "./email";
import { createExpiringToken, hashToken, tokenIsUsable } from "./tokens";

export const PASSWORD_RESET_EXPIRES_IN_MINUTES = 60;

export type PasswordResetRepository = {
  findUserByEmail(email: string): Promise<{ id: string } | null>;
  createPasswordResetToken(data: { userId: string; tokenHash: string; expiresAt: Date }): Promise<void>;
  findPasswordResetByTokenHash(tokenHash: string): Promise<{
    id: string;
    userId: string;
    expiresAt: Date;
    usedAt: Date | null;
  } | null>;
  completePasswordReset(data: {
    resetTokenId: string;
    userId: string;
    passwordHash: string;
    usedAt: Date;
  }): Promise<boolean>;
};

export async function requestPasswordReset(
  input: { email: string; now: Date },
  repository: PasswordResetRepository,
): Promise<{ rawToken: string; expiresAt: Date } | null> {
  const email = normalizeEmail(input.email);
  const user = await repository.findUserByEmail(email);

  if (!user) {
    return null;
  }

  const token = createExpiringToken(input.now, PASSWORD_RESET_EXPIRES_IN_MINUTES);

  await repository.createPasswordResetToken({
    userId: user.id,
    tokenHash: token.tokenHash,
    expiresAt: token.expiresAt,
  });

  return {
    rawToken: token.rawToken,
    expiresAt: token.expiresAt,
  };
}

export async function completePasswordReset(
  input: { rawToken: string; password: string; now: Date },
  repository: PasswordResetRepository,
): Promise<void> {
  const tokenHash = hashToken(input.rawToken);
  const resetToken = await repository.findPasswordResetByTokenHash(tokenHash);

  if (!resetToken || !tokenIsUsable(resetToken, input.now)) {
    throw new Error("Password reset token is invalid or expired");
  }

  const passwordHash = await hashPassword(input.password);

  const completed = await repository.completePasswordReset({
    resetTokenId: resetToken.id,
    userId: resetToken.userId,
    passwordHash,
    usedAt: input.now,
  });

  if (!completed) {
    throw new Error("Password reset token is invalid or expired");
  }
}
