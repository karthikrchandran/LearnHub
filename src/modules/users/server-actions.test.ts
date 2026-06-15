import { describe, expect, it, vi } from "vitest";

import type { MembershipAuthContext } from "../auth/permissions";
import type {
  OrganizationUserLifecycleRecord,
  OrganizationUserLifecycleRepository,
} from "./lifecycle";
import { createCommitUserImportAction, createValidateUserImportAction } from "./server-actions";
import type { CommitUserImportRepository } from "./user-import";

function formData(entries: Record<string, string | string[]>): FormData {
  const data = new FormData();

  for (const [key, value] of Object.entries(entries)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        data.append(key, item);
      }
    } else {
      data.set(key, value);
    }
  }

  return data;
}

const validCsv = [
  "email,firstName,lastName,role,managerEmail,employeeId,department,title,status",
  "manager@acme.test,Mohan,Manager,MANAGER,,MGR-1,Operations,Manager,ACTIVE",
  "learner@acme.test,Leela,Learner,LEARNER,manager@acme.test,EMP-1,Operations,Specialist,",
].join("\n");

describe("user import server actions", () => {
  it("validates CSV using organization domains and existing managers", async () => {
    const action = createValidateUserImportAction({
      getOrganizationImportContext: vi.fn(async () => ({
        organizationId: "org_1",
        allowedEmailDomains: ["acme.test"],
        existingManagerEmails: [],
      })),
    });

    const result = await action("acme", formData({ userCsv: validCsv }));

    expect(result.status).toBe("success");
    expect(result.plan?.rows).toHaveLength(2);
    expect(result.plan?.errors).toEqual([]);
  });

  it("commits a valid CSV import for an authorized actor", async () => {
    const repository: CommitUserImportRepository = {
      runInTransaction: vi.fn(async (operation) => operation()),
      upsertUser: vi.fn(async (data) => ({ id: `user:${data.email}`, email: data.email })),
      upsertMembership: vi.fn(async (data) => ({
        id: `membership:${data.userId}`,
        userId: data.userId,
        email: data.userId.replace("user:", ""),
      })),
      findMembershipByOrganizationAndEmail: vi.fn(async () => null),
      setMembershipManager: vi.fn(),
      createInvitation: vi.fn(),
      recordAuditLog: vi.fn(),
    };
    const action = createCommitUserImportAction({
      getActor: async () => ({ userId: "admin_1" }),
      getOrganizationImportContext: async () => ({
        organizationId: "org_1",
        allowedEmailDomains: ["acme.test"],
        existingManagerEmails: [],
      }),
      repository,
      now: () => new Date("2026-06-09T12:00:00.000Z"),
    });

    const result = await action("acme", formData({ userCsv: validCsv }));

    expect(result).toEqual({
      status: "success",
      message: "Imported 2 users.",
      importedCount: 2,
    });
    expect(repository.recordAuditLog).toHaveBeenCalledWith({
      organizationId: "org_1",
      actorId: "admin_1",
      importedCount: 2,
    });
  });
});

const admin: MembershipAuthContext = {
  userId: "admin_1",
  isPlatformOwner: false,
  memberships: [
    {
      id: "admin_membership",
      organizationId: "org_1",
      roles: ["ADMIN"],
      status: "ACTIVE",
      managerMembershipId: null,
    },
  ],
};

const lifecycleRecord: OrganizationUserLifecycleRecord = {
  id: "learner_membership",
  organizationId: "org_1",
  userId: "learner_user",
  roles: ["LEARNER"],
  status: "INVITED",
  managerMembershipId: null,
  employeeId: null,
  department: null,
  title: null,
  user: {
    email: "learner@acme.test",
    status: "INVITED",
  },
};

