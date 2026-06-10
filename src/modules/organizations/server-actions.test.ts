import { describe, expect, it, vi } from "vitest";

import { createProvisionOrganizationAction } from "./server-actions";
import type { ProvisionOrganizationRepository } from "./provisioning";

function formData(entries: Record<string, string>): FormData {
  const data = new FormData();

  for (const [key, value] of Object.entries(entries)) {
    data.set(key, value);
  }

  return data;
}

describe("organization server actions", () => {
  it("provisions an organization for a platform owner", async () => {
    const repository: ProvisionOrganizationRepository = {
      createOrganization: vi.fn(async () => ({ id: "org_1", slug: "acme" })),
    };
    const action = createProvisionOrganizationAction({
      getActor: async () => ({ userId: "owner_1", isPlatformOwner: true }),
      repository,
    });

    const result = await action(
      formData({
        name: "Acme Learning",
        slug: "acme",
        allowedEmailDomains: "acme.test, acme.com",
        logoUrl: "",
        primaryColor: "#2563eb",
        accentColor: "#14b8a6",
        enrollmentPolicy: "ASSIGNMENT_AND_SELF_ENROLLMENT",
        globalLibraryEnabled: "true",
      }),
    );

    expect(result).toEqual({
      status: "success",
      message: "Organization created.",
      organizationSlug: "acme",
    });
    expect(repository.createOrganization).toHaveBeenCalledWith({
      name: "Acme Learning",
      slug: "acme",
      allowedEmailDomains: ["acme.test", "acme.com"],
      logoUrl: null,
      primaryColor: "#2563eb",
      accentColor: "#14b8a6",
      enrollmentPolicy: "ASSIGNMENT_AND_SELF_ENROLLMENT",
      globalLibraryEnabled: true,
    });
  });

  it("returns validation errors without creating an organization", async () => {
    const repository: ProvisionOrganizationRepository = {
      createOrganization: vi.fn(),
    };
    const action = createProvisionOrganizationAction({
      getActor: async () => ({ userId: "owner_1", isPlatformOwner: true }),
      repository,
    });

    const result = await action(
      formData({
        name: "",
        slug: "acme",
        allowedEmailDomains: "acme.test",
        primaryColor: "#2563eb",
        accentColor: "#14b8a6",
        enrollmentPolicy: "ASSIGNMENT_ONLY",
      }),
    );

    expect(result).toEqual({
      status: "error",
      message: "Organization name is required",
    });
    expect(repository.createOrganization).not.toHaveBeenCalled();
  });
});
