export type ProvisionOrganizationInput = {
  actor: { userId: string; isPlatformOwner: boolean };
  name: string;
  slug: string;
  allowedEmailDomains: string[];
  logoUrl?: string;
  primaryColor: string;
  accentColor: string;
  enrollmentPolicy: "ASSIGNMENT_ONLY" | "ASSIGNMENT_AND_SELF_ENROLLMENT";
  globalLibraryEnabled: boolean;
};

export type ProvisionOrganizationRepository = {
  createOrganization(data: {
    name: string;
    slug: string;
    allowedEmailDomains: string[];
    logoUrl: string | null;
    primaryColor: string;
    accentColor: string;
    enrollmentPolicy: "ASSIGNMENT_ONLY" | "ASSIGNMENT_AND_SELF_ENROLLMENT";
    globalLibraryEnabled: boolean;
  }): Promise<{ id: string; slug: string }>;
};

const hexColorPattern = /^#[0-9a-fA-F]{6}$/;
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const domainLabelPattern = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

function requireHexColor(color: string): void {
  if (!hexColorPattern.test(color)) {
    throw new Error("Theme color must be a 6-digit hex color");
  }
}

function requireValidSlug(slug: string): void {
  if (!slugPattern.test(slug)) {
    throw new Error("Organization slug must use lowercase letters, numbers, and hyphens");
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

export async function provisionOrganization(
  input: ProvisionOrganizationInput,
  repository: ProvisionOrganizationRepository,
): Promise<{ id: string; slug: string }> {
  if (!input.actor.isPlatformOwner) {
    throw new Error("Only platform owners can provision organizations");
  }

  const name = input.name.trim();
  if (!name) {
    throw new Error("Organization name is required");
  }

  const slug = input.slug.trim();
  if (!slug) {
    throw new Error("Organization slug is required");
  }
  requireValidSlug(slug);

  const allowedEmailDomains = normalizeAllowedEmailDomains(input.allowedEmailDomains);
  if (allowedEmailDomains.length === 0) {
    throw new Error("At least one allowed email domain is required");
  }
  for (const domain of allowedEmailDomains) {
    requireValidAllowedEmailDomain(domain);
  }

  requireHexColor(input.primaryColor);
  requireHexColor(input.accentColor);

  const logoUrl = input.logoUrl?.trim() || null;

  return repository.createOrganization({
    name,
    slug,
    allowedEmailDomains,
    logoUrl,
    primaryColor: input.primaryColor,
    accentColor: input.accentColor,
    enrollmentPolicy: input.enrollmentPolicy,
    globalLibraryEnabled: input.globalLibraryEnabled,
  });
}