function createLifecycleRepository(): OrganizationUserLifecycleRepository & {
  savedMemberships: Parameters<OrganizationUserLifecycleRepository["saveMembershipLifecycle"]>[0][];
  invitations: Parameters<OrganizationUserLifecycleRepository["createInvitation"]>[0][];
  passwordResets: Parameters<OrganizationUserLifecycleRepository["createPasswordReset"]>[0][];
} {
  const savedMemberships: Parameters<OrganizationUserLifecycleRepository["saveMembershipLifecycle"]>[0][] = [];
  const invitations: Parameters<OrganizationUserLifecycleRepository["createInvitation"]>[0][] = [];
  const passwordResets: Parameters<OrganizationUserLifecycleRepository["createPasswordReset"]>[0][] = [];
  let current = lifecycleRecord;

  return {
    savedMemberships,
    invitations,
    passwordResets,
    async runInTransaction(operation) {
      return operation();
    },
    async findMembershipForLifecycle(input) {
      return input.organizationId === "org_1" && input.membershipId === current.id ? current : null;
    },
    async findManagerMembership() {
      return null;
    },
    async countActiveAdminMemberships(input) {
      return current.organizationId === input.organizationId &&
        current.status === "ACTIVE" &&
        current.roles.includes("ADMIN")
        ? 1
        : 0;
    },
    async saveMembershipLifecycle(data) {
      savedMemberships.push(data);
      current = { ...current, ...data };

      return current;
    },
    async saveUserStatus() {},
    async createInvitation(data) {
      invitations.push(data);

      return {
        rawToken: "invite_token",
        expiresAt: new Date("2026-06-20T12:00:00.000Z"),
      };
    },
    async createPasswordReset(data) {
      passwordResets.push(data);

      return {
        rawToken: "reset_token",
        expiresAt: new Date("2026-06-13T13:00:00.000Z"),
      };
    },
    async recordAuditLog() {},
  };
}

describe("user lifecycle server actions", () => {
  it("updates lifecycle data from form values", async () => {
    const repository = createLifecycleRepository();
    const { createUpdateOrganizationUserLifecycleAction } = await import("./server-actions");
    const action = createUpdateOrganizationUserLifecycleAction({
      getActor: async () => admin,
      getOrganizationIdBySlug: async () => "org_1",
      repository,
    });

    const result = await action(
      "acme",
      formData({
        membershipId: "learner_membership",
        roles: ["LEARNER", "MANAGER"],
        managerMembershipId: "",
        employeeId: "EMP-2",
        department: "Support",
        title: "Team Lead",
        status: "ACTIVE",
      }),
    );

    expect(result).toEqual({
      status: "success",
      message: "User updated.",
    });
    expect(repository.savedMemberships).toEqual([
      {
        organizationId: "org_1",
        membershipId: "learner_membership",
        roles: ["LEARNER", "MANAGER"],
        managerMembershipId: null,
        employeeId: "EMP-2",
        department: "Support",
        title: "Team Lead",
        status: "ACTIVE",
      },
    ]);
  });

  it("resends an invitation from a membership id", async () => {
    const repository = createLifecycleRepository();
    const { createResendOrganizationUserInvitationAction } = await import("./server-actions");
    const action = createResendOrganizationUserInvitationAction({
      getActor: async () => admin,
      getOrganizationIdBySlug: async () => "org_1",
      repository,
      now: () => new Date("2026-06-13T12:00:00.000Z"),
    });

    const result = await action(
      "acme",
      formData({ membershipId: "learner_membership" }),
    );

    expect(result).toEqual({
      status: "success",
      message: "Invitation resent.",
    });
    expect(repository.invitations).toEqual([
      {
        organizationId: "org_1",
        membershipId: "learner_membership",
        userId: "learner_user",
        now: new Date("2026-06-13T12:00:00.000Z"),
      },
    ]);
  });

  it("issues a password reset and sends the generated token", async () => {
    const repository = createLifecycleRepository();
    const sendPasswordReset = vi.fn();
    const { createIssueOrganizationUserPasswordResetAction } = await import("./server-actions");
    const action = createIssueOrganizationUserPasswordResetAction({
      getActor: async () => admin,
      getOrganizationIdBySlug: async () => "org_1",
      repository,
      sendPasswordReset,
      now: () => new Date("2026-06-13T12:00:00.000Z"),
    });

    const result = await action(
      "acme",
      formData({ membershipId: "learner_membership" }),
    );

    expect(result).toEqual({
      status: "success",
      message: "Password reset issued.",
    });
    expect(repository.passwordResets).toEqual([
      {
        userId: "learner_user",
        now: new Date("2026-06-13T12:00:00.000Z"),
      },
    ]);
    expect(sendPasswordReset).toHaveBeenCalledWith({
      email: "learner@acme.test",
      rawToken: "reset_token",
      expiresAt: new Date("2026-06-13T13:00:00.000Z"),
    });
  });
});
