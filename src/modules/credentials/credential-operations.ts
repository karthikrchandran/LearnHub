import type { CredentialProvider } from "../providers/credentials/credential-provider";

export type CredentialProviderName = "CREDLY";
export type CredentialIssuanceStatus = "PENDING" | "SUCCEEDED" | "FAILED";

export type CredentialRetryCertificate = {
  id: string;
  organizationId: string;
  courseId: string;
  learnerName: string;
  learnerEmail: string;
  issuedAt: Date;
  course: {
    credentialProvider: CredentialProviderName | null;
    credentialTemplateId: string | null;
  };
  latestCredentialIssuance: CredentialIssuanceRecord | null;
};

export type CredentialIssuanceRecord = {
  id: string;
  organizationId: string;
  certificateId: string;
  provider: CredentialProviderName;
  status: CredentialIssuanceStatus;
  providerCredentialId: string | null;
  providerUrl: string | null;
  errorMessage: string | null;
  attemptedAt: Date;
};

export type CredentialInspectionRow = {
  certificateId: string;
  verificationUrl: string;
  learnerName: string;
  learnerEmail: string;
  courseTitle: string;
  issuedAt: Date;
  provider: CredentialProviderName | null;
  credentialTemplateId: string | null;
  credentialStatus: CredentialIssuanceStatus;
  providerCredentialId: string | null;
  providerUrl: string | null;
  failureMessage: string | null;
  lastAttemptedAt: Date | null;
};

export type CredentialIssuanceUpsert = {
  organizationId: string;
  certificateId: string;
  provider: CredentialProviderName;
  status: CredentialIssuanceStatus;
  providerCredentialId?: string | null;
  providerUrl?: string | null;
  errorMessage?: string | null;
  attemptedAt: Date;
};

export interface CredentialOperationsRepository {
  findCertificateForCredentialRetry(input: {
    organizationId: string;
    certificateId: string;
    provider: CredentialProviderName;
  }): Promise<CredentialRetryCertificate | null>;
  upsertCredentialIssuance(input: CredentialIssuanceUpsert): Promise<CredentialIssuanceRecord>;
}

export type RetryCredentialIssuanceInput = {
  organizationId: string;
  certificateId: string;
  provider: CredentialProviderName;
  now: Date;
};

export async function retryCredentialIssuance(
  input: RetryCredentialIssuanceInput,
  repository: CredentialOperationsRepository,
  provider: CredentialProvider,
): Promise<CredentialIssuanceRecord> {
  const certificate = await repository.findCertificateForCredentialRetry({
    organizationId: input.organizationId,
    certificateId: input.certificateId,
    provider: input.provider,
  });

  if (!certificate) {
    throw new Error("Certificate not found");
  }

  if (certificate.latestCredentialIssuance?.status === "SUCCEEDED") {
    return certificate.latestCredentialIssuance;
  }

  if (certificate.course.credentialProvider !== input.provider || !certificate.course.credentialTemplateId) {
    throw new Error("Course is not mapped to a credential template");
  }

  try {
    const result = await provider.issueCredential({
      organizationId: certificate.organizationId,
      courseId: certificate.courseId,
      learnerEmail: certificate.learnerEmail,
      learnerName: certificate.learnerName,
      issuedAt: certificate.issuedAt,
      providerTemplateId: certificate.course.credentialTemplateId,
    });

    return repository.upsertCredentialIssuance({
      organizationId: certificate.organizationId,
      certificateId: certificate.id,
      provider: input.provider,
      status: "SUCCEEDED",
      providerCredentialId: result.providerCredentialId,
      providerUrl: result.providerUrl ?? null,
      errorMessage: null,
      attemptedAt: input.now,
    });
  } catch (error) {
    return repository.upsertCredentialIssuance({
      organizationId: certificate.organizationId,
      certificateId: certificate.id,
      provider: input.provider,
      status: "FAILED",
      providerCredentialId: null,
      providerUrl: null,
      errorMessage: error instanceof Error ? error.message : "Credential provider failed",
      attemptedAt: input.now,
    });
  }
}
