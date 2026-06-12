import type { PrismaClient } from "@prisma/client";

import type { NotificationJobUpsert, NotificationJobWriteRepository } from "./notification-jobs";
import type { NotificationDeliveryJob, NotificationSchedulerRepository } from "./scheduler";

type PrismaNotificationClient = Pick<PrismaClient, "$transaction" | "notificationJob" | "notificationEnqueueFailure">;

export type NotificationInspectionJob = {
  id: string;
  organizationId: string;
  organizationName?: string;
  organizationSlug?: string;
  assignmentId: string;
  type: string;
  status: string;
  recipientEmail: string;
  recipientName: string | null;
  subject: string;
  attempts: number;
  nextRunAt: Date;
  sentAt: Date | null;
  lastError: string | null;
  providerMessageId: string | null;
  courseTitle: string | null;
};

export interface NotificationInspectionRepository {
  listTenantNotificationJobs(input: { organizationId: string; take?: number }): Promise<NotificationInspectionJob[]>;
  listPlatformNotificationFailures(input?: { take?: number }): Promise<NotificationInspectionJob[]>;
}

const inspectionSelect = {
  id: true,
  organizationId: true,
  assignmentId: true,
  type: true,
  status: true,
  recipientEmail: true,
  recipientName: true,
  subject: true,
  attempts: true,
  nextRunAt: true,
  sentAt: true,
  lastError: true,
  providerMessageId: true,
  organization: {
    select: {
      name: true,
      slug: true,
    },
  },
  assignment: {
    select: {
      course: {
        select: {
          title: true,
        },
      },
    },
  },
};

const enqueueFailureInspectionSelect = {
  id: true,
  organizationId: true,
  assignmentId: true,
  certificateId: true,
  operation: true,
  status: true,
  attempts: true,
  retryAt: true,
  failedAt: true,
  lastError: true,
  payload: true,
  organization: {
    select: {
      name: true,
      slug: true,
    },
  },
  assignment: {
    select: {
      course: {
        select: {
          title: true,
        },
      },
    },
  },
};

type ClaimedNotificationJobRow = {
  id: string;
  type: NotificationDeliveryJob["type"];
  assignmentStatus: NotificationDeliveryJob["assignmentStatus"];
  recipientEmail: string;
  subject: string;
  html: string;
  text: string;
  attempts: number;
};

export function createPrismaNotificationRepository(
  client: PrismaNotificationClient,
): NotificationJobWriteRepository & NotificationSchedulerRepository & NotificationInspectionRepository {
  return {
    async upsertNotificationJob(job: NotificationJobUpsert) {
      await client.notificationJob.upsert({
        where: {
          organizationId_assignmentId_type_scheduledForDate: {
            organizationId: job.organizationId,
            assignmentId: job.assignmentId,
            type: job.type,
            scheduledForDate: job.scheduledForDate,
          },
        },
        update: {
          certificateId: job.certificateId ?? null,
          recipientEmail: job.recipientEmail,
          recipientName: job.recipientName ?? null,
          subject: job.subject,
          html: job.html,
          text: job.text,
          nextRunAt: job.nextRunAt,
        },
        create: job,
      });
    },
    async claimDueNotificationJobs(input): Promise<NotificationDeliveryJob[]> {
      const staleClaimedBefore = new Date(input.now.getTime() - input.processingTimeoutMs);

      return client.$transaction((transaction) =>
        transaction.$queryRaw<ClaimedNotificationJobRow[]>`
          WITH candidates AS (
            SELECT "id"
            FROM "NotificationJob"
            WHERE (
              "status" IN ('PENDING', 'FAILED')
              OR ("status" = 'PROCESSING' AND "claimedAt" IS NOT NULL AND "claimedAt" <= ${staleClaimedBefore})
            )
            AND "nextRunAt" <= ${input.now}
            AND "attempts" < ${input.maxAttempts}
            ORDER BY "nextRunAt" ASC, "createdAt" ASC
            FOR UPDATE SKIP LOCKED
            LIMIT ${input.batchSize}
          )
          UPDATE "NotificationJob" AS job
          SET
            "status" = 'PROCESSING',
            "claimedAt" = ${input.now},
            "updatedAt" = ${input.now}
          FROM candidates, "CourseAssignment" AS assignment
          WHERE job."id" = candidates."id"
            AND assignment."organizationId" = job."organizationId"
            AND assignment."id" = job."assignmentId"
          RETURNING
            job."id",
            job."type",
            assignment."status" AS "assignmentStatus",
            job."recipientEmail",
            job."subject",
            job."html",
            job."text",
            job."attempts"
        `,
      );
    },
    async markNotificationJobSent(input) {
      await client.notificationJob.update({
        where: { id: input.id },
        data: {
          status: "SENT",
          providerMessageId: input.providerMessageId,
          sentAt: input.sentAt,
          lastError: null,
        },
      });
    },
    async markNotificationJobFailed(input) {
      await client.notificationJob.update({
        where: { id: input.id },
        data: {
          status: "FAILED",
          attempts: input.attempts,
          lastError: input.lastError,
          nextRunAt: input.nextRunAt,
        },
      });
    },
    async markNotificationJobSkipped(input) {
      await client.notificationJob.update({
        where: { id: input.id },
        data: {
          status: "SKIPPED",
          sentAt: input.skippedAt,
          lastError: input.reason,
        },
      });
    },
    async listTenantNotificationJobs(input) {
      const take = input.take ?? 100;
      const [jobs, enqueueFailures] = await Promise.all([
        client.notificationJob.findMany({
          where: {
            organizationId: input.organizationId,
            status: { in: ["PENDING", "FAILED"] },
          },
          orderBy: [{ status: "asc" }, { nextRunAt: "asc" }],
          take,
          select: inspectionSelect,
        }),
        client.notificationEnqueueFailure.findMany({
          where: {
            organizationId: input.organizationId,
            status: "PENDING",
          },
          orderBy: [{ retryAt: "asc" }, { createdAt: "asc" }],
          take,
          select: enqueueFailureInspectionSelect,
        }),
      ]);

      return [...jobs.map(mapInspectionJob), ...enqueueFailures.map(mapEnqueueFailureInspectionJob)];
    },
    async listPlatformNotificationFailures(input) {
      const take = input?.take ?? 100;
      const [jobs, enqueueFailures] = await Promise.all([
        client.notificationJob.findMany({
          where: { status: "FAILED" },
          orderBy: [{ nextRunAt: "asc" }],
          take,
          select: inspectionSelect,
        }),
        client.notificationEnqueueFailure.findMany({
          where: { status: "PENDING" },
          orderBy: [{ retryAt: "asc" }, { createdAt: "asc" }],
          take,
          select: enqueueFailureInspectionSelect,
        }),
      ]);

      return [...jobs.map(mapInspectionJob), ...enqueueFailures.map(mapEnqueueFailureInspectionJob)];
    },
  };
}

