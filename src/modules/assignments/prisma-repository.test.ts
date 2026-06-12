import { describe, expect, it, vi } from "vitest";

import { createPrismaAssignmentRepository } from "./prisma-repository";

function createAssignmentClient() {
  return {
    $transaction: vi.fn(async (operation) => operation(createAssignmentClient())),
    course: {
      findFirst: vi.fn(async () => ({
        id: "course_1",
        organizationId: "org_1",
        title: "Safety Basics",
        status: "PUBLISHED",
        estimatedCompletionBusinessDays: 3,
      })),
    },
    organizationMembership: {
      findFirst: vi.fn(async () => ({
        id: "learner-membership",
        userId: "learner-user",
        organizationId: "org_1",
        managerMembershipId: "manager-membership",
        status: "ACTIVE",
        roles: ["LEARNER"],
        user: {
          email: "learner@example.com",
          firstName: "Ada",
          lastName: "Lovelace",
        },
        managerMembership: {
          user: {
            email: "manager@example.com",
            firstName: "Grace",
            lastName: "Hopper",
          },
        },
      })),
    },
    organization: {
      findUnique: vi.fn(async () => ({
        id: "org_1",
        enrollmentPolicy: "ASSIGNMENT_AND_SELF_ENROLLMENT",
      })),
    },
    courseAssignment: {
      findFirst: vi.fn(async () => null),
      create: vi.fn(async () => ({ id: "assignment_1" })),
    },
    auditLog: {
      create: vi.fn(async () => ({})),
    },
  };
}

describe("createPrismaAssignmentRepository", () => {
  it("scopes course, membership, organization, and duplicate lookups by organization", async () => {
    const client = createAssignmentClient();
    const repository = createPrismaAssignmentRepository(
      client as unknown as Parameters<typeof createPrismaAssignmentRepository>[0],
    );

    await repository.findCourse({ organizationId: "org_1", courseId: "course_1" });
    await repository.findMembership({ organizationId: "org_1", membershipId: "learner-membership" });
    await repository.findOrganization({ organizationId: "org_1" });
    await repository.assignmentExists({
      organizationId: "org_1",
      courseId: "course_1",
      membershipId: "learner-membership",
    });

    expect(client.course.findFirst).toHaveBeenCalledWith({
      where: { id: "course_1", organizationId: "org_1" },
      select: {
        id: true,
        organizationId: true,
        title: true,
        status: true,
        estimatedCompletionBusinessDays: true,
      },
    });
    expect(client.organizationMembership.findFirst).toHaveBeenCalledWith({
      where: { id: "learner-membership", organizationId: "org_1" },
      select: {
        id: true,
        userId: true,
        organizationId: true,
        managerMembershipId: true,
        status: true,
        roles: true,
        user: {
          select: {
            email: true,
            firstName: true,
            lastName: true,
          },
        },
        managerMembership: {
          select: {
            user: {
              select: {
                email: true,
                firstName: true,
                lastName: true,
              },
            },
          },
        },
      },
    });
    expect(client.organization.findUnique).toHaveBeenCalledWith({
      where: { id: "org_1" },
      select: { id: true, enrollmentPolicy: true },
    });
    expect(client.courseAssignment.findFirst).toHaveBeenCalledWith({
      where: {
        organizationId: "org_1",
        courseId: "course_1",
        membershipId: "learner-membership",
      },
      select: { id: true },
    });
  });

  it("creates assignments and audit logs with service-provided values", async () => {
    const client = createAssignmentClient();
    const repository = createPrismaAssignmentRepository(
      client as unknown as Parameters<typeof createPrismaAssignmentRepository>[0],
    );
    const startDate = new Date("2026-06-12T12:00:00.000Z");
    const dueDate = new Date("2026-06-17T12:00:00.000Z");

    await repository.createAssignment({
      organizationId: "org_1",
      courseId: "course_1",
      membershipId: "learner-membership",
      assignedByMembershipId: "admin-membership",
      startDate,
      dueDate,
      status: "ASSIGNED",
    });
    await repository.recordAuditLog({
      organizationId: "org_1",
      actorId: "admin-user",
      action: "assignment.created",
      targetType: "course_assignment",
      targetId: "assignment_1",
    });

    expect(client.courseAssignment.create).toHaveBeenCalledWith({
      data: {
        organizationId: "org_1",
        courseId: "course_1",
        membershipId: "learner-membership",
        assignedByMembershipId: "admin-membership",
        startDate,
        dueDate,
        status: "ASSIGNED",
      },
      select: { id: true },
    });
    expect(client.auditLog.create).toHaveBeenCalledWith({
      data: {
        organizationId: "org_1",
        actorId: "admin-user",
        action: "assignment.created",
        targetType: "course_assignment",
        targetId: "assignment_1",
      },
    });
  });

  it("uses the active transaction client for nested writes", async () => {
    const rootClient = createAssignmentClient();
    const transactionClient = createAssignmentClient();
    rootClient.$transaction.mockImplementationOnce(async (operation) => operation(transactionClient));
    const repository = createPrismaAssignmentRepository(
      rootClient as unknown as Parameters<typeof createPrismaAssignmentRepository>[0],
    );

    await repository.runInTransaction(async () => {
      await repository.createAssignment({
        organizationId: "org_1",
        courseId: "course_1",
        membershipId: "learner-membership",
        assignedByMembershipId: null,
        startDate: new Date("2026-06-12T12:00:00.000Z"),
        dueDate: new Date("2026-06-17T12:00:00.000Z"),
        status: "ASSIGNED",
      });
      await repository.recordAuditLog({
        organizationId: "org_1",
        actorId: "learner-user",
        action: "assignment.self_enrolled",
        targetType: "course_assignment",
        targetId: "assignment_1",
      });
    });

    expect(rootClient.courseAssignment.create).not.toHaveBeenCalled();
    expect(rootClient.auditLog.create).not.toHaveBeenCalled();
    expect(transactionClient.courseAssignment.create).toHaveBeenCalledTimes(1);
    expect(transactionClient.auditLog.create).toHaveBeenCalledTimes(1);
  });
});
