import { describe, expect, it, vi } from "vitest";

import { processNotificationJobs, type NotificationDeliveryJob, type NotificationSchedulerRepository } from "./scheduler";
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
    ...overrides,
  };
}

describe("notification scheduler", () => {
  it("processes a bounded batch and records successful sends", async () => {
    const repository: NotificationSchedulerRepository = {
      claimDueNotificationJobs: vi.fn(async () => [job({ id: "job_1" }), job({ id: "job_2" })]),
      markNotificationJobSent: vi.fn(),
      markNotificationJobFailed: vi.fn(),
    };
    const provider: EmailProvider = {
      send: vi.fn(async () => ({ providerMessageId: "provider_1" })),
    };

    const result = await processNotificationJobs({ now, batchSize: 2, maxAttempts: 3 }, repository, provider);

    expect(result).toEqual({ processed: 2, sent: 2, failed: 0 });
    expect(repository.claimDueNotificationJobs).toHaveBeenCalledWith({
      now,
      batchSize: 2,
      maxAttempts: 3,
    });
    expect(provider.send).toHaveBeenCalledTimes(2);
    expect(repository.markNotificationJobSent).toHaveBeenCalledWith({
      id: "job_1",
      providerMessageId: "provider_1",
      sentAt: now,
    });
  });

  it("records failed sends with incremented attempts and retry time", async () => {
    const repository: NotificationSchedulerRepository = {
      claimDueNotificationJobs: vi.fn(async () => [job({ id: "job_1", attempts: 1 })]),
      markNotificationJobSent: vi.fn(),
      markNotificationJobFailed: vi.fn(),
    };
    const provider: EmailProvider = {
      send: vi.fn(async () => {
        throw new Error("SMTP unavailable");
      }),
    };

    const result = await processNotificationJobs({ now, batchSize: 1, maxAttempts: 3 }, repository, provider);

    expect(result).toEqual({ processed: 1, sent: 0, failed: 1 });
    expect(repository.markNotificationJobFailed).toHaveBeenCalledWith({
      id: "job_1",
      attempts: 2,
      lastError: "SMTP unavailable",
      nextRunAt: new Date("2026-06-12T10:10:00.000Z"),
    });
    expect(repository.markNotificationJobSent).not.toHaveBeenCalled();
  });

  it("clamps batch size to fifty", async () => {
    const repository: NotificationSchedulerRepository = {
      claimDueNotificationJobs: vi.fn(async () => []),
      markNotificationJobSent: vi.fn(),
      markNotificationJobFailed: vi.fn(),
    };
    const provider: EmailProvider = {
      send: vi.fn(),
    };

    await processNotificationJobs({ now, batchSize: 500, maxAttempts: 3 }, repository, provider);

    expect(repository.claimDueNotificationJobs).toHaveBeenCalledWith({
      now,
      batchSize: 50,
      maxAttempts: 3,
    });
  });

  it("passes max attempts so exhausted jobs are not claimed", async () => {
    const repository: NotificationSchedulerRepository = {
      claimDueNotificationJobs: vi.fn(async () => []),
      markNotificationJobSent: vi.fn(),
      markNotificationJobFailed: vi.fn(),
    };
    const provider: EmailProvider = {
      send: vi.fn(),
    };

    await processNotificationJobs({ now, batchSize: 5, maxAttempts: 4 }, repository, provider);

    expect(repository.claimDueNotificationJobs).toHaveBeenCalledWith({
      now,
      batchSize: 5,
      maxAttempts: 4,
    });
  });
});
