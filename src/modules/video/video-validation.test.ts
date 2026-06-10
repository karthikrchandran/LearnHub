import { describe, expect, it } from "vitest";

import {
  clampVideoSecond,
  requireNonNegativeSecond,
  requirePositiveDurationSeconds,
  validateChapterRange,
} from "./video-validation";

describe("video validation", () => {
  it("requires positive video duration seconds", () => {
    expect(requirePositiveDurationSeconds(180)).toBe(180);
    expect(() => requirePositiveDurationSeconds(0)).toThrow("Video duration seconds must be positive");
  });

  it("requires non-negative seconds with a label", () => {
    expect(requireNonNegativeSecond(0, "Position")).toBe(0);
    expect(() => requireNonNegativeSecond(-1, "Position")).toThrow("Position cannot be negative");
    expect(() => requireNonNegativeSecond(1.5, "Position")).toThrow("Position must be a whole number");
    expect(() => requireNonNegativeSecond(Number.NaN, "Position")).toThrow("Position must be a whole number");
  });

  it("clamps seconds to the video duration", () => {
    expect(clampVideoSecond(200, 180)).toBe(180);
  });

  it("rejects chapter end times before or equal to start times", () => {
    expect(() => validateChapterRange({ startSecond: 45, endSecond: 30, durationSeconds: 180 })).toThrow(
      "Chapter end time must be after start time",
    );
    expect(() => validateChapterRange({ startSecond: 45, endSecond: 45, durationSeconds: 180 })).toThrow(
      "Chapter end time must be after start time",
    );
  });

  it("rejects chapter starts beyond the lesson duration", () => {
    expect(() => validateChapterRange({ startSecond: 200, endSecond: null, durationSeconds: 180 })).toThrow(
      "Chapter start time cannot exceed lesson duration",
    );
  });
});
