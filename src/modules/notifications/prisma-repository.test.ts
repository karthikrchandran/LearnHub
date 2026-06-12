import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

import { createPrismaNotificationRepository } from "./prisma-repository";
import type { NotificationJobUpsert } from "./notification-jobs";

const scheduledForDate = new Date("2026-06-12T00:00:00.000Z");
const nextRunAt = new Date("2026-06-12T10:00:00.000Z");
const notificationJobsMigrationPath = "prisma/migrations/20260613040000_notification_jobs/migration.sql";

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
  const queryRaw = vi.fn(async (...args: unknown[]): Promise<Array<Record<string, unknown>>> => {
    void args;

    return [];
  });

  return {
    $queryRaw: queryRaw,
    $transaction: vi.fn(async (operation) => operation({ $queryRaw: queryRaw })),
    notificationJob: {
      upsert: vi.fn(),
      findMany: vi.fn(async (): Promise<Array<Record<string, unknown>>> => []),
      updateMany: vi.fn(),
      update: vi.fn(),
    },
    notificationEnqueueFailure: {
      findMany: vi.fn(async (): Promise<Array<Record<string, unknown>>> => []),
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
    expect(client.notificationEnqueueFailure.findMany).toHaveBeenCalledWith({
      where: {
        organizationId: "org_1",
        status: "PENDING",
      },
      orderBy: [{ retryAt: "asc" }, { createdAt: "asc" }],
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
    expect(client.notificationEnqueueFailure.findMany).toHaveBeenCalledWith({
      where: { status: "PENDING" },
      orderBy: [{ retryAt: "asc" }, { createdAt: "asc" }],
      take: 100,
      select: expect.any(Object),
    });
  });

  it("surfaces durable enqueue failures through tenant notification inspection", async () => {
    const client = createClient();
    client.notificationEnqueueFailure.findMany.mockResolvedValueOnce([
      {
        id: "enqueue_failure_1",
        organizationId: "org_1",
        assignmentId: "assignment_1",
        certificateId: null,
        operation: "ASSIGNMENT_NOTIFICATIONS",
        status: "PENDING",
        attempts: 0,
        retryAt: new Date("2026-06-12T13:05:00.000Z"),
        failedAt: new Date("2026-06-12T13:00:00.000Z"),
        lastError: "Notification database unavailable",
        organization: {
          name: "Acme",
          slug: "acme",
        },
        assignment: {
          course: {
            title: "Safety Basics",
          },
        },
      },
    ]);
    const repository = createPrismaNotificationRepository(
      client as unknown as Parameters<typeof createPrismaNotificationRepository>[0],
    );

    const jobs = await repository.listTenantNotificationJobs({ organizationId: "org_1" });

    expect(jobs).toEqual([
      expect.objectContaining({
        id: "enqueue_failure_1",
        organizationId: "org_1",
        organizationName: "Acme",
        organizationSlug: "acme",
        assignmentId: "assignment_1",
        type: "ASSIGNMENT_NOTIFICATIONS",
        status: "ENQUEUE_FAILED",
        subject: "Notification enqueue failed",
        attempts: 0,
        nextRunAt: new Date("2026-06-12T13:05:00.000Z"),
        sentAt: null,
        lastError: "Notification database unavailable",
        courseTitle: "Safety Basics",
      }),
    ]);
  });

  it("claims due jobs atomically with row locks and returns only rows updated by the claim", async () => {
    const client = createClient();
    client.$queryRaw.mockResolvedValueOnce([
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
    const repository = createPrismaNotificationRepository(
      client as unknown as Parameters<typeof createPrismaNotificationRepository>[0],
    );

    const jobs = await repository.claimDueNotificationJobs({
      now: nextRunAt,
      batchSize: 10,
      maxAttempts: 3,
      processingTimeoutMs: 15 * 60 * 1000,
    });

    expect(client.$transaction).toHaveBeenCalledTimes(1);
    expect(client.notificationJob.findMany).not.toHaveBeenCalled();
    expect(client.notificationJob.updateMany).not.toHaveBeenCalled();
    const [sqlParts, ...values] = client.$queryRaw.mock.calls[0] as [TemplateStringsArray, ...unknown[]];
    const sql = Array.from(sqlParts as TemplateStringsArray).join("?");
    expect(sql).toContain("FOR UPDATE SKIP LOCKED");
    expect(sql).toContain('UPDATE "NotificationJob"');
    expect(sql).toContain('"status" = \'PROCESSING\'');
    expect(sql).toContain('"claimedAt"');
    expect(sql).toContain("RETURNING");
    expect(values).toContainEqual(new Date("2026-06-12T09:45:00.000Z"));
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

  it("makes stale processing jobs eligible for a new atomic claim after the lease timeout", async () => {
    const client = createClient();
    const repository = createPrismaNotificationRepository(
      client as unknown as Parameters<typeof createPrismaNotificationRepository>[0],
    );

    await repository.claimDueNotificationJobs({
      now: nextRunAt,
      batchSize: 5,
      maxAttempts: 3,
      processingTimeoutMs: 30 * 60 * 1000,
    });

    const [sqlParts, ...values] = client.$queryRaw.mock.calls[0] as [TemplateStringsArray, ...unknown[]];
    const sql = Array.from(sqlParts as TemplateStringsArray).join("?");
    expect(sql).toContain("\"status\" = 'PROCESSING'");
    expect(sql).toContain('"claimedAt" <=');
    expect(values).toContainEqual(new Date("2026-06-12T09:30:00.000Z"));
  });

  it("claims due enqueue failures atomically and leases them for retry replay", async () => {
    const client = createClient();
    client.$queryRaw.mockResolvedValueOnce([
      {
        id: "enqueue_failure_1",
        operation: "ASSIGNMENT_NOTIFICATIONS",
        payload: {
          organizationId: "org_1",
          assignmentId: "assignment_1",
        },
        attempts: 1,
      },
    ]);
    const repository = createPrismaNotificationRepository(
      client as unknown as Parameters<typeof createPrismaNotificationRepository>[0],
    );

    const failures = await repository.claimDueNotificationEnqueueFailures({
      now: nextRunAt,
      batchSize: 10,
      maxAttempts: 3,
      processingTimeoutMs: 15 * 60 * 1000,
    });

    const [sqlParts, ...values] = client.$queryRaw.mock.calls[0] as [TemplateStringsArray, ...unknown[]];
    const sql = Array.from(sqlParts as TemplateStringsArray).join("?");
    expect(sql).toContain('FROM "NotificationEnqueueFailure"');
    expect(sql).toContain("FOR UPDATE SKIP LOCKED");
    expect(sql).toContain('UPDATE "NotificationEnqueueFailure"');
    expect(sql).toContain('"status" = \'PROCESSING\'');
    expect(sql).toContain("RETURNING");
    expect(values).toContainEqual(new Date("2026-06-12T10:15:00.000Z"));
    expect(failures).toEqual([
      {
        id: "enqueue_failure_1",
        operation: "ASSIGNMENT_NOTIFICATIONS",
        payload: {
          organizationId: "org_1",
          assignmentId: "assignment_1",
        },
        attempts: 1,
      },
    ]);
  });

  it("marks enqueue failures resolved or pending for retry", async () => {
    const client = createClient();
    const repository = createPrismaNotificationRepository(
      client as unknown as Parameters<typeof createPrismaNotificationRepository>[0],
    );

    await repository.markNotificationEnqueueFailureResolved({
      id: "enqueue_failure_1",
      resolvedAt: nextRunAt,
    });
    await repository.markNotificationEnqueueFailureFailed({
      id: "enqueue_failure_2",
      attempts: 2,
      lastError: "notification table unavailable",
      retryAt: nextRunAt,
    });

    expect(client.notificationEnqueueFailure.update).toHaveBeenCalledWith({
      where: { id: "enqueue_failure_1" },
      data: {
        status: "RESOLVED",
        retryAt: nextRunAt,
        lastError: null,
      },
    });
    expect(client.notificationEnqueueFailure.update).toHaveBeenCalledWith({
      where: { id: "enqueue_failure_2" },
      data: {
        status: "PENDING",
        attempts: 2,
        lastError: "notification table unavailable",
        retryAt: nextRunAt,
      },
    });
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

  it("enforces certificate notification linkage within the same tenant", () => {
    const schema = readFileSync("prisma/schema.prisma", "utf8");
    const migration = readFileSync(notificationJobsMigrationPath, "utf8");

    expect(schema).toContain(
      "certificate       Certificate?          @relation(fields: [organizationId, certificateId], references: [organizationId, id]",
    );
    expect(schema).toContain("PROCESSING");
    expect(schema).toContain("@@unique([organizationId, id])");
    expect(migration).toContain("CREATE TYPE \"NotificationEnqueueFailureStatus\" AS ENUM ('PENDING', 'PROCESSING', 'RESOLVED')");
    expect(migration).toContain(
      'FOREIGN KEY ("organizationId", "certificateId") REFERENCES "Certificate"("organizationId", "id")',
    );
  });
});
