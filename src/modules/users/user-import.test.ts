import { describe, expect, it, vi } from "vitest";

import type { UserImportPlan } from "./csv-import";
import { commitUserImport, type CommitUserImportRepository } from "./user-import";

function createRepository(): CommitUserImportRepository & {
  calls: string[];
} {
  const userIdsByEmail = new Map<string, string>();
  const membershipIdsByEmail = new Map<string, string>();
  const calls: string[] = [];

  return {
    calls,
    upsertUser: vi.fn(async (data) => {
      calls.push(`user:${data.email}`);
      const id = `user_${userIdsByEmail.size + 1}`;
      userIdsByEmail.set(data.email, id);

      return { id, email: data.email };
    }),
    upsertMembership: vi.fn(async (data) => {
      calls.push(`membership:${data.userId}`);
      const email = [...userIdsByEmail.entries()].find(([, id]) => id === data.userId)?.[0] ?? data.userId;
      const id = `membership_${membershipIdsByEmail.size + 1}`;
      membershipIdsByEmail.set(email, id);

      return { id, userId: data.userId, email };
    }),
    setMembershipManager: vi.fn(async (data) => {
      calls.push(`manager:${data.membershipId}:${data.managerMembershipId ?? "none"}`);
    }),
    createInvitation: vi.fn(async (data) => {
      calls.push(`invitation:${data.membershipId}:${data.userId}`);
    }),
    recordAuditLog: vi.fn(async (data) => {
      calls.push(`audit:${data.importedCount}`);
    }),
  };
}

const validPlan: UserImportPlan = {
  errors: [],
  rows: [
    {
      rowNumber: 2,
      email: "manager@acme.test",
      firstName: "Mohan",
      lastName: "Manager",
      role: "MANAGER",
      managerEmail: null,
      employeeId: "MGR-1",
      department: "Operations",
      title: "Manager",
      status: "ACTIVE",
    },
    {
      rowNumber: 3,
      email: "learner@acme.test",
      firstName: "Leela",
      lastName: "Learner",
      role: "LEARNER",
      managerEmail: "manager@acme.test",
      employeeId: "EMP-1",
      department: "Operations",
      title: "Specialist",
      status: "INVITED",
    },
    {
      rowNumber: 4,
      email: "admin@acme.test",
      firstName: "Asha",
      lastName: "Admin",
      role: "ADMIN",
      managerEmail: null,
      employeeId: null,
      department: null,
      title: null,
      status: "INACTIVE",
    },
  ],
};

describe("commitUserImport", () => {
  it("fails if the import plan contains validation errors", async () => {
    const repository = createRepository();

    await expect(
      commitUserImport(
        {
          organizationId: "org_1",
          actorId: "actor_1",
          now: new Date("2026-06-09T12:00:00.000Z"),
          plan: {
            rows: [],
            errors: [{ rowNumber: 2, field: "email", message: "Email domain is not allowed for this organization" }],
          },
        },
        repository,
      ),
    ).rejects.toThrow("Cannot commit a user import plan with validation errors");

    expect(repository.upsertUser).not.toHaveBeenCalled();
    expect(repository.upsertMembership).not.toHaveBeenCalled();
    expect(repository.recordAuditLog).not.toHaveBeenCalled();
  });

  it("upserts users and memberships in row order, then connects managers after memberships exist", async () => {
    const repository = createRepository();
    const now = new Date("2026-06-09T12:00:00.000Z");

    const result = await commitUserImport(
      {
        organizationId: "org_1",
        actorId: "actor_1",
        plan: validPlan,
        now,
      },
      repository,
    );

    expect(result).toEqual({ importedCount: 3 });
    expect(repository.upsertUser).toHaveBeenNthCalledWith(1, {
      email: "manager@acme.test",
      firstName: "Mohan",
      lastName: "Manager",
      status: "ACTIVE",
    });
    expect(repository.upsertUser).toHaveBeenNthCalledWith(2, {
      email: "learner@acme.test",
      firstName: "Leela",
      lastName: "Learner",
      status: "INVITED",
    });
    expect(repository.upsertMembership).toHaveBeenNthCalledWith(2, {
      organizationId: "org_1",
      userId: "user_2",
      roles: ["LEARNER"],
      employeeId: "EMP-1",
      department: "Operations",
      title: "Specialist",
      status: "INVITED",
    });
    expect(repository.calls).toEqual([
      "user:manager@acme.test",
      "membership:user_1",
      "user:learner@acme.test",
      "membership:user_2",
      "user:admin@acme.test",
      "membership:user_3",
      "manager:membership_1:none",
      "manager:membership_2:membership_1",
      "manager:membership_3:none",
      "invitation:membership_2:user_2",
      "audit:3",
    ]);
    expect(repository.setMembershipManager).toHaveBeenNthCalledWith(2, {
      organizationId: "org_1",
      membershipId: "membership_2",
      managerMembershipId: "membership_1",
    });
  });

  it("creates invitations for invited rows only and records an audit log", async () => {
    const repository = createRepository();
    const now = new Date("2026-06-09T12:00:00.000Z");

    await commitUserImport(
      {
        organizationId: "org_1",
        actorId: "actor_1",
        plan: validPlan,
        now,
      },
      repository,
    );

    expect(repository.createInvitation).toHaveBeenCalledTimes(1);
    expect(repository.createInvitation).toHaveBeenCalledWith({
      organizationId: "org_1",
      membershipId: "membership_2",
      userId: "user_2",
      now,
    });
    expect(repository.recordAuditLog).toHaveBeenCalledWith({
      organizationId: "org_1",
      actorId: "actor_1",
      importedCount: 3,
    });
  });
});
