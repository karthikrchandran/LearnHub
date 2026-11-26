import { describe, expect, it, vi } from "vitest";

import { hashMobileRefreshToken, rotateMobileSession } from "./mobile-sessions";

describe("mobile sessions", () => {
  it("hashes refresh tokens deterministically without returning the raw token", () => {
    const token = "refresh-token-for-test";
    const hash = hashMobileRefreshToken(token);

    expect(hash).toHaveLength(64);
    expect(hash).toBe(hashMobileRefreshToken(token));
    expect(hash).not.toContain(token);
  });

  it("rotates only after atomically claiming an unrevoked session", async () => {
    const session = {
      id: "session-old",
      userId: "user-1",
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: null,
      user: { status: "ACTIVE" },
    };
    const transaction = {
      mobileSession: {
        updateMany: vi.fn(async () => ({ count: 1 })),
        create: vi.fn(async ({ data }: { data: { userId: string; tokenHash: string; expiresAt: Date } }) => ({
          id: "session-new",
          userId: data.userId,
          expiresAt: data.expiresAt,
        })),
      },
    };
    const client = {
      mobileSession: { findUnique: vi.fn(async () => session) },
      $transaction: vi.fn(async (operation: (tx: typeof transaction) => Promise<unknown>) => operation(transaction)),
    } as never;

    const result = await rotateMobileSession(client, "old-refresh-token");

    expect(transaction.mobileSession.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "session-old", userId: "user-1", revokedAt: null, expiresAt: { gt: expect.any(Date) } },
    }));
    expect(result).toMatchObject({ id: "session-new", userId: "user-1" });
    expect(result?.refreshToken).not.toBe("old-refresh-token");
  });

  it("does not issue a replacement when another request already rotated the session", async () => {
    const transaction = {
      mobileSession: {
        updateMany: vi.fn(async () => ({ count: 0 })),
        create: vi.fn(),
      },
    };
    const client = {
      mobileSession: {
        findUnique: vi.fn(async () => ({
          id: "session-old",
          userId: "user-1",
          expiresAt: new Date(Date.now() + 60_000),
          revokedAt: null,
          user: { status: "ACTIVE" },
        })),
      },
      $transaction: vi.fn(async (operation: (tx: typeof transaction) => Promise<unknown>) => operation(transaction)),
    } as never;

    await expect(rotateMobileSession(client, "old-refresh-token")).resolves.toBeNull();
    expect(transaction.mobileSession.create).not.toHaveBeenCalled();
  });
});