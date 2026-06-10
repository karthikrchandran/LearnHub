import { canManageCatalog, type MembershipAuthContext } from "../auth/permissions";

export function canEditCatalog(context: MembershipAuthContext, organizationId: string): boolean {
  return canManageCatalog(context, organizationId);
}
