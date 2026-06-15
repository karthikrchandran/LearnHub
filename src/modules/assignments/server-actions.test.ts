import { describe, expect, it, vi } from "vitest";

import {
  createAssignCourseAction,
  createBulkAssignCourseAction,
  createSelfEnrollAction,
  type AssignCourseActionDependencies,
  type SelfEnrollActionDependencies,
} from "./server-actions";
import type { AssignmentRepository } from "./assignment-service";
import type { MembershipAuthContext } from "../auth/permissions";

function formData(entries: Record<string, string | string[]>): FormData {
  const data = new FormData();

  for (const [key, value] of Object.entries(entries)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        data.append(key, item);
      }
    } else {
      data.append(key, value);
    }
  }

  return data;
}

const actor: MembershipAuthContext = {
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

function createRepository(): AssignmentRepository {
  return {
    runInTransaction: vi.fn(async (operation) => operation()),
    findCourse: vi.fn(async () => ({
      id: "course_1",
      organizationId: "org_1",
      title: "Safety Basics",
      status: "PUBLISHED" as const,
      estimatedCompletionBusinessDays: 3,
    })),
    findMembership: vi.fn(async () => ({
      id: "learner-membership",
      userId: "learner-user",
      organizationId: "org_1",
      managerMembershipId: null,
      learnerEmail: "learner@example.com",
      learnerName: "Ada Lovelace",
      managerEmail: null,
      managerName: null,
      status: "ACTIVE" as const,
      roles: ["LEARNER" as const],
    })),
    findOrganization: vi.fn(async () => ({
      id: "org_1",
      enrollmentPolicy: "ASSIGNMENT_AND_SELF_ENROLLMENT" as const,
    })),
    assignmentExists: vi.fn(async () => false),
    createAssignment: vi.fn(async () => ({ id: "assignment_1" })),
    recordAuditLog: vi.fn(async () => {}),
  };
}

function createAssignDependencies(): AssignCourseActionDependencies & { repository: AssignmentRepository } {
  return {
    repository: createRepository(),
    notificationScheduler: {
      scheduleAssignmentNotifications: vi.fn(),
    },
    buildAssignmentUrl: vi.fn((slug) => `https://learnhub.test/org/${slug}/learn`),
    now: vi.fn(() => new Date("2026-06-12T13:00:00.000Z")),
    getActorAndOrganization: vi.fn(async (slug) => ({
      actor,
      organizationId: slug === "acme" ? "org_1" : "org_other",
    })),
  };
}

function createSelfEnrollDependencies(): SelfEnrollActionDependencies & { repository: AssignmentRepository } {
  return {
    repository: createRepository(),
    notificationScheduler: {
      scheduleAssignmentNotifications: vi.fn(),
    },
    buildAssignmentUrl: vi.fn((slug) => `https://learnhub.test/org/${slug}/learn`),
    now: vi.fn(() => new Date("2026-06-12T13:00:00.000Z")),
    getActorAndOrganization: vi.fn(async () => ({
      actor: {
        ...actor,
        userId: "learner-user",
        memberships: [
          {
            id: "learner-membership",
            organizationId: "org_1",
            roles: ["LEARNER" as const],
            status: "ACTIVE" as const,
            managerMembershipId: null,
          },
        ],
      },
      organizationId: "org_1",
    })),
  };
}

describe("assignment server actions", () => {
  it("parses admin and manager assignment form fields", async () => {
    const dependencies = createAssignDependencies();
    const action = createAssignCourseAction(dependencies);

    await expect(
      action(
        "acme",
        formData({
          courseId: "course_1",
          learnerMembershipId: "learner-membership",
          startDate: "2026-06-12",
        }),
      ),
    ).resolves.toEqual({ status: "success", message: "Course assigned." });

    expect(dependencies.getActorAndOrganization).toHaveBeenCalledWith("acme");
    expect(dependencies.repository.createAssignment).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org_1",
        courseId: "course_1",
        membershipId: "learner-membership",
        status: "ASSIGNED",
      }),
    );
    expect(dependencies.notificationScheduler!.scheduleAssignmentNotifications).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org_1",
        assignmentId: "assignment_1",
        assignmentUrl: "https://learnhub.test/org/acme/learn",
        now: new Date("2026-06-12T13:00:00.000Z"),
      }),
    );
  });

  it("parses learner self-enrollment form fields", async () => {
    const dependencies = createSelfEnrollDependencies();
    const action = createSelfEnrollAction(dependencies);

    await expect(
      action(
        "acme",
        formData({
          courseId: "course_1",
          learnerMembershipId: "learner-membership",
          startDate: "2026-06-12",
        }),
      ),
    ).resolves.toEqual({ status: "success", message: "Course added." });

    expect(dependencies.repository.createAssignment).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org_1",
        courseId: "course_1",
        membershipId: "learner-membership",
        assignedByMembershipId: null,
      }),
    );
  });

  it("assigns one course to multiple learners from a bulk form", async () => {
    const dependencies = createAssignDependencies();
    vi.mocked(dependencies.repository.findMembership).mockImplementation(async ({ membershipId }) => ({
      id: membershipId,
      userId: `user:${membershipId}`,
      organizationId: "org_1",
      managerMembershipId: null,
      learnerEmail: `${membershipId}@example.com`,
      learnerName: membershipId,
      managerEmail: null,
      managerName: null,
      status: "ACTIVE" as const,
      roles: ["LEARNER" as const],
    }));
    const action = createBulkAssignCourseAction(dependencies);

    await expect(
      action(
        "acme",
        formData({
          courseId: "course_1",
          learnerMembershipIds: ["learner-one", "learner-two"],
          startDate: "2026-06-12",
        }),
      ),
    ).resolves.toEqual({ status: "success", message: "Assigned course to 2 learners." });

    expect(dependencies.repository.createAssignment).toHaveBeenCalledTimes(2);
    expect(dependencies.repository.createAssignment).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        courseId: "course_1",
        membershipId: "learner-one",
      }),
    );
    expect(dependencies.repository.createAssignment).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        courseId: "course_1",
        membershipId: "learner-two",
      }),
    );
  });

  it("returns invalid start date and domain errors without throwing", async () => {
    const dependencies = createAssignDependencies();
    const action = createAssignCourseAction(dependencies);

    await expect(
      action("acme", formData({ courseId: "course_1", learnerMembershipId: "learner-membership", startDate: "" })),
    ).resolves.toEqual({ status: "error", message: "Start date is required" });

    vi.mocked(dependencies.repository.assignmentExists).mockResolvedValueOnce(true);

    await expect(
      action(
        "acme",
        formData({
          courseId: "course_1",
          learnerMembershipId: "learner-membership",
          startDate: "2026-06-12",
        }),
      ),
    ).resolves.toEqual({ status: "error", message: "Learner already has this course assigned" });
  });
});
