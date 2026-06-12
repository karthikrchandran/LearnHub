import { describe, expect, it } from "vitest";

import {
  getOrganizationDashboardSummary,
  getPlatformDashboardSummary,
  type OrganizationDashboardRepository,
  type PlatformDashboardRepository,
} from "./dashboard";

describe("organization dashboards", () => {
  it("builds platform live counts from repository values", async () => {
    const repository: PlatformDashboardRepository = {
      countOrganizations: async () => 3,
      countActiveUsers: async () => 42,
      countCompletedAssignments: async () => 17,
      countOverdueAssignments: async () => 5,
      countProviderFailures: async () => 2,
      countAuditLogs: async () => 91,
    };

    await expect(getPlatformDashboardSummary(repository)).resolves.toEqual({
      organizations: 3,
      activeUsers: 42,
      completions: 17,
      overdueAssignments: 5,
      providerFailures: 2,
      auditLogs: 91,
    });
  });

  it("builds organization dashboard counts and branding", async () => {
    const repository: OrganizationDashboardRepository = {
      findOrganizationDashboardBranding: async () => ({
        id: "org_1",
        name: "Acme Learning",
        slug: "acme",
        logoUrl: "https://cdn.learnhub.test/acme.svg",
        primaryColor: "#123456",
        accentColor: "#ABCDEF",
      }),
      countAssignments: async () => 12,
      countAssignmentsByStatus: async () => 4,
      countCertificates: async () => 7,
      averageProgressPercent: async () => 63,
    };

    await expect(
      getOrganizationDashboardSummary(
        { organizationId: "org_1" },
        repository,
      ),
    ).resolves.toEqual({
      organization: {
        id: "org_1",
        name: "Acme Learning",
        slug: "acme",
        logoUrl: "https://cdn.learnhub.test/acme.svg",
        primaryColor: "#123456",
        accentColor: "#ABCDEF",
      },
      assignedCourses: 12,
      inProgressAssignments: 4,
      overdueAssignments: 4,
      certificates: 7,
      averageProgressPercent: 63,
    });
  });

  it("throws when organization dashboard branding is missing", async () => {
    const repository: OrganizationDashboardRepository = {
      findOrganizationDashboardBranding: async () => null,
      countAssignments: async () => 0,
      countAssignmentsByStatus: async () => 0,
      countCertificates: async () => 0,
      averageProgressPercent: async () => 0,
    };

    await expect(
      getOrganizationDashboardSummary(
        { organizationId: "missing" },
        repository,
      ),
    ).rejects.toThrow("Organization was not found");
  });
});
