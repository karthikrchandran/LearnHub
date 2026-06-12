import type { Prisma, PrismaClient } from "@prisma/client";

import type { ScormPackageRepository } from "./scorm-package-service";
import type {
  ScormRegistrationState,
  ScormRuntimeAssignment,
  ScormRuntimeRepository,
} from "./scorm-runtime";

type PrismaScormClient = Pick<
  PrismaClient,
  | "$transaction"
  | "course"
  | "scormPackage"
  | "scormRegistration"
  | "courseAssignment"
  | "assignmentProgress"
  | "learningProgressEvent"
  | "auditLog"
>;

export type PrismaScormRepository = ScormPackageRepository & ScormRuntimeRepository;

const registrationSelect = {
  id: true,
  packageId: true,
  cmiData: true,
  lessonStatus: true,
  scoreRaw: true,
  sessionTimeSeconds: true,
  totalTimeSeconds: true,
  launchCount: true,
  lastLaunchedAt: true,
  lastCommittedAt: true,
} as const;

type RegistrationRecord = {
  id: string;
  packageId: string;
  cmiData: Prisma.JsonValue;
  lessonStatus: string;
  scoreRaw: number | null;
  sessionTimeSeconds: number;
  totalTimeSeconds: number;
  launchCount: number;
  lastLaunchedAt: Date | null;
  lastCommittedAt: Date | null;
};

type AssignmentRecord = {
  id: string;
  organizationId: string;
  courseId: string;
  course: {
    id: string;
    title: string;
    type: ScormRuntimeAssignment["course"]["type"];
    scormPackages: NonNullable<ScormRuntimeAssignment["course"]["scormPackage"]>[];
  };
  scormRegistration: RegistrationRecord | null;
};

function rawPayloadToJson(rawPayload: unknown): Prisma.InputJsonValue {
  if (rawPayload === null || rawPayload === undefined) {
    return {};
  }

  return rawPayload as Prisma.InputJsonValue;
}

export function createPrismaScormRepository(client: PrismaScormClient): PrismaScormRepository {
  let transactionClient: PrismaScormClient | null = null;
  const activeClient = () => transactionClient ?? client;

  return {
    async runInTransaction(operation) {
      return client.$transaction(async (transaction) => {
        transactionClient = transaction as PrismaScormClient;

        try {
          return await operation();
        } finally {
          transactionClient = null;
        }
      });
    },
    findCourse(input) {
      return activeClient().course.findFirst({
        where: { id: input.courseId, organizationId: input.organizationId },
        select: { id: true, organizationId: true, type: true },
      });
    },
    upsertPackage(data) {
      return activeClient().scormPackage.upsert({
        where: {
          organizationId_courseId: {
            organizationId: data.organizationId,
            courseId: data.courseId,
          },
        },
        update: {
          originalFileName: data.originalFileName,
          contentType: data.contentType,
          byteSize: data.byteSize,
          storageKey: data.storageKey,
          contentRootKey: data.contentRootKey,
          launchPath: data.launchPath,
          manifestTitle: data.manifestTitle,
          uploadedByUserId: data.uploadedByUserId,
          active: true,
        },
        create: {
          id: data.packageId,
          organizationId: data.organizationId,
          courseId: data.courseId,
          originalFileName: data.originalFileName,
          contentType: data.contentType,
          byteSize: data.byteSize,
          storageKey: data.storageKey,
          contentRootKey: data.contentRootKey,
          launchPath: data.launchPath,
          manifestTitle: data.manifestTitle,
          uploadedByUserId: data.uploadedByUserId,
          active: true,
        },
        select: { id: true, storageKey: true },
      });
    },
    async recordAuditLog(input) {
      await activeClient().auditLog.create({
        data: {
          organizationId: input.organizationId,
          actorId: input.actorId,
          action: input.action,
          targetType: input.targetType,
          targetId: input.targetId,
        },
      });
    },
    async findAssignmentForRuntime(input) {
      const assignment = await activeClient().courseAssignment.findFirst({
        where: { id: input.assignmentId, organizationId: input.organizationId },
        select: {
          id: true,
          organizationId: true,
          courseId: true,
          course: {
            select: {
              id: true,
              title: true,
              type: true,
              scormPackages: {
                where: { active: true },
                take: 1,
                orderBy: { updatedAt: "desc" },
                select: {
                  id: true,
                  launchPath: true,
                  storageKey: true,
                  contentRootKey: true,
                  manifestTitle: true,
                },
              },
            },
          },
          scormRegistration: {
            select: registrationSelect,
          },
        },
      });

      return assignment ? mapAssignment(assignment) : null;
    },
    upsertLaunchRegistration(input) {
      return activeClient().scormRegistration.upsert({
        where: {
          organizationId_assignmentId: {
            organizationId: input.organizationId,
            assignmentId: input.assignmentId,
          },
        },
        update: {
          packageId: input.packageId,
          launchCount: input.launchCount,
          sessionTimeSeconds: 0,
          lastLaunchedAt: input.launchedAt,
        },
        create: {
          organizationId: input.organizationId,
          assignmentId: input.assignmentId,
          packageId: input.packageId,
          launchCount: input.launchCount,
          sessionTimeSeconds: 0,
          lastLaunchedAt: input.launchedAt,
        },
        select: registrationSelect,
      }).then(mapRegistration);
    },
    saveRuntimeCommit(input) {
      return activeClient().scormRegistration.upsert({
        where: {
          organizationId_assignmentId: {
            organizationId: input.organizationId,
            assignmentId: input.assignmentId,
          },
        },
        update: {
          packageId: input.packageId,
          cmiData: input.cmiData as Prisma.InputJsonValue,
          lessonStatus: input.lessonStatus,
          scoreRaw: input.scoreRaw,
          sessionTimeSeconds: input.sessionTimeSeconds,
          totalTimeSeconds: input.totalTimeSeconds,
          lastCommittedAt: input.committedAt,
        },
        create: {
          organizationId: input.organizationId,
          assignmentId: input.assignmentId,
          packageId: input.packageId,
          cmiData: input.cmiData as Prisma.InputJsonValue,
          lessonStatus: input.lessonStatus,
          scoreRaw: input.scoreRaw,
          sessionTimeSeconds: input.sessionTimeSeconds,
          totalTimeSeconds: input.totalTimeSeconds,
          lastCommittedAt: input.committedAt,
        },
        select: registrationSelect,
      }).then(mapRegistration);
    },
    async findAssignmentForProgress(input) {
      const assignment = await activeClient().courseAssignment.findFirst({
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
      await activeClient().learningProgressEvent.create({
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

      await activeClient().assignmentProgress.upsert({
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

      await activeClient().courseAssignment.update({
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
    },
  };
}

function mapAssignment(assignment: AssignmentRecord): ScormRuntimeAssignment {
  return {
    id: assignment.id,
    organizationId: assignment.organizationId,
    courseId: assignment.courseId,
    course: {
      id: assignment.course.id,
      title: assignment.course.title,
      type: assignment.course.type,
      scormPackage: assignment.course.scormPackages[0] ?? null,
    },
    scormRegistration: assignment.scormRegistration ? mapRegistration(assignment.scormRegistration) : null,
  };
}

function mapRegistration(registration: RegistrationRecord): ScormRegistrationState {
  return {
    ...registration,
    cmiData: isRecord(registration.cmiData) ? registration.cmiData : {},
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
