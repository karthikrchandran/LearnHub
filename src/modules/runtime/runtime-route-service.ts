import {
  canLaunchRuntimeAssignment,
  canViewRuntimeProgress,
  type MembershipAuthContext,
} from "../auth/permissions";

export type RuntimeRouteCourseType = "NATIVE_VIDEO" | "SCORM_1_2";

export type RuntimeRouteAssignment = {
  id: string;
  organizationId: string;
  membershipId: string;
  learner: {
    id: string;
    userId: string;
    organizationId: string;
    managerMembershipId: string | null;
  };
  course: {
    id: string;
    slug: string;
    type: RuntimeRouteCourseType;
  };
};

export type RuntimeRouteRepository = {
  findAssignment(input: {
    organizationId: string;
    assignmentId: string;
  }): Promise<RuntimeRouteAssignment | null>;
};

export class RuntimeRouteError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 403 | 404,
  ) {
    super(message);
    this.name = "RuntimeRouteError";
  }
}

export async function requireLearnerLaunchAssignment(input: {
  organizationId: string;
  assignmentId: string;
  expectedCourseType: RuntimeRouteCourseType;
  actor: MembershipAuthContext;
  repository: RuntimeRouteRepository;
}): Promise<RuntimeRouteAssignment> {
  const assignment = await loadRouteAssignment(input);

  if (assignment.course.type !== input.expectedCourseType) {
    throw new RuntimeRouteError("Assignment course type does not match this runtime", 400);
  }

  if (!canLaunchRuntimeAssignment(input.actor, assignment)) {
    throw new RuntimeRouteError("Not allowed to launch this assignment", 403);
  }

  return assignment;
}

export async function requireRuntimeProgressAssignment(input: {
  organizationId: string;
  assignmentId: string;
  actor: MembershipAuthContext;
  repository: RuntimeRouteRepository;
}): Promise<RuntimeRouteAssignment> {
  const assignment = await loadRouteAssignment(input);

  if (!canViewRuntimeProgress(input.actor, assignment)) {
    throw new RuntimeRouteError("Not allowed to view this assignment progress", 403);
  }

  return assignment;
}

async function loadRouteAssignment(input: {
  organizationId: string;
  assignmentId: string;
  repository: RuntimeRouteRepository;
}): Promise<RuntimeRouteAssignment> {
  const assignment = await input.repository.findAssignment({
    organizationId: input.organizationId,
    assignmentId: input.assignmentId,
  });

  if (!assignment || assignment.organizationId !== input.organizationId) {
    throw new RuntimeRouteError("Assignment was not found", 404);
  }

  return assignment;
}
