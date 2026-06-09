import { describe, expect, it } from "vitest";

import { addBusinessDays } from "./business-days";

describe("addBusinessDays", () => {
  it("skips weekends when calculating due dates", () => {
    const friday = new Date("2026-06-12T12:00:00.000Z");

    expect(addBusinessDays(friday, 3).toISOString()).toBe("2026-06-17T12:00:00.000Z");
  });

  it("returns the same day for zero business days", () => {
    const monday = new Date("2026-06-15T08:30:00.000Z");

    expect(addBusinessDays(monday, 0).toISOString()).toBe("2026-06-15T08:30:00.000Z");
  });

  it("rejects negative day counts", () => {
    const monday = new Date("2026-06-15T08:30:00.000Z");

    expect(() => addBusinessDays(monday, -1)).toThrow("Business day count cannot be negative");
  });
});
