import { describe, expect, it, vi } from "vitest";

import {
  assignCourse,
  selfEnrollInCourse,
  type AssignmentCourse,
  type AssignmentMembership,
  type AssignmentRepository,
} from "./assignment-service";
import type { MembershipAuthContext } from "../auth/permissions";

type AssignmentOrganization = NonNullable<Awaited<ReturnType<AssignmentRepository["findOrganization"]>>>;

const startDate = new Date("2026-06-12T12:00:00.000Z");

const publishedCourse: AssignmentCourse = {
  id: "course_1",
  organizationId: "org_1",
  title: "Safety Basics",
  status: "PUBLISHED",
  estimatedCompletionBusinessDays: 3,
};

const activeLearner: AssignmentMembership = {
  id: "learner-membership",
  userId: "learner-user",
  organizationId: "org_1",
  managerMembershipId: "manager-membership",
  learnerEmail: "learner@example.com",
  learnerName: "Ada Lovelace",
  managerEmail: "manager@example.com",
  managerName: "Grace Hopper",
  status: "ACTIVE",
  roles: ["LEARNER"],
};

const selfEnrollmentOrganization: AssignmentOrganization = {
  id: "org_1",
  enrollmentPolicy: "ASSIGNMENT_AND_SELF_ENROLLMENT",
};

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
  course: AssignmentCourse | null = publishedCourse;
  learner: AssignmentMembership | null = activeLearner;
  organization: AssignmentOrganization | null = selfEnrollmentOrganization;
  existingAssignment = false;
  transactions = 0;
  calls: string[] = [];
  createdAssignments: Array<Parameters<AssignmentRepository["createAssignment"]>[0]> = [];
  auditLogs: Array<Parameters<AssignmentRepository["recordAuditLog"]>[0]> = [];

  async runInTransaction<T>(operation: () => Promise<T>): Promise<T> {
    this.transactions += 1;
    this.calls.push("transaction:start");
    const result = await operation();
    this.calls.push("transaction:end");

    return result;
  }

  async findCourse(): Promise<AssignmentCourse | null> {
    this.calls.push("find-course");

    return this.course;
  }

  async findMembership(): Promise<AssignmentMembership | null> {
    this.calls.push("find-membership");

    return this.learner;
  }

  async findOrganization(): Promise<AssignmentOrganization | null> {
    this.calls.push("find-organization");

    return this.organization;
  }

  async assignmentExists(): Promise<boolean> {
    this.calls.push("assignment-exists");

    return this.existingAssignment;
  }

  async createAssignment(data: Parameters<AssignmentRepository["createAssignment"]>[0]): Promise<{ id: string }> {
    this.calls.push("create-assignment");
    this.createdAssignments.push(data);

    return { id: "assignment_1" };
  }

  async recordAuditLog(data: Parameters<AssignmentRepository["recordAuditLog"]>[0]): Promise<void> {
    this.calls.push(`audit:${data.action}`);
    this.auditLogs.push(data);
  }
}

describe("assignment service", () => {
  it("lets an admin assign a published course to an active learner in the organization", async () => {
    const repository = createRepository();
    const notifications = {
      scheduleAssignmentNotifications: vi.fn(),
    };

    const assignment = await assignCourse(
      {
        organizationId: "org_1",
        courseId: "course_1",
        learnerMembershipId: "learner-membership",
        actor: adminActor,
        startDate,
        now: new Date("2026-06-12T13:00:00.000Z"),
        assignmentUrl: "https://learnhub.test/org/acme/learn",
      },
      repository,
      notifications,
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
    expect(notifications.scheduleAssignmentNotifications).toHaveBeenCalledWith({
      organizationId: "org_1",
      assignmentId: "assignment_1",
      learnerEmail: "learner@example.com",
      learnerName: "Ada Lovelace",
      courseTitle: "Safety Basics",
      dueDate: new Date("2026-06-17T12:00:00.000Z"),
      assignmentUrl: "https://learnhub.test/org/acme/learn",
      managerEmail: "manager@example.com",
      managerName: "Grace Hopper",
      now: new Date("2026-06-12T13:00:00.000Z"),
    });
    expect(repository.transactions).toBe(1);
    expect(repository.calls).toEqual([
      "find-course",
      "find-membership",
      "transaction:start",
      "assignment-exists",
      "find-course",
      "create-assignment",
      "audit:assignment.created",
      "transaction:end",
    ]);
  });

  it("does not fail the committed assignment when notification enqueue fails", async () => {
    const repository = createRepository();
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

    try {
      await expect(
        assignCourse(
          {
            organizationId: "org_1",
            courseId: "course_1",
            learnerMembershipId: "learner-membership",
            actor: adminActor,
            startDate,
            now: new Date("2026-06-12T13:00:00.000Z"),
            assignmentUrl: "https://learnhub.test/org/acme/learn",
          },
          repository,
          {
            scheduleAssignmentNotifications: async () => {
              throw new Error("Notification database unavailable");
            },
          },
        ),
      ).resolves.toEqual({ id: "assignment_1" });

      expect(repository.createdAssignments).toHaveLength(1);
      expect(repository.auditLogs).toMatchObject([{ action: "assignment.created", targetId: "assignment_1" }]);
      expect(error).toHaveBeenCalledWith("Notification enqueue failed after assignment commit", {
        organizationId: "org_1",
        assignmentId: "assignment_1",
        error: "Notification database unavailable",
      });
    } finally {
      error.mockRestore();
    }
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
            ...activeLearner,
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
          createRepository({ course: { ...publishedCourse, status } }),
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

  it("throws clear errors for missing course and learner membership", async () => {
    await expect(
      assignCourse(
        {
          organizationId: "org_1",
          courseId: "missing-course",
          learnerMembershipId: "learner-membership",
          actor: adminActor,
          startDate,
        },
        createRepository({ course: null }),
      ),
    ).rejects.toThrow("Course not found");

    await expect(
      assignCourse(
        {
          organizationId: "org_1",
          courseId: "course_1",
          learnerMembershipId: "missing-learner",
          actor: adminActor,
          startDate,
        },
        createRepository({ learner: null }),
      ),
    ).rejects.toThrow("Learner membership not found");
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
        createRepository({ learner: { ...activeLearner, status: "INACTIVE" } }),
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
        createRepository({ learner: { ...activeLearner, roles: ["MANAGER"] } }),
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
    expect(repository.calls).toEqual([
      "find-organization",
      "find-course",
      "find-membership",
      "transaction:start",
      "assignment-exists",
      "find-course",
      "create-assignment",
      "audit:assignment.self_enrolled",
      "transaction:end",
    ]);

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

  it("blocks self-enrollment by a different or inactive learner actor", async () => {
    await expect(
      selfEnrollInCourse(
        {
          organizationId: "org_1",
          courseId: "course_1",
          learnerMembershipId: "learner-membership",
          actor: { ...learnerActor, userId: "other-user" },
          startDate,
        },
        createRepository(),
      ),
    ).rejects.toThrow("Not allowed to self-enroll this learner");

    await expect(
      selfEnrollInCourse(
        {
          organizationId: "org_1",
          courseId: "course_1",
          learnerMembershipId: "learner-membership",
          actor: {
            ...learnerActor,
            memberships: [{ ...learnerActor.memberships[0], status: "INACTIVE" }],
          },
          startDate,
        },
        createRepository(),
      ),
    ).rejects.toThrow("Not allowed to self-enroll this learner");
  });
});
