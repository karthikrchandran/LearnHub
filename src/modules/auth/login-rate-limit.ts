import { createHash } from "node:crypto";

import type { PrismaClient } from "@prisma/client";

const windowMilliseconds = 60_000;
const maximumEmailAttempts = 8;
const maximumIpAttempts = 40;
const throttleRetentionMilliseconds = 24 * 60 * 60 * 1000;
const throttleCleanupIntervalMilliseconds = 15 * 60 * 1000;
let lastThrottleCleanupAt = 0;

export type LoginThrottleRepository = {
  increment(keyHash: string, now: Date, windowMilliseconds: number): Promise<number>;
  reset(keyHash: string): Promise<void>;
};

export function createPrismaLoginThrottleRepository(client: PrismaClient): LoginThrottleRepository {
  return {
    async increment(keyHash, now, windowMs) {
      const windowStartCutoff = new Date(now.getTime() - windowMs);
      const rows = await client.$queryRaw<Array<{ attempts: number }>>`
        INSERT INTO "LoginThrottleBucket" ("keyHash", "attempts", "windowStartedAt", "updatedAt")
        VALUES (${keyHash}, 1, ${now}, ${now})
        ON CONFLICT ("keyHash") DO UPDATE SET
          "attempts" = CASE
            WHEN "LoginThrottleBucket"."windowStartedAt" <= ${windowStartCutoff} THEN 1
            ELSE "LoginThrottleBucket"."attempts" + 1
          END,
          "windowStartedAt" = CASE
            WHEN "LoginThrottleBucket"."windowStartedAt" <= ${windowStartCutoff} THEN ${now}
            ELSE "LoginThrottleBucket"."windowStartedAt"
          END,
          "updatedAt" = ${now}
        RETURNING "attempts"
      `;

      if (now.getTime() - lastThrottleCleanupAt >= throttleCleanupIntervalMilliseconds) {
        await client.loginThrottleBucket.deleteMany({
          where: { updatedAt: { lt: new Date(now.getTime() - throttleRetentionMilliseconds) } },
        });
        lastThrottleCleanupAt = now.getTime();
      }

      return Number(rows[0]?.attempts ?? 0);
    },
    async reset(keyHash) {
      await client.loginThrottleBucket.deleteMany({ where: { keyHash } });
    },
  };
}

export async function isLoginRateLimited(
  input: { ipAddress: string; normalizedEmail: string },
  repository: LoginThrottleRepository,
  now = new Date(),
): Promise<boolean> {
  const ipKeyHash = hashKey(`ip:${input.ipAddress}`);
  const emailKeyHash = hashKey(`email:${input.ipAddress}:${input.normalizedEmail}`);
  const [ipAttempts, emailAttempts] = await Promise.all([
    repository.increment(ipKeyHash, now, windowMilliseconds),
    repository.increment(emailKeyHash, now, windowMilliseconds),
  ]);

  return ipAttempts > maximumIpAttempts || emailAttempts > maximumEmailAttempts;
}

export async function resetLoginRateLimit(
  input: { ipAddress: string; normalizedEmail: string },
  repository: LoginThrottleRepository,
): Promise<void> {
  await repository.reset(hashKey(`email:${input.ipAddress}:${input.normalizedEmail}`));
}

function hashKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}