import { describe, expect, it } from "vitest";

import {
  INVITATION_EXPIRES_IN_MINUTES,
  activateInvitation,
  createInvitation,
  type InvitationRepository,
} from "./invitations";
import { hashToken } from "./tokens";
import { verifyPassword } from "../../lib/auth/password";

type InvitationTokenRecord = {
  id: string;
  organizationId: string;
  membershipId: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  usedAt: Date | null;
};

class FakeInvitationRepository implements InvitationRepository {
  readonly invitationTokens: InvitationTokenRecord[] = [];
  readonly users = new Map<string, { status: "INVITED" | "ACTIVE"; passwordHash: string | null }>();
  readonly memberships = new Map<string, { status: "INVITED" | "ACTIVE" }>();
  readonly activationCalls: Array<{
    invitationId: string;
    userId: string;
    membershipId: string;
    passwordHash: string;
    usedAt: Date;
  }> = [];

  async createInvitationToken(data: {
    organizationId: string;
    membershipId: string;
    userId: string;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<void> {
    this.invitationTokens.push({
      id: `invitation_${this.invitationTokens.length + 1}`,
      usedAt: null,
      ...data,
    });
    this.users.set(data.userId, { status: "INVITED", passwordHash: null });
    this.memberships.set(data.membershipId, { status: "INVITED" });
  }

  async findInvitationByTokenHash(tokenHash: string): Promise<{
    id: string;
    userId: string;
    membershipId: string;
    expiresAt: Date;
    usedAt: Date | null;
  } | null> {
    const token = this.invitationTokens.find((invitationToken) => invitationToken.tokenHash === tokenHash);

    if (!token) {
      return null;
    }

    return {
      id: token.id,
      userId: token.userId,
      membershipId: token.membershipId,
      expiresAt: token.expiresAt,
      usedAt: token.usedAt,
    };
  }

  async activateInvitation(data: {
    invitationId: string;
    userId: string;
    membershipId: string;
    passwordHash: string;
    usedAt: Date;
  }): Promise<boolean> {
    const token = this.invitationTokens.find(
      (invitationToken) =>
        invitationToken.id === data.invitationId &&
        invitationToken.userId === data.userId &&
        invitationToken.membershipId === data.membershipId,
    );

    if (!token || token.usedAt !== null || token.expiresAt.getTime() <= data.usedAt.getTime()) {
      return false;
    }

    token.usedAt = data.usedAt;
    this.activationCalls.push(data);
    this.users.set(data.userId, { status: "ACTIVE", passwordHash: data.passwordHash });
    this.memberships.set(data.membershipId, { status: "ACTIVE" });

    return true;
  }
}

describe("invitation service", () => {
  it("creates an expiring invitation token and stores only the hash", async () => {
    const now = new Date("2026-06-09T12:00:00.000Z");
    const repository = new FakeInvitationRepository();

    const result = await createInvitation(
      {
        organizationId: "org_1",
        membershipId: "membership_1",
        userId: "user_1",
        now,
      },
      repository,
    );

    expect(result.rawToken).toEqual(expect.any(String));
    expect(result.rawToken.length).toBeGreaterThanOrEqual(32);
    expect(result.expiresAt.toISOString()).toBe("2026-06-16T12:00:00.000Z");
    expect(INVITATION_EXPIRES_IN_MINUTES).toBe(60 * 24 * 7);
    expect(repository.invitationTokens).toEqual([
      {
        id: "invitation_1",
        organizationId: "org_1",
        membershipId: "membership_1",
        userId: "user_1",
        tokenHash: hashToken(result.rawToken),
        expiresAt: result.expiresAt,
        usedAt: null,
      },
    ]);
    expect(repository.invitationTokens[0]?.tokenHash).not.toBe(result.rawToken);
  });

  it("rejects missing invitation tokens", async () => {
    const repository = new FakeInvitationRepository();

    await expect(
      activateInvitation(
        {
          rawToken: "missing-token",
          password: "CorrectPassword123!",
          now: new Date("2026-06-09T12:00:00.000Z"),
        },
        repository,
      ),
    ).rejects.toThrow("Invitation token is invalid or expired");
    expect(repository.activationCalls).toEqual([]);
  });

  it("rejects used invitation tokens", async () => {
    const now = new Date("2026-06-09T12:00:00.000Z");
    const repository = new FakeInvitationRepository();
    const invitation = await createInvitation(
      {
        organizationId: "org_1",
        membershipId: "membership_1",
        userId: "user_1",
        now,
      },
      repository,
    );
    repository.invitationTokens[0]!.usedAt = new Date("2026-06-09T12:01:00.000Z");

    await expect(
      activateInvitation(
        {
          rawToken: invitation.rawToken,
          password: "CorrectPassword123!",
          now: new Date("2026-06-09T12:02:00.000Z"),
        },
        repository,
      ),
    ).rejects.toThrow("Invitation token is invalid or expired");
    expect(repository.activationCalls).toEqual([]);
  });

  it("rejects expired invitation tokens", async () => {
    const now = new Date("2026-06-09T12:00:00.000Z");
    const repository = new FakeInvitationRepository();
    const invitation = await createInvitation(
      {
        organizationId: "org_1",
        membershipId: "membership_1",
        userId: "user_1",
        now,
      },
      repository,
    );

    await expect(
      activateInvitation(
        {
          rawToken: invitation.rawToken,
          password: "CorrectPassword123!",
          now: new Date("2026-06-16T12:00:00.000Z"),
        },
        repository,
      ),
    ).rejects.toThrow("Invitation token is invalid or expired");
    expect(repository.activationCalls).toEqual([]);
  });

  it("activates valid invitations with a password hash and used timestamp", async () => {
    const now = new Date("2026-06-09T12:00:00.000Z");
    const usedAt = new Date("2026-06-09T12:30:00.000Z");
    const repository = new FakeInvitationRepository();
    const invitation = await createInvitation(
      {
        organizationId: "org_1",
        membershipId: "membership_1",
        userId: "user_1",
        now,
      },
      repository,
    );

    await activateInvitation(
      {
        rawToken: invitation.rawToken,
        password: "CorrectPassword123!",
        now: usedAt,
      },
      repository,
    );

    expect(repository.activationCalls).toHaveLength(1);
    expect(repository.activationCalls[0]).toMatchObject({
      invitationId: "invitation_1",
      userId: "user_1",
      membershipId: "membership_1",
      usedAt,
    });
    expect(repository.activationCalls[0]?.passwordHash).not.toBe("CorrectPassword123!");
    await expect(verifyPassword("CorrectPassword123!", repository.activationCalls[0]!.passwordHash)).resolves.toBe(
      true,
    );
    expect(repository.invitationTokens[0]?.usedAt).toBe(usedAt);
    expect(repository.users.get("user_1")?.status).toBe("ACTIVE");
    expect(repository.users.get("user_1")?.passwordHash).toBe(repository.activationCalls[0]?.passwordHash);
    expect(repository.memberships.get("membership_1")?.status).toBe("ACTIVE");
  });

  it("consumes a valid invitation so the same token cannot be activated twice", async () => {
    const now = new Date("2026-06-09T12:00:00.000Z");
    const repository = new FakeInvitationRepository();
    const invitation = await createInvitation(
      {
        organizationId: "org_1",
        membershipId: "membership_1",
        userId: "user_1",
        now,
      },
      repository,
    );

    await activateInvitation(
      {
        rawToken: invitation.rawToken,
        password: "CorrectPassword123!",
        now: new Date("2026-06-09T12:30:00.000Z"),
      },
      repository,
    );

    await expect(
      activateInvitation(
        {
          rawToken: invitation.rawToken,
          password: "AnotherPassword123!",
          now: new Date("2026-06-09T12:31:00.000Z"),
        },
        repository,
      ),
    ).rejects.toThrow("Invitation token is invalid or expired");
    expect(repository.activationCalls).toHaveLength(1);
  });

  it("rejects when the repository cannot atomically consume the invitation", async () => {
    const now = new Date("2026-06-09T12:00:00.000Z");
    const repository = new FakeInvitationRepository();
    const invitation = await createInvitation(
      {
        organizationId: "org_1",
        membershipId: "membership_1",
        userId: "user_1",
        now,
      },
      repository,
    );
    const failingRepository: InvitationRepository = {
      createInvitationToken: repository.createInvitationToken.bind(repository),
      findInvitationByTokenHash: repository.findInvitationByTokenHash.bind(repository),
      activateInvitation: async () => false,
    };

    await expect(
      activateInvitation(
        {
          rawToken: invitation.rawToken,
          password: "CorrectPassword123!",
          now: new Date("2026-06-09T12:30:00.000Z"),
        },
        failingRepository,
      ),
    ).rejects.toThrow("Invitation token is invalid or expired");
  });
});
