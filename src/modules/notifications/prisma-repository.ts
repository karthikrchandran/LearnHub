import type { PrismaClient } from "@prisma/client";

import type { NotificationJobUpsert, NotificationJobWriteRepository } from "./notification-jobs";
import type { NotificationDeliveryJob, NotificationSchedulerRepository } from "./scheduler";

type PrismaNotificationClient = Pick<PrismaClient, "notificationJob">;

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
      const jobs = await client.notificationJob.findMany({
        where: {
          status: { in: ["PENDING", "FAILED"] },
          nextRunAt: { lte: input.now },
          attempts: { lt: input.maxAttempts },
        },
        orderBy: [{ nextRunAt: "asc" }, { createdAt: "asc" }],
        take: input.batchSize,
        select: {
          id: true,
          type: true,
          assignment: {
            select: {
              status: true,
            },
          },
          recipientEmail: true,
          subject: true,
          html: true,
          text: true,
          attempts: true,
        },
      });

      if (jobs.length > 0) {
        await client.notificationJob.updateMany({
          where: { id: { in: jobs.map((job) => job.id) } },
          data: { status: "PROCESSING" },
        });
      }

      return jobs.map((job) => ({
        id: job.id,
        type: job.type,
        assignmentStatus: job.assignment.status,
        recipientEmail: job.recipientEmail,
        subject: job.subject,
        html: job.html,
        text: job.text,
        attempts: job.attempts,
      }));
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
      const jobs = await client.notificationJob.findMany({
        where: {
          organizationId: input.organizationId,
          status: { in: ["PENDING", "FAILED"] },
        },
        orderBy: [{ status: "asc" }, { nextRunAt: "asc" }],
        take: input.take ?? 100,
        select: inspectionSelect,
      });

      return jobs.map(mapInspectionJob);
    },
    async listPlatformNotificationFailures(input) {
      const jobs = await client.notificationJob.findMany({
        where: { status: "FAILED" },
        orderBy: [{ nextRunAt: "asc" }],
        take: input?.take ?? 100,
        select: inspectionSelect,
      });

      return jobs.map(mapInspectionJob);
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
