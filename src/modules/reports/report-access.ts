import type { GuardAuthContext } from "@/lib/auth/guards";

export type ReportViewerRole = "admin" | "manager" | "user";

export type TenantReportAccessSettings = {
  allowManagerReports: boolean;
  allowUserReports: boolean;
  allowCsvExports: boolean;
};

export function resolveReportViewerRole(
  context: GuardAuthContext,
  organizationId: string,
): ReportViewerRole {
  const activeMembership = context.memberships.find(
    (membership) => membership.organizationId === organizationId && membership.status === "ACTIVE",
  );
  const roles = activeMembership?.roles ?? [];

  if (context.isPlatformOwner || roles.includes("ADMIN")) {
    return "admin";
  }

  if (roles.includes("MANAGER")) {
    return "manager";
  }

  return "user";
}

export function canViewTenantReports(
  role: ReportViewerRole,
  settings: TenantReportAccessSettings,
): boolean {
  if (role === "admin") {
    return true;
  }

  if (role === "manager") {
    return settings.allowManagerReports;
  }

  return settings.allowUserReports;
}

export function canExportTenantReports(
  role: ReportViewerRole,
  settings: TenantReportAccessSettings,
): boolean {
  return canViewTenantReports(role, settings) && settings.allowCsvExports;
}
