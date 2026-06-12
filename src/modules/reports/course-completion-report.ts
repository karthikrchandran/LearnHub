import { formatCsv } from "./csv";

export type CourseCompletionAssignmentRow = {
  courseId: string;
  courseTitle: string;
  assignmentStatus: "ASSIGNED" | "IN_PROGRESS" | "COMPLETED" | "OVERDUE";
  progressPercent: number;
};

export type CourseCompletionReportRow = {
  courseId: string;
  courseTitle: string;
  assignedCount: number;
  startedCount: number;
  completedCount: number;
  overdueCount: number;
  completionRate: number;
};

export function buildCourseCompletionReportRows(
  assignments: CourseCompletionAssignmentRow[],
): CourseCompletionReportRow[] {
  const grouped = new Map<string, CourseCompletionAssignmentRow[]>();

  for (const assignment of assignments) {
    grouped.set(assignment.courseId, [...(grouped.get(assignment.courseId) ?? []), assignment]);
  }

  return [...grouped.entries()].map(([courseId, rows]) => {
    const assignedCount = rows.length;
    const completedCount = rows.filter((row) => row.assignmentStatus === "COMPLETED").length;

    return {
      courseId,
      courseTitle: rows[0].courseTitle,
      assignedCount,
      startedCount: rows.filter((row) => row.progressPercent > 0 || row.assignmentStatus !== "ASSIGNED").length,
      completedCount,
      overdueCount: rows.filter((row) => row.assignmentStatus === "OVERDUE").length,
      completionRate: assignedCount === 0 ? 0 : Math.round((completedCount / assignedCount) * 100),
    };
  });
}

export function formatCourseCompletionCsv(rows: CourseCompletionReportRow[]): string {
  return formatCsv([
    ["Course Title", "Assigned", "Started", "Completed", "Overdue", "Completion Rate"],
    ...rows.map((row) => [
      row.courseTitle,
      row.assignedCount,
      row.startedCount,
      row.completedCount,
      row.overdueCount,
      row.completionRate,
    ]),
  ]);
}
