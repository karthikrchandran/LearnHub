import { describe, expect, it, vi } from "vitest";

import type { MembershipAuthContext } from "../auth/permissions";
import {
  issueOrganizationUserPasswordReset,
  resendOrganizationUserInvitation,
  updateOrganizationUserLifecycle,
  type OrganizationUserLifecycleRecord,
  type OrganizationUserLifecycleRepository,
} from "./lifecycle";

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

const baseMembership: OrganizationUserLifecycleRecord = {
  id: "learner_membership",
  organizationId: "org_1",
  userId: "learner_user",
  roles: ["LEARNER"],
  status: "ACTIVE",
  managerMembershipId: null,
  employeeId: "EMP-1",
  department: "Operations",
  title: "Specialist",
  user: {
    email: "learner@acme.test",
    status: "ACTIVE",
  },
};

const managerMembership: OrganizationUserLifecycleRecord = {
  ...baseMembership,
  id: "manager_membership",
  userId: "manager_user",
  roles: ["MANAGER"],
  status: "ACTIVE",
  user: {
    email: "manager@acme.test",
    status: "ACTIVE",
  },
};

function createRepository(
  membership: OrganizationUserLifecycleRecord | null = baseMembership,
): OrganizationUserLifecycleRepository & {
  savedMemberships: Parameters<OrganizationUserLifecycleRepository["saveMembershipLifecycle"]>[0][];
  savedUserStatuses: Parameters<OrganizationUserLifecycleRepository["saveUserStatus"]>[0][];
  invitations: Parameters<OrganizationUserLifecycleRepository["createInvitation"]>[0][];
  passwordResets: Parameters<OrganizationUserLifecycleRepository["createPasswordReset"]>[0][];
  auditLogs: Parameters<OrganizationUserLifecycleRepository["recordAuditLog"]>[0][];
} {
  let current = membership;
  const savedMemberships: Parameters<OrganizationUserLifecycleRepository["saveMembershipLifecycle"]>[0][] = [];
  const savedUserStatuses: Parameters<OrganizationUserLifecycleRepository["saveUserStatus"]>[0][] = [];
  const invitations: Parameters<OrganizationUserLifecycleRepository["createInvitation"]>[0][] = [];
  const passwordResets: Parameters<OrganizationUserLifecycleRepository["createPasswordReset"]>[0][] = [];
  const auditLogs: Parameters<OrganizationUserLifecycleRepository["recordAuditLog"]>[0][] = [];

  return {
    savedMemberships,
    savedUserStatuses,
    invitations,
    passwordResets,
    auditLogs,
    async runInTransaction(operation) {
      return operation();
    },
    async findMembershipForLifecycle(input) {
      if (
        current?.organizationId === input.organizationId &&
        current.id === input.membershipId
      ) {
        return current;
      }

      return null;
    },
    async findManagerMembership(input) {
      if (
        input.organizationId === "org_1" &&
        input.managerMembershipId === managerMembership.id
      ) {
        return managerMembership;
      }

      return null;
    },
    async countActiveAdminMemberships(input) {
      return current?.organizationId === input.organizationId &&
        current.status === "ACTIVE" &&
        current.roles.includes("ADMIN")
        ? 1
        : 0;
    },
    async saveMembershipLifecycle(data) {
      savedMemberships.push(data);
      current = { ...current!, ...data };

      return current;
    },
    async saveUserStatus(data) {
      savedUserStatuses.push(data);
      if (current) {
        current = { ...current, user: { ...current.user, status: data.status } };
      }
    },
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
    async recordAuditLog(data) {
      auditLogs.push(data);
    },
  };
}

