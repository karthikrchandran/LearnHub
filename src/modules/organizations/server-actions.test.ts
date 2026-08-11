import { describe, expect, it, vi } from "vitest";

import type { MembershipAuthContext } from "../auth/permissions";
import {
  createProvisionOrganizationAction,
  createUpdateOrganizationBrandingAction,
  createUpdateOrganizationReportAccessAction,
  createUpdateOrganizationSettingsAction,
} from "./server-actions";
import type { ProvisionOrganizationRepository } from "./provisioning";
import type {
  OrganizationSettingsRecord,
  OrganizationSettingsRepository,
} from "./settings";

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

const platformOwner: MembershipAuthContext = {
  userId: "owner_1",
  isPlatformOwner: true,
  memberships: [],
};

const orgAdmin: MembershipAuthContext = {
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

const settingsRecord: OrganizationSettingsRecord = {
  id: "org_1",
  name: "Acme",
  slug: "acme",
  status: "ACTIVE",
  allowedEmailDomains: ["acme.test"],
  logoUrl: null,
  primaryColor: "#2563eb",
  accentColor: "#14b8a6",
  enrollmentPolicy: "ASSIGNMENT_ONLY",
  globalLibraryEnabled: false,
  allowAdminBranding: true,
  allowManagerReports: true,
  allowUserReports: true,
  allowCsvExports: true,
};

function createSettingsRepository(): OrganizationSettingsRepository & {
  savedSettings: Array<Partial<OrganizationSettingsRecord> & { id: string }>;
} {
  let current = settingsRecord;
  const savedSettings: Array<Partial<OrganizationSettingsRecord> & { id: string }> = [];

  return {
    savedSettings,
    async findOrganizationSettings(input) {
      return input.organizationId === current.id ? current : null;
    },
    async saveOrganizationSettings(data) {
      savedSettings.push(data);
      current = { ...current, ...data };

      return current;
    },
    async recordAuditLog() {},
  };
}

describe("organization settings server actions", () => {
  it("updates platform-owned organization settings from form data", async () => {
    const repository = createSettingsRepository();
    const action = createUpdateOrganizationSettingsAction({
      getActor: async () => platformOwner,
      getOrganizationIdBySlug: async () => "org_1",
      repository,
    });

    const result = await action(
      "acme",
      formData({
        name: "Acme Learning",
        slug: "acme-learning",
        status: "INACTIVE",
        allowedEmailDomains: "acme.test, learnhub.test",
        logoUrl: "",
        primaryColor: "#112233",
        accentColor: "#445566",
        enrollmentPolicy: "ASSIGNMENT_AND_SELF_ENROLLMENT",
        globalLibraryEnabled: "true",
        allowAdminBranding: "true",
        allowManagerReports: "false",
        allowUserReports: "false",
        allowCsvExports: "false",
      }),
    );

    expect(result).toEqual({
      status: "success",
      message: "Organization settings updated.",
      organizationSlug: "acme-learning",
    });
    expect(repository.savedSettings[0]).toMatchObject({
      id: "org_1",
      name: "Acme Learning",
      slug: "acme-learning",
      status: "INACTIVE",
      allowedEmailDomains: ["acme.test", "learnhub.test"],
      logoUrl: null,
      primaryColor: "#112233",
      accentColor: "#445566",
      enrollmentPolicy: "ASSIGNMENT_AND_SELF_ENROLLMENT",
      globalLibraryEnabled: true,
      allowAdminBranding: true,
      allowManagerReports: false,
      allowUserReports: false,
      allowCsvExports: false,
    });
  });

  it("returns an error when a platform organization slug is missing", async () => {
    const action = createUpdateOrganizationSettingsAction({
      getActor: async () => platformOwner,
      getOrganizationIdBySlug: async () => null,
      repository: createSettingsRepository(),
    });

    const result = await action(
      "missing",
      formData({
        name: "Acme Learning",
        slug: "acme-learning",
        status: "ACTIVE",
        allowedEmailDomains: "acme.test",
        primaryColor: "#112233",
        accentColor: "#445566",
        enrollmentPolicy: "ASSIGNMENT_ONLY",
      }),
    );

    expect(result).toEqual({
      status: "error",
      message: "Organization was not found",
    });
  });

  it("updates tenant branding from form data", async () => {
    const repository = createSettingsRepository();
    const action = createUpdateOrganizationBrandingAction({
      getActor: async () => orgAdmin,
      getOrganizationIdBySlug: async () => "org_1",
      repository,
    });

    const result = await action(
      "acme",
      formData({
        logoUrl: "https://cdn.learnhub.test/acme.png",
        primaryColor: "#334455",
        accentColor: "#667788",
      }),
    );

    expect(result).toEqual({
      status: "success",
      message: "Organization branding updated.",
    });
    expect(repository.savedSettings[0]).toMatchObject({
      id: "org_1",
      logoUrl: "https://cdn.learnhub.test/acme.png",
      primaryColor: "#334455",
      accentColor: "#667788",
    });
  });

  it("updates tenant report access from form data", async () => {
    const repository = createSettingsRepository();
    const action = createUpdateOrganizationReportAccessAction({
      getActor: async () => orgAdmin,
      getOrganizationIdBySlug: async () => "org_1",
      repository,
    });

    const result = await action(
      "acme",
      formData({
        allowManagerReports: "false",
        allowUserReports: "true",
        allowCsvExports: "false",
      }),
    );

    expect(result).toEqual({
      status: "success",
      message: "Report access settings updated.",
    });
    expect(repository.savedSettings[0]).toMatchObject({
      id: "org_1",
      allowManagerReports: false,
      allowUserReports: true,
      allowCsvExports: false,
    });
  });
});
