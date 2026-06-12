import { describe, expect, it, vi } from "vitest";

import {
  processNotificationJobs,
  type NotificationDeliveryJob,
  type NotificationEnqueueFailureRetry,
  type NotificationSchedulerRepository,
} from "./scheduler";
import type { EmailProvider } from "../providers/email/email-provider";

const now = new Date("2026-06-12T10:00:00.000Z");

function job(overrides: Partial<NotificationDeliveryJob> = {}): NotificationDeliveryJob {
  return {
    id: "job_1",
    recipientEmail: "learner@example.com",
    subject: "Subject",
    html: "<p>Hello</p>",
    text: "Hello",
    attempts: 0,
    type: "ASSIGNMENT_ASSIGNED",
    assignmentStatus: "ASSIGNED",
    ...overrides,
  };
}

function enqueueFailure(overrides: Partial<NotificationEnqueueFailureRetry> = {}): NotificationEnqueueFailureRetry {
  return {
    id: "enqueue_failure_1",
    operation: "ASSIGNMENT_NOTIFICATIONS",
    payload: {
      organizationId: "org_1",
      assignmentId: "assignment_1",
      learnerEmail: "learner@example.com",
      learnerName: "Learner One",
      courseTitle: "Safety Basics",
      dueDate: "2026-06-15T00:00:00.000Z",
      assignmentUrl: "https://learnhub.test/org/acme/learn/safety",
      now: "2026-06-12T10:00:00.000Z",
    },
    attempts: 0,
    ...overrides,
  };
}

function repository(overrides: Partial<NotificationSchedulerRepository> = {}): NotificationSchedulerRepository {
  return {
    upsertNotificationJob: vi.fn(),
    claimDueNotificationEnqueueFailures: vi.fn(async () => []),
    markNotificationEnqueueFailureResolved: vi.fn(),
    markNotificationEnqueueFailureFailed: vi.fn(),
    claimDueNotificationJobs: vi.fn(async () => []),
    markNotificationJobSent: vi.fn(),
    markNotificationJobFailed: vi.fn(),
    markNotificationJobSkipped: vi.fn(),
    ...overrides,
  };
}

