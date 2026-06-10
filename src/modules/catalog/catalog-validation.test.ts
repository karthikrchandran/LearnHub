import { describe, expect, it } from "vitest";

import {
  normalizeCatalogSlug,
  requireCatalogTitle,
  requireNonNegativeBusinessDays,
  requirePositiveDurationMinutes,
} from "./catalog-validation";

describe("catalog validation", () => {
  it("accepts lowercase URL-safe slugs", () => {
    expect(normalizeCatalogSlug("manager-coaching-101")).toBe("manager-coaching-101");
    expect(normalizeCatalogSlug(" manager-coaching-101 ")).toBe("manager-coaching-101");
  });

  it("rejects unsafe slugs", () => {
    expect(() => normalizeCatalogSlug("Manager Coaching")).toThrow(
      "Slug must use lowercase letters, numbers, and hyphens",
    );
    expect(() => normalizeCatalogSlug("manager coaching")).toThrow(
      "Slug must use lowercase letters, numbers, and hyphens",
    );
    expect(() => normalizeCatalogSlug("manager/coaching")).toThrow(
      "Slug must use lowercase letters, numbers, and hyphens",
    );
    expect(() => normalizeCatalogSlug("manager_coaching")).toThrow(
      "Slug must use lowercase letters, numbers, and hyphens",
    );
    expect(() => normalizeCatalogSlug("")).toThrow("Slug must use lowercase letters, numbers, and hyphens");
  });

  it("requires non-empty titles", () => {
    expect(requireCatalogTitle(" Workplace Safety ")).toBe("Workplace Safety");
    expect(() => requireCatalogTitle(" ")).toThrow("Course title is required");
  });

  it("requires positive expected duration", () => {
    expect(requirePositiveDurationMinutes(30)).toBe(30);
    expect(() => requirePositiveDurationMinutes(0)).toThrow("Expected duration minutes must be positive");
    expect(() => requirePositiveDurationMinutes(-1)).toThrow("Expected duration minutes must be positive");
    expect(() => requirePositiveDurationMinutes(1.5)).toThrow("Expected duration minutes must be positive");
  });

  it("requires non-negative estimated business days", () => {
    expect(requireNonNegativeBusinessDays(0)).toBe(0);
    expect(requireNonNegativeBusinessDays(5)).toBe(5);
    expect(() => requireNonNegativeBusinessDays(-1)).toThrow(
      "Estimated completion business days cannot be negative",
    );
    expect(() => requireNonNegativeBusinessDays(1.5)).toThrow(
      "Estimated completion business days cannot be negative",
    );
  });
});
