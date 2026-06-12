import { describe, expect, it } from "vitest";

import { buildQuizDifficultyReportRows, buildScoringReportRows } from "./scoring-report";

describe("scoring reports", () => {
  it("aggregates average, best, latest, and pass rate by course", () => {
    expect(
      buildScoringReportRows(
        [
          { organizationId: "org_1", courseId: "course_1", courseTitle: "Course", scorePercent: 100, submittedAt: new Date("2026-06-12T10:00:00.000Z") },
          { organizationId: "org_1", courseId: "course_1", courseTitle: "Course", scorePercent: 40, submittedAt: new Date("2026-06-12T11:00:00.000Z") },
          { organizationId: "org_2", courseId: "course_1", courseTitle: "Other", scorePercent: 100, submittedAt: new Date("2026-06-12T12:00:00.000Z") },
        ],
        "org_1",
      ),
    ).toEqual([
      {
        organizationId: "org_1",
        courseId: "course_1",
        courseTitle: "Course",
        attemptCount: 2,
        averageScore: 70,
        bestScore: 100,
        latestScore: 40,
        passRate: 50,
      },
    ]);
  });

  it("builds quiz difficulty rows", () => {
    expect(
      buildQuizDifficultyReportRows(
        [
          {
            organizationId: "org_1",
            courseId: "course_1",
            questionId: "q1",
            prompt: "Question",
            selectedAnswerIds: ["a"],
            correct: false,
          },
          {
            organizationId: "org_1",
            courseId: "course_1",
            questionId: "q1",
            prompt: "Question",
            selectedAnswerIds: ["b"],
            correct: true,
          },
        ],
        "org_1",
      )[0],
    ).toMatchObject({
      questionId: "q1",
      prompt: "Question",
      attempts: 2,
      correctRate: 50,
    });
  });
});
