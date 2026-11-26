import { describe, expect, it } from "vitest";

import { isMobileProgressAdvanceAllowed } from "./progress-integrity";

describe("mobile progress integrity", () => {
  it("allows normal checkpoint advancement", () => {
    expect(isMobileProgressAdvanceAllowed(60, 90)).toBe(true);
  });

  it("rejects an instant completion jump", () => {
    expect(isMobileProgressAdvanceAllowed(0, 180)).toBe(false);
  });

  it("allows a configured larger checkpoint window", () => {
    expect(isMobileProgressAdvanceAllowed(0, 120, 120)).toBe(true);
  });
});