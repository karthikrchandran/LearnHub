import { describe, expect, it } from "vitest";

import {
  buildCompletedKnowledgeCheckAttempts,
  buildCourseAction,
  buildCourseMeta,
  buildLockedCertificates,
  buildPendingRequiredChecks,
  groupLearnerCourses,
} from "./read-model";

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

  it("builds pending checks from required questions and repeated attempts", () => {
    const assignments = [
      assessmentAssignment({
        attempts: [
          attempt({
            id: "retry-old",
            questionId: "retry-required",
            attemptNumber: 1,
            correct: false,
            scorePercent: 0,
            submittedAt: new Date("2026-06-13T10:00:00.000Z"),
          }),
          attempt({
            id: "retry-latest",
            questionId: "retry-required",
            attemptNumber: 2,
            correct: false,
            scorePercent: 25,
            submittedAt: new Date("2026-06-13T10:00:00.000Z"),
          }),
          attempt({
            id: "done-correct",
            questionId: "done-required",
            attemptNumber: 1,
            correct: true,
            submittedAt: new Date("2026-06-13T09:00:00.000Z"),
          }),
          attempt({
            id: "done-later-review",
            questionId: "done-required",
            attemptNumber: 2,
            correct: false,
            submittedAt: new Date("2026-06-13T11:00:00.000Z"),
          }),
          attempt({
            id: "optional-review",
            questionId: "optional-check",
            attemptNumber: 1,
            correct: false,
            submittedAt: new Date("2026-06-13T12:00:00.000Z"),
          }),
        ],
      }),
    ];

    const pending = buildPendingRequiredChecks(assignments);

    expect(pending.map((item) => item.check.id)).toEqual(["retry-required"]);
    expect(pending[0]?.latestAttempt?.id).toBe("retry-latest");
    expect(pending[0]?.latestAttempt?.attemptNumber).toBe(2);
  });

  it("sorts completed attempts by submitted date and attempt number", () => {
    const assignments = [
      assessmentAssignment({
        attempts: [
          attempt({
            id: "older-attempt",
            questionId: "retry-required",
            attemptNumber: 1,
            submittedAt: new Date("2026-06-13T10:00:00.000Z"),
          }),
          attempt({
            id: "same-time-higher-attempt",
            questionId: "retry-required",
            attemptNumber: 3,
            submittedAt: new Date("2026-06-13T10:00:00.000Z"),
          }),
          attempt({
            id: "newest-attempt",
            questionId: "done-required",
            attemptNumber: 2,
            submittedAt: new Date("2026-06-13T11:00:00.000Z"),
          }),
          attempt({
            id: "unknown-question",
            questionId: "missing",
            attemptNumber: 1,
            submittedAt: new Date("2026-06-13T12:00:00.000Z"),
          }),
        ],
      }),
    ];

    const completed = buildCompletedKnowledgeCheckAttempts(assignments);

    expect(completed.map((item) => item.attempt.id)).toEqual([
      "newest-attempt",
      "same-time-higher-attempt",
      "older-attempt",
    ]);
  });

  it("builds locked certificate cards without duplicate assigned, available, or earned courses", () => {
    const locked = buildLockedCertificates({
      slug: "acme",
      earnedCourseIds: new Set(["earned-course"]),
      assignments: [
        certificateAssignment({
          id: "assigned-learnhub",
          courseId: "learnhub-course",
          title: "Assigned LearnHub course",
          credentialProvider: null,
          status: "IN_PROGRESS",
        }),
        certificateAssignment({
          id: "assigned-credly",
          courseId: "credly-course",
          title: "Assigned Credly course",
          credentialProvider: "CREDLY",
          status: "ASSIGNED",
        }),
        certificateAssignment({
          id: "assigned-earned",
          courseId: "earned-course",
          title: "Earned course",
          credentialProvider: null,
          status: "COMPLETED",
        }),
      ],
      availableCourses: [
        availableCertificateCourse({
          id: "learnhub-course",
          title: "Duplicate available course",
          credentialProvider: null,
        }),
        availableCertificateCourse({
          id: "available-learnhub",
          title: "Available LearnHub course",
          credentialProvider: null,
        }),
        availableCertificateCourse({
          id: "earned-course",
          title: "Earned available course",
          credentialProvider: null,
        }),
      ],
    });

    expect(locked.map((certificate) => certificate.id)).toEqual([
      "assignment-assigned-learnhub",
      "assignment-assigned-credly",
      "available-available-learnhub",
    ]);
    expect(locked[0]).toMatchObject({
      title: "Assigned LearnHub course",
      actionLabel: "Continue course",
      body: expect.stringContaining("LearnHub certificate"),
    });
    expect(locked[1]?.body).toContain("CREDLY credential");
    expect(locked[2]).toMatchObject({
      title: "Available LearnHub course",
      actionLabel: "View course",
      body: expect.stringContaining("LearnHub certificate eligible when enrolled and completed"),
    });
  });
});

function assessmentAssignment({
  attempts,
}: {
  attempts: Array<ReturnType<typeof attempt>>;
}) {
  return {
    id: "assignment-1",
    course: {
      title: "Security Basics",
      slug: "security-basics",
      knowledgeCheckQuestions: [
        question({ id: "retry-required", prompt: "Retry this required check", required: true }),
        question({ id: "done-required", prompt: "Already done required check", required: true }),
        question({ id: "optional-check", prompt: "Optional check", required: false }),
      ],
    },
    knowledgeCheckAttempts: attempts,
  };
}

function question({ id, prompt, required }: { id: string; prompt: string; required: boolean }) {
  return {
    id,
    lessonId: null,
    prompt,
    required,
    questionType: "SINGLE_CHOICE",
  };
}

function attempt({
  id,
  questionId,
  attemptNumber,
  submittedAt,
  correct = false,
  scorePercent = correct ? 100 : 0,
}: {
  id: string;
  questionId: string;
  attemptNumber: number;
  submittedAt: Date;
  correct?: boolean;
  scorePercent?: number;
}) {
  return {
    id,
    questionId,
    attemptNumber,
    selectedAnswerIds: ["answer-1"],
    correct,
    scorePercent,
    submittedAt,
  };
}

function certificateAssignment({
  id,
  courseId,
  title,
  credentialProvider,
  status,
}: {
  id: string;
  courseId: string;
  title: string;
  credentialProvider: string | null;
  status: string;
}) {
  return {
    id,
    courseId,
    status,
    dueDate: new Date("2026-06-30T00:00:00.000Z"),
    progress: { progressPercent: status === "COMPLETED" ? 100 : 40 },
    course: {
      title,
      slug: title.toLowerCase().replaceAll(" ", "-"),
      type: "NATIVE_VIDEO",
      expectedDurationMinutes: 30,
      credentialProvider,
    },
  };
}

function availableCertificateCourse({
  id,
  title,
  credentialProvider,
}: {
  id: string;
  title: string;
  credentialProvider: string | null;
}) {
  return {
    id,
    title,
    slug: title.toLowerCase().replaceAll(" ", "-"),
    type: "SCORM_1_2",
    expectedDurationMinutes: 45,
    credentialProvider,
  };
}
