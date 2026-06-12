import { formatCsv } from "./csv";

export type QuizDifficultySourceRow = {
  courseId: string;
  courseTitle: string;
  questionId: string;
  prompt: string;
  selectedAnswerIds: string[];
  correct: boolean;
};

export type QuizDifficultyReportRow = {
  courseId: string;
  courseTitle: string;
  questionId: string;
  prompt: string;
  attempts: number;
  correctRate: number;
};

export function buildQuizDifficultyReportRows(rows: QuizDifficultySourceRow[]): QuizDifficultyReportRow[] {
  const grouped = new Map<string, QuizDifficultySourceRow[]>();

  for (const row of rows) {
    grouped.set(row.questionId, [...(grouped.get(row.questionId) ?? []), row]);
  }

  return [...grouped.entries()].map(([questionId, questionRows]) => ({
    courseId: questionRows[0].courseId,
    courseTitle: questionRows[0].courseTitle,
    questionId,
    prompt: questionRows[0].prompt,
    attempts: questionRows.length,
    correctRate: Math.round((questionRows.filter((row) => row.correct).length / questionRows.length) * 100),
  }));
}

export function formatQuizDifficultyReportCsv(rows: QuizDifficultyReportRow[]): string {
  return formatCsv([
    ["Course Title", "Question ID", "Prompt", "Attempts", "Correct Rate"],
    ...rows.map((row) => [row.courseTitle, row.questionId, row.prompt, row.attempts, row.correctRate]),
  ]);
}
