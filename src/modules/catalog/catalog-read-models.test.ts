import { describe, expect, it } from "vitest";

import {
  adminCatalogFilter,
  learnerAssignmentFilter,
  learnerPublishedCatalogFilter,
  managerDirectReportAssignmentFilter,
} from "./catalog-read-models";

describe("catalog read models", () => {
  it("scopes admin catalog filters to the organization", () => {
    expect(adminCatalogFilter("org_1")).toEqual({ organizationId: "org_1" });
  });

  it("scopes learner catalog filters to published courses in the organization", () => {
    expect(learnerPublishedCatalogFilter("org_1")).toEqual({
      organizationId: "org_1",
      status: "PUBLISHED",
    });
  });

  it("scopes learner assignment filters to organization and membership", () => {
    expect(learnerAssignmentFilter("org_1", "membership_1")).toEqual({
      organizationId: "org_1",
      membershipId: "membership_1",
    });
  });

  it("scopes manager direct-report assignment filters to organization and direct report memberships", () => {
    expect(managerDirectReportAssignmentFilter("org_1", ["membership_1", "membership_2"])).toEqual({
      organizationId: "org_1",
      membershipId: { in: ["membership_1", "membership_2"] },
    });
  });
});
