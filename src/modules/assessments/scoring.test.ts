import { describe, expect, it } from "vitest";

import {
  aggregateQuizDifficulty,
  scoreKnowledgeCheck,
  type ScoreableKnowledgeCheck,
} from "./scoring";

const singleChoice: ScoreableKnowledgeCheck = {
  id: "check_1",
  questionType: "SINGLE_CHOICE",
  explanation: "Choose the answer that opens the conversation.",
  answers: [
    { id: "answer_1", correct: true, feedback: "Correct. Open questions invite context." },
    { id: "answer_2", correct: false, feedback: "This can sound accusatory." },
  ],
};

describe("scoreKnowledgeCheck", () => {
  it("scores single-answer multiple choice as correct when exactly one correct answer is selected", () => {
    expect(scoreKnowledgeCheck(singleChoice, ["answer_1"])).toEqual({
      correct: true,
      scorePercent: 100,
      selectedAnswerFeedback: ["Correct. Open questions invite context."],
      explanation: "Choose the answer that opens the conversation.",
    });
  });

  it("scores single-answer multiple choice as wrong when more than one answer is selected", () => {
    expect(scoreKnowledgeCheck(singleChoice, ["answer_1", "answer_2"])).toMatchObject({
      correct: false,
      scorePercent: 0,
      selectedAnswerFeedback: [
        "Correct. Open questions invite context.",
        "This can sound accusatory.",
      ],
    });
  });

  it("requires all and only correct answers for multiple-answer checks", () => {
    const check: ScoreableKnowledgeCheck = {
      id: "check_2",
      questionType: "MULTIPLE_CHOICE",
      explanation: null,
      answers: [
        { id: "a", correct: true, feedback: null },
        { id: "b", correct: true, feedback: null },
        { id: "c", correct: false, feedback: "Distractor." },
      ],
    };

    expect(scoreKnowledgeCheck(check, ["a", "b"])).toMatchObject({ correct: true, scorePercent: 100 });
    expect(scoreKnowledgeCheck(check, ["a", "c"])).toMatchObject({ correct: false, scorePercent: 0 });
  });

  it("scores true false checks through the same selected answer contract", () => {
    const check: ScoreableKnowledgeCheck = {
      id: "check_tf",
      questionType: "TRUE_FALSE",
      explanation: "The statement is true.",
      answers: [
        { id: "true", correct: true, feedback: "Right." },
        { id: "false", correct: false, feedback: "Review the lesson context." },
      ],
    };

    expect(scoreKnowledgeCheck(check, ["false"])).toEqual({
      correct: false,
      scorePercent: 0,
      selectedAnswerFeedback: ["Review the lesson context."],
      explanation: "The statement is true.",
    });
  });
});

describe("aggregateQuizDifficulty", () => {
  it("ranks harder questions by lower correct rate and includes commonly missed answers", () => {
    const rows = aggregateQuizDifficulty([
      { questionId: "q1", selectedAnswerIds: ["a"], correct: true },
      { questionId: "q1", selectedAnswerIds: ["b"], correct: false },
      { questionId: "q1", selectedAnswerIds: ["b"], correct: false },
      { questionId: "q2", selectedAnswerIds: ["x"], correct: true },
    ]);

    expect(rows[0]).toEqual({
      questionId: "q1",
      attempts: 3,
      correctAttempts: 1,
      incorrectAttempts: 2,
      correctRate: 33,
      commonlyMissedAnswerIds: ["b"],
    });
  });
});
