import { scopeByOrganization } from "../tenants/tenant-scope";

export function adminCatalogFilter(organizationId: string): { organizationId: string } {
  return scopeByOrganization(organizationId, {});
}

export function learnerPublishedCatalogFilter(organizationId: string): {
  organizationId: string;
  status: "PUBLISHED";
} {
  return scopeByOrganization(organizationId, { status: "PUBLISHED" as const });
}

export function learnerAssignmentFilter(
  organizationId: string,
  membershipId: string,
): {
  organizationId: string;
  membershipId: string;
} {
  return scopeByOrganization(organizationId, { membershipId });
}

export function managerDirectReportAssignmentFilter(
  organizationId: string,
  directReportMembershipIds: string[],
): {
  organizationId: string;
  membershipId: { in: string[] };
} {
  return scopeByOrganization(organizationId, { membershipId: { in: directReportMembershipIds } });
}
