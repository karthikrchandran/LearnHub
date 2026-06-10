import { describe, expect, it } from "vitest";

import {
  canAssignDirectReport,
  canManageOrganization,
  canManageOrganizationUsers,
  canViewMembershipProgress,
  type MembershipAuthContext,
} from "./permissions";

const admin: MembershipAuthContext = {
  userId: "admin-user",
  isPlatformOwner: false,
  memberships: [
    {
      id: "admin-membership",
      organizationId: "org_1",
      roles: ["ADMIN"],
      status: "ACTIVE",
      managerMembershipId: null,
    },
  ],
};

const manager: MembershipAuthContext = {
  userId: "manager-user",
  isPlatformOwner: false,
  memberships: [
    {
      id: "manager-membership",
      organizationId: "org_1",
      roles: ["MANAGER"],
      status: "ACTIVE",
      managerMembershipId: null,
    },
  ],
};

const learner: MembershipAuthContext = {
  userId: "learner-user",
  isPlatformOwner: false,
  memberships: [
    {
      id: "learner-membership",
      organizationId: "org_1",
      roles: ["LEARNER"],
      status: "ACTIVE",
      managerMembershipId: null,
    },
  ],
};

describe("authorization permissions", () => {
  it("lets platform owners manage any organization", () => {
    const owner = { userId: "owner", isPlatformOwner: true, memberships: [] };

    expect(canManageOrganization(owner, "org_any")).toBe(true);
    expect(canManageOrganizationUsers(owner, "org_any")).toBe(true);
  });

  it("lets organization admins manage their own users only", () => {
    expect(canManageOrganizationUsers(admin, "org_1")).toBe(true);
    expect(canManageOrganizationUsers(admin, "org_2")).toBe(false);
  });

  it("does not let inactive admin memberships manage organization users", () => {
    expect(
      canManageOrganizationUsers(
        {
          userId: "inactive-admin-user",
          isPlatformOwner: false,
          memberships: [
            {
              id: "inactive-admin-membership",
              organizationId: "org_1",
              roles: ["ADMIN"],
              status: "INACTIVE",
              managerMembershipId: null,
            },
          ],
        },
        "org_1",
      ),
    ).toBe(false);
  });

  it("lets managers view only direct report progress in the same organization", () => {
    expect(
      canViewMembershipProgress(manager, {
        id: "learner-membership",
        userId: "learner-user",
        organizationId: "org_1",
        managerMembershipId: "manager-membership",
      }),
    ).toBe(true);

    expect(
      canViewMembershipProgress(manager, {
        id: "other-learner",
        userId: "other-user",
        organizationId: "org_1",
        managerMembershipId: null,
      }),
    ).toBe(false);

    expect(
      canViewMembershipProgress(manager, {
        id: "cross-org-learner",
        userId: "other-user",
        organizationId: "org_2",
        managerMembershipId: "manager-membership",
      }),
    ).toBe(false);
  });

  it("does not let invited manager memberships view direct report progress", () => {
    expect(
      canViewMembershipProgress(
        {
          userId: "invited-manager-user",
          isPlatformOwner: false,
          memberships: [
            {
              id: "invited-manager-membership",
              organizationId: "org_1",
              roles: ["MANAGER"],
              status: "INVITED",
              managerMembershipId: null,
            },
          ],
        },
        {
          id: "learner-membership",
          userId: "learner-user",
          organizationId: "org_1",
          managerMembershipId: "invited-manager-membership",
        },
      ),
    ).toBe(false);
  });

  it("lets learners view their own progress", () => {
    expect(
      canViewMembershipProgress(learner, {
        id: "learner-membership",
        userId: "learner-user",
        organizationId: "org_1",
        managerMembershipId: null,
      }),
    ).toBe(true);
  });

  it("does not let inactive learner memberships view self progress", () => {
    expect(
      canViewMembershipProgress(
        {
          userId: "learner-user",
          isPlatformOwner: false,
          memberships: [
            {
              id: "inactive-learner-membership",
              organizationId: "org_1",
              roles: ["LEARNER"],
              status: "INACTIVE",
              managerMembershipId: null,
            },
          ],
        },
        {
          id: "inactive-learner-membership",
          userId: "learner-user",
          organizationId: "org_1",
          managerMembershipId: null,
        },
      ),
    ).toBe(false);
  });

  it("does not let learners view same-user progress without a target organization membership", () => {
    expect(
      canViewMembershipProgress(learner, {
        id: "other-org-membership",
        userId: "learner-user",
        organizationId: "org_2",
        managerMembershipId: null,
      }),
    ).toBe(false);
  });

  it("lets platform owners assign any learner", () => {
    expect(
      canAssignDirectReport(
        { userId: "owner", isPlatformOwner: true, memberships: [] },
        {
          id: "learner-membership",
          userId: "learner-user",
          organizationId: "org_any",
          managerMembershipId: null,
        },
      ),
    ).toBe(true);
  });

  it("lets active organization admins assign any learner in their organization", () => {
    expect(
      canAssignDirectReport(admin, {
        id: "learner-membership",
        userId: "learner-user",
        organizationId: "org_1",
        managerMembershipId: null,
      }),
    ).toBe(true);

    expect(
      canAssignDirectReport(admin, {
        id: "other-learner-membership",
        userId: "other-learner-user",
        organizationId: "org_1",
        managerMembershipId: "other-manager-membership",
      }),
    ).toBe(true);
  });

  it("lets active managers assign only their direct reports", () => {
    expect(
      canAssignDirectReport(manager, {
        id: "learner-membership",
        userId: "learner-user",
        organizationId: "org_1",
        managerMembershipId: "manager-membership",
      }),
    ).toBe(true);

    expect(
      canAssignDirectReport(manager, {
        id: "other-learner-membership",
        userId: "other-learner-user",
        organizationId: "org_1",
        managerMembershipId: "other-manager-membership",
      }),
    ).toBe(false);
  });

  it("does not let inactive or invited manager memberships assign direct reports", () => {
    expect(
      canAssignDirectReport(
        {
          userId: "inactive-manager-user",
          isPlatformOwner: false,
          memberships: [
            {
              id: "inactive-manager-membership",
              organizationId: "org_1",
              roles: ["MANAGER"],
              status: "INACTIVE",
              managerMembershipId: null,
            },
          ],
        },
        {
          id: "learner-membership",
          userId: "learner-user",
          organizationId: "org_1",
          managerMembershipId: "inactive-manager-membership",
        },
      ),
    ).toBe(false);

    expect(
      canAssignDirectReport(
        {
          userId: "invited-manager-user",
          isPlatformOwner: false,
          memberships: [
            {
              id: "invited-manager-membership",
              organizationId: "org_1",
              roles: ["MANAGER"],
              status: "INVITED",
              managerMembershipId: null,
            },
          ],
        },
        {
          id: "learner-membership",
          userId: "learner-user",
          organizationId: "org_1",
          managerMembershipId: "invited-manager-membership",
        },
      ),
    ).toBe(false);
  });
});
