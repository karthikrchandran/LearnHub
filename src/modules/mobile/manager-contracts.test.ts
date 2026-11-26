import { describe, expect, it } from "vitest";

import { toMobileManagerDirectReportsResponse } from "./manager-contracts";

describe("toMobileManagerDirectReportsResponse", () => {
  it("projects direct reports and calculates average assignment progress", () => {
    const response = toMobileManagerDirectReportsResponse("org-1", [
      {
        id: "membership-1",
        employeeId: "E-100",
        department: "Operations",
        title: "Analyst",
        user: { email: "learner@example.com", firstName: "Ada", lastName: "Lovelace" },
        learningAssignments: [
          {
            id: "assignment-1",
            status: "IN_PROGRESS",
            startDate: new Date("2026-09-01T00:00:00.000Z"),
            dueDate: new Date("2026-10-01T00:00:00.000Z"),
            progress: { progressPercent: 50 },
            course: {
              title: "Course One",
              slug: "course-one",
              type: "NATIVE_VIDEO",
              expectedDurationMinutes: 20,
            },
          },
          {
            id: "assignment-2",
            status: "COMPLETED",
            startDate: null,
            dueDate: null,
            progress: { progressPercent: 100 },
            course: {
              title: "Course Two",
              slug: "course-two",
              type: "SCORM_1_2",
              expectedDurationMinutes: 40,
            },
          },
        ],
        certificates: [{ id: "certificate-1" }],
      },
    ]);

    expect(response.reports[0]).toMatchObject({
      id: "membership-1",
      firstName: "Ada",
      certificateCount: 1,
      progressPercent: 75,
    });
    expect(response.reports[0].assignments[0]).toMatchObject({
      id: "assignment-1",
      startDate: "2026-09-01T00:00:00.000Z",
      dueDate: "2026-10-01T00:00:00.000Z",
      certificateIssued: false,
    });
  });

  it("does not emit assignments without course data", () => {
    const [report] = toMobileManagerDirectReportsResponse("org-1", [
      {
        id: "membership-1",
        employeeId: null,
        department: null,
        title: null,
        user: { email: "learner@example.com", firstName: "Ada", lastName: "Lovelace" },
        learningAssignments: [{ id: "assignment-1", status: "ASSIGNED", progress: null }],
        certificates: [],
      },
    ]).reports;

    expect(report.assignments).toEqual([]);
    expect(report.progressPercent).toBe(0);
  });
});