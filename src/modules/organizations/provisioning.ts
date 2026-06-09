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

function requireHexColor(color: string): void {
  if (!hexColorPattern.test(color)) {
    throw new Error("Theme color must be a 6-digit hex color");
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

  const allowedEmailDomains = normalizeAllowedEmailDomains(input.allowedEmailDomains);
  if (allowedEmailDomains.length === 0) {
    throw new Error("At least one allowed email domain is required");
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
