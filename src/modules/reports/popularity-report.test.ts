import { describe, expect, it } from "vitest";

import { buildPopularityReportRows } from "./popularity-report";

describe("popularity report", () => {
  it("ranks courses by views, enrollments, completions, and rating", () => {
    expect(
      buildPopularityReportRows([
        { courseId: "course_1", courseTitle: "Safety", viewCount: 20, enrollmentCount: 5, completionCount: 3, averageRating: 4.5 },
        { courseId: "course_2", courseTitle: "Ethics", viewCount: 10, enrollmentCount: 7, completionCount: 4, averageRating: 4.8 },
      ]),
    ).toEqual({
      mostViewed: { courseId: "course_1", courseTitle: "Safety", value: 20 },
      mostEnrolled: { courseId: "course_2", courseTitle: "Ethics", value: 7 },
      mostCompleted: { courseId: "course_2", courseTitle: "Ethics", value: 4 },
      highestRated: { courseId: "course_2", courseTitle: "Ethics", value: 4.8 },
    });
  });
});
