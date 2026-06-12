import type { KnowledgeCheckQuestionType } from "./scoring";

export type KnowledgeCheckAnswerDraft = {
  text: string;
  correct: boolean;
  feedback: string | null;
  sortOrder: number;
};

export type KnowledgeCheckDraft = {
  organizationId: string;
  courseId: string;
  lessonId: string | null;
  prompt: string;
  questionType: KnowledgeCheckQuestionType;
  required: boolean;
  active: boolean;
  explanation: string | null;
  answers: KnowledgeCheckAnswerDraft[];
};

export type NativeCompletionInput = {
  requiredLessonCount: number;
  completedRequiredLessonCount: number;
  requiredCheckCount: number;
  completedRequiredCheckCount: number;
};

export function normalizeKnowledgeCheckDraft(draft: KnowledgeCheckDraft): KnowledgeCheckDraft {
  const prompt = draft.prompt.trim();

  if (!prompt) {
    throw new Error("Knowledge check prompt is required");
  }

  const answers = draft.answers
    .map((answer, index) => ({
      ...answer,
      text: answer.text.trim(),
      feedback: answer.feedback?.trim() || null,
      sortOrder: index,
    }))
    .filter((answer) => answer.text.length > 0);

  if (answers.length < 2) {
    throw new Error("Knowledge check must have at least two answers");
  }

  validateCorrectAnswerCount(draft.questionType, answers);

  return {
    ...draft,
    prompt,
    explanation: draft.explanation?.trim() || null,
    answers,
  };
}

export function requireCanActivateKnowledgeCheck(draft: KnowledgeCheckDraft): void {
  const normalized = normalizeKnowledgeCheckDraft(draft);

  if (!normalized.answers.some((answer) => answer.correct)) {
    throw new Error("Active knowledge checks require at least one correct answer");
  }
}

export function reorderKnowledgeChecks(ids: string[]): Array<{ id: string; sortOrder: number }> {
  return ids.map((id, sortOrder) => ({ id, sortOrder }));
}

export function buildLearnerKnowledgeCheckView(input: {
  id: string;
  lessonId: string | null;
  prompt: string;
  questionType: KnowledgeCheckQuestionType;
  required: boolean;
  explanation: string | null;
  answers: Array<{ id: string; text: string; correct: boolean }>;
  latestAttempt: null | { correct: boolean; scorePercent: number; selectedAnswerIds: string[] };
}) {
  return {
    id: input.id,
    lessonId: input.lessonId,
    prompt: input.prompt,
    questionType: input.questionType,
    required: input.required,
    explanation: input.latestAttempt ? input.explanation : null,
    latestAttempt: input.latestAttempt,
    answers: input.answers.map((answer) => ({ id: answer.id, text: answer.text })),
  };
}

export function calculateNativeCompletionWithChecks(input: NativeCompletionInput): {
  completed: boolean;
  progressPercent: number;
} {
  const requiredItems = input.requiredLessonCount + input.requiredCheckCount;

  if (requiredItems === 0) {
    return { completed: true, progressPercent: 100 };
  }

  const completedItems = input.completedRequiredLessonCount + input.completedRequiredCheckCount;
  const progressPercent = Math.round((completedItems / requiredItems) * 100);

  return {
    completed: progressPercent >= 100,
    progressPercent,
  };
}

function validateCorrectAnswerCount(
  questionType: KnowledgeCheckQuestionType,
  answers: KnowledgeCheckAnswerDraft[],
): void {
  const correctCount = answers.filter((answer) => answer.correct).length;

  if (correctCount < 1) {
    throw new Error("Active knowledge checks require at least one correct answer");
  }

  if (questionType === "SINGLE_CHOICE" && correctCount !== 1) {
    throw new Error("Single-answer checks must have exactly one correct answer");
  }

  if (questionType === "TRUE_FALSE" && (answers.length !== 2 || correctCount !== 1)) {
    throw new Error("True/false checks must have one correct answer");
  }
}
