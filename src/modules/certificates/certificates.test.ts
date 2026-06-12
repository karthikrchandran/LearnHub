import { describe, expect, it, vi } from "vitest";

import { issueCertificateForCompletedAssignment, type CertificateRepository } from "./certificates";

function createRepository(
  assignment: Awaited<ReturnType<CertificateRepository["findAssignmentForCertificate"]>>,
  existingCertificate: Awaited<ReturnType<CertificateRepository["findCertificateByAssignment"]>> = null,
): CertificateRepository & {
  createdCertificates: Parameters<CertificateRepository["createCertificate"]>[0][];
} {
  const createdCertificates: Parameters<CertificateRepository["createCertificate"]>[0][] = [];

  return {
    createdCertificates,
    async findAssignmentForCertificate() {
      return assignment;
    },
    async findCertificateByAssignment() {
      return existingCertificate;
    },
    async createCertificate(data) {
      createdCertificates.push(data);
      return {
        id: "certificate_1",
        verificationCode: data.verificationCode,
        verificationUrl: data.verificationUrl,
        issuedAt: data.issuedAt,
      };
    },
  };
}

const completedAssignment = {
  id: "assignment_1",
  organizationId: "org_1",
  courseId: "course_1",
  membershipId: "membership_1",
  userId: "user_1",
  learnerName: "Asha Rao",
  learnerEmail: "asha@example.com",
  courseTitle: "Safety Basics",
  status: "COMPLETED" as const,
};

describe("issueCertificateForCompletedAssignment", () => {
  it("creates a public verification certificate for completed assignments", async () => {
    const repository = createRepository(completedAssignment);
    const notifications = {
      scheduleCertificateNotification: vi.fn(),
    };

    const certificate = await issueCertificateForCompletedAssignment(
      {
        organizationId: "org_1",
        assignmentId: "assignment_1",
        appBaseUrl: "https://learnhub.example",
        now: new Date("2026-06-09T12:00:00.000Z"),
      },
      repository,
      notifications,
    );

    expect(certificate.verificationUrl).toMatch(/^https:\/\/learnhub\.example\/certificates\/[A-Z0-9]{16}$/);
    expect(repository.createdCertificates[0]).toMatchObject({
      organizationId: "org_1",
      assignmentId: "assignment_1",
      courseId: "course_1",
      membershipId: "membership_1",
      userId: "user_1",
      learnerName: "Asha Rao",
      learnerEmail: "asha@example.com",
      courseTitle: "Safety Basics",
      issuedAt: new Date("2026-06-09T12:00:00.000Z"),
    });
    expect(notifications.scheduleCertificateNotification).toHaveBeenCalledWith({
      organizationId: "org_1",
      assignmentId: "assignment_1",
      certificateId: "certificate_1",
      learnerEmail: "asha@example.com",
      learnerName: "Asha Rao",
      courseTitle: "Safety Basics",
      certificateUrl: certificate.verificationUrl,
      now: new Date("2026-06-09T12:00:00.000Z"),
    });
  });

  it("returns the existing certificate without creating another record", async () => {
    const existing = {
      id: "certificate_existing",
      verificationCode: "ABCDEF1234567890",
      verificationUrl: "https://learnhub.example/certificates/ABCDEF1234567890",
      issuedAt: new Date("2026-06-09T12:00:00.000Z"),
    };
    const repository = createRepository(completedAssignment, existing);
    const notifications = {
      scheduleCertificateNotification: vi.fn(),
    };

    const certificate = await issueCertificateForCompletedAssignment(
      {
        organizationId: "org_1",
        assignmentId: "assignment_1",
        appBaseUrl: "https://learnhub.example",
        now: new Date("2026-06-09T12:30:00.000Z"),
      },
      repository,
      notifications,
    );

    expect(certificate).toBe(existing);
    expect(repository.createdCertificates).toEqual([]);
    expect(notifications.scheduleCertificateNotification).not.toHaveBeenCalled();
  });

  it("does not fail certificate issuance when notification enqueue fails after certificate creation", async () => {
    const repository = createRepository(completedAssignment);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

    try {
      await expect(
        issueCertificateForCompletedAssignment(
          {
            organizationId: "org_1",
            assignmentId: "assignment_1",
            appBaseUrl: "https://learnhub.example",
            now: new Date("2026-06-09T12:00:00.000Z"),
          },
          repository,
          {
            scheduleCertificateNotification: async () => {
              throw new Error("Notification database unavailable");
            },
          },
        ),
      ).resolves.toMatchObject({ id: "certificate_1" });

      expect(repository.createdCertificates).toHaveLength(1);
      expect(error).toHaveBeenCalledWith("Notification enqueue failed after certificate commit", {
        organizationId: "org_1",
        assignmentId: "assignment_1",
        certificateId: "certificate_1",
        error: "Notification database unavailable",
      });
    } finally {
      error.mockRestore();
    }
  });

  it("does not require provider credential success to issue the certificate", async () => {
    const repository = createRepository(completedAssignment);

    await expect(
      issueCertificateForCompletedAssignment(
        {
          organizationId: "org_1",
          assignmentId: "assignment_1",
          appBaseUrl: "https://learnhub.example",
          now: new Date("2026-06-09T12:00:00.000Z"),
          credentialProvider: {
            async issueCredential() {
              throw new Error("Credly unavailable");
            },
          },
        },
        repository,
      ),
    ).resolves.toMatchObject({
      id: "certificate_1",
    });

    expect(repository.createdCertificates).toHaveLength(1);
  });
});
