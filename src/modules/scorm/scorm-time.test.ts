import { describe, expect, it } from "vitest";

import { formatScorm12Time, parseScorm12Time } from "./scorm-time";

describe("SCORM 1.2 time", () => {
  it("parses HH:MM:SS decimal time strings", () => {
    expect(parseScorm12Time("01:02:03.50")).toBe(3723);
  });

  it("formats seconds as HH:MM:SS", () => {
    expect(formatScorm12Time(3723)).toBe("01:02:03");
  });

  it("rejects invalid time strings", () => {
    expect(() => parseScorm12Time("1:2:3")).toThrow("Invalid SCORM 1.2 time");
    expect(() => parseScorm12Time("00:70:00")).toThrow("Invalid SCORM 1.2 time");
  });
});
