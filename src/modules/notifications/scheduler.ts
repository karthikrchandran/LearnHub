import type { EmailProvider } from "../providers/email/email-provider";
import type { NotificationJobType } from "./notification-jobs";

export type NotificationDeliveryJob = {
  id: string;
  type: NotificationJobType;
  assignmentStatus: "ASSIGNED" | "IN_PROGRESS" | "COMPLETED" | "OVERDUE";
  recipientEmail: string;
  subject: string;
  html: string;
  text: string;
  attempts: number;
};

export type NotificationProcessResult = {
  processed: number;
  sent: number;
  failed: number;
  skipped: number;
};

export interface NotificationSchedulerRepository {
  claimDueNotificationJobs(input: {
    now: Date;
    batchSize: number;
    maxAttempts: number;
    processingTimeoutMs: number;
  }): Promise<NotificationDeliveryJob[]>;
  markNotificationJobSent(input: {
    id: string;
    providerMessageId: string;
    sentAt: Date;
  }): Promise<void>;
  markNotificationJobFailed(input: {
    id: string;
    attempts: number;
    lastError: string;
    nextRunAt: Date;
  }): Promise<void>;
  markNotificationJobSkipped(input: {
    id: string;
    skippedAt: Date;
    reason: string;
  }): Promise<void>;
}

export async function processNotificationJobs(
  input: { now: Date; batchSize: number; maxAttempts: number; processingTimeoutMs?: number },
  repository: NotificationSchedulerRepository,
  provider: EmailProvider,
): Promise<NotificationProcessResult> {
  const batchSize = clampBatchSize(input.batchSize);
  const jobs = await repository.claimDueNotificationJobs({
    now: input.now,
    batchSize,
    maxAttempts: input.maxAttempts,
    processingTimeoutMs: input.processingTimeoutMs ?? 15 * 60 * 1000,
  });
  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const job of jobs) {
    if (shouldSkipCompletedAssignmentNotification(job)) {
      await repository.markNotificationJobSkipped({
        id: job.id,
        skippedAt: input.now,
        reason: "Assignment completed before delayed notification delivery",
      });
      skipped += 1;
      continue;
    }

    try {
      const result = await provider.send({
        to: job.recipientEmail,
        subject: job.subject,
        html: job.html,
        text: job.text,
      });
      await repository.markNotificationJobSent({
        id: job.id,
        providerMessageId: result.providerMessageId,
        sentAt: input.now,
      });
      sent += 1;
    } catch (error) {
      const attempts = job.attempts + 1;

      await repository.markNotificationJobFailed({
        id: job.id,
        attempts,
        lastError: error instanceof Error ? error.message : "Notification delivery failed",
        nextRunAt: addMinutes(input.now, retryDelayMinutes(attempts)),
      });
      failed += 1;
    }
  }

  return {
    processed: jobs.length,
    sent,
    failed,
    skipped,
  };
}

function shouldSkipCompletedAssignmentNotification(job: NotificationDeliveryJob): boolean {
  return job.assignmentStatus === "COMPLETED" && isDelayedAssignmentNotification(job.type);
}

function isDelayedAssignmentNotification(type: NotificationJobType): boolean {
  return type === "ASSIGNMENT_DUE_SOON" || type === "ASSIGNMENT_OVERDUE" || type === "MANAGER_ESCALATION";
}

function clampBatchSize(batchSize: number): number {
  if (!Number.isFinite(batchSize) || batchSize < 1) {
    return 1;
  }

  return Math.min(50, Math.floor(batchSize));
}

function retryDelayMinutes(attempts: number): number {
  return Math.min(60, attempts * 5);
}

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}
