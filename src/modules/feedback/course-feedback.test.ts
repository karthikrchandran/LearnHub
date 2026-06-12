import { describe, expect, it } from "vitest";

import { aggregateCourseSatisfaction, normalizeCourseFeedback } from "./course-feedback";

describe("normalizeCourseFeedback", () => {
  it("accepts one to five stars with optional text", () => {
    expect(normalizeCourseFeedback({ stars: 5, text: "Useful course." })).toEqual({
      stars: 5,
      text: "Useful course.",
    });
  });

  it("trims blank feedback text to null", () => {
    expect(normalizeCourseFeedback({ stars: 4, text: "   " })).toEqual({
      stars: 4,
      text: null,
    });
  });

  it("rejects stars outside the supported range", () => {
    expect(() => normalizeCourseFeedback({ stars: 0, text: null })).toThrow(
      "Course rating must be between 1 and 5 stars",
    );
    expect(() => normalizeCourseFeedback({ stars: 6, text: null })).toThrow(
      "Course rating must be between 1 and 5 stars",
    );
  });
});

describe("aggregateCourseSatisfaction", () => {
  it("aggregates ratings and feedback by tenant and course", () => {
    expect(
      aggregateCourseSatisfaction(
        [
          { organizationId: "org_1", courseId: "course_1", stars: 5, text: "Great" },
          { organizationId: "org_1", courseId: "course_1", stars: 3, text: null },
          { organizationId: "org_2", courseId: "course_1", stars: 1, text: "Other tenant" },
        ],
        "org_1",
      ),
    ).toEqual([
      {
        organizationId: "org_1",
        courseId: "course_1",
        ratingCount: 2,
        averageStars: 4,
        feedback: ["Great"],
      },
    ]);
  });
});
