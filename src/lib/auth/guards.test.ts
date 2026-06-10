import { describe, expect, it } from "vitest";

import {
  resolveOrganizationMemberGuard,
  resolveOrganizationUsersAdminGuard,
  resolvePlatformOwnerGuard,
  type GuardAuthContext,
} from "./guards";

const platformOwner: GuardAuthContext = {
  userId: "owner_1",
  isPlatformOwner: true,
  memberships: [],
};

const orgAdmin: GuardAuthContext = {
  userId: "admin_1",
  isPlatformOwner: false,
  memberships: [
    {
      id: "membership_admin",
      organizationId: "org_1",
      roles: ["ADMIN"],
      status: "ACTIVE",
      managerMembershipId: null,
    },
  ],
};

const inactiveAdmin: GuardAuthContext = {
  userId: "admin_1",
  isPlatformOwner: false,
  memberships: [
    {
      id: "membership_admin",
      organizationId: "org_1",
      roles: ["ADMIN"],
      status: "INACTIVE",
      managerMembershipId: null,
    },
  ],
};

describe("auth guards", () => {
  it("requires a signed-in platform owner for platform routes", () => {
    expect(resolvePlatformOwnerGuard(null)).toEqual({ allowed: false, redirectTo: "/login" });
    expect(resolvePlatformOwnerGuard(orgAdmin)).toEqual({ allowed: false, redirectTo: "/org" });
    expect(resolvePlatformOwnerGuard(platformOwner)).toEqual({ allowed: true });
  });

  it("allows platform owners and active organization admins to manage users", () => {
    expect(resolveOrganizationUsersAdminGuard(null, "org_1")).toEqual({ allowed: false, redirectTo: "/login" });
    expect(resolveOrganizationUsersAdminGuard(inactiveAdmin, "org_1")).toEqual({
      allowed: false,
      redirectTo: "/platform",
    });
    expect(resolveOrganizationUsersAdminGuard(orgAdmin, "org_1")).toEqual({ allowed: true });
    expect(resolveOrganizationUsersAdminGuard(platformOwner, "org_1")).toEqual({ allowed: true });
  });

  it("allows only platform owners or active organization members into organization workspaces", () => {
    expect(resolveOrganizationMemberGuard(null, "org_1")).toEqual({ allowed: false, redirectTo: "/login" });
    expect(resolveOrganizationMemberGuard(inactiveAdmin, "org_1")).toEqual({ allowed: false, redirectTo: "/platform" });
    expect(resolveOrganizationMemberGuard(orgAdmin, "org_1")).toEqual({ allowed: true });
    expect(resolveOrganizationMemberGuard(platformOwner, "org_1")).toEqual({ allowed: true });
  });
});
