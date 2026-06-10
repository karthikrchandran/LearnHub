import { describe, expect, it } from "vitest";

import { calculateScormProgress, normalizeScormLessonStatus } from "./scorm-progress";

describe("SCORM progress rules", () => {
  it("maps completed and passed statuses to completion", () => {
    expect(calculateScormProgress({ lessonStatus: "completed" })).toEqual({
      lessonStatus: "completed",
      progressPercent: 100,
      eventType: "COMPLETED",
      completed: true,
    });
    expect(calculateScormProgress({ lessonStatus: "passed" })).toEqual({
      lessonStatus: "passed",
      progressPercent: 100,
      eventType: "PASSED",
      completed: true,
    });
  });

  it("maps incomplete score to score capped at 95", () => {
    expect(calculateScormProgress({ lessonStatus: "incomplete", scoreRaw: 98 })).toMatchObject({
      progressPercent: 95,
      eventType: "PROGRESS",
      completed: false,
    });
  });

  it("maps incomplete activity without score to 50", () => {
    expect(calculateScormProgress({ lessonStatus: "incomplete", hasActivity: true })).toMatchObject({
      progressPercent: 50,
      eventType: "PROGRESS",
      completed: false,
    });
  });

  it("maps browsed and not attempted statuses", () => {
    expect(calculateScormProgress({ lessonStatus: "browsed" })).toMatchObject({ progressPercent: 25 });
    expect(calculateScormProgress({ lessonStatus: "not attempted" })).toMatchObject({ progressPercent: 0 });
  });

  it("normalizes unknown statuses to not attempted", () => {
    expect(normalizeScormLessonStatus("unknown")).toBe("not attempted");
  });
});
