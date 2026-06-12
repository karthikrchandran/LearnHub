import { describe, expect, it, vi } from "vitest";

import type { MembershipAuthContext } from "../auth/permissions";
import {
  updateOrganizationBranding,
  updateOrganizationSettings,
  type OrganizationSettingsRecord,
  type OrganizationSettingsRepository,
} from "./settings";

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

const baseOrganization: OrganizationSettingsRecord = {
  id: "org_1",
  name: "Acme",
  slug: "acme",
  status: "ACTIVE",
  allowedEmailDomains: ["acme.test"],
  logoUrl: null,
  primaryColor: "#111111",
  accentColor: "#222222",
  enrollmentPolicy: "ASSIGNMENT_ONLY",
  globalLibraryEnabled: false,
  allowAdminBranding: false,
};

function createRepository(
  organization: OrganizationSettingsRecord | null = baseOrganization,
): OrganizationSettingsRepository & {
  savedSettings: Array<Partial<OrganizationSettingsRecord> & { id: string }>;
  auditLogs: Array<{
    organizationId: string;
    actorId: string;
    action: string;
    targetType: string;
    targetId: string;
    metadata: Record<string, unknown>;
  }>;
} {
  const savedSettings: Array<Partial<OrganizationSettingsRecord> & { id: string }> = [];
  const auditLogs: Array<{
    organizationId: string;
    actorId: string;
    action: string;
    targetType: string;
    targetId: string;
    metadata: Record<string, unknown>;
  }> = [];
  let current = organization;

  return {
    savedSettings,
    auditLogs,
    async findOrganizationSettings(input) {
      if (!current || current.id !== input.organizationId) {
        return null;
      }

      return current;
    },
    async saveOrganizationSettings(data) {
      savedSettings.push(data);
      current = { ...current!, ...data };

      return current;
    },
    async recordAuditLog(data) {
      auditLogs.push(data);
    },
  };
}

