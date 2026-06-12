import { describe, expect, it, vi } from "vitest";

import { createPrismaCourseFeedbackRepository } from "./prisma-repository";

describe("createPrismaCourseFeedbackRepository", () => {
  it("loads assignment ownership through tenant scope", async () => {
    const client = {
      courseAssignment: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
      courseFeedback: {
        upsert: vi.fn(),
        findMany: vi.fn(),
      },
    };
    const repository = createPrismaCourseFeedbackRepository(client as never);

    await repository.findAssignmentForFeedback({
      organizationId: "org_1",
      assignmentId: "assignment_1",
    });

    expect(client.courseAssignment.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "assignment_1",
          organizationId: "org_1",
        },
        select: expect.objectContaining({
          course: { select: { type: true } },
          membership: {
            select: {
              id: true,
              userId: true,
              organizationId: true,
              managerMembershipId: true,
            },
          },
        }),
      }),
    );
  });

  it("upserts feedback by organization and assignment", async () => {
    const submittedAt = new Date("2026-06-13T04:00:00.000Z");
    const client = {
      courseAssignment: { findFirst: vi.fn() },
      courseFeedback: {
        upsert: vi.fn().mockResolvedValue({ id: "feedback_1" }),
        findMany: vi.fn(),
      },
    };
    const repository = createPrismaCourseFeedbackRepository(client as never);

    await repository.upsertCourseFeedback({
      organizationId: "org_1",
      courseId: "course_1",
      assignmentId: "assignment_1",
      membershipId: "membership_1",
      stars: 5,
      text: "Useful course.",
      submittedAt,
    });

    expect(client.courseFeedback.upsert).toHaveBeenCalledWith({
      where: {
        organizationId_assignmentId: {
          organizationId: "org_1",
          assignmentId: "assignment_1",
        },
      },
      update: {
        stars: 5,
        text: "Useful course.",
        submittedAt,
      },
      create: {
        organizationId: "org_1",
        courseId: "course_1",
        assignmentId: "assignment_1",
        membershipId: "membership_1",
        stars: 5,
        text: "Useful course.",
        submittedAt,
      },
      select: { id: true },
    });
  });

  it("filters satisfaction report rows by organization", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const repository = createPrismaCourseFeedbackRepository({
      courseAssignment: {},
      courseFeedback: { findMany },
    } as never);

    await repository.listSatisfactionRows({ organizationId: "org_1" });

    expect(findMany).toHaveBeenCalledWith({
      where: { organizationId: "org_1" },
      select: {
        organizationId: true,
        courseId: true,
        assignmentId: true,
        membershipId: true,
        stars: true,
        text: true,
      },
    });
  });
});
