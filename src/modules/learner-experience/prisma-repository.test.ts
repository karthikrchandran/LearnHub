import { describe, expect, it, vi } from "vitest";

import { createPrismaLearnerExperienceRepository } from "./prisma-repository";

describe("Prisma learner experience repository", () => {
  it("loads assigned learner courses with progress, lessons, checks, and certificate state", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const repository = createPrismaLearnerExperienceRepository({
      courseAssignment: { findMany, findFirst: vi.fn() },
      course: { findMany: vi.fn(), findFirst: vi.fn() },
      organization: { findUnique: vi.fn() },
      organizationMembership: { findFirst: vi.fn() },
      certificate: { findMany: vi.fn() },
      courseKnowledgeCheckQuestion: { findMany: vi.fn() },
      knowledgeCheckAttempt: { findMany: vi.fn() },
    });

    await repository.listLearnerAssignments({ organizationId: "org_1", membershipId: "mem_1" });

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { organizationId: "org_1", membershipId: "mem_1" },
      select: expect.objectContaining({
        id: true,
        status: true,
        dueDate: true,
        progress: expect.any(Object),
        certificate: expect.any(Object),
        course: expect.objectContaining({
          select: expect.objectContaining({
            title: true,
            slug: true,
            description: true,
            expectedDurationMinutes: true,
            videoLessons: expect.any(Object),
            knowledgeCheckQuestions: expect.any(Object),
          }),
        }),
      }),
    }));
  });

  it("loads available published courses excluding assigned course ids", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const repository = createPrismaLearnerExperienceRepository({
      courseAssignment: { findMany: vi.fn(), findFirst: vi.fn() },
      course: { findMany, findFirst: vi.fn() },
      organization: { findUnique: vi.fn() },
      organizationMembership: { findFirst: vi.fn() },
      certificate: { findMany: vi.fn() },
      courseKnowledgeCheckQuestion: { findMany: vi.fn() },
      knowledgeCheckAttempt: { findMany: vi.fn() },
    });

    await repository.listAvailableCourses({
      organizationId: "org_1",
      excludedCourseIds: ["course_1"],
    });

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        organizationId: "org_1",
        status: "PUBLISHED",
        id: { notIn: ["course_1"] },
      },
    }));
  });
});
