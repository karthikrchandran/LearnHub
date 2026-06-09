export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function getEmailDomain(email: string): string {
  const normalized = normalizeEmail(email);
  const atIndex = normalized.lastIndexOf("@");
  const domain = atIndex >= 0 ? normalized.slice(atIndex + 1) : "";

  if (!domain) {
    throw new Error("Valid email is required");
  }

  return domain;
}

function normalizeAllowedDomains(allowedDomains: string[]): string[] {
  return allowedDomains.map((allowedDomain) => allowedDomain.trim().toLowerCase()).filter(Boolean);
}

export function emailDomainAllowed(email: string, allowedDomains: string[]): boolean {
  const normalizedDomains = normalizeAllowedDomains(allowedDomains);

  if (normalizedDomains.length === 0) {
    return false;
  }

  return normalizedDomains.includes(getEmailDomain(email));
}

export function requireAllowedOrganizationEmail(email: string, allowedDomains: string[]): string {
  const normalized = normalizeEmail(email);

  if (!emailDomainAllowed(normalized, allowedDomains)) {
    throw new Error("Email domain is not allowed for this organization");
  }

  return normalized;
}