describe("organization settings", () => {
  it("lets platform owners update full organization settings with audit diffs", async () => {
    const repository = createRepository();

    const result = await updateOrganizationSettings(
      {
        actor: platformOwner,
        organizationId: "org_1",
        settings: {
          name: "Acme Learning",
          slug: "acme-learning",
          status: "INACTIVE",
          allowedEmailDomains: [" @Acme.TEST ", "learnhub.test"],
          logoUrl: "https://cdn.learnhub.test/acme.svg",
          primaryColor: "#123456",
          accentColor: "#ABCDEF",
          enrollmentPolicy: "ASSIGNMENT_AND_SELF_ENROLLMENT",
          globalLibraryEnabled: true,
          allowAdminBranding: true,
        },
      },
      repository,
    );

    expect(result).toMatchObject({
      id: "org_1",
      name: "Acme Learning",
      slug: "acme-learning",
      status: "INACTIVE",
      allowedEmailDomains: ["acme.test", "learnhub.test"],
      logoUrl: "https://cdn.learnhub.test/acme.svg",
      primaryColor: "#123456",
      accentColor: "#ABCDEF",
      enrollmentPolicy: "ASSIGNMENT_AND_SELF_ENROLLMENT",
      globalLibraryEnabled: true,
      allowAdminBranding: true,
    });
    expect(repository.savedSettings).toEqual([
      {
        id: "org_1",
        name: "Acme Learning",
        slug: "acme-learning",
        status: "INACTIVE",
        allowedEmailDomains: ["acme.test", "learnhub.test"],
        logoUrl: "https://cdn.learnhub.test/acme.svg",
        primaryColor: "#123456",
        accentColor: "#ABCDEF",
        enrollmentPolicy: "ASSIGNMENT_AND_SELF_ENROLLMENT",
        globalLibraryEnabled: true,
        allowAdminBranding: true,
      },
    ]);
    expect(repository.auditLogs).toEqual([
      {
        organizationId: "org_1",
        actorId: "owner_1",
        action: "organization.settings.updated",
        targetType: "organization",
        targetId: "org_1",
        metadata: {
          changed: [
            "name",
            "slug",
            "status",
            "allowedEmailDomains",
            "logoUrl",
            "primaryColor",
            "accentColor",
            "enrollmentPolicy",
            "globalLibraryEnabled",
            "allowAdminBranding",
          ],
          previous: {
            name: "Acme",
            slug: "acme",
            status: "ACTIVE",
            allowedEmailDomains: ["acme.test"],
            logoUrl: null,
            primaryColor: "#111111",
            accentColor: "#222222",
            enrollmentPolicy: "ASSIGNMENT_ONLY",
            globalLibraryEnabled: false,
            allowAdminBranding: false,
          },
          next: {
            name: "Acme Learning",
            slug: "acme-learning",
            status: "INACTIVE",
            allowedEmailDomains: ["acme.test", "learnhub.test"],
            logoUrl: "https://cdn.learnhub.test/acme.svg",
            primaryColor: "#123456",
            accentColor: "#ABCDEF",
            enrollmentPolicy: "ASSIGNMENT_AND_SELF_ENROLLMENT",
            globalLibraryEnabled: true,
            allowAdminBranding: true,
          },
        },
      },
    ]);
  });

  it("requires platform ownership for full organization settings", async () => {
    const repository = createRepository();

    await expect(
      updateOrganizationSettings(
        {
          actor: orgAdmin,
          organizationId: "org_1",
          settings: {
            name: "Acme Learning",
            slug: "acme-learning",
            status: "ACTIVE",
            allowedEmailDomains: ["acme.test"],
            logoUrl: null,
            primaryColor: "#123456",
            accentColor: "#ABCDEF",
            enrollmentPolicy: "ASSIGNMENT_ONLY",
            globalLibraryEnabled: false,
            allowAdminBranding: false,
          },
        },
        repository,
      ),
    ).rejects.toThrow("Only platform owners can update organization settings");
    expect(repository.savedSettings).toEqual([]);
    expect(repository.auditLogs).toEqual([]);
  });

  it("lets organization admins update branding when platform policy allows it", async () => {
    const repository = createRepository({
      ...baseOrganization,
      allowAdminBranding: true,
    });

    await updateOrganizationBranding(
      {
        actor: orgAdmin,
        organizationId: "org_1",
        branding: {
          logoUrl: "https://cdn.learnhub.test/acme.png",
          primaryColor: "#334455",
          accentColor: "#667788",
        },
      },
      repository,
    );

    expect(repository.savedSettings).toEqual([
      {
        id: "org_1",
        logoUrl: "https://cdn.learnhub.test/acme.png",
        primaryColor: "#334455",
        accentColor: "#667788",
      },
    ]);
    expect(repository.auditLogs[0]).toMatchObject({
      organizationId: "org_1",
      actorId: "admin_1",
      action: "organization.branding.updated",
      targetType: "organization",
      targetId: "org_1",
      metadata: {
        changed: ["logoUrl", "primaryColor", "accentColor"],
      },
    });
  });

  it("blocks organization admin branding when platform policy denies it", async () => {
    const repository = createRepository();

    await expect(
      updateOrganizationBranding(
        {
          actor: orgAdmin,
          organizationId: "org_1",
          branding: {
            logoUrl: null,
            primaryColor: "#334455",
            accentColor: "#667788",
          },
        },
        repository,
      ),
    ).rejects.toThrow("Organization admins cannot edit branding for this organization");
    expect(repository.savedSettings).toEqual([]);
    expect(repository.auditLogs).toEqual([]);
  });

  it("does not persist or audit unchanged settings", async () => {
    const repository = createRepository();

    const result = await updateOrganizationSettings(
      {
        actor: platformOwner,
        organizationId: "org_1",
        settings: baseOrganization,
      },
      repository,
    );

    expect(result).toEqual(baseOrganization);
    expect(repository.savedSettings).toEqual([]);
    expect(repository.auditLogs).toEqual([]);
  });

  it("validates slugs, colors, and allowed domains", async () => {
    const repository = createRepository();

    await expect(
      updateOrganizationSettings(
        {
          actor: platformOwner,
          organizationId: "org_1",
          settings: { ...baseOrganization, slug: "Acme Ops" },
        },
        repository,
      ),
    ).rejects.toThrow("Organization slug must use lowercase letters, numbers, and hyphens");
    await expect(
      updateOrganizationSettings(
        {
          actor: platformOwner,
          organizationId: "org_1",
          settings: { ...baseOrganization, allowedEmailDomains: ["admin@acme.test"] },
        },
        repository,
      ),
    ).rejects.toThrow("Allowed email domain is invalid");
    await expect(
      updateOrganizationBranding(
        {
          actor: orgAdmin,
          organizationId: "org_1",
          branding: { logoUrl: null, primaryColor: "123456", accentColor: "#667788" },
        },
        createRepository({ ...baseOrganization, allowAdminBranding: true }),
      ),
    ).rejects.toThrow("Theme color must be a 6-digit hex color");
  });

  it("throws when the organization does not exist", async () => {
    const repository = createRepository(null);
    const saveSpy = vi.spyOn(repository, "saveOrganizationSettings");

    await expect(
      updateOrganizationSettings(
        {
          actor: platformOwner,
          organizationId: "missing",
          settings: baseOrganization,
        },
        repository,
      ),
    ).rejects.toThrow("Organization was not found");
    expect(saveSpy).not.toHaveBeenCalled();
  });
});
