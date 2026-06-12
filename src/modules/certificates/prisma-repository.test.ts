import { describe, expect, it, vi } from "vitest";

import { createPrismaCertificateRepository } from "./prisma-repository";

function createCertificateClient() {
  return {
    courseAssignment: {
      findFirst: vi.fn(),
    },
    certificate: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    credentialIssuance: {
      create: vi.fn(),
    },
    notificationEnqueueFailure: {
      create: vi.fn(async () => ({})),
    },
  };
}

describe("createPrismaCertificateRepository", () => {
  it("records failed notification enqueue attempts with retry metadata", async () => {
    const client = createCertificateClient();
    const repository = createPrismaCertificateRepository(
      client as unknown as Parameters<typeof createPrismaCertificateRepository>[0],
    );
    const payload = {
      organizationId: "org_1",
      assignmentId: "assignment_1",
      certificateId: "certificate_1",
      learnerEmail: "learner@example.com",
    };

    await repository.recordNotificationEnqueueFailure!({
      organizationId: "org_1",
      assignmentId: "assignment_1",
      certificateId: "certificate_1",
      operation: "CERTIFICATE_NOTIFICATION",
      payload,
      lastError: "Notification database unavailable",
      failedAt: new Date("2026-06-12T13:00:00.000Z"),
      retryAt: new Date("2026-06-12T13:05:00.000Z"),
    });

    expect(client.notificationEnqueueFailure.create).toHaveBeenCalledWith({
      data: {
        organizationId: "org_1",
        assignmentId: "assignment_1",
        certificateId: "certificate_1",
        operation: "CERTIFICATE_NOTIFICATION",
        payload,
        lastError: "Notification database unavailable",
        failedAt: new Date("2026-06-12T13:00:00.000Z"),
        retryAt: new Date("2026-06-12T13:05:00.000Z"),
      },
    });
  });
});
