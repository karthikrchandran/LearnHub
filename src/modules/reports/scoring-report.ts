import { aggregateQuizDifficulty } from "@/modules/assessments/scoring";
import { formatCsv } from "./csv";

export type ScoringAttemptRow = {
  organizationId: string;
  courseId: string;
  courseTitle: string;
  scorePercent: number;
  submittedAt: Date;
};

export type DifficultyAttemptRow = {
  organizationId: string;
  courseId: string;
  questionId: string;
  prompt: string;
  selectedAnswerIds: string[];
  correct: boolean;
};

export function buildScoringReportRows(rows: ScoringAttemptRow[], organizationId: string) {
  const grouped = new Map<string, ScoringAttemptRow[]>();

  for (const row of rows.filter((candidate) => candidate.organizationId === organizationId)) {
    grouped.set(row.courseId, [...(grouped.get(row.courseId) ?? []), row]);
  }

  return [...grouped.entries()].map(([courseId, courseRows]) => ({
    organizationId,
    courseId,
    courseTitle: courseRows[0].courseTitle,
    attemptCount: courseRows.length,
    averageScore: Math.round(courseRows.reduce((sum, row) => sum + row.scorePercent, 0) / courseRows.length),
    bestScore: Math.max(...courseRows.map((row) => row.scorePercent)),
    latestScore: [...courseRows].sort((left, right) => right.submittedAt.getTime() - left.submittedAt.getTime())[0]
      .scorePercent,
    passRate: Math.round((courseRows.filter((row) => row.scorePercent >= 70).length / courseRows.length) * 100),
  }));
}

export function buildQuizDifficultyReportRows(rows: DifficultyAttemptRow[], organizationId: string) {
  const scoped = rows.filter((row) => row.organizationId === organizationId);
  const promptByQuestion = new Map(scoped.map((row) => [row.questionId, row.prompt]));

  return aggregateQuizDifficulty(scoped).map((row) => ({
    ...row,
    prompt: promptByQuestion.get(row.questionId) ?? row.questionId,
  }));
}

export function formatScoringReportCsv(rows: ReturnType<typeof buildScoringReportRows>): string {
  return formatCsv([
    ["Course Title", "Attempts", "Average Score", "Best Score", "Latest Score", "Pass Rate"],
    ...rows.map((row) => [
      row.courseTitle,
      row.attemptCount,
      row.averageScore,
      row.bestScore,
      row.latestScore,
      row.passRate,
    ]),
  ]);
}
