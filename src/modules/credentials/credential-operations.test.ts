import { describe, expect, it, vi } from "vitest";

import { retryCredentialIssuance, type CredentialOperationsRepository } from "./credential-operations";

function repository(
  certificate: Awaited<ReturnType<CredentialOperationsRepository["findCertificateForCredentialRetry"]>>,
): CredentialOperationsRepository & {
  upserts: Parameters<CredentialOperationsRepository["upsertCredentialIssuance"]>[0][];
} {
  const upserts: Parameters<CredentialOperationsRepository["upsertCredentialIssuance"]>[0][] = [];

  return {
    upserts,
    async findCertificateForCredentialRetry() {
      return certificate;
    },
    async upsertCredentialIssuance(input) {
      upserts.push(input);

      return {
        id: "issuance_1",
        ...input,
        providerCredentialId: input.providerCredentialId ?? null,
        providerUrl: input.providerUrl ?? null,
        errorMessage: input.errorMessage ?? null,
        attemptedAt: input.attemptedAt,
      };
    },
  };
}

const certificate = {
  id: "certificate_1",
  organizationId: "org_1",
  courseId: "course_1",
  learnerName: "Asha Rao",
  learnerEmail: "asha@example.com",
  issuedAt: new Date("2026-06-12T12:00:00.000Z"),
  course: {
    credentialProvider: "CREDLY" as const,
    credentialTemplateId: "template_1",
  },
  latestCredentialIssuance: {
    id: "issuance_old",
    organizationId: "org_1",
    certificateId: "certificate_1",
    provider: "CREDLY" as const,
    status: "FAILED" as const,
    providerCredentialId: null,
    providerUrl: null,
    errorMessage: "Credly unavailable",
    attemptedAt: new Date("2026-06-12T12:30:00.000Z"),
  },
};

describe("retryCredentialIssuance", () => {
  it("retries failed Credly issuance and updates one provider record for the existing certificate", async () => {
    const repo = repository(certificate);
    const provider = {
      issueCredential: vi.fn(async () => ({
        providerCredentialId: "credly_1",
        providerUrl: "https://credly.test/badges/credly_1",
      })),
    };

    const result = await retryCredentialIssuance(
      {
        organizationId: "org_1",
        certificateId: "certificate_1",
        provider: "CREDLY",
        now: new Date("2026-06-12T13:00:00.000Z"),
      },
      repo,
      provider,
    );

    expect(provider.issueCredential).toHaveBeenCalledWith({
      organizationId: "org_1",
      courseId: "course_1",
      learnerEmail: "asha@example.com",
      learnerName: "Asha Rao",
      issuedAt: new Date("2026-06-12T12:00:00.000Z"),
      providerTemplateId: "template_1",
    });
    expect(repo.upserts).toEqual([
      {
        organizationId: "org_1",
        certificateId: "certificate_1",
        provider: "CREDLY",
        status: "SUCCEEDED",
        providerCredentialId: "credly_1",
        providerUrl: "https://credly.test/badges/credly_1",
        errorMessage: null,
        attemptedAt: new Date("2026-06-12T13:00:00.000Z"),
      },
    ]);
    expect(result.status).toBe("SUCCEEDED");
  });

  it("does not reissue an already succeeded provider credential", async () => {
    const repo = repository({
      ...certificate,
      latestCredentialIssuance: {
        id: "issuance_1",
        organizationId: "org_1",
        certificateId: "certificate_1",
        provider: "CREDLY" as const,
        status: "SUCCEEDED",
        providerCredentialId: "credly_1",
        providerUrl: "https://credly.test/badges/credly_1",
        errorMessage: null,
        attemptedAt: new Date("2026-06-12T12:30:00.000Z"),
      },
    });
    const provider = {
      issueCredential: vi.fn(),
    };

    await expect(
      retryCredentialIssuance(
        {
          organizationId: "org_1",
          certificateId: "certificate_1",
          provider: "CREDLY",
          now: new Date("2026-06-12T13:00:00.000Z"),
        },
        repo,
        provider,
      ),
    ).resolves.toMatchObject({ status: "SUCCEEDED", providerCredentialId: "credly_1" });
    expect(provider.issueCredential).not.toHaveBeenCalled();
    expect(repo.upserts).toEqual([]);
  });

  it("records failed retry state without creating a certificate", async () => {
    const repo = repository(certificate);
    const provider = {
      issueCredential: vi.fn(async () => {
        throw new Error("Credly unavailable");
      }),
    };

    await expect(
      retryCredentialIssuance(
        {
          organizationId: "org_1",
          certificateId: "certificate_1",
          provider: "CREDLY",
          now: new Date("2026-06-12T13:00:00.000Z"),
        },
        repo,
        provider,
      ),
    ).resolves.toMatchObject({ status: "FAILED", errorMessage: "Credly unavailable" });

    expect(repo.upserts).toEqual([
      expect.objectContaining({
        organizationId: "org_1",
        certificateId: "certificate_1",
        provider: "CREDLY",
        status: "FAILED",
        errorMessage: "Credly unavailable",
      }),
    ]);
  });
});
