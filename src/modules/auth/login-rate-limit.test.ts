import { describe, expect, it } from "vitest";

import { isLoginRateLimited, resetLoginRateLimit, type LoginThrottleRepository } from "./login-rate-limit";

function createThrottleRepository(): LoginThrottleRepository {
  const buckets = new Map<string, { attempts: number; resetAt: number }>();

  return {
    async increment(keyHash, now, windowMilliseconds) {
      const current = buckets.get(keyHash);
      if (!current || current.resetAt <= now.getTime()) {
        buckets.set(keyHash, { attempts: 1, resetAt: now.getTime() + windowMilliseconds });
        return 1;
      }

      current.attempts += 1;
      return current.attempts;
    },
    async reset(keyHash) {
      buckets.delete(keyHash);
    },
  };
}

describe("database-backed login throttle policy", () => {
  it("limits repeated credentials and resets after successful authentication", async () => {
    const repository = createThrottleRepository();
    const input = { ipAddress: "192.0.2.1", normalizedEmail: "admin@example.com" };
    const now = new Date("2026-10-20T12:00:00Z");

    for (let attempt = 0; attempt < 8; attempt += 1) {
      expect(await isLoginRateLimited(input, repository, now)).toBe(false);
    }
    expect(await isLoginRateLimited(input, repository, now)).toBe(true);

    await resetLoginRateLimit(input, repository);
    expect(await isLoginRateLimited(input, repository, now)).toBe(false);
  });

  it("limits an IP independently across different email addresses", async () => {
    const repository = createThrottleRepository();
    const now = new Date("2026-10-20T12:00:00Z");

    for (let attempt = 0; attempt < 40; attempt += 1) {
      await isLoginRateLimited({ ipAddress: "192.0.2.2", normalizedEmail: `user${attempt}@example.com` }, repository, now);
    }

    expect(await isLoginRateLimited({ ipAddress: "192.0.2.2", normalizedEmail: "another@example.com" }, repository, now)).toBe(true);
  });
});