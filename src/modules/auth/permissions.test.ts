import { describe, expect, it } from "vitest";

import {
  canManageOrganization,
  canManageOrganizationUsers,
  canViewMembershipProgress,
  type MembershipAuthContext,
} from "./permissions";

const admin: MembershipAuthContext = {
  userId: "admin-user",
  isPlatformOwner: false,
  memberships: [{ id: "admin-membership", organizationId: "org_1", roles: ["ADMIN"], managerMembershipId: null }],
};

const manager: MembershipAuthContext = {
  userId: "manager-user",
  isPlatformOwner: false,
  memberships: [{ id: "manager-membership", organizationId: "org_1", roles: ["MANAGER"], managerMembershipId: null }],
};

const learner: MembershipAuthContext = {
  userId: "learner-user",
  isPlatformOwner: false,
  memberships: [{ id: "learner-membership", organizationId: "org_1", roles: ["LEARNER"], managerMembershipId: null }],
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
});
