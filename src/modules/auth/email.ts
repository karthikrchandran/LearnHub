export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function getEmailDomain(email: string): string {
  const normalized = normalizeEmail(email);
  const parts = normalized.split("@");
  const [localPart, domain] = parts;

  if (parts.length !== 2 || !localPart || !domain || /\s/.test(normalized)) {
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
