import { describe, expect, it, vi } from "vitest";

import { createPrismaKnowledgeCheckRepository } from "./prisma-repository";

const validDraft = {
  organizationId: "org_1",
  courseId: "course_1",
  lessonId: "lesson_1",
  prompt: "Which response is best?",
  questionType: "SINGLE_CHOICE" as const,
  required: true,
  active: true,
  explanation: "Use neutral language.",
  answers: [
    { text: "What happened?", correct: true, feedback: "Correct.", sortOrder: 0 },
    { text: "Why did you fail?", correct: false, feedback: "Too accusatory.", sortOrder: 1 },
  ],
};

describe("createPrismaKnowledgeCheckRepository", () => {
  it("filters course checks by organization and course slug", async () => {
    const client = {
      courseKnowledgeCheckQuestion: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    };
    const repository = createPrismaKnowledgeCheckRepository(client as never);

    await repository.listChecksForCourse({
      organizationId: "org_1",
      courseSlug: "manager-basics",
    });

    expect(client.courseKnowledgeCheckQuestion.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organizationId: "org_1",
          course: { slug: "manager-basics" },
        },
      }),
    );
  });

  it("loads assignments for learner submission by organization and assignment id", async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    const repository = createPrismaKnowledgeCheckRepository({
      courseAssignment: { findFirst },
    } as never);

    await repository.findAssignmentForSubmission({
      organizationId: "org_1",
      assignmentId: "assignment_1",
    });

    expect(findFirst).toHaveBeenCalledWith({
      where: {
        id: "assignment_1",
        organizationId: "org_1",
      },
      select: expect.objectContaining({
        id: true,
        organizationId: true,
        membershipId: true,
        courseId: true,
        membership: {
          select: {
            id: true,
            userId: true,
            organizationId: true,
            managerMembershipId: true,
          },
        },
      }),
    });
  });

  it("filters submission checks by organization, course, id, and active state", async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    const repository = createPrismaKnowledgeCheckRepository({
      courseKnowledgeCheckQuestion: { findFirst },
    } as never);

    await repository.findCheckForSubmission({
      organizationId: "org_1",
      courseId: "course_1",
      checkId: "check_1",
    });

    expect(findFirst).toHaveBeenCalledWith({
      where: {
        id: "check_1",
        organizationId: "org_1",
        courseId: "course_1",
        active: true,
      },
      select: expect.objectContaining({
        id: true,
        questionType: true,
        explanation: true,
      }),
    });
  });

  it("retries createAttempt once after an attempt-number unique conflict", async () => {
    const uniqueConflict = Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
    const secondCreate = vi.fn().mockResolvedValue({ id: "attempt_2" });
    const transaction = vi
      .fn()
      .mockRejectedValueOnce(uniqueConflict)
      .mockImplementationOnce(async (operation) =>
        operation({
          knowledgeCheckAttempt: {
            findFirst: vi.fn().mockResolvedValue({ attemptNumber: 1 }),
            create: secondCreate,
          },
        }),
      );
    const repository = createPrismaKnowledgeCheckRepository({
      $transaction: transaction,
      courseAssignment: {},
      courseKnowledgeCheckQuestion: {},
      courseKnowledgeCheckAnswer: {},
      knowledgeCheckAttempt: {},
    } as never);

    await expect(
      repository.createAttempt({
        organizationId: "org_1",
        assignmentId: "assignment_1",
        questionId: "check_1",
        selectedAnswerIds: ["answer_1"],
        score: { correct: true, scorePercent: 100, selectedAnswerFeedback: [], explanation: null },
        submittedAt: new Date("2026-06-13T03:00:00.000Z"),
      }),
    ).resolves.toEqual({ attemptNumber: 2 });
    expect(transaction).toHaveBeenCalledTimes(2);
    expect(secondCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ attemptNumber: 2 }),
      }),
    );
  });

  it("creates checks and nested answers with organization scope", async () => {
    const create = vi.fn().mockResolvedValue({ id: "check_1" });
    const repository = createPrismaKnowledgeCheckRepository({
      courseKnowledgeCheckQuestion: { create },
    } as never);

    await repository.createCheck(validDraft);

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          organizationId: "org_1",
          courseId: "course_1",
          answers: {
            create: [
              expect.objectContaining({ organizationId: "org_1", text: "What happened?" }),
              expect.objectContaining({ organizationId: "org_1", text: "Why did you fail?" }),
            ],
          },
        }),
      }),
    );
  });

  it("replaces answers by organization and question instead of unscoped question id", async () => {
    const deleteMany = vi.fn().mockResolvedValue({ count: 2 });
    const update = vi.fn().mockResolvedValue({ id: "check_1" });
    const transaction = vi.fn(async (operation) =>
      operation({
        courseKnowledgeCheckQuestion: {
          findFirst: vi.fn().mockResolvedValue({ id: "check_1" }),
          update,
        },
        courseKnowledgeCheckAnswer: { deleteMany },
      }),
    );
    const repository = createPrismaKnowledgeCheckRepository({
      $transaction: transaction,
    } as never);

    await repository.replaceCheck({ id: "check_1", draft: validDraft });

    expect(deleteMany).toHaveBeenCalledWith({
      where: {
        organizationId: "org_1",
        questionId: "check_1",
      },
    });
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organizationId_id: {
            organizationId: "org_1",
            id: "check_1",
          },
        },
      }),
    );
  });

  it("reorders checks with organization-scoped compound keys", async () => {
    const update = vi.fn().mockResolvedValue({});
    const transaction = vi.fn().mockResolvedValue([]);
    const repository = createPrismaKnowledgeCheckRepository({
      $transaction: transaction,
      courseKnowledgeCheckQuestion: { update },
    } as never);

    await repository.reorderChecks({
      organizationId: "org_1",
      orderedIds: [
        { id: "check_2", sortOrder: 0 },
        { id: "check_1", sortOrder: 1 },
      ],
    });

    expect(update).toHaveBeenCalledWith({
      where: { organizationId_id: { organizationId: "org_1", id: "check_2" } },
      data: { sortOrder: 0 },
    });
    expect(update).toHaveBeenCalledWith({
      where: { organizationId_id: { organizationId: "org_1", id: "check_1" } },
      data: { sortOrder: 1 },
    });
    expect(transaction).toHaveBeenCalledTimes(1);
  });

  it("validates tenant-scoped answer structure before activating", async () => {
    const update = vi.fn().mockResolvedValue({});
    const findFirst = vi.fn().mockResolvedValue({
      organizationId: "org_1",
      courseId: "course_1",
      lessonId: null,
      prompt: "Question",
      questionType: "SINGLE_CHOICE",
      required: true,
      active: false,
      explanation: null,
      answers: [
        { text: "A", correct: false, feedback: null, sortOrder: 0 },
        { text: "B", correct: false, feedback: null, sortOrder: 1 },
      ],
    });
    const repository = createPrismaKnowledgeCheckRepository({
      courseKnowledgeCheckQuestion: { findFirst, update },
    } as never);

    await expect(
      repository.setCheckActive({
        organizationId: "org_1",
        id: "check_1",
        active: true,
      }),
    ).rejects.toThrow("Active knowledge checks require at least one correct answer");
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "check_1",
          organizationId: "org_1",
        },
      }),
    );
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          answers: expect.objectContaining({
            where: { organizationId: "org_1" },
          }),
        }),
      }),
    );
    expect(update).not.toHaveBeenCalled();
  });

  it("deactivates checks with organization-scoped compound keys", async () => {
    const update = vi.fn().mockResolvedValue({});
    const repository = createPrismaKnowledgeCheckRepository({
      courseKnowledgeCheckQuestion: { update },
    } as never);

    await repository.setCheckActive({
      organizationId: "org_1",
      id: "check_1",
      active: false,
    });

    expect(update).toHaveBeenCalledWith({
      where: { organizationId_id: { organizationId: "org_1", id: "check_1" } },
      data: { active: false },
    });
  });

  it("filters difficulty report rows by organization and course id", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const repository = createPrismaKnowledgeCheckRepository({
      knowledgeCheckAttempt: { findMany },
    } as never);

    await repository.listDifficultyRows({
      organizationId: "org_1",
      courseId: "course_1",
    });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organizationId: "org_1",
          question: {
            courseId: "course_1",
          },
        },
      }),
    );
  });
});
