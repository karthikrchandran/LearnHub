import { describe, expect, it } from "vitest";

import { assignCourse, selfEnrollInCourse, type AssignmentRepository } from "./assignment-service";
import type { MembershipAuthContext } from "../auth/permissions";

const startDate = new Date("2026-06-12T12:00:00.000Z");

const adminActor: MembershipAuthContext = {
  userId: "admin-user",
  isPlatformOwner: false,
  memberships: [
    {
      id: "admin-membership",
      organizationId: "org_1",
      roles: ["ADMIN"],
      status: "ACTIVE",
      managerMembershipId: null,
    },
  ],
};

const managerActor: MembershipAuthContext = {
  userId: "manager-user",
  isPlatformOwner: false,
  memberships: [
    {
      id: "manager-membership",
      organizationId: "org_1",
      roles: ["MANAGER"],
      status: "ACTIVE",
      managerMembershipId: null,
    },
  ],
};

const learnerActor: MembershipAuthContext = {
  userId: "learner-user",
  isPlatformOwner: false,
  memberships: [
    {
      id: "learner-membership",
      organizationId: "org_1",
      roles: ["LEARNER"],
      status: "ACTIVE",
      managerMembershipId: "manager-membership",
    },
  ],
};

function createRepository(overrides: Partial<FakeAssignmentRepository> = {}): FakeAssignmentRepository {
  return Object.assign(new FakeAssignmentRepository(), overrides);
}

class FakeAssignmentRepository implements AssignmentRepository {
  course = {
    id: "course_1",
    organizationId: "org_1",
    status: "PUBLISHED" as const,
    estimatedCompletionBusinessDays: 3,
  };
  learner = {
    id: "learner-membership",
    userId: "learner-user",
    organizationId: "org_1",
    managerMembershipId: "manager-membership",
    status: "ACTIVE" as const,
    roles: ["LEARNER" as const],
  };
  organization = {
    id: "org_1",
    enrollmentPolicy: "ASSIGNMENT_AND_SELF_ENROLLMENT" as const,
  };
  existingAssignment = false;
  transactions = 0;
  createdAssignments: Array<Parameters<AssignmentRepository["createAssignment"]>[0]> = [];
  auditLogs: Array<Parameters<AssignmentRepository["recordAuditLog"]>[0]> = [];

  async runInTransaction<T>(operation: () => Promise<T>): Promise<T> {
    this.transactions += 1;

    return operation();
  }

  async findCourse(): Promise<FakeAssignmentRepository["course"] | null> {
    return this.course;
  }

  async findMembership(): Promise<FakeAssignmentRepository["learner"] | null> {
    return this.learner;
  }

  async findOrganization(): Promise<FakeAssignmentRepository["organization"] | null> {
    return this.organization;
  }

  async assignmentExists(): Promise<boolean> {
    return this.existingAssignment;
  }

  async createAssignment(data: Parameters<AssignmentRepository["createAssignment"]>[0]): Promise<{ id: string }> {
    this.createdAssignments.push(data);

    return { id: "assignment_1" };
  }

  async recordAuditLog(data: Parameters<AssignmentRepository["recordAuditLog"]>[0]): Promise<void> {
    this.auditLogs.push(data);
  }
}

describe("assignment service", () => {
  it("lets an admin assign a published course to an active learner in the organization", async () => {
    const repository = createRepository();

    const assignment = await assignCourse(
      {
        organizationId: "org_1",
        courseId: "course_1",
        learnerMembershipId: "learner-membership",
        actor: adminActor,
        startDate,
      },
      repository,
    );

    expect(assignment).toEqual({ id: "assignment_1" });
    expect(repository.createdAssignments).toEqual([
      {
        organizationId: "org_1",
        courseId: "course_1",
        membershipId: "learner-membership",
        assignedByMembershipId: "admin-membership",
        startDate,
        dueDate: new Date("2026-06-17T12:00:00.000Z"),
        status: "ASSIGNED",
      },
    ]);
    expect(repository.auditLogs).toMatchObject([{ action: "assignment.created", targetId: "assignment_1" }]);
    expect(repository.transactions).toBe(1);
  });

  it("lets a manager assign a published course only to an active direct report", async () => {
    const repository = createRepository();

    await expect(
      assignCourse(
        {
          organizationId: "org_1",
          courseId: "course_1",
          learnerMembershipId: "learner-membership",
          actor: managerActor,
          startDate,
        },
        repository,
      ),
    ).resolves.toEqual({ id: "assignment_1" });

    await expect(
      assignCourse(
        {
          organizationId: "org_1",
          courseId: "course_1",
          learnerMembershipId: "learner-membership",
          actor: managerActor,
          startDate,
        },
        createRepository({
          learner: {
            ...repository.learner,
            managerMembershipId: "other-manager-membership",
          },
        }),
      ),
    ).rejects.toThrow("Not allowed to assign this course");
  });

  it("blocks draft, deprecated, and retired courses for new assignment", async () => {
    for (const status of ["DRAFT", "DEPRECATED", "RETIRED"] as const) {
      await expect(
        assignCourse(
          {
            organizationId: "org_1",
            courseId: "course_1",
            learnerMembershipId: "learner-membership",
            actor: adminActor,
            startDate,
          },
          createRepository({ course: { ...new FakeAssignmentRepository().course, status } }),
        ),
      ).rejects.toThrow("Only published courses can be assigned");
    }
  });

  it("rejects duplicate assignments before writing", async () => {
    const repository = createRepository({ existingAssignment: true });

    await expect(
      assignCourse(
        {
          organizationId: "org_1",
          courseId: "course_1",
          learnerMembershipId: "learner-membership",
          actor: adminActor,
          startDate,
        },
        repository,
      ),
    ).rejects.toThrow("Learner already has this course assigned");

    expect(repository.createdAssignments).toHaveLength(0);
  });

  it("validates learner membership before assignment", async () => {
    await expect(
      assignCourse(
        {
          organizationId: "org_1",
          courseId: "course_1",
          learnerMembershipId: "learner-membership",
          actor: adminActor,
          startDate,
        },
        createRepository({ learner: { ...new FakeAssignmentRepository().learner, status: "INACTIVE" } }),
      ),
    ).rejects.toThrow("Learner membership must be active");

    await expect(
      assignCourse(
        {
          organizationId: "org_1",
          courseId: "course_1",
          learnerMembershipId: "learner-membership",
          actor: adminActor,
          startDate,
        },
        createRepository({ learner: { ...new FakeAssignmentRepository().learner, roles: ["MANAGER"] } }),
      ),
    ).rejects.toThrow("Course can only be assigned to learners");
  });

  it("requires self-enrollment policy for learner self-enrollment", async () => {
    const repository = createRepository();

    await expect(
      selfEnrollInCourse(
        {
          organizationId: "org_1",
          courseId: "course_1",
          learnerMembershipId: "learner-membership",
          actor: learnerActor,
          startDate,
        },
        repository,
      ),
    ).resolves.toEqual({ id: "assignment_1" });
    expect(repository.createdAssignments[0]?.assignedByMembershipId).toBeNull();
    expect(repository.auditLogs).toMatchObject([{ action: "assignment.self_enrolled", targetId: "assignment_1" }]);

    await expect(
      selfEnrollInCourse(
        {
          organizationId: "org_1",
          courseId: "course_1",
          learnerMembershipId: "learner-membership",
          actor: learnerActor,
          startDate,
        },
        createRepository({ organization: { id: "org_1", enrollmentPolicy: "ASSIGNMENT_ONLY" } }),
      ),
    ).rejects.toThrow("Self-enrollment is not enabled for this organization");
  });
});
