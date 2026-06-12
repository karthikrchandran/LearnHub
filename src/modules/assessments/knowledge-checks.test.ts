import { describe, expect, it } from "vitest";

import {
  buildLearnerKnowledgeCheckView,
  calculateNativeCompletionWithChecks,
  normalizeKnowledgeCheckDraft,
  reorderKnowledgeChecks,
  requireCanActivateKnowledgeCheck,
  type KnowledgeCheckDraft,
} from "./knowledge-checks";

const validDraft: KnowledgeCheckDraft = {
  organizationId: "org_1",
  courseId: "course_1",
  lessonId: "lesson_1",
  prompt: "Which response is best?",
  questionType: "SINGLE_CHOICE",
  required: true,
  active: true,
  explanation: "Use neutral language.",
  answers: [
    { text: "What happened?", correct: true, feedback: "Correct.", sortOrder: 0 },
    { text: "Why did you fail?", correct: false, feedback: "Too accusatory.", sortOrder: 1 },
  ],
};

describe("normalizeKnowledgeCheckDraft", () => {
  it("accepts single-answer multiple choice with exactly one correct answer", () => {
    expect(normalizeKnowledgeCheckDraft(validDraft)).toMatchObject({
      prompt: "Which response is best?",
      answers: [{ sortOrder: 0 }, { sortOrder: 1 }],
    });
  });

  it("requires at least two answers", () => {
    expect(() =>
      normalizeKnowledgeCheckDraft({
        ...validDraft,
        answers: [{ text: "Only one", correct: true, feedback: null, sortOrder: 0 }],
      }),
    ).toThrow("Knowledge check must have at least two answers");
  });

  it("requires true false checks to have one correct and one incorrect answer", () => {
    expect(() =>
      normalizeKnowledgeCheckDraft({
        ...validDraft,
        questionType: "TRUE_FALSE",
        answers: [
          { text: "True", correct: true, feedback: null, sortOrder: 0 },
          { text: "False", correct: true, feedback: null, sortOrder: 1 },
        ],
      }),
    ).toThrow("True/false checks must have one correct answer");
  });
});

describe("activation and ordering", () => {
  it("rejects activation without a correct answer", () => {
    expect(() =>
      requireCanActivateKnowledgeCheck({
        ...validDraft,
        answers: validDraft.answers.map((answer) => ({ ...answer, correct: false })),
      }),
    ).toThrow("Active knowledge checks require at least one correct answer");
  });

  it("assigns stable zero-based sort order", () => {
    expect(reorderKnowledgeChecks(["check_c", "check_a"])).toEqual([
      { id: "check_c", sortOrder: 0 },
      { id: "check_a", sortOrder: 1 },
    ]);
  });
});

describe("learner view and completion", () => {
  it("does not expose correct answer flags before submission", () => {
    const view = buildLearnerKnowledgeCheckView({
      id: "check_1",
      lessonId: "lesson_1",
      prompt: "Question",
      questionType: "SINGLE_CHOICE",
      required: true,
      explanation: "Context",
      answers: [
        { id: "a", text: "A", correct: true },
        { id: "b", text: "B", correct: false },
      ],
      latestAttempt: null,
    });

    expect(view.answers).toEqual([
      { id: "a", text: "A" },
      { id: "b", text: "B" },
    ]);
  });

  it("requires required lessons and required active checks for native completion", () => {
    expect(
      calculateNativeCompletionWithChecks({
        requiredLessonCount: 2,
        completedRequiredLessonCount: 2,
        requiredCheckCount: 2,
        completedRequiredCheckCount: 1,
      }),
    ).toEqual({
      completed: false,
      progressPercent: 75,
    });
  });
});
