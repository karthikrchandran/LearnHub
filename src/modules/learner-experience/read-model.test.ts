import { describe, expect, it } from "vitest";

import { buildCourseAction, buildCourseMeta, groupLearnerCourses } from "./read-model";

describe("learner experience read models", () => {
  it("groups assigned, in-progress, completed, and available courses", () => {
    const grouped = groupLearnerCourses([
      { id: "a1", assignmentId: "as1", status: "ASSIGNED", progressPercent: 0, certificateIssued: false },
      { id: "a2", assignmentId: "as2", status: "IN_PROGRESS", progressPercent: 58, certificateIssued: false },
      { id: "a3", assignmentId: "as3", status: "COMPLETED", progressPercent: 100, certificateIssued: true },
      { id: "a4", assignmentId: null, status: "AVAILABLE", progressPercent: 0, certificateIssued: false },
    ]);

    expect(grouped.assigned.map((course) => course.id)).toEqual(["a1"]);
    expect(grouped.inProgress.map((course) => course.id)).toEqual(["a2"]);
    expect(grouped.completed.map((course) => course.id)).toEqual(["a3"]);
    expect(grouped.available.map((course) => course.id)).toEqual(["a4"]);
  });

  it("builds learner course action labels", () => {
    expect(buildCourseAction({ slug: "acme", courseSlug: "security", assignmentId: "as1", status: "IN_PROGRESS" })).toEqual({
      label: "Resume",
      href: "/org/acme/learn/courses/security",
      variant: "blue",
    });
    expect(buildCourseAction({ slug: "acme", courseSlug: "privacy", assignmentId: "as2", status: "COMPLETED" })).toEqual({
      label: "View certificate",
      href: "/org/acme/certificates",
      variant: "light",
    });
    const availableAction = buildCourseAction({ slug: "acme", courseSlug: "coaching", assignmentId: null, status: "AVAILABLE" });

    expect(availableAction).toEqual({
      label: "Enroll",
      href: "/org/acme/learn/catalog",
      variant: "light",
    });
    expect(availableAction.href).not.toContain("/learn/courses/");
  });

  it("builds compact course metadata", () => {
    expect(buildCourseMeta({ durationMinutes: 45, lessonCount: 5, certificateEligible: true })).toEqual([
      "45 min",
      "5 lessons",
      "Certificate",
    ]);
  });
});
