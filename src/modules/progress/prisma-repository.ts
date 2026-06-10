import type { Prisma, PrismaClient } from "@prisma/client";

import type { ProgressRepository } from "./progress";

type PrismaProgressClient = Pick<PrismaClient, "$transaction" | "courseAssignment" | "assignmentProgress" | "learningProgressEvent">;

function rawPayloadToJson(rawPayload: unknown): Prisma.InputJsonValue {
  if (rawPayload === null || rawPayload === undefined) {
    return {};
  }

  return rawPayload as Prisma.InputJsonValue;
}

export function createPrismaProgressRepository(client: PrismaProgressClient): ProgressRepository {
  return {
    async findAssignmentForProgress(input) {
      const assignment = await client.courseAssignment.findFirst({
        where: {
          id: input.assignmentId,
          organizationId: input.organizationId,
        },
        select: {
          id: true,
          organizationId: true,
          status: true,
          course: {
            select: {
              type: true,
            },
          },
          progress: {
            select: {
              progressPercent: true,
            },
          },
        },
      });

      return assignment
        ? {
            id: assignment.id,
            organizationId: assignment.organizationId,
            courseType: assignment.course.type,
            status: assignment.status,
            currentProgressPercent: assignment.progress?.progressPercent ?? 0,
          }
        : null;
    },
    async saveProgressUpdate(input) {
      await client.$transaction(async (transaction) => {
        await transaction.learningProgressEvent.create({
          data: {
            organizationId: input.organizationId,
            assignmentId: input.assignmentId,
            source: input.event.source,
            type: input.event.type,
            progressPercent: input.event.progressPercent,
            rawPayload: rawPayloadToJson(input.event.rawPayload),
            occurredAt: input.event.occurredAt,
          },
        });

        await transaction.assignmentProgress.upsert({
          where: {
            organizationId_assignmentId: {
              organizationId: input.organizationId,
              assignmentId: input.assignmentId,
            },
          },
          update: {
            progressPercent: input.progress.progressPercent,
            lastEventAt: input.event.occurredAt,
          },
          create: {
            organizationId: input.organizationId,
            assignmentId: input.assignmentId,
            progressPercent: input.progress.progressPercent,
            lastEventAt: input.event.occurredAt,
          },
        });

        await transaction.courseAssignment.update({
          where: {
            organizationId_id: {
              organizationId: input.organizationId,
              id: input.assignmentId,
            },
          },
          data: {
            status: input.progress.assignmentStatus,
          },
        });
      });
    },
  };
}
