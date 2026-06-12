import { beforeEach, describe, expect, it, vi } from "vitest";

import { createEmailProviderFromEnv } from "@/modules/providers/email/email-provider";
import { createPrismaNotificationRepository } from "@/modules/notifications/prisma-repository";
import { processNotificationJobs } from "@/modules/notifications/scheduler";

import { POST } from "./route";

const mocks = vi.hoisted(() => ({
  repository: { claimDueNotificationJobs: vi.fn(), markNotificationJobSent: vi.fn(), markNotificationJobFailed: vi.fn() },
  provider: { send: vi.fn() },
  processNotificationJobs: vi.fn(),
}));

vi.mock("@/lib/env", () => ({
  env: {
    EMAIL_PROVIDER: "console",
    NOTIFICATION_JOBS_SECRET: "jobs-secret",
  },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    notificationJob: {},
  },
}));

vi.mock("@/modules/providers/email/email-provider", () => ({
  createEmailProviderFromEnv: vi.fn(() => mocks.provider),
}));

vi.mock("@/modules/notifications/prisma-repository", () => ({
  createPrismaNotificationRepository: vi.fn(() => mocks.repository),
}));

vi.mock("@/modules/notifications/scheduler", () => ({
  processNotificationJobs: vi.fn(() => Promise.resolve({ processed: 2, sent: 1, failed: 1 })),
}));

describe("notification jobs cron route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("requires the shared jobs secret", async () => {
    const response = await POST(new Request("https://learnhub.test/api/jobs/notifications"));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Notification jobs secret is required" });
  });

  it("processes a bounded batch when the secret is valid", async () => {
    const response = await POST(
      new Request("https://learnhub.test/api/jobs/notifications?batchSize=10", {
        method: "POST",
        headers: {
          Authorization: "Bearer jobs-secret",
        },
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ processed: 2, sent: 1, failed: 1 });
    expect(createPrismaNotificationRepository).toHaveBeenCalledTimes(1);
    expect(createEmailProviderFromEnv).toHaveBeenCalledTimes(1);
    expect(processNotificationJobs).toHaveBeenCalledWith(
      {
        now: expect.any(Date),
        batchSize: 10,
        maxAttempts: 3,
      },
      mocks.repository,
      mocks.provider,
    );
  });
});
