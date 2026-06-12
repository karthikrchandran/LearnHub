import type { PrismaClient } from "@prisma/client";

import type {
  CredentialInspectionRow,
  CredentialOperationsRepository,
  CredentialProviderName,
} from "./credential-operations";

type PrismaCredentialOperationsClient = Pick<PrismaClient, "certificate" | "credentialIssuance">;

const credentialIssuanceSelect = {
  id: true,
  organizationId: true,
  certificateId: true,
  provider: true,
  status: true,
  providerCredentialId: true,
  providerUrl: true,
  errorMessage: true,
  attemptedAt: true,
} as const;

export function createPrismaCredentialOperationsRepository(
  client: PrismaCredentialOperationsClient,
): CredentialOperationsRepository & {
  listCredentialOperations(input: { organizationId: string; take?: number }): Promise<CredentialInspectionRow[]>;
} {
  return {
    async findCertificateForCredentialRetry(input) {
      const certificate = await client.certificate.findFirst({
        where: {
          id: input.certificateId,
          organizationId: input.organizationId,
        },
        select: {
          id: true,
          organizationId: true,
          courseId: true,
          learnerName: true,
          learnerEmail: true,
          issuedAt: true,
          course: {
            select: {
              credentialProvider: true,
              credentialTemplateId: true,
            },
          },
          credentialIssuances: {
            where: { provider: input.provider },
            orderBy: { attemptedAt: "desc" },
            take: 1,
            select: credentialIssuanceSelect,
          },
        },
      });

      if (!certificate) {
        return null;
      }

      return {
        id: certificate.id,
        organizationId: certificate.organizationId,
        courseId: certificate.courseId,
        learnerName: certificate.learnerName,
        learnerEmail: certificate.learnerEmail,
        issuedAt: certificate.issuedAt,
        course: {
          credentialProvider: certificate.course.credentialProvider,
          credentialTemplateId: certificate.course.credentialTemplateId,
        },
        latestCredentialIssuance: certificate.credentialIssuances[0] ?? null,
      };
    },
    async upsertCredentialIssuance(input) {
      return client.credentialIssuance.upsert({
        where: {
          organizationId_certificateId_provider: {
            organizationId: input.organizationId,
            certificateId: input.certificateId,
            provider: input.provider,
          },
        },
        create: {
          organizationId: input.organizationId,
          certificateId: input.certificateId,
          provider: input.provider,
          status: input.status,
          providerCredentialId: input.providerCredentialId ?? null,
          providerUrl: input.providerUrl ?? null,
          errorMessage: input.errorMessage ?? null,
          attemptedAt: input.attemptedAt,
        },
        update: {
          status: input.status,
          providerCredentialId: input.providerCredentialId ?? null,
          providerUrl: input.providerUrl ?? null,
          errorMessage: input.errorMessage ?? null,
          attemptedAt: input.attemptedAt,
        },
        select: credentialIssuanceSelect,
      });
    },
    async listCredentialOperations(input) {
      const certificates = await client.certificate.findMany({
        where: { organizationId: input.organizationId },
        orderBy: { issuedAt: "desc" },
        take: input.take ?? 100,
        select: {
          id: true,
          verificationUrl: true,
          learnerName: true,
          learnerEmail: true,
          courseTitle: true,
          issuedAt: true,
          course: {
            select: {
              credentialProvider: true,
              credentialTemplateId: true,
            },
          },
          credentialIssuances: {
            orderBy: { attemptedAt: "desc" },
            take: 1,
            select: credentialIssuanceSelect,
          },
        },
      });

      return certificates.map((certificate) => {
        const issuance = certificate.credentialIssuances[0] ?? null;

        return {
          certificateId: certificate.id,
          verificationUrl: certificate.verificationUrl,
          learnerName: certificate.learnerName,
          learnerEmail: certificate.learnerEmail,
          courseTitle: certificate.courseTitle,
          issuedAt: certificate.issuedAt,
          provider: certificate.course.credentialProvider as CredentialProviderName | null,
          credentialTemplateId: certificate.course.credentialTemplateId,
          credentialStatus: issuance?.status ?? "PENDING",
          providerCredentialId: issuance?.providerCredentialId ?? null,
          providerUrl: issuance?.providerUrl ?? null,
          failureMessage: issuance?.errorMessage ?? null,
          lastAttemptedAt: issuance?.attemptedAt ?? null,
        };
      });
    },
  };
}
