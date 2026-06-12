import { formatCsv } from "./csv";

export type TimingSourceRow = {
  courseId: string;
  courseTitle: string;
  totalTimeSeconds: number;
  lastActivityAt: Date | null;
};

export type TimingReportRow = {
  courseId: string;
  courseTitle: string;
  learnerCount: number;
  averageTimeSeconds: number;
  totalTimeSeconds: number;
  lastActivityAt: Date | null;
};

export function buildTimingReportRows(rows: TimingSourceRow[]): TimingReportRow[] {
  const grouped = new Map<string, TimingSourceRow[]>();

  for (const row of rows) {
    grouped.set(row.courseId, [...(grouped.get(row.courseId) ?? []), row]);
  }

  return [...grouped.entries()].map(([courseId, courseRows]) => {
    const totalTimeSeconds = courseRows.reduce((sum, row) => sum + row.totalTimeSeconds, 0);
    const activityDates = courseRows
      .map((row) => row.lastActivityAt)
      .filter((date): date is Date => Boolean(date));

    return {
      courseId,
      courseTitle: courseRows[0].courseTitle,
      learnerCount: courseRows.length,
      averageTimeSeconds: Math.round(totalTimeSeconds / courseRows.length),
      totalTimeSeconds,
      lastActivityAt: activityDates.length === 0
        ? null
        : new Date(Math.max(...activityDates.map((date) => date.getTime()))),
    };
  });
}

export function formatTimingReportCsv(rows: TimingReportRow[]): string {
  return formatCsv([
    ["Course Title", "Learners", "Average Time Seconds", "Total Time Seconds", "Last Activity"],
    ...rows.map((row) => [
      row.courseTitle,
      row.learnerCount,
      row.averageTimeSeconds,
      row.totalTimeSeconds,
      row.lastActivityAt?.toISOString() ?? "",
    ]),
  ]);
}
