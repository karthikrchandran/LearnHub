import { describe, expect, it } from "vitest";

import { buildCourseCompletionReportRows, formatCourseCompletionCsv } from "./course-completion-report";

describe("course completion report", () => {
  it("aggregates assigned, started, completed, overdue, and completion rate by course", () => {
    const rows = buildCourseCompletionReportRows([
      { courseId: "course_1", courseTitle: "Safety", assignmentStatus: "ASSIGNED", progressPercent: 0 },
      { courseId: "course_1", courseTitle: "Safety", assignmentStatus: "IN_PROGRESS", progressPercent: 20 },
      { courseId: "course_1", courseTitle: "Safety", assignmentStatus: "COMPLETED", progressPercent: 100 },
      { courseId: "course_1", courseTitle: "Safety", assignmentStatus: "OVERDUE", progressPercent: 40 },
      { courseId: "course_2", courseTitle: "Ethics", assignmentStatus: "COMPLETED", progressPercent: 100 },
    ]);

    expect(rows).toEqual([
      {
        courseId: "course_1",
        courseTitle: "Safety",
        assignedCount: 4,
        startedCount: 3,
        completedCount: 1,
        overdueCount: 1,
        completionRate: 25,
      },
      {
        courseId: "course_2",
        courseTitle: "Ethics",
        assignedCount: 1,
        startedCount: 1,
        completedCount: 1,
        overdueCount: 0,
        completionRate: 100,
      },
    ]);
  });

  it("formats completion rows as CSV", () => {
    expect(
      formatCourseCompletionCsv([
        {
          courseId: "course_1",
          courseTitle: "Safety, Basics",
          assignedCount: 4,
          startedCount: 3,
          completedCount: 1,
          overdueCount: 1,
          completionRate: 25,
        },
      ]),
    ).toBe(
      'Course Title,Assigned,Started,Completed,Overdue,Completion Rate\r\n"Safety, Basics",4,3,1,1,25',
    );
  });
});
