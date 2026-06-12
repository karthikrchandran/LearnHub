import { describe, expect, it, vi } from "vitest";

import { createPrismaNotificationRepository } from "./prisma-repository";
import type { NotificationJobUpsert } from "./notification-jobs";

const scheduledForDate = new Date("2026-06-12T00:00:00.000Z");
const nextRunAt = new Date("2026-06-12T10:00:00.000Z");

function notificationJob(): NotificationJobUpsert {
  return {
    organizationId: "org_1",
    assignmentId: "assignment_1",
    certificateId: null,
    type: "ASSIGNMENT_ASSIGNED",
    recipientEmail: "learner@example.com",
    recipientName: "Learner One",
    subject: "Subject",
    html: "<p>Hello</p>",
    text: "Hello",
    scheduledForDate,
    nextRunAt,
  };
}

function createClient() {
  return {
    notificationJob: {
      upsert: vi.fn(),
      findMany: vi.fn(async (): Promise<Array<Record<string, unknown>>> => []),
      updateMany: vi.fn(),
      update: vi.fn(),
    },
  };
}

describe("Prisma notification repository", () => {
  it("upserts jobs by organization, assignment, type, and scheduled date", async () => {
    const client = createClient();
    const repository = createPrismaNotificationRepository(
      client as unknown as Parameters<typeof createPrismaNotificationRepository>[0],
    );

    await repository.upsertNotificationJob(notificationJob());

    expect(client.notificationJob.upsert).toHaveBeenCalledWith({
      where: {
        organizationId_assignmentId_type_scheduledForDate: {
          organizationId: "org_1",
          assignmentId: "assignment_1",
          type: "ASSIGNMENT_ASSIGNED",
          scheduledForDate,
        },
      },
      update: {
        certificateId: null,
        recipientEmail: "learner@example.com",
        recipientName: "Learner One",
        subject: "Subject",
        html: "<p>Hello</p>",
        text: "Hello",
        nextRunAt,
      },
      create: {
        ...notificationJob(),
      },
    });
  });

  it("lists pending and failed jobs for a tenant", async () => {
    const client = createClient();
    const repository = createPrismaNotificationRepository(
      client as unknown as Parameters<typeof createPrismaNotificationRepository>[0],
    );

    await repository.listTenantNotificationJobs({ organizationId: "org_1" });

    expect(client.notificationJob.findMany).toHaveBeenCalledWith({
      where: {
        organizationId: "org_1",
        status: { in: ["PENDING", "FAILED"] },
      },
      orderBy: [{ status: "asc" }, { nextRunAt: "asc" }],
      take: 100,
      select: expect.any(Object),
    });
  });

  it("lists failed notification jobs across tenants for platform owners", async () => {
    const client = createClient();
    const repository = createPrismaNotificationRepository(
      client as unknown as Parameters<typeof createPrismaNotificationRepository>[0],
    );

    await repository.listPlatformNotificationFailures();

    expect(client.notificationJob.findMany).toHaveBeenCalledWith({
      where: { status: "FAILED" },
      orderBy: [{ nextRunAt: "asc" }],
      take: 100,
      select: expect.any(Object),
    });
  });

  it("claims due jobs with status, time, attempts, ordering, and batch bounds", async () => {
    const client = createClient();
    client.notificationJob.findMany.mockResolvedValueOnce([
      {
        id: "job_1",
        type: "ASSIGNMENT_DUE_SOON",
        recipientEmail: "learner@example.com",
        subject: "Subject",
        html: "<p>Hello</p>",
        text: "Hello",
        attempts: 1,
        assignment: {
          status: "COMPLETED",
        },
      },
    ]);
    const repository = createPrismaNotificationRepository(
      client as unknown as Parameters<typeof createPrismaNotificationRepository>[0],
    );

    const jobs = await repository.claimDueNotificationJobs({
      now: nextRunAt,
      batchSize: 10,
      maxAttempts: 3,
    });

    expect(client.notificationJob.findMany).toHaveBeenCalledWith({
      where: {
        status: { in: ["PENDING", "FAILED"] },
        nextRunAt: { lte: nextRunAt },
        attempts: { lt: 3 },
      },
      orderBy: [{ nextRunAt: "asc" }, { createdAt: "asc" }],
      take: 10,
      select: {
        id: true,
        type: true,
        recipientEmail: true,
        subject: true,
        html: true,
        text: true,
        attempts: true,
        assignment: {
          select: {
            status: true,
          },
        },
      },
    });
    expect(client.notificationJob.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["job_1"] } },
      data: { status: "PROCESSING" },
    });
    expect(jobs).toEqual([
      {
        id: "job_1",
        type: "ASSIGNMENT_DUE_SOON",
        recipientEmail: "learner@example.com",
        subject: "Subject",
        html: "<p>Hello</p>",
        text: "Hello",
        attempts: 1,
        assignmentStatus: "COMPLETED",
      },
    ]);
  });

  it("marks sent, failed, and skipped jobs", async () => {
    const client = createClient();
    const repository = createPrismaNotificationRepository(
      client as unknown as Parameters<typeof createPrismaNotificationRepository>[0],
    );

    await repository.markNotificationJobSent({
      id: "job_1",
      providerMessageId: "provider_1",
      sentAt: nextRunAt,
    });
    await repository.markNotificationJobFailed({
      id: "job_2",
      attempts: 2,
      lastError: "SMTP unavailable",
      nextRunAt,
    });
    await repository.markNotificationJobSkipped({
      id: "job_3",
      skippedAt: nextRunAt,
      reason: "Assignment completed before delayed notification delivery",
    });

    expect(client.notificationJob.update).toHaveBeenCalledWith({
      where: { id: "job_1" },
      data: {
        status: "SENT",
        providerMessageId: "provider_1",
        sentAt: nextRunAt,
        lastError: null,
      },
    });
    expect(client.notificationJob.update).toHaveBeenCalledWith({
      where: { id: "job_2" },
      data: {
        status: "FAILED",
        attempts: 2,
        lastError: "SMTP unavailable",
        nextRunAt,
      },
    });
    expect(client.notificationJob.update).toHaveBeenCalledWith({
      where: { id: "job_3" },
      data: {
        status: "SKIPPED",
        sentAt: nextRunAt,
        lastError: "Assignment completed before delayed notification delivery",
      },
    });
  });
});
