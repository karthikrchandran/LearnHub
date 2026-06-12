import { describe, expect, it, vi } from "vitest";

import {
  createAssignCourseAction,
  createSelfEnrollAction,
  type AssignCourseActionDependencies,
  type SelfEnrollActionDependencies,
} from "./server-actions";
import type { AssignmentRepository } from "./assignment-service";
import type { MembershipAuthContext } from "../auth/permissions";

function formData(entries: Record<string, string>): FormData {
  const data = new FormData();

  for (const [key, value] of Object.entries(entries)) {
    data.append(key, value);
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
      status: "PUBLISHED",
      estimatedCompletionBusinessDays: 3,
    })),
    findMembership: vi.fn(async () => ({
      id: "learner-membership",
      userId: "learner-user",
      organizationId: "org_1",
      managerMembershipId: null,
      status: "ACTIVE",
      roles: ["LEARNER"],
    })),
    findOrganization: vi.fn(async () => ({
      id: "org_1",
      enrollmentPolicy: "ASSIGNMENT_AND_SELF_ENROLLMENT",
    })),
    assignmentExists: vi.fn(async () => false),
    createAssignment: vi.fn(async () => ({ id: "assignment_1" })),
    recordAuditLog: vi.fn(async () => {}),
  };
}

function createAssignDependencies(): AssignCourseActionDependencies & { repository: AssignmentRepository } {
  return {
    repository: createRepository(),
    getActorAndOrganization: vi.fn(async (slug) => ({
      actor,
      organizationId: slug === "acme" ? "org_1" : "org_other",
    })),
  };
}

function createSelfEnrollDependencies(): SelfEnrollActionDependencies & { repository: AssignmentRepository } {
  return {
    repository: createRepository(),
    getActorAndOrganization: vi.fn(async () => ({
      actor: {
        ...actor,
        userId: "learner-user",
        memberships: [
          {
            id: "learner-membership",
            organizationId: "org_1",
            roles: ["LEARNER"],
            status: "ACTIVE",
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
