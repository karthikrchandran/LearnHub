import type {
  OrganizationEnrollmentPolicy,
  OrganizationStatus,
} from "@prisma/client";

import {
  canManageOrganization,
  type MembershipAuthContext,
} from "../auth/permissions";

export type OrganizationSettingsActor = MembershipAuthContext;

export type OrganizationSettingsRecord = {
  id: string;
  name: string;
  slug: string;
  status: OrganizationStatus;
  allowedEmailDomains: string[];
  logoUrl: string | null;
  primaryColor: string;
  accentColor: string;
  enrollmentPolicy: OrganizationEnrollmentPolicy;
  globalLibraryEnabled: boolean;
  allowAdminBranding: boolean;
  allowManagerReports: boolean;
  allowUserReports: boolean;
  allowCsvExports: boolean;
};

export type OrganizationSettingsInput = Omit<OrganizationSettingsRecord, "id">;

export type OrganizationBrandingInput = Pick<
  OrganizationSettingsRecord,
  "logoUrl" | "primaryColor" | "accentColor"
>;

export type OrganizationSettingsRepository = {
  findOrganizationSettings(input: {
    organizationId: string;
  }): Promise<OrganizationSettingsRecord | null>;
  saveOrganizationSettings(
    data: Partial<OrganizationSettingsRecord> & { id: string },
  ): Promise<OrganizationSettingsRecord>;
  recordAuditLog(data: {
    organizationId: string;
    actorId: string;
    action: string;
    targetType: string;
    targetId: string;
    metadata: Record<string, unknown>;
  }): Promise<void>;
};

const hexColorPattern = /^#[0-9a-fA-F]{6}$/;
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const domainLabelPattern = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;
const settingFieldOrder = [
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
  "allowManagerReports",
  "allowUserReports",
  "allowCsvExports",
] as const;
const brandingFieldOrder = ["logoUrl", "primaryColor", "accentColor"] as const;

type SettingField = (typeof settingFieldOrder)[number];
type BrandingField = (typeof brandingFieldOrder)[number];

export async function updateOrganizationSettings(
  input: {
    actor: OrganizationSettingsActor;
    organizationId: string;
    settings: OrganizationSettingsInput;
  },
  repository: OrganizationSettingsRepository,
): Promise<OrganizationSettingsRecord> {
  if (!input.actor.isPlatformOwner) {
    throw new Error("Only platform owners can update organization settings");
  }

  const current = await requireOrganization(input.organizationId, repository);
  const normalized = normalizeSettings(input.settings);
  const changed = changedFields(current, normalized, settingFieldOrder);

  if (changed.length === 0) {
    return current;
  }

  const next = await repository.saveOrganizationSettings({
    id: current.id,
    ...normalized,
  });

  await repository.recordAuditLog({
    organizationId: current.id,
    actorId: input.actor.userId,
    action: "organization.settings.updated",
    targetType: "organization",
    targetId: current.id,
    metadata: buildAuditMetadata(current, normalized, changed),
  });

  return next;
}

export async function updateOrganizationBranding(
  input: {
    actor: OrganizationSettingsActor;
    organizationId: string;
    branding: OrganizationBrandingInput;
  },
  repository: OrganizationSettingsRepository,
): Promise<OrganizationSettingsRecord> {
  const current = await requireOrganization(input.organizationId, repository);

  if (!canManageOrganization(input.actor, current.id) || !current.allowAdminBranding) {
    throw new Error("Organization admins cannot edit branding for this organization");
  }

  const normalized = normalizeBranding(input.branding);
  const changed = changedFields(current, normalized, brandingFieldOrder);

  if (changed.length === 0) {
    return current;
  }

  const next = await repository.saveOrganizationSettings({
    id: current.id,
    ...normalized,
  });

  await repository.recordAuditLog({
    organizationId: current.id,
    actorId: input.actor.userId,
    action: "organization.branding.updated",
    targetType: "organization",
    targetId: current.id,
    metadata: buildAuditMetadata(current, normalized, changed),
  });

  return next;
}

export async function updateOrganizationReportAccess(
  input: {
    actor: OrganizationSettingsActor;
    organizationId: string;
    reportAccess: Pick<
      OrganizationSettingsRecord,
      "allowManagerReports" | "allowUserReports" | "allowCsvExports"
    >;
  },
  repository: OrganizationSettingsRepository,
): Promise<OrganizationSettingsRecord> {
  const current = await requireOrganization(input.organizationId, repository);

  if (!canManageOrganization(input.actor, current.id)) {
    throw new Error("Only organization admins can update tenant report access");
  }

  const normalized = {
    allowManagerReports: input.reportAccess.allowManagerReports,
    allowUserReports: input.reportAccess.allowUserReports,
    allowCsvExports: input.reportAccess.allowCsvExports,
  };
  const reportAccessFields = ["allowManagerReports", "allowUserReports", "allowCsvExports"] as const;
  const changed = changedFields(current, normalized, reportAccessFields);

  if (changed.length === 0) {
    return current;
  }

  const next = await repository.saveOrganizationSettings({
    id: current.id,
    ...normalized,
  });

  await repository.recordAuditLog({
    organizationId: current.id,
    actorId: input.actor.userId,
    action: "organization.report_access.updated",
    targetType: "organization",
    targetId: current.id,
    metadata: buildAuditMetadata(current, normalized, changed),
  });

  return next;
}

