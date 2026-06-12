import { describe, expect, it } from "vitest";

import {
  renderAssignmentAssignedEmail,
  renderCertificateIssuedEmail,
  renderDueSoonEmail,
  renderManagerEscalationEmail,
  renderOverdueEmail,
} from "./templates";

const dueDate = new Date("2026-06-20T15:30:00.000Z");

describe("notification email templates", () => {
  it("renders assignment emails for learners", () => {
    const email = renderAssignmentAssignedEmail({
      learnerEmail: "ada@example.com",
      learnerName: "Ada Lovelace",
      courseTitle: "Safety Basics",
      dueDate,
      assignmentUrl: "https://learnhub.test/org/acme/learn",
    });

    expect(email).toMatchObject({
      to: "ada@example.com",
      subject: "New LearnHub assignment: Safety Basics",
    });
    expect(email.text).toContain("Safety Basics");
    expect(email.text).toContain("due on 2026-06-20");
    expect(email.html).toContain("https://learnhub.test/org/acme/learn");
  });

  it("renders due-soon reminders before the due date", () => {
    const email = renderDueSoonEmail({
      learnerEmail: "ada@example.com",
      learnerName: "Ada Lovelace",
      courseTitle: "Safety Basics",
      dueDate,
      assignmentUrl: "https://learnhub.test/org/acme/learn",
    });

    expect(email.subject).toBe("LearnHub reminder: Safety Basics is due soon");
    expect(email.text).toContain("due on 2026-06-20");
    expect(email.to).toBe("ada@example.com");
  });

  it("renders overdue reminders for incomplete assignments", () => {
    const email = renderOverdueEmail({
      learnerEmail: "ada@example.com",
      learnerName: "Ada Lovelace",
      courseTitle: "Safety Basics",
      dueDate,
      assignmentUrl: "https://learnhub.test/org/acme/learn",
    });

    expect(email.subject).toBe("Overdue LearnHub assignment: Safety Basics");
    expect(email.text).toContain("was due on 2026-06-20");
  });

  it("renders manager escalations to the manager", () => {
    const email = renderManagerEscalationEmail({
      managerEmail: "manager@example.com",
      managerName: "Grace Hopper",
      learnerName: "Ada Lovelace",
      courseTitle: "Safety Basics",
      dueDate,
      assignmentUrl: "https://learnhub.test/org/acme/admin/reports",
    });

    expect(email.to).toBe("manager@example.com");
    expect(email.subject).toBe("Manager escalation: Safety Basics is overdue");
    expect(email.text).toContain("Ada Lovelace");
  });

  it("renders certificate emails with the verification URL", () => {
    const email = renderCertificateIssuedEmail({
      learnerEmail: "ada@example.com",
      learnerName: "Ada Lovelace",
      courseTitle: "Safety Basics",
      certificateUrl: "https://learnhub.test/certificates/ABC123",
    });

    expect(email.to).toBe("ada@example.com");
    expect(email.subject).toBe("LearnHub certificate issued: Safety Basics");
    expect(email.text).toContain("https://learnhub.test/certificates/ABC123");
    expect(email.html).toContain("Safety Basics");
  });

  it("escapes user-controlled content in HTML", () => {
    const email = renderAssignmentAssignedEmail({
      learnerEmail: "ada@example.com",
      learnerName: "<script>alert(1)</script>",
      courseTitle: "Safety <Basics>",
      dueDate,
      assignmentUrl: "https://learnhub.test/org/acme/learn?token=<raw>",
    });

    expect(email.html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(email.html).toContain("Safety &lt;Basics&gt;");
    expect(email.html).toContain("token=&lt;raw&gt;");
    expect(email.html).not.toContain("<script>");
  });
});
