export function requireOrganizationId(organizationId: string): string {
  if (!organizationId.trim()) {
    throw new Error("Organization id is required");
  }

  return organizationId;
}

export function scopeByOrganization<TFilter extends Record<string, unknown>>(
  organizationId: string,
  filter: TFilter,
): TFilter & { organizationId: string } {
  return {
    ...filter,
    organizationId: requireOrganizationId(organizationId),
  };
}
