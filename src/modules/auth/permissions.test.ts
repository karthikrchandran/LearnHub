import { describe, expect, it } from "vitest";

import {
  canAssignDirectReport,
  canInspectRuntimeAssignment,
  canManageOrganization,
  canManageOrganizationUsers,
  canViewRuntimeProgress,
  canLaunchRuntimeAssignment,
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

const runtimeAssignment = {
  id: "assignment_1",
  organizationId: "org_1",
  membershipId: "learner-membership",
  learner: {
    id: "learner-membership",
    userId: "learner-user",
    organizationId: "org_1",
    managerMembershipId: "manager-membership",
  },
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

  it("lets learners launch only their own runtime assignments", () => {
    expect(canLaunchRuntimeAssignment(learner, runtimeAssignment)).toBe(true);
    expect(
      canLaunchRuntimeAssignment(learner, {
        ...runtimeAssignment,
        id: "other_assignment",
        membershipId: "other-learner-membership",
        learner: {
          ...runtimeAssignment.learner,
          id: "other-learner-membership",
          userId: "other-user",
        },
      }),
    ).toBe(false);
  });

  it("does not let managers launch as direct reports", () => {
    expect(canViewRuntimeProgress(manager, runtimeAssignment)).toBe(true);
    expect(canLaunchRuntimeAssignment(manager, runtimeAssignment)).toBe(false);
  });

  it("lets admins and platform owners inspect runtime assignments", () => {
    expect(canInspectRuntimeAssignment(admin, runtimeAssignment)).toBe(true);
    expect(canViewRuntimeProgress(admin, runtimeAssignment)).toBe(true);
    expect(
      canInspectRuntimeAssignment(
        { userId: "owner", isPlatformOwner: true, memberships: [] },
        { ...runtimeAssignment, organizationId: "org_any", learner: { ...runtimeAssignment.learner, organizationId: "org_any" } },
      ),
    ).toBe(true);
  });

  it("rejects cross-organization runtime assignment access", () => {
    const crossOrgAssignment = {
      ...runtimeAssignment,
      organizationId: "org_2",
      learner: {
        ...runtimeAssignment.learner,
        organizationId: "org_2",
      },
    };

    expect(canLaunchRuntimeAssignment(learner, crossOrgAssignment)).toBe(false);
    expect(canViewRuntimeProgress(manager, crossOrgAssignment)).toBe(false);
    expect(canInspectRuntimeAssignment(admin, crossOrgAssignment)).toBe(false);
  });

  it("rejects runtime access for inactive memberships", () => {
    const inactiveLearner = {
      ...learner,
      memberships: [{ ...learner.memberships[0], status: "INACTIVE" as const }],
    };

    expect(canLaunchRuntimeAssignment(inactiveLearner, runtimeAssignment)).toBe(false);
    expect(canViewRuntimeProgress(inactiveLearner, runtimeAssignment)).toBe(false);
  });
});
