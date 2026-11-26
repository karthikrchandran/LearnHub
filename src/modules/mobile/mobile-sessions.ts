import { createHash, randomBytes } from "node:crypto";

import type { PrismaClient } from "@prisma/client";

const refreshTokenLifetimeMilliseconds = 30 * 24 * 60 * 60 * 1000;

export function hashMobileRefreshToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createMobileSession(client: PrismaClient, userId: string) {
  const refreshToken = randomBytes(48).toString("base64url");
  const session = await client.mobileSession.create({
    data: {
      userId,
      tokenHash: hashMobileRefreshToken(refreshToken),
      expiresAt: new Date(Date.now() + refreshTokenLifetimeMilliseconds),
    },
    select: { id: true, expiresAt: true },
  });

  return { ...session, refreshToken };
}

export async function rotateMobileSession(client: PrismaClient, refreshToken: string) {
  const now = new Date();
  const existing = await client.mobileSession.findUnique({
    where: { tokenHash: hashMobileRefreshToken(refreshToken) },
    select: { id: true, userId: true, expiresAt: true, revokedAt: true, user: { select: { status: true } } },
  });

  if (!existing || existing.revokedAt || existing.expiresAt <= now || existing.user.status !== "ACTIVE") {
    return null;
  }

  const nextRefreshToken = randomBytes(48).toString("base64url");
  const next = await client.$transaction(async (transaction) => {
    const claimed = await transaction.mobileSession.updateMany({
      where: { id: existing.id, userId: existing.userId, revokedAt: null, expiresAt: { gt: now } },
      data: { revokedAt: now },
    });

    if (claimed.count !== 1) {
      return null;
    }

    return transaction.mobileSession.create({
      data: {
        userId: existing.userId,
        tokenHash: hashMobileRefreshToken(nextRefreshToken),
        expiresAt: existing.expiresAt,
      },
      select: { id: true, expiresAt: true, userId: true },
    });
  });

  if (!next) {
    return null;
  }

  return { ...next, refreshToken: nextRefreshToken };
}

export async function revokeMobileSession(client: PrismaClient, sessionId: string, userId: string): Promise<void> {
  await client.mobileSession.updateMany({
    where: { id: sessionId, userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}