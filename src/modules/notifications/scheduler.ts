import type { EmailProvider } from "../providers/email/email-provider";

export type NotificationDeliveryJob = {
  id: string;
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
};

export interface NotificationSchedulerRepository {
  claimDueNotificationJobs(input: {
    now: Date;
    batchSize: number;
    maxAttempts: number;
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
}

export async function processNotificationJobs(
  input: { now: Date; batchSize: number; maxAttempts: number },
  repository: NotificationSchedulerRepository,
  provider: EmailProvider,
): Promise<NotificationProcessResult> {
  const batchSize = clampBatchSize(input.batchSize);
  const jobs = await repository.claimDueNotificationJobs({
    now: input.now,
    batchSize,
    maxAttempts: input.maxAttempts,
  });
  let sent = 0;
  let failed = 0;

  for (const job of jobs) {
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
  };
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