function mapInspectionJob(job: {
  id: string;
  organizationId: string;
  assignmentId: string;
  type: string;
  status: string;
  recipientEmail: string;
  recipientName: string | null;
  subject: string;
  attempts: number;
  nextRunAt: Date;
  sentAt: Date | null;
  lastError: string | null;
  providerMessageId: string | null;
  organization?: { name: string; slug: string } | null;
  assignment?: { course?: { title: string } | null } | null;
}): NotificationInspectionJob {
  return {
    id: job.id,
    organizationId: job.organizationId,
    organizationName: job.organization?.name,
    organizationSlug: job.organization?.slug,
    assignmentId: job.assignmentId,
    type: job.type,
    status: job.status,
    recipientEmail: job.recipientEmail,
    recipientName: job.recipientName,
    subject: job.subject,
    attempts: job.attempts,
    nextRunAt: job.nextRunAt,
    sentAt: job.sentAt,
    lastError: job.lastError,
    providerMessageId: job.providerMessageId,
    courseTitle: job.assignment?.course?.title ?? null,
  };
}

function mapEnqueueFailureInspectionJob(failure: {
  id: string;
  organizationId: string;
  assignmentId: string;
  certificateId: string | null;
  operation: string;
  status: string;
  attempts: number;
  retryAt: Date;
  failedAt: Date;
  lastError: string;
  payload: unknown;
  organization?: { name: string; slug: string } | null;
  assignment?: { course?: { title: string } | null } | null;
}): NotificationInspectionJob {
  const payload = isRecord(failure.payload) ? failure.payload : {};
  const learnerEmail = typeof payload.learnerEmail === "string" ? payload.learnerEmail : "unknown";
  const learnerName = typeof payload.learnerName === "string" ? payload.learnerName : null;

  return {
    id: failure.id,
    organizationId: failure.organizationId,
    organizationName: failure.organization?.name,
    organizationSlug: failure.organization?.slug,
    assignmentId: failure.assignmentId,
    type: failure.operation,
    status: "ENQUEUE_FAILED",
    recipientEmail: learnerEmail,
    recipientName: learnerName,
    subject: "Notification enqueue failed",
    attempts: failure.attempts,
    nextRunAt: failure.retryAt,
    sentAt: null,
    lastError: failure.lastError,
    providerMessageId: null,
    courseTitle: failure.assignment?.course?.title ?? null,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
