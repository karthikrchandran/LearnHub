import { describe, expect, it } from "vitest";

import {
  provisionOrganization,
  type ProvisionOrganizationRepository,
} from "./provisioning";

function createRepository(): ProvisionOrganizationRepository & {
  createdOrganizations: Parameters<ProvisionOrganizationRepository["createOrganization"]>[0][];
} {
  const createdOrganizations: Parameters<ProvisionOrganizationRepository["createOrganization"]>[0][] = [];

  return {
    createdOrganizations,
    async createOrganization(data) {
      createdOrganizations.push(data);
      return { id: "org_1", slug: data.slug };
    },
  };
}

const validInput = {
  actor: { userId: "owner_1", isPlatformOwner: true },
  name: "Acme Learning",
  slug: "acme",
  allowedEmailDomains: ["acme.test"],
  primaryColor: "#1A2B3C",
  accentColor: "#D4E5F6",
  enrollmentPolicy: "ASSIGNMENT_ONLY" as const,
  globalLibraryEnabled: true,
};

describe("provisionOrganization", () => {
  it("requires a platform owner actor", async () => {
    const repository = createRepository();

    await expect(
      provisionOrganization(
        {
          ...validInput,
          actor: { userId: "admin_1", isPlatformOwner: false },
        },
        repository,
      ),
    ).rejects.toThrow("Only platform owners can provision organizations");
  });

  it("requires organization names and slugs", async () => {
    const repository = createRepository();

    await expect(provisionOrganization({ ...validInput, name: " " }, repository)).rejects.toThrow(
      "Organization name is required",
    );
    await expect(provisionOrganization({ ...validInput, slug: " " }, repository)).rejects.toThrow(
      "Organization slug is required",
    );
  });

  it("requires at least one allowed email domain", async () => {
    const repository = createRepository();

    await expect(provisionOrganization({ ...validInput, allowedEmailDomains: [] }, repository)).rejects.toThrow(
      "At least one allowed email domain is required",
    );
  });

  it("validates hex theme colors", async () => {
    const repository = createRepository();

    await expect(provisionOrganization({ ...validInput, primaryColor: "#12345" }, repository)).rejects.toThrow(
      "Theme color must be a 6-digit hex color",
    );
    await expect(provisionOrganization({ ...validInput, accentColor: "123456" }, repository)).rejects.toThrow(
      "Theme color must be a 6-digit hex color",
    );
  });

  it("normalizes allowed email domains before creating the organization", async () => {
    const repository = createRepository();

    await provisionOrganization(
      {
        ...validInput,
        allowedEmailDomains: [" @Acme.TEST ", "LEARNHUB.test"],
      },
      repository,
    );

    expect(repository.createdOrganizations[0].allowedEmailDomains).toEqual(["acme.test", "learnhub.test"]);
  });

  it("passes organization settings to the repository", async () => {
    const repository = createRepository();

    const result = await provisionOrganization(
      {
        ...validInput,
        logoUrl: " ",
        primaryColor: "#112233",
        accentColor: "#AABBCC",
        enrollmentPolicy: "ASSIGNMENT_AND_SELF_ENROLLMENT",
        globalLibraryEnabled: false,
      },
      repository,
    );

    expect(result).toEqual({ id: "org_1", slug: "acme" });
    expect(repository.createdOrganizations[0]).toEqual({
      name: "Acme Learning",
      slug: "acme",
      allowedEmailDomains: ["acme.test"],
      logoUrl: null,
      primaryColor: "#112233",
      accentColor: "#AABBCC",
      enrollmentPolicy: "ASSIGNMENT_AND_SELF_ENROLLMENT",
      globalLibraryEnabled: false,
    });
  });
});
