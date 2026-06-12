import { describe, expect, it, vi } from "vitest";

import { createPrismaRuntimeRouteRepository } from "./prisma-repository";

function createRuntimeRouteClient() {
  return {
    courseAssignment: {
      findFirst: vi.fn(async () => ({
        id: "assignment_1",
        organizationId: "org_1",
        membershipId: "learner-membership",
        membership: {
          id: "learner-membership",
          userId: "learner-user",
          organizationId: "org_1",
          managerMembershipId: "manager-membership",
        },
        course: {
          id: "course_1",
          slug: "course-one",
          type: "NATIVE_VIDEO",
        },
      })),
    },
  };
}

describe("createPrismaRuntimeRouteRepository", () => {
  it("finds assignments by id and organization with learner and course fields", async () => {
    const client = createRuntimeRouteClient();
    const repository = createPrismaRuntimeRouteRepository(
      client as unknown as Parameters<typeof createPrismaRuntimeRouteRepository>[0],
    );

    const assignment = await repository.findAssignment({
      organizationId: "org_1",
      assignmentId: "assignment_1",
    });

    expect(client.courseAssignment.findFirst).toHaveBeenCalledWith({
      where: {
        id: "assignment_1",
        organizationId: "org_1",
      },
      select: {
        id: true,
        organizationId: true,
        membershipId: true,
        membership: {
          select: {
            id: true,
            userId: true,
            organizationId: true,
            managerMembershipId: true,
          },
        },
        course: {
          select: {
            id: true,
            slug: true,
            type: true,
          },
        },
      },
    });
    expect(assignment).toEqual({
      id: "assignment_1",
      organizationId: "org_1",
      membershipId: "learner-membership",
      learner: {
        id: "learner-membership",
        userId: "learner-user",
        organizationId: "org_1",
        managerMembershipId: "manager-membership",
      },
      course: {
        id: "course_1",
        slug: "course-one",
        type: "NATIVE_VIDEO",
      },
    });
  });

  it("returns null when the scoped assignment is not found", async () => {
    const client = createRuntimeRouteClient();
    client.courseAssignment.findFirst.mockResolvedValueOnce(null as never);
    const repository = createPrismaRuntimeRouteRepository(
      client as unknown as Parameters<typeof createPrismaRuntimeRouteRepository>[0],
    );

    await expect(
      repository.findAssignment({
        organizationId: "org_1",
        assignmentId: "missing",
      }),
    ).resolves.toBeNull();
  });
});
