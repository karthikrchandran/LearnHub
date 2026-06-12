import type { EmailProvider } from "../providers/email/email-provider";
import {
  scheduleAssignmentNotifications,
  scheduleCertificateNotification,
  type AssignmentNotificationScheduleInput,
  type CertificateNotificationScheduleInput,
  type NotificationEnqueueOperation,
  type NotificationJobType,
  type NotificationJobWriteRepository,
} from "./notification-jobs";

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

export type NotificationEnqueueFailureRetry = {
  id: string;
  operation: NotificationEnqueueOperation;
  payload: unknown;
  attempts: number;
};

export interface NotificationSchedulerRepository extends NotificationJobWriteRepository {
  claimDueNotificationEnqueueFailures(input: {
    now: Date;
    batchSize: number;
    maxAttempts: number;
    processingTimeoutMs: number;
  }): Promise<NotificationEnqueueFailureRetry[]>;
  markNotificationEnqueueFailureResolved(input: {
    id: string;
    resolvedAt: Date;
  }): Promise<void>;
  markNotificationEnqueueFailureFailed(input: {
    id: string;
    attempts: number;
    lastError: string;
    retryAt: Date;
  }): Promise<void>;
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
  const processingTimeoutMs = input.processingTimeoutMs ?? 15 * 60 * 1000;
  await processNotificationEnqueueFailures(
    {
      now: input.now,
      batchSize,
      maxAttempts: input.maxAttempts,
      processingTimeoutMs,
    },
    repository,
  );
  const jobs = await repository.claimDueNotificationJobs({
    now: input.now,
    batchSize,
    maxAttempts: input.maxAttempts,
    processingTimeoutMs,
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

async function processNotificationEnqueueFailures(
  input: { now: Date; batchSize: number; maxAttempts: number; processingTimeoutMs: number },
  repository: NotificationSchedulerRepository,
): Promise<void> {
  const failures = await repository.claimDueNotificationEnqueueFailures(input);

  for (const failure of failures) {
    try {
      await replayNotificationEnqueueFailure(failure, repository);
      await repository.markNotificationEnqueueFailureResolved({
        id: failure.id,
        resolvedAt: input.now,
      });
    } catch (error) {
      const attempts = failure.attempts + 1;

      await repository.markNotificationEnqueueFailureFailed({
        id: failure.id,
        attempts,
        lastError: error instanceof Error ? error.message : "Notification enqueue retry failed",
        retryAt: addMinutes(input.now, retryDelayMinutes(attempts)),
      });
    }
  }
}

async function replayNotificationEnqueueFailure(
  failure: NotificationEnqueueFailureRetry,
  repository: NotificationSchedulerRepository,
): Promise<void> {
  if (failure.operation === "ASSIGNMENT_NOTIFICATIONS") {
    await scheduleAssignmentNotifications(parseAssignmentNotificationPayload(failure.payload), repository);
    return;
  }

  if (failure.operation === "CERTIFICATE_NOTIFICATION") {
    await scheduleCertificateNotification(parseCertificateNotificationPayload(failure.payload), repository);
    return;
  }

  throw new Error("Unsupported notification enqueue operation");
}

function parseAssignmentNotificationPayload(payload: unknown): AssignmentNotificationScheduleInput {
  const value = requireRecord(payload);

  return {
    organizationId: requireString(value, "organizationId"),
    assignmentId: requireString(value, "assignmentId"),
    learnerEmail: requireString(value, "learnerEmail"),
    learnerName: requireString(value, "learnerName"),
    courseTitle: requireString(value, "courseTitle"),
    dueDate: requireDate(value, "dueDate"),
    assignmentUrl: optionalString(value, "assignmentUrl") ?? "",
    managerEmail: optionalString(value, "managerEmail"),
    managerName: optionalString(value, "managerName"),
    now: requireDate(value, "now"),
  };
}

function parseCertificateNotificationPayload(payload: unknown): CertificateNotificationScheduleInput {
  const value = requireRecord(payload);

  return {
    organizationId: requireString(value, "organizationId"),
    assignmentId: requireString(value, "assignmentId"),
    certificateId: requireString(value, "certificateId"),
    learnerEmail: requireString(value, "learnerEmail"),
    learnerName: requireString(value, "learnerName"),
    courseTitle: requireString(value, "courseTitle"),
    certificateUrl: requireString(value, "certificateUrl"),
    now: requireDate(value, "now"),
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

function requireRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Notification enqueue payload is invalid");
  }

  return value as Record<string, unknown>;
}

function requireString(value: Record<string, unknown>, key: string): string {
  const candidate = value[key];

  if (typeof candidate !== "string" || !candidate.trim()) {
    throw new Error(`Notification enqueue payload is missing ${key}`);
  }

  return candidate.trim();
}

function optionalString(value: Record<string, unknown>, key: string): string | null {
  const candidate = value[key];

  return typeof candidate === "string" && candidate.trim() ? candidate.trim() : null;
}

function requireDate(value: Record<string, unknown>, key: string): Date {
  const candidate = value[key];
  const parsed = candidate instanceof Date ? candidate : typeof candidate === "string" ? new Date(candidate) : null;

  if (!parsed || Number.isNaN(parsed.getTime())) {
    throw new Error(`Notification enqueue payload has invalid ${key}`);
  }

  return parsed;
}