describe("notification scheduler", () => {
  it("processes a bounded batch and records successful sends", async () => {
    const notificationRepository = repository({
      claimDueNotificationJobs: vi.fn(async () => [job({ id: "job_1" }), job({ id: "job_2" })]),
    });
    const provider: EmailProvider = {
      send: vi.fn(async () => ({ providerMessageId: "provider_1" })),
    };

    const result = await processNotificationJobs({ now, batchSize: 2, maxAttempts: 3 }, notificationRepository, provider);

    expect(result).toEqual({ processed: 2, sent: 2, failed: 0, skipped: 0 });
    expect(notificationRepository.claimDueNotificationEnqueueFailures).toHaveBeenCalledWith({
      now,
      batchSize: 2,
      maxAttempts: 3,
      processingTimeoutMs: 15 * 60 * 1000,
    });
    expect(notificationRepository.claimDueNotificationJobs).toHaveBeenCalledWith({
      now,
      batchSize: 2,
      maxAttempts: 3,
      processingTimeoutMs: 15 * 60 * 1000,
    });
    expect(provider.send).toHaveBeenCalledTimes(2);
    expect(notificationRepository.markNotificationJobSent).toHaveBeenCalledWith({
      id: "job_1",
      providerMessageId: "provider_1",
      sentAt: now,
    });
  });

  it("records failed sends with incremented attempts and retry time", async () => {
    const notificationRepository = repository({
      claimDueNotificationJobs: vi.fn(async () => [job({ id: "job_1", attempts: 1 })]),
    });
    const provider: EmailProvider = {
      send: vi.fn(async () => {
        throw new Error("SMTP unavailable");
      }),
    };

    const result = await processNotificationJobs({ now, batchSize: 1, maxAttempts: 3 }, notificationRepository, provider);

    expect(result).toEqual({ processed: 1, sent: 0, failed: 1, skipped: 0 });
    expect(notificationRepository.markNotificationJobFailed).toHaveBeenCalledWith({
      id: "job_1",
      attempts: 2,
      lastError: "SMTP unavailable",
      nextRunAt: new Date("2026-06-12T10:10:00.000Z"),
    });
    expect(notificationRepository.markNotificationJobSent).not.toHaveBeenCalled();
  });

  it("clamps batch size to fifty", async () => {
    const notificationRepository = repository();
    const provider: EmailProvider = {
      send: vi.fn(),
    };

    await processNotificationJobs({ now, batchSize: 500, maxAttempts: 3 }, notificationRepository, provider);

    expect(notificationRepository.claimDueNotificationEnqueueFailures).toHaveBeenCalledWith({
      now,
      batchSize: 50,
      maxAttempts: 3,
      processingTimeoutMs: 15 * 60 * 1000,
    });
    expect(notificationRepository.claimDueNotificationJobs).toHaveBeenCalledWith({
      now,
      batchSize: 50,
      maxAttempts: 3,
      processingTimeoutMs: 15 * 60 * 1000,
    });
  });

  it("passes max attempts so exhausted jobs are not claimed", async () => {
    const notificationRepository = repository();
    const provider: EmailProvider = {
      send: vi.fn(),
    };

    await processNotificationJobs({ now, batchSize: 5, maxAttempts: 4 }, notificationRepository, provider);

    expect(notificationRepository.claimDueNotificationEnqueueFailures).toHaveBeenCalledWith({
      now,
      batchSize: 5,
      maxAttempts: 4,
      processingTimeoutMs: 15 * 60 * 1000,
    });
    expect(notificationRepository.claimDueNotificationJobs).toHaveBeenCalledWith({
      now,
      batchSize: 5,
      maxAttempts: 4,
      processingTimeoutMs: 15 * 60 * 1000,
    });
  });

  it("sends only jobs returned by the atomic claim", async () => {
    const notificationRepository = repository({
      claimDueNotificationJobs: vi.fn(async () => [
        job({
          id: "claimed-job",
          recipientEmail: "claimed@example.com",
        }),
      ]),
    });
    const provider: EmailProvider = {
      send: vi.fn(async () => ({ providerMessageId: "provider_1" })),
    };

    const result = await processNotificationJobs({ now, batchSize: 2, maxAttempts: 3 }, notificationRepository, provider);

    expect(result).toEqual({ processed: 1, sent: 1, failed: 0, skipped: 0 });
    expect(provider.send).toHaveBeenCalledTimes(1);
    expect(provider.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "claimed@example.com",
      }),
    );
    expect(provider.send).not.toHaveBeenCalledWith(
      expect.objectContaining({
        to: "stale-non-claimed@example.com",
      }),
    );
  });

  it("skips completed assignments for delayed reminder and escalation jobs", async () => {
    const notificationRepository = repository({
      claimDueNotificationJobs: vi.fn(async () => [
        job({
          id: "due-soon-job",
          type: "ASSIGNMENT_DUE_SOON",
          assignmentStatus: "COMPLETED",
        }),
        job({
          id: "overdue-job",
          type: "ASSIGNMENT_OVERDUE",
          assignmentStatus: "COMPLETED",
        }),
        job({
          id: "manager-job",
          type: "MANAGER_ESCALATION",
          assignmentStatus: "COMPLETED",
        }),
      ]),
    });
    const provider: EmailProvider = {
      send: vi.fn(),
    };

    const result = await processNotificationJobs({ now, batchSize: 3, maxAttempts: 3 }, notificationRepository, provider);

    expect(result).toEqual({ processed: 3, sent: 0, failed: 0, skipped: 3 });
    expect(provider.send).not.toHaveBeenCalled();
    expect(notificationRepository.markNotificationJobSkipped).toHaveBeenCalledTimes(3);
    expect(notificationRepository.markNotificationJobSkipped).toHaveBeenCalledWith({
      id: "due-soon-job",
      skippedAt: now,
      reason: "Assignment completed before delayed notification delivery",
    });
  });

  it("still sends immediate assignment and certificate jobs for completed assignments", async () => {
    const notificationRepository = repository({
      claimDueNotificationJobs: vi.fn(async () => [
        job({
          id: "assignment-job",
          type: "ASSIGNMENT_ASSIGNED",
          assignmentStatus: "COMPLETED",
        }),
        job({
          id: "certificate-job",
          type: "CERTIFICATE_ISSUED",
          assignmentStatus: "COMPLETED",
        }),
      ]),
    });
    const provider: EmailProvider = {
      send: vi.fn(async () => ({ providerMessageId: "provider_1" })),
    };

    const result = await processNotificationJobs({ now, batchSize: 2, maxAttempts: 3 }, notificationRepository, provider);

    expect(result).toEqual({ processed: 2, sent: 2, failed: 0, skipped: 0 });
    expect(provider.send).toHaveBeenCalledTimes(2);
    expect(notificationRepository.markNotificationJobSkipped).not.toHaveBeenCalled();
  });

  it("replays durable assignment enqueue failures into notification jobs before delivery sends", async () => {
    const notificationRepository = repository({
      claimDueNotificationEnqueueFailures: vi.fn(async () => [enqueueFailure()]),
      claimDueNotificationJobs: vi.fn(async () => []),
    });
    const provider: EmailProvider = {
      send: vi.fn(),
    };

    const result = await processNotificationJobs({ now, batchSize: 5, maxAttempts: 3 }, notificationRepository, provider);

    expect(result).toEqual({ processed: 0, sent: 0, failed: 0, skipped: 0 });
    expect(notificationRepository.upsertNotificationJob).toHaveBeenCalledTimes(3);
    expect(notificationRepository.upsertNotificationJob).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org_1",
        assignmentId: "assignment_1",
        type: "ASSIGNMENT_ASSIGNED",
        recipientEmail: "learner@example.com",
      }),
    );
    expect(notificationRepository.markNotificationEnqueueFailureResolved).toHaveBeenCalledWith({
      id: "enqueue_failure_1",
      resolvedAt: now,
    });
    expect(notificationRepository.markNotificationEnqueueFailureFailed).not.toHaveBeenCalled();
  });

  it("reschedules enqueue failures when replay cannot create notification jobs", async () => {
    const notificationRepository = repository({
      claimDueNotificationEnqueueFailures: vi.fn(async () => [enqueueFailure({ attempts: 1 })]),
      claimDueNotificationJobs: vi.fn(async () => []),
      upsertNotificationJob: vi.fn(async () => {
        throw new Error("notification table unavailable");
      }),
    });
    const provider: EmailProvider = {
      send: vi.fn(),
    };

    await processNotificationJobs({ now, batchSize: 5, maxAttempts: 3 }, notificationRepository, provider);

    expect(notificationRepository.markNotificationEnqueueFailureFailed).toHaveBeenCalledWith({
      id: "enqueue_failure_1",
      attempts: 2,
      lastError: "notification table unavailable",
      retryAt: new Date("2026-06-12T10:10:00.000Z"),
    });
    expect(notificationRepository.markNotificationEnqueueFailureResolved).not.toHaveBeenCalled();
  });
});
