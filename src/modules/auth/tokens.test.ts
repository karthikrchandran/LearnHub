import { describe, expect, it } from "vitest";

import { createExpiringToken, hashToken, tokenIsUsable } from "./tokens";

describe("auth token helpers", () => {
  it("creates a raw token, hash, and expiry", () => {
    const now = new Date("2026-06-09T12:00:00.000Z");
    const token = createExpiringToken(now, 60);

    expect(token.rawToken.length).toBeGreaterThanOrEqual(32);
    expect(token.rawToken).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(token.tokenHash).toHaveLength(64);
    expect(token.tokenHash).toBe(hashToken(token.rawToken));
    expect(token.expiresAt.toISOString()).toBe("2026-06-09T13:00:00.000Z");
  });

  it("hashes the same token consistently", () => {
    expect(hashToken("abc123")).toBe(hashToken("abc123"));
  });

  it("requires a positive expiry duration", () => {
    const now = new Date("2026-06-09T12:00:00.000Z");

    expect(() => createExpiringToken(now, 0)).toThrow("Token expiry must be positive");
    expect(() => createExpiringToken(now, -1)).toThrow("Token expiry must be positive");
  });

  it("requires a finite integer expiry duration", () => {
    const now = new Date("2026-06-09T12:00:00.000Z");

    expect(() => createExpiringToken(now, Number.NaN)).toThrow("Token expiry must be positive");
    expect(() => createExpiringToken(now, Number.POSITIVE_INFINITY)).toThrow("Token expiry must be positive");
    expect(() => createExpiringToken(now, Number.NEGATIVE_INFINITY)).toThrow("Token expiry must be positive");
    expect(() => createExpiringToken(now, 1.5)).toThrow("Token expiry must be positive");
  });

  it("treats used or expired tokens as unusable", () => {
    const now = new Date("2026-06-09T12:00:00.000Z");

    expect(tokenIsUsable({ expiresAt: new Date("2026-06-09T12:01:00.000Z"), usedAt: null }, now)).toBe(true);
    expect(tokenIsUsable({ expiresAt: new Date("2026-06-09T12:00:00.000Z"), usedAt: null }, now)).toBe(false);
    expect(tokenIsUsable({ expiresAt: new Date("2026-06-09T11:59:00.000Z"), usedAt: null }, now)).toBe(false);
    expect(tokenIsUsable({ expiresAt: new Date("2026-06-09T12:01:00.000Z"), usedAt: now }, now)).toBe(false);
  });
});
