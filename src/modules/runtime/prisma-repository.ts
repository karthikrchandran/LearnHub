import type { PrismaClient } from "@prisma/client";

import type {
  RuntimeRouteAssignment,
  RuntimeRouteRepository,
} from "./runtime-route-service";

type PrismaRuntimeRouteClient = Pick<PrismaClient, "courseAssignment">;

type RuntimeRouteAssignmentRecord = {
  id: string;
  organizationId: string;
  membershipId: string;
  membership: RuntimeRouteAssignment["learner"];
  course: RuntimeRouteAssignment["course"];
};

export function createPrismaRuntimeRouteRepository(
  client: PrismaRuntimeRouteClient,
): RuntimeRouteRepository {
  return {
    async findAssignment(input) {
      const assignment = await client.courseAssignment.findFirst({
        where: {
          id: input.assignmentId,
          organizationId: input.organizationId,
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

      return assignment ? mapAssignment(assignment) : null;
    },
  };
}

function mapAssignment(assignment: RuntimeRouteAssignmentRecord): RuntimeRouteAssignment {
  return {
    id: assignment.id,
    organizationId: assignment.organizationId,
    membershipId: assignment.membershipId,
    learner: assignment.membership,
    course: assignment.course,
  };
}
