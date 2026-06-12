import { describe, expect, it } from "vitest";

import { buildTimingReportRows, formatTimingReportCsv } from "./timing-report";

describe("timing report", () => {
  it("aggregates average time, total time, and last activity by course", () => {
    const rows = buildTimingReportRows([
      { courseId: "course_1", courseTitle: "Safety", totalTimeSeconds: 120, lastActivityAt: new Date("2026-06-12T10:00:00.000Z") },
      { courseId: "course_1", courseTitle: "Safety", totalTimeSeconds: 60, lastActivityAt: new Date("2026-06-12T11:00:00.000Z") },
      { courseId: "course_2", courseTitle: "Ethics", totalTimeSeconds: 0, lastActivityAt: null },
    ]);

    expect(rows).toEqual([
      {
        courseId: "course_1",
        courseTitle: "Safety",
        learnerCount: 2,
        averageTimeSeconds: 90,
        totalTimeSeconds: 180,
        lastActivityAt: new Date("2026-06-12T11:00:00.000Z"),
      },
      {
        courseId: "course_2",
        courseTitle: "Ethics",
        learnerCount: 1,
        averageTimeSeconds: 0,
        totalTimeSeconds: 0,
        lastActivityAt: null,
      },
    ]);
  });

  it("formats timing rows as CSV", () => {
    expect(
      formatTimingReportCsv([
        {
          courseId: "course_1",
          courseTitle: "Safety",
          learnerCount: 2,
          averageTimeSeconds: 90,
          totalTimeSeconds: 180,
          lastActivityAt: new Date("2026-06-12T11:00:00.000Z"),
        },
      ]),
    ).toContain("Safety,2,90,180,2026-06-12T11:00:00.000Z");
  });
});
