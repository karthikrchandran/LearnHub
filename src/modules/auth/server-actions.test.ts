import { describe, expect, it, vi } from "vitest";

import {
  createActivateInvitationAction,
  createCompletePasswordResetAction,
  createRequestPasswordResetAction,
} from "./server-actions";
import type { InvitationRepository } from "./invitations";
import type { PasswordResetRepository } from "./password-resets";

function formData(entries: Record<string, string>): FormData {
  const data = new FormData();

  for (const [key, value] of Object.entries(entries)) {
    data.set(key, value);
  }

  return data;
}

describe("auth server actions", () => {
  it("requests a password reset without revealing unknown emails", async () => {
    const repository: PasswordResetRepository = {
      findUserByEmail: vi.fn(async () => null),
      createPasswordResetToken: vi.fn(),
      findPasswordResetByTokenHash: vi.fn(),
      completePasswordReset: vi.fn(),
    };
    const sendResetEmail = vi.fn();
    const action = createRequestPasswordResetAction({
      repository,
      sendResetEmail,
      now: () => new Date("2026-06-09T12:00:00.000Z"),
    });

    const result = await action(formData({ email: "missing@acme.test" }));

    expect(result).toEqual({
      status: "success",
      message: "If an account exists, a reset link has been sent.",
    });
    expect(sendResetEmail).not.toHaveBeenCalled();
  });

  it("sends a reset link when the email belongs to an existing user", async () => {
    const repository: PasswordResetRepository = {
      findUserByEmail: vi.fn(async () => ({ id: "user_1" })),
      createPasswordResetToken: vi.fn(),
      findPasswordResetByTokenHash: vi.fn(),
      completePasswordReset: vi.fn(),
    };
    const sendResetEmail = vi.fn();
    const action = createRequestPasswordResetAction({
      repository,
      sendResetEmail,
      now: () => new Date("2026-06-09T12:00:00.000Z"),
    });

    const result = await action(formData({ email: " learner@acme.test " }));

    expect(result.status).toBe("success");
    expect(sendResetEmail).toHaveBeenCalledWith({
      email: "learner@acme.test",
      rawToken: expect.any(String),
      expiresAt: new Date("2026-06-09T13:00:00.000Z"),
    });
  });

  it("completes a password reset from form data", async () => {
    const repository: PasswordResetRepository = {
      findUserByEmail: vi.fn(),
      createPasswordResetToken: vi.fn(),
      findPasswordResetByTokenHash: vi.fn(async () => ({
        id: "reset_1",
        userId: "user_1",
        expiresAt: new Date("2026-06-09T13:00:00.000Z"),
        usedAt: null,
      })),
      completePasswordReset: vi.fn(async () => true),
    };
    const action = createCompletePasswordResetAction({
      repository,
      now: () => new Date("2026-06-09T12:00:00.000Z"),
    });

    const result = await action(formData({ token: "raw-token", password: "NewPassword123!" }));

    expect(result).toEqual({
      status: "success",
      message: "Password reset. You can sign in with your new password.",
    });
    expect(repository.completePasswordReset).toHaveBeenCalledWith({
      resetTokenId: "reset_1",
      userId: "user_1",
      passwordHash: expect.any(String),
      usedAt: new Date("2026-06-09T12:00:00.000Z"),
    });
  });

  it("activates an invitation from form data", async () => {
    const repository: InvitationRepository = {
      createInvitationToken: vi.fn(),
      findInvitationByTokenHash: vi.fn(async () => ({
        id: "invitation_1",
        userId: "user_1",
        membershipId: "membership_1",
        expiresAt: new Date("2026-06-16T12:00:00.000Z"),
        usedAt: null,
      })),
      activateInvitation: vi.fn(async () => true),
    };
    const action = createActivateInvitationAction({
      repository,
      now: () => new Date("2026-06-09T12:00:00.000Z"),
    });

    const result = await action(formData({ token: "raw-token", password: "CorrectPassword123!" }));

    expect(result).toEqual({
      status: "success",
      message: "Account activated. You can sign in now.",
    });
    expect(repository.activateInvitation).toHaveBeenCalledWith({
      invitationId: "invitation_1",
      userId: "user_1",
      membershipId: "membership_1",
      passwordHash: expect.any(String),
      usedAt: new Date("2026-06-09T12:00:00.000Z"),
    });
  });
});
