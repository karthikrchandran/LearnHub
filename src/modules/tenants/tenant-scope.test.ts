import { describe, expect, it } from "vitest";

import { requireOrganizationId, scopeByOrganization } from "./tenant-scope";

describe("tenant-scope helpers", () => {
  it("adds organizationId to query filters", () => {
    expect(scopeByOrganization("org_123", { status: "PUBLISHED" })).toEqual({
      organizationId: "org_123",
      status: "PUBLISHED",
    });
  });

  it("rejects empty organization ids", () => {
    expect(() => requireOrganizationId("")).toThrow("Organization id is required");
  });
});
