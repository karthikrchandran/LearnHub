export type NotificationEmailContent = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

export type LearnerNotificationTemplateInput = {
  learnerEmail: string;
  learnerName: string;
  courseTitle: string;
  dueDate: Date;
  assignmentUrl: string;
};

export type ManagerEscalationTemplateInput = {
  managerEmail: string;
  managerName: string | null;
  learnerName: string;
  courseTitle: string;
  dueDate: Date;
  assignmentUrl: string;
};

export type CertificateIssuedTemplateInput = {
  learnerEmail: string;
  learnerName: string;
  courseTitle: string;
  certificateUrl: string;
};

export function renderAssignmentAssignedEmail(input: LearnerNotificationTemplateInput): NotificationEmailContent {
  const dueDate = formatDate(input.dueDate);
  const text = [
    `Hi ${input.learnerName},`,
    "",
    `You have a new LearnHub assignment: ${input.courseTitle}.`,
    `It is due on ${dueDate}.`,
    `Open the assignment: ${input.assignmentUrl}`,
  ].join("\n");

  return {
    to: input.learnerEmail,
    subject: `New LearnHub assignment: ${input.courseTitle}`,
    html: learnerHtml({
      greetingName: input.learnerName,
      title: "You have a new LearnHub assignment",
      body: `${input.courseTitle} is due on ${dueDate}.`,
      actionUrl: input.assignmentUrl,
      actionLabel: "Open assignment",
    }),
    text,
  };
}

export function renderDueSoonEmail(input: LearnerNotificationTemplateInput): NotificationEmailContent {
  const dueDate = formatDate(input.dueDate);
  const text = [
    `Hi ${input.learnerName},`,
    "",
    `${input.courseTitle} is due on ${dueDate}.`,
    `Open the assignment: ${input.assignmentUrl}`,
  ].join("\n");

  return {
    to: input.learnerEmail,
    subject: `LearnHub reminder: ${input.courseTitle} is due soon`,
    html: learnerHtml({
      greetingName: input.learnerName,
      title: "Your LearnHub assignment is due soon",
      body: `${input.courseTitle} is due on ${dueDate}.`,
      actionUrl: input.assignmentUrl,
      actionLabel: "Continue assignment",
    }),
    text,
  };
}

export function renderOverdueEmail(input: LearnerNotificationTemplateInput): NotificationEmailContent {
  const dueDate = formatDate(input.dueDate);
  const text = [
    `Hi ${input.learnerName},`,
    "",
    `${input.courseTitle} was due on ${dueDate} and is still incomplete.`,
    `Open the assignment: ${input.assignmentUrl}`,
  ].join("\n");

  return {
    to: input.learnerEmail,
    subject: `Overdue LearnHub assignment: ${input.courseTitle}`,
    html: learnerHtml({
      greetingName: input.learnerName,
      title: "Your LearnHub assignment is overdue",
      body: `${input.courseTitle} was due on ${dueDate} and is still incomplete.`,
      actionUrl: input.assignmentUrl,
      actionLabel: "Complete assignment",
    }),
    text,
  };
}

export function renderManagerEscalationEmail(input: ManagerEscalationTemplateInput): NotificationEmailContent {
  const dueDate = formatDate(input.dueDate);
  const managerName = input.managerName?.trim() || "Manager";
  const text = [
    `Hi ${managerName},`,
    "",
    `${input.learnerName} has not completed ${input.courseTitle}.`,
    `The assignment was due on ${dueDate}.`,
    `Review the learner progress: ${input.assignmentUrl}`,
  ].join("\n");

  return {
    to: input.managerEmail,
    subject: `Manager escalation: ${input.courseTitle} is overdue`,
    html: learnerHtml({
      greetingName: managerName,
      title: "A direct report has an overdue LearnHub assignment",
      body: `${input.learnerName} has not completed ${input.courseTitle}, which was due on ${dueDate}.`,
      actionUrl: input.assignmentUrl,
      actionLabel: "Review progress",
    }),
    text,
  };
}

export function renderCertificateIssuedEmail(input: CertificateIssuedTemplateInput): NotificationEmailContent {
  const text = [
    `Hi ${input.learnerName},`,
    "",
    `Your LearnHub certificate for ${input.courseTitle} has been issued.`,
    `View the certificate: ${input.certificateUrl}`,
  ].join("\n");

  return {
    to: input.learnerEmail,
    subject: `LearnHub certificate issued: ${input.courseTitle}`,
    html: learnerHtml({
      greetingName: input.learnerName,
      title: "Your LearnHub certificate has been issued",
      body: `Your certificate for ${input.courseTitle} is ready.`,
      actionUrl: input.certificateUrl,
      actionLabel: "View certificate",
    }),
    text,
  };
}

function learnerHtml(input: {
  greetingName: string;
  title: string;
  body: string;
  actionUrl: string;
  actionLabel: string;
}): string {
  return [
    "<main>",
    `<p>Hi ${escapeHtml(input.greetingName)},</p>`,
    `<h1>${escapeHtml(input.title)}</h1>`,
    `<p>${escapeHtml(input.body)}</p>`,
    `<p><a href="${escapeHtml(input.actionUrl)}">${escapeHtml(input.actionLabel)}</a></p>`,
    "</main>",
  ].join("");
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
