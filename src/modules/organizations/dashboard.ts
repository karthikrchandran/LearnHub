import type { AssignmentStatus, PrismaClient } from "@prisma/client";

export type PlatformDashboardSummary = {
  organizations: number;
  activeUsers: number;
  completions: number;
  overdueAssignments: number;
  providerFailures: number;
  auditLogs: number;
};

export type OrganizationDashboardBranding = {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  primaryColor: string;
  accentColor: string;
};

export type OrganizationDashboardSummary = {
  organization: OrganizationDashboardBranding;
  assignedCourses: number;
  inProgressAssignments: number;
  overdueAssignments: number;
  certificates: number;
  averageProgressPercent: number;
};

export type PlatformDashboardRepository = {
  countOrganizations(): Promise<number>;
  countActiveUsers(): Promise<number>;
  countCompletedAssignments(): Promise<number>;
  countOverdueAssignments(): Promise<number>;
  countProviderFailures(): Promise<number>;
  countAuditLogs(): Promise<number>;
};

export type OrganizationDashboardRepository = {
  findOrganizationDashboardBranding(input: {
    organizationId: string;
  }): Promise<OrganizationDashboardBranding | null>;
  countAssignments(input: { organizationId: string }): Promise<number>;
  countAssignmentsByStatus(input: {
    organizationId: string;
    status: AssignmentStatus;
  }): Promise<number>;
  countCertificates(input: { organizationId: string }): Promise<number>;
  averageProgressPercent(input: { organizationId: string }): Promise<number>;
};

type PrismaDashboardClient = Pick<
  PrismaClient,
  | "organization"
  | "user"
  | "courseAssignment"
  | "credentialIssuance"
  | "auditLog"
  | "certificate"
  | "assignmentProgress"
>;

export async function getPlatformDashboardSummary(
  repository: PlatformDashboardRepository,
): Promise<PlatformDashboardSummary> {
  const [
    organizations,
    activeUsers,
    completions,
    overdueAssignments,
    providerFailures,
    auditLogs,
  ] = await Promise.all([
    repository.countOrganizations(),
    repository.countActiveUsers(),
    repository.countCompletedAssignments(),
    repository.countOverdueAssignments(),
    repository.countProviderFailures(),
    repository.countAuditLogs(),
  ]);

  return {
    organizations,
    activeUsers,
    completions,
    overdueAssignments,
    providerFailures,
    auditLogs,
  };
}

export async function getOrganizationDashboardSummary(
  input: { organizationId: string },
  repository: OrganizationDashboardRepository,
): Promise<OrganizationDashboardSummary> {
  const organization = await repository.findOrganizationDashboardBranding(input);

  if (!organization) {
    throw new Error("Organization was not found");
  }

  const [
    assignedCourses,
    inProgressAssignments,
    overdueAssignments,
    certificates,
    averageProgressPercent,
  ] = await Promise.all([
    repository.countAssignments(input),
    repository.countAssignmentsByStatus({
      ...input,
      status: "IN_PROGRESS",
    }),
    repository.countAssignmentsByStatus({
      ...input,
      status: "OVERDUE",
    }),
    repository.countCertificates(input),
    repository.averageProgressPercent(input),
  ]);

  return {
    organization,
    assignedCourses,
    inProgressAssignments,
    overdueAssignments,
    certificates,
    averageProgressPercent,
  };
}

export function createPrismaDashboardRepository(
  client: PrismaDashboardClient,
): PlatformDashboardRepository & OrganizationDashboardRepository {
  return {
    countOrganizations() {
      return client.organization.count();
    },
    countActiveUsers() {
      return client.user.count({ where: { status: "ACTIVE" } });
    },
    countCompletedAssignments() {
      return client.courseAssignment.count({ where: { status: "COMPLETED" } });
    },
    countOverdueAssignments() {
      return client.courseAssignment.count({ where: { status: "OVERDUE" } });
    },
    countProviderFailures() {
      return client.credentialIssuance.count({ where: { status: "FAILED" } });
    },
    countAuditLogs() {
      return client.auditLog.count();
    },
    findOrganizationDashboardBranding(input) {
      return client.organization.findUnique({
        where: { id: input.organizationId },
        select: {
          id: true,
          name: true,
          slug: true,
          logoUrl: true,
          primaryColor: true,
          accentColor: true,
        },
      });
    },
    countAssignments(input) {
      return client.courseAssignment.count({
        where: { organizationId: input.organizationId },
      });
    },
    countAssignmentsByStatus(input) {
      return client.courseAssignment.count({
        where: {
          organizationId: input.organizationId,
          status: input.status,
        },
      });
    },
    countCertificates(input) {
      return client.certificate.count({
        where: { organizationId: input.organizationId },
      });
    },
    async averageProgressPercent(input) {
      const aggregate = await client.assignmentProgress.aggregate({
        where: { organizationId: input.organizationId },
        _avg: { progressPercent: true },
      });

      return Math.round(aggregate._avg.progressPercent ?? 0);
    },
  };
}
