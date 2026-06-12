import { describe, expect, it } from "vitest";

import { buildSatisfactionReportRows, formatSatisfactionReportCsv } from "./satisfaction-report";

describe("satisfaction report", () => {
  it("aggregates ratings and feedback by course", () => {
    expect(
      buildSatisfactionReportRows([
        { courseId: "course_1", courseTitle: "Safety", stars: 5, text: "Clear", submittedAt: new Date("2026-06-12T10:00:00.000Z") },
        { courseId: "course_1", courseTitle: "Safety", stars: 3, text: null, submittedAt: new Date("2026-06-12T11:00:00.000Z") },
      ]),
    ).toEqual([
      {
        courseId: "course_1",
        courseTitle: "Safety",
        responseCount: 2,
        averageStars: 4,
        latestFeedbackText: null,
        latestFeedbackAt: new Date("2026-06-12T11:00:00.000Z"),
      },
    ]);
  });

  it("formats satisfaction rows as CSV", () => {
    expect(
      formatSatisfactionReportCsv([
        {
          courseId: "course_1",
          courseTitle: "Safety",
          responseCount: 2,
          averageStars: 4,
          latestFeedbackText: "Clear",
          latestFeedbackAt: new Date("2026-06-12T11:00:00.000Z"),
        },
      ]),
    ).toContain("Safety,2,4,Clear,2026-06-12T11:00:00.000Z");
  });
});
