import { describe, expect, it } from "vitest";

import {
  PASSWORD_RESET_EXPIRES_IN_MINUTES,
  completePasswordReset,
  requestPasswordReset,
  type PasswordResetRepository,
} from "./password-resets";
import { hashToken } from "./tokens";
import { verifyPassword } from "../../lib/auth/password";

type ResetTokenRecord = {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  usedAt: Date | null;
};

class FakePasswordResetRepository implements PasswordResetRepository {
  readonly users = new Map<string, { id: string; passwordHash: string | null }>();
  readonly passwordHashesByUserId = new Map<string, string | null>();
  readonly resetTokens: ResetTokenRecord[] = [];
  readonly createdResetTokens: Array<{ userId: string; tokenHash: string; expiresAt: Date }> = [];
  readonly completedResets: Array<{ resetTokenId: string; userId: string; passwordHash: string; usedAt: Date }> = [];

  constructor(users: Array<{ id: string; email: string }> = []) {
    for (const user of users) {
      this.users.set(user.email, { id: user.id, passwordHash: null });
      this.passwordHashesByUserId.set(user.id, null);
    }
  }

  async findUserByEmail(email: string): Promise<{ id: string } | null> {
    return this.users.get(email) ?? null;
  }

  async createPasswordResetToken(data: { userId: string; tokenHash: string; expiresAt: Date }): Promise<void> {
    this.createdResetTokens.push(data);
    this.resetTokens.push({
      id: `reset_${this.resetTokens.length + 1}`,
      usedAt: null,
      ...data,
    });
  }

  async findPasswordResetByTokenHash(tokenHash: string): Promise<{
    id: string;
    userId: string;
    expiresAt: Date;
    usedAt: Date | null;
  } | null> {
    const token = this.resetTokens.find((resetToken) => resetToken.tokenHash === tokenHash);

    if (!token) {
      return null;
    }

    return {
      id: token.id,
      userId: token.userId,
      expiresAt: token.expiresAt,
      usedAt: token.usedAt,
    };
  }

  async completePasswordReset(data: {
    resetTokenId: string;
    userId: string;
    passwordHash: string;
    usedAt: Date;
  }): Promise<boolean> {
    const token = this.resetTokens.find(
      (resetToken) => resetToken.id === data.resetTokenId && resetToken.userId === data.userId,
    );

    if (!token || token.usedAt !== null || token.expiresAt.getTime() <= data.usedAt.getTime()) {
      return false;
    }

    token.usedAt = data.usedAt;
    this.completedResets.push(data);
    this.passwordHashesByUserId.set(data.userId, data.passwordHash);

    for (const user of this.users.values()) {
      if (user.id === data.userId) {
        user.passwordHash = data.passwordHash;
      }
    }

    return true;
  }
}

