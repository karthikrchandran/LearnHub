import { formatCsv } from "./csv";

export type SatisfactionSourceRow = {
  courseId: string;
  courseTitle: string;
  stars: number;
  text: string | null;
  submittedAt: Date;
};

export type SatisfactionReportRow = {
  courseId: string;
  courseTitle: string;
  responseCount: number;
  averageStars: number;
  latestFeedbackText: string | null;
  latestFeedbackAt: Date | null;
};

export function buildSatisfactionReportRows(rows: SatisfactionSourceRow[]): SatisfactionReportRow[] {
  const grouped = new Map<string, SatisfactionSourceRow[]>();

  for (const row of rows) {
    grouped.set(row.courseId, [...(grouped.get(row.courseId) ?? []), row]);
  }

  return [...grouped.entries()].map(([courseId, courseRows]) => {
    const latest = [...courseRows].sort((left, right) => right.submittedAt.getTime() - left.submittedAt.getTime())[0];

    return {
      courseId,
      courseTitle: courseRows[0].courseTitle,
      responseCount: courseRows.length,
      averageStars: Number((courseRows.reduce((sum, row) => sum + row.stars, 0) / courseRows.length).toFixed(1)),
      latestFeedbackText: latest.text,
      latestFeedbackAt: latest.submittedAt,
    };
  });
}

export function formatSatisfactionReportCsv(rows: SatisfactionReportRow[]): string {
  return formatCsv([
    ["Course Title", "Responses", "Average Stars", "Latest Feedback", "Latest Feedback At"],
    ...rows.map((row) => [
      row.courseTitle,
      row.responseCount,
      row.averageStars,
      row.latestFeedbackText ?? "",
      row.latestFeedbackAt?.toISOString() ?? "",
    ]),
  ]);
}
