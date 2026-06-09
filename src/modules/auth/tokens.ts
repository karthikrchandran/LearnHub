import crypto from "node:crypto";

export type ExpiringToken = {
  rawToken: string;
  tokenHash: string;
  expiresAt: Date;
};

export type PersistedTokenState = {
  expiresAt: Date;
  usedAt: Date | null;
};

export function hashToken(rawToken: string): string {
  return crypto.createHash("sha256").update(rawToken).digest("hex");
}

export function createExpiringToken(now: Date, expiresInMinutes: number): ExpiringToken {
  if (expiresInMinutes <= 0) {
    throw new Error("Token expiry must be positive");
  }

  const rawToken = crypto.randomBytes(32).toString("base64url");
  const expiresAt = new Date(now);
  expiresAt.setUTCMinutes(expiresAt.getUTCMinutes() + expiresInMinutes);

  return {
    rawToken,
    tokenHash: hashToken(rawToken),
    expiresAt,
  };
}

export function tokenIsUsable(token: PersistedTokenState, now: Date): boolean {
  return token.usedAt === null && token.expiresAt.getTime() > now.getTime();
}
