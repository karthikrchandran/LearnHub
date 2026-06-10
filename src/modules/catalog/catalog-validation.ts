const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function normalizeCatalogSlug(slug: string): string {
  const normalized = slug.trim();

  if (!slugPattern.test(normalized)) {
    throw new Error("Slug must use lowercase letters, numbers, and hyphens");
  }

  return normalized;
}

export function requireCatalogTitle(title: string): string {
  const normalized = title.trim();

  if (!normalized) {
    throw new Error("Course title is required");
  }

  return normalized;
}

export function requirePositiveDurationMinutes(durationMinutes: number): number {
  if (!Number.isInteger(durationMinutes) || durationMinutes <= 0) {
    throw new Error("Expected duration minutes must be positive");
  }

  return durationMinutes;
}

export function requireNonNegativeBusinessDays(days: number): number {
  if (!Number.isInteger(days) || days < 0) {
    throw new Error("Estimated completion business days cannot be negative");
  }

  return days;
}
