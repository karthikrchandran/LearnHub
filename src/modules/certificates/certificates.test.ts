import { describe, expect, it, vi } from "vitest";

import { issueCertificateForCompletedAssignment, type CertificateRepository } from "./certificates";

type NotificationEnqueueFailureRecord = {
  organizationId: string;
  assignmentId: string;
  certificateId?: string | null;
  operation: string;
  payload: unknown;
  lastError: string;
  failedAt: Date;
  retryAt: Date;
};

function createRepository(
  assignment: Awaited<ReturnType<CertificateRepository["findAssignmentForCertificate"]>>,
  existingCertificate: Awaited<ReturnType<CertificateRepository["findCertificateByAssignment"]>> = null,
): CertificateRepository & {
  createdCertificates: Parameters<CertificateRepository["createCertificate"]>[0][];
  enqueueFailures: NotificationEnqueueFailureRecord[];
} {
  const createdCertificates: Parameters<CertificateRepository["createCertificate"]>[0][] = [];
  const enqueueFailures: NotificationEnqueueFailureRecord[] = [];

  return {
    createdCertificates,
    enqueueFailures,
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
    async recordNotificationEnqueueFailure(data: NotificationEnqueueFailureRecord) {
      enqueueFailures.push(data);
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
  issuerName: "Acme Learning",
  issuerLogoUrl: "https://cdn.example/logo.png",
  issuerPrimaryColor: "#0f766e",
  issuerAccentColor: "#f59e0b",
  credentialProvider: "CREDLY" as const,
  credentialTemplateId: "template_1",
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
      issuerName: "Acme Learning",
      issuerLogoUrl: "https://cdn.example/logo.png",
      issuerPrimaryColor: "#0f766e",
      issuerAccentColor: "#f59e0b",
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
      expect(repository.enqueueFailures).toEqual([
        expect.objectContaining({
          organizationId: "org_1",
          assignmentId: "assignment_1",
          certificateId: "certificate_1",
          operation: "CERTIFICATE_NOTIFICATION",
          lastError: "Notification database unavailable",
          failedAt: new Date("2026-06-09T12:00:00.000Z"),
          retryAt: new Date("2026-06-09T12:05:00.000Z"),
        }),
      ]);
      expect(repository.enqueueFailures[0]?.payload).toMatchObject({
        organizationId: "org_1",
        assignmentId: "assignment_1",
        certificateId: "certificate_1",
        learnerEmail: "asha@example.com",
      });
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

  it("uses the course credential template mapping when issuing Credly credentials", async () => {
    const repository = createRepository(completedAssignment);
    const credentialProvider = {
      issueCredential: vi.fn(async () => ({
        providerCredentialId: "credly_1",
        providerUrl: "https://credly.test/badges/credly_1",
      })),
    };
    const credentialIssuances: unknown[] = [];
    repository.recordCredentialIssuance = async (input) => {
      credentialIssuances.push(input);
    };

    await issueCertificateForCompletedAssignment(
      {
        organizationId: "org_1",
        assignmentId: "assignment_1",
        appBaseUrl: "https://learnhub.example",
        now: new Date("2026-06-09T12:00:00.000Z"),
        credentialProvider,
      },
      repository,
    );

    expect(credentialProvider.issueCredential).toHaveBeenCalledWith({
      organizationId: "org_1",
      courseId: "course_1",
      learnerEmail: "asha@example.com",
      learnerName: "Asha Rao",
      issuedAt: new Date("2026-06-09T12:00:00.000Z"),
      providerTemplateId: "template_1",
    });
    expect(credentialIssuances).toEqual([
      expect.objectContaining({
        organizationId: "org_1",
        certificateId: "certificate_1",
        provider: "CREDLY",
        status: "SUCCEEDED",
        providerCredentialId: "credly_1",
        providerUrl: "https://credly.test/badges/credly_1",
      }),
    ]);
  });
});