describe("password reset service", () => {
  it("returns null and creates no token for unknown email", async () => {
    const repository = new FakePasswordResetRepository();

    const result = await requestPasswordReset(
      {
        email: " Missing@Acme.TEST ",
        now: new Date("2026-06-09T12:00:00.000Z"),
      },
      repository,
    );

    expect(result).toBeNull();
    expect(repository.createdResetTokens).toEqual([]);
  });

  it("normalizes known email and stores only a reset token hash", async () => {
    const now = new Date("2026-06-09T12:00:00.000Z");
    const repository = new FakePasswordResetRepository([{ id: "user_1", email: "learner@acme.test" }]);

    const result = await requestPasswordReset(
      {
        email: " Learner@Acme.TEST ",
        now,
      },
      repository,
    );

    expect(result).not.toBeNull();
    expect(result?.rawToken).toEqual(expect.any(String));
    expect(result?.rawToken.length).toBeGreaterThanOrEqual(32);
    expect(result?.expiresAt.toISOString()).toBe("2026-06-09T13:00:00.000Z");
    expect(PASSWORD_RESET_EXPIRES_IN_MINUTES).toBe(60);
    expect(repository.createdResetTokens).toEqual([
      {
        userId: "user_1",
        tokenHash: hashToken(result!.rawToken),
        expiresAt: result!.expiresAt,
      },
    ]);
    expect(repository.createdResetTokens[0]?.tokenHash).not.toBe(result?.rawToken);
  });

  it("rejects missing reset tokens", async () => {
    const repository = new FakePasswordResetRepository();

    await expect(
      completePasswordReset(
        {
          rawToken: "missing-token",
          password: "CorrectPassword123!",
          now: new Date("2026-06-09T12:00:00.000Z"),
        },
        repository,
      ),
    ).rejects.toThrow("Password reset token is invalid or expired");
    expect(repository.completedResets).toEqual([]);
  });

  it("rejects used reset tokens", async () => {
    const now = new Date("2026-06-09T12:00:00.000Z");
    const repository = new FakePasswordResetRepository([{ id: "user_1", email: "learner@acme.test" }]);
    const reset = await requestPasswordReset({ email: "learner@acme.test", now }, repository);
    repository.resetTokens[0]!.usedAt = new Date("2026-06-09T12:01:00.000Z");

    await expect(
      completePasswordReset(
        {
          rawToken: reset!.rawToken,
          password: "CorrectPassword123!",
          now: new Date("2026-06-09T12:02:00.000Z"),
        },
        repository,
      ),
    ).rejects.toThrow("Password reset token is invalid or expired");
    expect(repository.completedResets).toEqual([]);
  });

  it("rejects expired reset tokens", async () => {
    const now = new Date("2026-06-09T12:00:00.000Z");
    const repository = new FakePasswordResetRepository([{ id: "user_1", email: "learner@acme.test" }]);
    const reset = await requestPasswordReset({ email: "learner@acme.test", now }, repository);

    await expect(
      completePasswordReset(
        {
          rawToken: reset!.rawToken,
          password: "CorrectPassword123!",
          now: new Date("2026-06-09T13:00:00.000Z"),
        },
        repository,
      ),
    ).rejects.toThrow("Password reset token is invalid or expired");
    expect(repository.completedResets).toEqual([]);
  });

  it("completes valid reset tokens with a password hash and used timestamp", async () => {
    const now = new Date("2026-06-09T12:00:00.000Z");
    const usedAt = new Date("2026-06-09T12:30:00.000Z");
    const repository = new FakePasswordResetRepository([{ id: "user_1", email: "learner@acme.test" }]);
    const reset = await requestPasswordReset({ email: "learner@acme.test", now }, repository);

    await completePasswordReset(
      {
        rawToken: reset!.rawToken,
        password: "NewCorrectPassword123!",
        now: usedAt,
      },
      repository,
    );

    expect(repository.completedResets).toHaveLength(1);
    expect(repository.completedResets[0]).toMatchObject({
      resetTokenId: "reset_1",
      userId: "user_1",
      usedAt,
    });
    expect(repository.completedResets[0]?.passwordHash).not.toBe("NewCorrectPassword123!");
    await expect(verifyPassword("NewCorrectPassword123!", repository.completedResets[0]!.passwordHash)).resolves.toBe(
      true,
    );
    expect(repository.resetTokens[0]?.usedAt).toBe(usedAt);
    expect(repository.passwordHashesByUserId.get("user_1")).toBe(repository.completedResets[0]?.passwordHash);
    expect(repository.users.get("learner@acme.test")?.passwordHash).toBe(repository.completedResets[0]?.passwordHash);
  });

  it("consumes a valid reset token so the same token cannot reset twice", async () => {
    const now = new Date("2026-06-09T12:00:00.000Z");
    const repository = new FakePasswordResetRepository([{ id: "user_1", email: "learner@acme.test" }]);
    const reset = await requestPasswordReset({ email: "learner@acme.test", now }, repository);

    await completePasswordReset(
      {
        rawToken: reset!.rawToken,
        password: "NewCorrectPassword123!",
        now: new Date("2026-06-09T12:30:00.000Z"),
      },
      repository,
    );

    await expect(
      completePasswordReset(
        {
          rawToken: reset!.rawToken,
          password: "SecondPassword123!",
          now: new Date("2026-06-09T12:31:00.000Z"),
        },
        repository,
      ),
    ).rejects.toThrow("Password reset token is invalid or expired");
    expect(repository.completedResets).toHaveLength(1);
  });

  it("rejects when the repository cannot atomically consume the reset token", async () => {
    const now = new Date("2026-06-09T12:00:00.000Z");
    const repository = new FakePasswordResetRepository([{ id: "user_1", email: "learner@acme.test" }]);
    const reset = await requestPasswordReset({ email: "learner@acme.test", now }, repository);
    const failingRepository: PasswordResetRepository = {
      findUserByEmail: repository.findUserByEmail.bind(repository),
      createPasswordResetToken: repository.createPasswordResetToken.bind(repository),
      findPasswordResetByTokenHash: repository.findPasswordResetByTokenHash.bind(repository),
      completePasswordReset: async () => false,
    };

    await expect(
      completePasswordReset(
        {
          rawToken: reset!.rawToken,
          password: "NewCorrectPassword123!",
          now: new Date("2026-06-09T12:30:00.000Z"),
        },
        failingRepository,
      ),
    ).rejects.toThrow("Password reset token is invalid or expired");
  });
});
