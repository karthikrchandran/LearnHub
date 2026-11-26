import { describe, expect, it } from "vitest";

import { toMobileLearnerAssignmentsResponse } from "./learner-contracts";

describe("toMobileLearnerAssignmentsResponse", () => {
  it("returns stable learner DTOs without exposing persistence objects", () => {
    const response = toMobileLearnerAssignmentsResponse("org-1", [
      {
        id: "assignment-1",
        status: "IN_PROGRESS",
        startDate: new Date("2026-09-01T00:00:00.000Z"),
        dueDate: null,
        progress: { progressPercent: 45 },
        certificate: null,
        course: {
          id: "course-1",
          title: "Secure onboarding",
          slug: "secure-onboarding",
          description: "Learn the essentials.",
          type: "NATIVE_VIDEO",
          expectedDurationMinutes: 30,
          credentialProvider: null,
        },
      },
    ]);

    expect(response).toEqual({
      organizationId: "org-1",
      assignments: [
        {
          id: "assignment-1",
          status: "IN_PROGRESS",
          startDate: "2026-09-01T00:00:00.000Z",
          dueDate: null,
          progressPercent: 45,
          certificateIssued: false,
          course: {
            id: "course-1",
            title: "Secure onboarding",
            slug: "secure-onboarding",
            description: "Learn the essentials.",
            type: "NATIVE_VIDEO",
            durationMinutes: 30,
            credentialProvider: null,
          },
        },
      ],
    });
  });

  it("uses zero progress when no progress row exists", () => {
    const [assignment] = toMobileLearnerAssignmentsResponse("org-1", [
      {
        id: "assignment-1",
        status: "ASSIGNED",
        startDate: null,
        dueDate: null,
        progress: null,
        certificate: { id: "certificate-1" },
        course: {
          id: "course-1",
          title: "Course",
          slug: "course",
          description: "",
          type: "SCORM_1_2",
          expectedDurationMinutes: 10,
          credentialProvider: "CREDLY",
        },
      },
    ]).assignments;

    expect(assignment.progressPercent).toBe(0);
    expect(assignment.certificateIssued).toBe(true);
  });
});