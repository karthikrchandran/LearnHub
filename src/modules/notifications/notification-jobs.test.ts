import { describe, expect, it } from "vitest";

import {
  scheduleAssignmentNotifications,
  scheduleCertificateNotification,
  type NotificationJobUpsert,
  type NotificationJobWriteRepository,
} from "./notification-jobs";

class FakeNotificationJobRepository implements NotificationJobWriteRepository {
  jobs: NotificationJobUpsert[] = [];

  async upsertNotificationJob(job: NotificationJobUpsert): Promise<void> {
    this.jobs.push(job);
  }
}

const now = new Date("2026-06-12T10:00:00.000Z");
const dueDate = new Date("2026-06-20T15:30:00.000Z");

describe("notification job scheduling", () => {
  it("schedules assignment lifecycle notifications with idempotent scheduled dates", async () => {
    const repository = new FakeNotificationJobRepository();

    await scheduleAssignmentNotifications(
      {
        organizationId: "org_1",
        assignmentId: "assignment_1",
        learnerEmail: "ada@example.com",
        learnerName: "Ada Lovelace",
        courseTitle: "Safety Basics",
        dueDate,
        assignmentUrl: "https://learnhub.test/org/acme/learn",
        managerEmail: "manager@example.com",
        managerName: "Grace Hopper",
        now,
      },
      repository,
    );

    expect(repository.jobs.map((job) => job.type)).toEqual([
      "ASSIGNMENT_ASSIGNED",
      "ASSIGNMENT_DUE_SOON",
      "ASSIGNMENT_OVERDUE",
      "MANAGER_ESCALATION",
    ]);
    expect(repository.jobs).toMatchObject([
      {
        organizationId: "org_1",
        assignmentId: "assignment_1",
        recipientEmail: "ada@example.com",
        nextRunAt: now,
        scheduledForDate: new Date("2026-06-12T00:00:00.000Z"),
      },
      {
        recipientEmail: "ada@example.com",
        nextRunAt: new Date("2026-06-18T15:30:00.000Z"),
        scheduledForDate: new Date("2026-06-18T00:00:00.000Z"),
      },
      {
        recipientEmail: "ada@example.com",
        nextRunAt: new Date("2026-06-21T15:30:00.000Z"),
        scheduledForDate: new Date("2026-06-21T00:00:00.000Z"),
      },
      {
        recipientEmail: "manager@example.com",
        nextRunAt: new Date("2026-06-23T15:30:00.000Z"),
        scheduledForDate: new Date("2026-06-23T00:00:00.000Z"),
      },
    ]);
    expect(repository.jobs[0].subject).toBe("New LearnHub assignment: Safety Basics");
    expect(repository.jobs[3].text).toContain("Ada Lovelace");
  });

  it("does not schedule manager escalation when there is no manager email", async () => {
    const repository = new FakeNotificationJobRepository();

    await scheduleAssignmentNotifications(
      {
        organizationId: "org_1",
        assignmentId: "assignment_1",
        learnerEmail: "ada@example.com",
        learnerName: "Ada Lovelace",
        courseTitle: "Safety Basics",
        dueDate,
        assignmentUrl: "https://learnhub.test/org/acme/learn",
        managerEmail: null,
        managerName: null,
        now,
      },
      repository,
    );

    expect(repository.jobs.map((job) => job.type)).toEqual([
      "ASSIGNMENT_ASSIGNED",
      "ASSIGNMENT_DUE_SOON",
      "ASSIGNMENT_OVERDUE",
    ]);
  });

  it("does not schedule reminders in the past for short-due assignments", async () => {
    const repository = new FakeNotificationJobRepository();

    await scheduleAssignmentNotifications(
      {
        organizationId: "org_1",
        assignmentId: "assignment_1",
        learnerEmail: "ada@example.com",
        learnerName: "Ada Lovelace",
        courseTitle: "Safety Basics",
        dueDate: new Date("2026-06-13T15:30:00.000Z"),
        assignmentUrl: "https://learnhub.test/org/acme/learn",
        managerEmail: null,
        managerName: null,
        now,
      },
      repository,
    );

    expect(repository.jobs.find((job) => job.type === "ASSIGNMENT_DUE_SOON")?.nextRunAt).toEqual(now);
  });

  it("schedules certificate-issued email when a certificate is created", async () => {
    const repository = new FakeNotificationJobRepository();

    await scheduleCertificateNotification(
      {
        organizationId: "org_1",
        assignmentId: "assignment_1",
        certificateId: "certificate_1",
        learnerEmail: "ada@example.com",
        learnerName: "Ada Lovelace",
        courseTitle: "Safety Basics",
        certificateUrl: "https://learnhub.test/certificates/ABC123",
        now,
      },
      repository,
    );

    expect(repository.jobs).toHaveLength(1);
    expect(repository.jobs[0]).toMatchObject({
      organizationId: "org_1",
      assignmentId: "assignment_1",
      certificateId: "certificate_1",
      type: "CERTIFICATE_ISSUED",
      recipientEmail: "ada@example.com",
      scheduledForDate: new Date("2026-06-12T00:00:00.000Z"),
      nextRunAt: now,
      subject: "LearnHub certificate issued: Safety Basics",
    });
    expect(repository.jobs[0].text).toContain("https://learnhub.test/certificates/ABC123");
  });
});
