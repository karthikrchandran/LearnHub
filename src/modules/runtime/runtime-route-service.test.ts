import { describe, expect, it } from "vitest";

import type { MembershipAuthContext } from "../auth/permissions";
import {
  requireLearnerLaunchAssignment,
  requireRuntimeProgressAssignment,
  type RuntimeRouteAssignment,
  type RuntimeRouteRepository,
} from "./runtime-route-service";

const learner: MembershipAuthContext = {
  userId: "learner-user",
  isPlatformOwner: false,
  memberships: [
    {
      id: "learner-membership",
      organizationId: "org_1",
      roles: ["LEARNER"],
      status: "ACTIVE",
      managerMembershipId: null,
    },
  ],
};

const manager: MembershipAuthContext = {
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

const admin: MembershipAuthContext = {
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

const platformOwner: MembershipAuthContext = {
  userId: "owner-user",
  isPlatformOwner: true,
  memberships: [],
};

const assignment: RuntimeRouteAssignment = {
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
};

function createRepository(runtimeAssignment: RuntimeRouteAssignment | null): RuntimeRouteRepository {
  return {
    async findAssignment() {
      return runtimeAssignment;
    },
  };
}

describe("runtime route service", () => {
  it("lets learners launch their own active assignment", async () => {
    await expect(
      requireLearnerLaunchAssignment({
        organizationId: "org_1",
        assignmentId: "assignment_1",
        expectedCourseType: "NATIVE_VIDEO",
        actor: learner,
        repository: createRepository(assignment),
      }),
    ).resolves.toEqual(assignment);
  });

  it("blocks learners from launching another learner assignment", async () => {
    await expect(
      requireLearnerLaunchAssignment({
        organizationId: "org_1",
        assignmentId: "assignment_1",
        expectedCourseType: "NATIVE_VIDEO",
        actor: {
          ...learner,
          userId: "other-user",
          memberships: [{ ...learner.memberships[0], id: "other-membership" }],
        },
        repository: createRepository(assignment),
      }),
    ).rejects.toThrow("Not allowed to launch this assignment");
  });

  it("lets managers view direct-report runtime progress but not launch as the learner", async () => {
    await expect(
      requireRuntimeProgressAssignment({
        organizationId: "org_1",
        assignmentId: "assignment_1",
        actor: manager,
        repository: createRepository(assignment),
      }),
    ).resolves.toEqual(assignment);

    await expect(
      requireLearnerLaunchAssignment({
        organizationId: "org_1",
        assignmentId: "assignment_1",
        expectedCourseType: "NATIVE_VIDEO",
        actor: manager,
        repository: createRepository(assignment),
      }),
    ).rejects.toThrow("Not allowed to launch this assignment");
  });

  it("lets admins and platform owners inspect progress but not launch learner endpoints", async () => {
    await expect(
      requireRuntimeProgressAssignment({
        organizationId: "org_1",
        assignmentId: "assignment_1",
        actor: admin,
        repository: createRepository(assignment),
      }),
    ).resolves.toEqual(assignment);
    await expect(
      requireRuntimeProgressAssignment({
        organizationId: "org_1",
        assignmentId: "assignment_1",
        actor: platformOwner,
        repository: createRepository(assignment),
      }),
    ).resolves.toEqual(assignment);

    await expect(
      requireLearnerLaunchAssignment({
        organizationId: "org_1",
        assignmentId: "assignment_1",
        expectedCourseType: "NATIVE_VIDEO",
        actor: admin,
        repository: createRepository(assignment),
      }),
    ).rejects.toThrow("Not allowed to launch this assignment");
    await expect(
      requireLearnerLaunchAssignment({
        organizationId: "org_1",
        assignmentId: "assignment_1",
        expectedCourseType: "NATIVE_VIDEO",
        actor: platformOwner,
        repository: createRepository(assignment),
      }),
    ).rejects.toThrow("Not allowed to launch this assignment");
  });

  it("denies cross-organization assignment and learner mismatches", async () => {
    await expect(
      requireLearnerLaunchAssignment({
        organizationId: "org_1",
        assignmentId: "assignment_1",
        expectedCourseType: "NATIVE_VIDEO",
        actor: learner,
        repository: createRepository({
          ...assignment,
          organizationId: "org_2",
          learner: { ...assignment.learner, organizationId: "org_2" },
        }),
      }),
    ).rejects.toThrow("Assignment was not found");

    await expect(
      requireRuntimeProgressAssignment({
        organizationId: "org_1",
        assignmentId: "assignment_1",
        actor: manager,
        repository: createRepository({
          ...assignment,
          learner: { ...assignment.learner, organizationId: "org_2" },
        }),
      }),
    ).rejects.toThrow("Not allowed to view this assignment progress");
  });

  it("rejects missing assignments and wrong course types", async () => {
    await expect(
      requireLearnerLaunchAssignment({
        organizationId: "org_1",
        assignmentId: "missing",
        expectedCourseType: "NATIVE_VIDEO",
        actor: learner,
        repository: createRepository(null),
      }),
    ).rejects.toThrow("Assignment was not found");

    await expect(
      requireLearnerLaunchAssignment({
        organizationId: "org_1",
        assignmentId: "assignment_1",
        expectedCourseType: "SCORM_1_2",
        actor: learner,
        repository: createRepository(assignment),
      }),
    ).rejects.toThrow("Assignment course type does not match this runtime");
  });
});
