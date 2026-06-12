export type KnowledgeCheckQuestionType = "SINGLE_CHOICE" | "MULTIPLE_CHOICE" | "TRUE_FALSE";

export type ScoreableAnswer = {
  id: string;
  correct: boolean;
  feedback: string | null;
};

export type ScoreableKnowledgeCheck = {
  id: string;
  questionType: KnowledgeCheckQuestionType;
  explanation: string | null;
  answers: ScoreableAnswer[];
};

export type KnowledgeCheckScore = {
  correct: boolean;
  scorePercent: number;
  selectedAnswerFeedback: string[];
  explanation: string | null;
};

export type DifficultyAttempt = {
  questionId: string;
  selectedAnswerIds: string[];
  correct: boolean;
};

export type QuizDifficultyRow = {
  questionId: string;
  attempts: number;
  correctAttempts: number;
  incorrectAttempts: number;
  correctRate: number;
  commonlyMissedAnswerIds: string[];
};

export function scoreKnowledgeCheck(
  check: ScoreableKnowledgeCheck,
  selectedAnswerIds: string[],
): KnowledgeCheckScore {
  const selected = unique(selectedAnswerIds);
  const correctAnswerIds = check.answers.filter((answer) => answer.correct).map((answer) => answer.id).sort();
  const selectedSorted = [...selected].sort();
  const correct =
    selectedSorted.length === correctAnswerIds.length &&
    selectedSorted.every((answerId, index) => answerId === correctAnswerIds[index]) &&
    selectionCountIsValid(check.questionType, selectedSorted.length);

  return {
    correct,
    scorePercent: correct ? 100 : 0,
    selectedAnswerFeedback: check.answers
      .filter((answer) => selected.includes(answer.id) && answer.feedback)
      .sort((left, right) => selected.indexOf(left.id) - selected.indexOf(right.id))
      .map((answer) => answer.feedback as string),
    explanation: check.explanation,
  };
}

export function aggregateQuizDifficulty(attempts: DifficultyAttempt[]): QuizDifficultyRow[] {
  const byQuestion = new Map<string, DifficultyAttempt[]>();

  for (const attempt of attempts) {
    byQuestion.set(attempt.questionId, [...(byQuestion.get(attempt.questionId) ?? []), attempt]);
  }

  return [...byQuestion.entries()]
    .map(([questionId, questionAttempts]) => {
      const correctAttempts = questionAttempts.filter((attempt) => attempt.correct).length;
      const missedCounts = new Map<string, number>();

      for (const attempt of questionAttempts.filter((candidate) => !candidate.correct)) {
        for (const answerId of attempt.selectedAnswerIds) {
          missedCounts.set(answerId, (missedCounts.get(answerId) ?? 0) + 1);
        }
      }

      return {
        questionId,
        attempts: questionAttempts.length,
        correctAttempts,
        incorrectAttempts: questionAttempts.length - correctAttempts,
        correctRate: Math.round((correctAttempts / questionAttempts.length) * 100),
        commonlyMissedAnswerIds: [...missedCounts.entries()]
          .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
          .slice(0, 3)
          .map(([answerId]) => answerId),
      };
    })
    .sort((left, right) => left.correctRate - right.correctRate || right.attempts - left.attempts);
}

function selectionCountIsValid(questionType: KnowledgeCheckQuestionType, selectedCount: number): boolean {
  if (questionType === "MULTIPLE_CHOICE") {
    return selectedCount > 0;
  }

  return selectedCount === 1;
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
