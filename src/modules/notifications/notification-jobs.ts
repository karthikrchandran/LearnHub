import {
  renderAssignmentAssignedEmail,
  renderCertificateIssuedEmail,
  renderDueSoonEmail,
  renderManagerEscalationEmail,
  renderOverdueEmail,
} from "./templates";

export type NotificationJobType =
  | "ASSIGNMENT_ASSIGNED"
  | "ASSIGNMENT_DUE_SOON"
  | "ASSIGNMENT_OVERDUE"
  | "MANAGER_ESCALATION"
  | "CERTIFICATE_ISSUED";

export type NotificationJobStatus = "PENDING" | "PROCESSING" | "SENT" | "FAILED" | "SKIPPED";

export type NotificationJobUpsert = {
  organizationId: string;
  assignmentId: string;
  certificateId?: string | null;
  type: NotificationJobType;
  recipientEmail: string;
  recipientName?: string | null;
  subject: string;
  html: string;
  text: string;
  scheduledForDate: Date;
  nextRunAt: Date;
};

export type AssignmentNotificationScheduleInput = {
  organizationId: string;
  assignmentId: string;
  learnerEmail: string;
  learnerName: string;
  courseTitle: string;
  dueDate: Date;
  assignmentUrl: string;
  managerEmail?: string | null;
  managerName?: string | null;
  now: Date;
};

export type CertificateNotificationScheduleInput = {
  organizationId: string;
  assignmentId: string;
  certificateId: string;
  learnerEmail: string;
  learnerName: string;
  courseTitle: string;
  certificateUrl: string;
  now: Date;
};

export interface NotificationJobWriteRepository {
  upsertNotificationJob(job: NotificationJobUpsert): Promise<void>;
}

export async function scheduleAssignmentNotifications(
  input: AssignmentNotificationScheduleInput,
  repository: NotificationJobWriteRepository,
): Promise<void> {
  const assignmentEmail = renderAssignmentAssignedEmail(input);
  const dueSoonEmail = renderDueSoonEmail(input);
  const overdueEmail = renderOverdueEmail(input);
  const dueSoonAt = laterOf(input.now, addDays(input.dueDate, -2));
  const overdueAt = addDays(input.dueDate, 1);

  await repository.upsertNotificationJob(
    buildJob({
      input,
      type: "ASSIGNMENT_ASSIGNED",
      email: assignmentEmail,
      recipientName: input.learnerName,
      nextRunAt: input.now,
    }),
  );
  await repository.upsertNotificationJob(
    buildJob({
      input,
      type: "ASSIGNMENT_DUE_SOON",
      email: dueSoonEmail,
      recipientName: input.learnerName,
      nextRunAt: dueSoonAt,
    }),
  );
  await repository.upsertNotificationJob(
    buildJob({
      input,
      type: "ASSIGNMENT_OVERDUE",
      email: overdueEmail,
      recipientName: input.learnerName,
      nextRunAt: overdueAt,
    }),
  );

  if (input.managerEmail?.trim()) {
    const escalationEmail = renderManagerEscalationEmail({
      managerEmail: input.managerEmail,
      managerName: input.managerName ?? null,
      learnerName: input.learnerName,
      courseTitle: input.courseTitle,
      dueDate: input.dueDate,
      assignmentUrl: input.assignmentUrl,
    });

    await repository.upsertNotificationJob(
      buildJob({
        input,
        type: "MANAGER_ESCALATION",
        email: escalationEmail,
        recipientName: input.managerName ?? null,
        nextRunAt: addDays(input.dueDate, 3),
      }),
    );
  }
}

export async function scheduleCertificateNotification(
  input: CertificateNotificationScheduleInput,
  repository: NotificationJobWriteRepository,
): Promise<void> {
  const email = renderCertificateIssuedEmail(input);

  await repository.upsertNotificationJob({
    organizationId: input.organizationId,
    assignmentId: input.assignmentId,
    certificateId: input.certificateId,
    type: "CERTIFICATE_ISSUED",
    recipientEmail: email.to,
    recipientName: input.learnerName,
    subject: email.subject,
    html: email.html,
    text: email.text,
    scheduledForDate: startOfUtcDay(input.now),
    nextRunAt: input.now,
  });
}

export function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function buildJob(input: {
  input: AssignmentNotificationScheduleInput;
  type: Exclude<NotificationJobType, "CERTIFICATE_ISSUED">;
  email: { to: string; subject: string; html: string; text: string };
  recipientName: string | null;
  nextRunAt: Date;
}): NotificationJobUpsert {
  return {
    organizationId: input.input.organizationId,
    assignmentId: input.input.assignmentId,
    type: input.type,
    recipientEmail: input.email.to,
    recipientName: input.recipientName,
    subject: input.email.subject,
    html: input.email.html,
    text: input.email.text,
    scheduledForDate: startOfUtcDay(input.nextRunAt),
    nextRunAt: input.nextRunAt,
  };
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);

  return result;
}

function laterOf(first: Date, second: Date): Date {
  return first.getTime() > second.getTime() ? first : second;
}