async function requireOrganization(
  organizationId: string,
  repository: OrganizationSettingsRepository,
): Promise<OrganizationSettingsRecord> {
  const organization = await repository.findOrganizationSettings({
    organizationId,
  });

  if (!organization) {
    throw new Error("Organization was not found");
  }

  return organization;
}

function normalizeSettings(
  settings: OrganizationSettingsInput,
): OrganizationSettingsInput {
  const name = settings.name.trim();

  if (!name) {
    throw new Error("Organization name is required");
  }

  const slug = settings.slug.trim();

  if (!slug) {
    throw new Error("Organization slug is required");
  }
  requireValidSlug(slug);

  const allowedEmailDomains = normalizeAllowedEmailDomains(
    settings.allowedEmailDomains,
  );

  if (allowedEmailDomains.length === 0) {
    throw new Error("At least one allowed email domain is required");
  }

  for (const domain of allowedEmailDomains) {
    requireValidAllowedEmailDomain(domain);
  }

  if (settings.status !== "ACTIVE" && settings.status !== "INACTIVE") {
    throw new Error("Organization status is invalid");
  }

  if (
    settings.enrollmentPolicy !== "ASSIGNMENT_ONLY" &&
    settings.enrollmentPolicy !== "ASSIGNMENT_AND_SELF_ENROLLMENT"
  ) {
    throw new Error("Enrollment policy is invalid");
  }

  return {
    name,
    slug,
    status: settings.status,
    allowedEmailDomains,
    ...normalizeBranding(settings),
    enrollmentPolicy: settings.enrollmentPolicy,
    globalLibraryEnabled: settings.globalLibraryEnabled,
    allowAdminBranding: settings.allowAdminBranding,
    allowManagerReports: settings.allowManagerReports,
    allowUserReports: settings.allowUserReports,
    allowCsvExports: settings.allowCsvExports,
  };
}

function normalizeBranding(
  branding: OrganizationBrandingInput,
): OrganizationBrandingInput {
  requireHexColor(branding.primaryColor);
  requireHexColor(branding.accentColor);

  return {
    logoUrl: branding.logoUrl?.trim() || null,
    primaryColor: branding.primaryColor,
    accentColor: branding.accentColor,
  };
}

function requireHexColor(color: string): void {
  if (!hexColorPattern.test(color)) {
    throw new Error("Theme color must be a 6-digit hex color");
  }
}

function requireValidSlug(slug: string): void {
  if (!slugPattern.test(slug)) {
    throw new Error(
      "Organization slug must use lowercase letters, numbers, and hyphens",
    );
  }
}

function requireValidAllowedEmailDomain(domain: string): void {
  const labels = domain.split(".");

  if (
    domain.includes("@") ||
    domain.includes("/") ||
    domain.includes(":") ||
    labels.length < 2 ||
    labels.some((label) => !domainLabelPattern.test(label))
  ) {
    throw new Error("Allowed email domain is invalid");
  }
}

function normalizeAllowedEmailDomains(domains: string[]): string[] {
  return domains
    .map((domain) => domain.trim().replace(/^@+/, "").toLowerCase())
    .filter((domain) => domain.length > 0);
}

function changedFields<T extends readonly SettingField[] | readonly BrandingField[]>(
  current: OrganizationSettingsRecord,
  next: Partial<OrganizationSettingsInput>,
  fields: T,
): T[number][] {
  return fields.filter((field) => !valuesEqual(current[field], next[field]));
}

function valuesEqual(left: unknown, right: unknown): boolean {
  if (Array.isArray(left) && Array.isArray(right)) {
    return (
      left.length === right.length &&
      left.every((value, index) => value === right[index])
    );
  }

  return left === right;
}

function buildAuditMetadata(
  current: OrganizationSettingsRecord,
  next: Partial<OrganizationSettingsInput>,
  changed: Array<SettingField | BrandingField>,
): Record<string, unknown> {
  return {
    changed,
    previous: Object.fromEntries(
      changed.map((field) => [field, current[field]]),
    ),
    next: Object.fromEntries(changed.map((field) => [field, next[field]])),
  };
}
