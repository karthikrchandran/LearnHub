import { describe, expect, it } from "vitest";

import { buildQuizDifficultyReportRows, formatQuizDifficultyReportCsv } from "./quiz-difficulty-report";

describe("quiz difficulty report", () => {
  it("aggregates question attempts and correct rate", () => {
    expect(
      buildQuizDifficultyReportRows([
        { courseId: "course_1", courseTitle: "Safety", questionId: "q1", prompt: "Question", selectedAnswerIds: ["a"], correct: false },
        { courseId: "course_1", courseTitle: "Safety", questionId: "q1", prompt: "Question", selectedAnswerIds: ["b"], correct: true },
      ]),
    ).toEqual([
      {
        courseId: "course_1",
        courseTitle: "Safety",
        questionId: "q1",
        prompt: "Question",
        attempts: 2,
        correctRate: 50,
      },
    ]);
  });

  it("formats difficulty rows as CSV", () => {
    expect(
      formatQuizDifficultyReportCsv([
        {
          courseId: "course_1",
          courseTitle: "Safety",
          questionId: "q1",
          prompt: "Hard question",
          attempts: 2,
          correctRate: 50,
        },
      ]),
    ).toContain("Safety,q1,Hard question,2,50");
  });
});
