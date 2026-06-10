import { describe, expect, it } from "vitest";

import type { MembershipAuthContext } from "../auth/permissions";
import { canEditCatalog } from "./catalog-permissions";

describe("catalog permissions", () => {
  it("allows platform owners to edit any catalog", () => {
    const owner: MembershipAuthContext = {
      userId: "owner",
      isPlatformOwner: true,
      memberships: [],
    };

    expect(canEditCatalog(owner, "org_any")).toBe(true);
  });

  it("allows active organization admins to edit their catalog", () => {
    const admin: MembershipAuthContext = {
      userId: "admin",
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

    expect(canEditCatalog(admin, "org_1")).toBe(true);
  });

  it("does not allow admins to edit another organization catalog", () => {
    const admin: MembershipAuthContext = {
      userId: "admin",
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

    expect(canEditCatalog(admin, "org_2")).toBe(false);
  });
});