describe("organization user lifecycle", () => {
  it("updates roles, manager, profile fields, status, and audit diffs", async () => {
    const repository = createRepository();

    const result = await updateOrganizationUserLifecycle(
      {
        actor: admin,
        organizationId: "org_1",
        membershipId: "learner_membership",
        changes: {
          roles: ["LEARNER", "MANAGER"],
          managerMembershipId: "manager_membership",
          employeeId: "EMP-2",
          department: "Support",
          title: "Team Lead",
          status: "INACTIVE",
        },
      },
      repository,
    );

    expect(result).toMatchObject({
      id: "learner_membership",
      roles: ["LEARNER", "MANAGER"],
      managerMembershipId: "manager_membership",
      employeeId: "EMP-2",
      department: "Support",
      title: "Team Lead",
      status: "INACTIVE",
      user: { status: "INACTIVE" },
    });
    expect(repository.savedMemberships).toEqual([
      {
        organizationId: "org_1",
        membershipId: "learner_membership",
        roles: ["LEARNER", "MANAGER"],
        managerMembershipId: "manager_membership",
        employeeId: "EMP-2",
        department: "Support",
        title: "Team Lead",
        status: "INACTIVE",
      },
    ]);
    expect(repository.savedUserStatuses).toEqual([
      { userId: "learner_user", status: "INACTIVE" },
    ]);
    expect(repository.auditLogs).toEqual([
      {
        organizationId: "org_1",
        actorId: "admin_1",
        action: "users.lifecycle.updated",
        targetType: "organizationMembership",
        targetId: "learner_membership",
        metadata: {
          changed: [
            "roles",
            "managerMembershipId",
            "employeeId",
            "department",
            "title",
            "status",
          ],
          previous: {
            roles: ["LEARNER"],
            managerMembershipId: null,
            employeeId: "EMP-1",
            department: "Operations",
            title: "Specialist",
            status: "ACTIVE",
          },
          next: {
            roles: ["LEARNER", "MANAGER"],
            managerMembershipId: "manager_membership",
            employeeId: "EMP-2",
            department: "Support",
            title: "Team Lead",
            status: "INACTIVE",
          },
          userEmail: "learner@acme.test",
        },
      },
    ]);
  });

  it("rejects managers outside the organization manager scope", async () => {
    const repository = createRepository();

    await expect(
      updateOrganizationUserLifecycle(
        {
          actor: admin,
          organizationId: "org_1",
          membershipId: "learner_membership",
          changes: {
            roles: ["LEARNER"],
            managerMembershipId: "outside_manager",
            employeeId: "EMP-1",
            department: "Operations",
            title: "Specialist",
            status: "ACTIVE",
          },
        },
        repository,
      ),
    ).rejects.toThrow("Manager membership was not found");
    expect(repository.savedMemberships).toEqual([]);
  });

  it("deactivates only user and membership state, preserving progress and certificates", async () => {
    const repository = createRepository();

    await updateOrganizationUserLifecycle(
      {
        actor: admin,
        organizationId: "org_1",
        membershipId: "learner_membership",
        changes: {
          roles: ["LEARNER"],
          managerMembershipId: null,
          employeeId: "EMP-1",
          department: "Operations",
          title: "Specialist",
          status: "INACTIVE",
        },
      },
      repository,
    );

    expect(repository.savedMemberships[0]).toEqual({
      organizationId: "org_1",
      membershipId: "learner_membership",
      roles: ["LEARNER"],
      managerMembershipId: null,
      employeeId: "EMP-1",
      department: "Operations",
      title: "Specialist",
      status: "INACTIVE",
    });
    expect(repository.savedUserStatuses).toEqual([
      { userId: "learner_user", status: "INACTIVE" },
    ]);
  });

  it("blocks deactivating the last active organization admin", async () => {
    const lastAdminMembership: OrganizationUserLifecycleRecord = {
      ...baseMembership,
      id: "admin_membership",
      userId: "admin_user",
      roles: ["ADMIN"],
      user: {
        email: "admin@acme.test",
        status: "ACTIVE",
      },
    };
    const repository = createRepository(lastAdminMembership);

    await expect(
      updateOrganizationUserLifecycle(
        {
          actor: admin,
          organizationId: "org_1",
          membershipId: "admin_membership",
          changes: {
            roles: ["ADMIN"],
            managerMembershipId: null,
            employeeId: "EMP-1",
            department: "Operations",
            title: "Specialist",
            status: "INACTIVE",
          },
        },
        repository,
      ),
    ).rejects.toThrow("At least one active organization admin is required");
    expect(repository.savedMemberships).toEqual([]);
    expect(repository.savedUserStatuses).toEqual([]);
  });

  it("blocks removing the admin role from the last active organization admin", async () => {
    const lastAdminMembership: OrganizationUserLifecycleRecord = {
      ...baseMembership,
      id: "admin_membership",
      userId: "admin_user",
      roles: ["ADMIN", "LEARNER"],
      user: {
        email: "admin@acme.test",
        status: "ACTIVE",
      },
    };
    const repository = createRepository(lastAdminMembership);

    await expect(
      updateOrganizationUserLifecycle(
        {
          actor: admin,
          organizationId: "org_1",
          membershipId: "admin_membership",
          changes: {
            roles: ["LEARNER"],
            managerMembershipId: null,
            employeeId: "EMP-1",
            department: "Operations",
            title: "Specialist",
            status: "ACTIVE",
          },
        },
        repository,
      ),
    ).rejects.toThrow("At least one active organization admin is required");
    expect(repository.savedMemberships).toEqual([]);
    expect(repository.savedUserStatuses).toEqual([]);
  });

  it("resends invitations only for invited memberships and records audit metadata", async () => {
    const repository = createRepository({
      ...baseMembership,
      status: "INVITED",
      user: { ...baseMembership.user, status: "INVITED" },
    });
    const now = new Date("2026-06-13T12:00:00.000Z");

    await expect(
      resendOrganizationUserInvitation(
        {
          actor: admin,
          organizationId: "org_1",
          membershipId: "learner_membership",
          now,
        },
        repository,
      ),
    ).resolves.toEqual({
      rawToken: "invite_token",
      expiresAt: new Date("2026-06-20T12:00:00.000Z"),
    });
    expect(repository.invitations).toEqual([
      {
        organizationId: "org_1",
        membershipId: "learner_membership",
        userId: "learner_user",
        now,
      },
    ]);
    expect(repository.auditLogs[0]).toMatchObject({
      action: "users.invitation.resent",
      metadata: {
        userEmail: "learner@acme.test",
        membershipStatus: "INVITED",
      },
    });

    await expect(
      resendOrganizationUserInvitation(
        {
          actor: admin,
          organizationId: "org_1",
          membershipId: "learner_membership",
          now,
        },
        createRepository(baseMembership),
      ),
    ).rejects.toThrow("Invitations can only be resent to invited users");
  });

  it("issues password reset for active or invited users and records audit metadata", async () => {
    const repository = createRepository();
    const now = new Date("2026-06-13T12:00:00.000Z");

    await expect(
      issueOrganizationUserPasswordReset(
        {
          actor: admin,
          organizationId: "org_1",
          membershipId: "learner_membership",
          now,
        },
        repository,
      ),
    ).resolves.toEqual({
      rawToken: "reset_token",
      expiresAt: new Date("2026-06-13T13:00:00.000Z"),
      email: "learner@acme.test",
    });
    expect(repository.passwordResets).toEqual([
      {
        userId: "learner_user",
        now,
      },
    ]);
    expect(repository.auditLogs[0]).toMatchObject({
      action: "users.password_reset.issued",
      metadata: {
        userEmail: "learner@acme.test",
        membershipStatus: "ACTIVE",
      },
    });

    await expect(
      issueOrganizationUserPasswordReset(
        {
          actor: admin,
          organizationId: "org_1",
          membershipId: "learner_membership",
          now,
        },
        createRepository({
          ...baseMembership,
          status: "INACTIVE",
          user: { ...baseMembership.user, status: "INACTIVE" },
        }),
      ),
    ).rejects.toThrow("Password reset can only be issued for active or invited users");
  });

  it("requires an organization admin or platform owner actor", async () => {
    const repository = createRepository();
    const learnerActor: MembershipAuthContext = {
      userId: "learner_user",
      isPlatformOwner: false,
      memberships: [
        {
          id: "learner_membership",
          organizationId: "org_1",
          roles: ["LEARNER"],
          status: "ACTIVE",
          managerMembershipId: null,
        },
      ],
    };

    await expect(
      updateOrganizationUserLifecycle(
        {
          actor: learnerActor,
          organizationId: "org_1",
          membershipId: "learner_membership",
          changes: {
            roles: ["LEARNER"],
            managerMembershipId: null,
            employeeId: "EMP-1",
            department: "Operations",
            title: "Specialist",
            status: "ACTIVE",
          },
        },
        repository,
      ),
    ).rejects.toThrow("Not allowed to manage organization users");
    expect(repository.savedMemberships).toEqual([]);
  });

  it("does not persist or audit unchanged lifecycle data", async () => {
    const repository = createRepository();
    const recordAudit = vi.spyOn(repository, "recordAuditLog");

    const result = await updateOrganizationUserLifecycle(
      {
        actor: admin,
        organizationId: "org_1",
        membershipId: "learner_membership",
        changes: {
          roles: ["LEARNER"],
          managerMembershipId: null,
          employeeId: "EMP-1",
          department: "Operations",
          title: "Specialist",
          status: "ACTIVE",
        },
      },
      repository,
    );

    expect(result).toEqual(baseMembership);
    expect(repository.savedMemberships).toEqual([]);
    expect(recordAudit).not.toHaveBeenCalled();
  });
});
