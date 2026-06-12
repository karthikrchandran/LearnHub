import { Prisma, type PrismaClient } from "@prisma/client";

import type { CertificateRepository } from "./certificates";

type PrismaCertificateClient = Pick<
  PrismaClient,
  "courseAssignment" | "certificate" | "credentialIssuance" | "notificationEnqueueFailure"
>;

export function createPrismaCertificateRepository(client: PrismaCertificateClient): CertificateRepository {
  return {
    async findAssignmentForCertificate(input) {
      const assignment = await client.courseAssignment.findFirst({
        where: {
          id: input.assignmentId,
          organizationId: input.organizationId,
        },
        select: {
          id: true,
          organizationId: true,
          courseId: true,
          membershipId: true,
          status: true,
          course: {
            select: {
              title: true,
              credentialProvider: true,
              credentialTemplateId: true,
              organization: {
                select: {
                  name: true,
                  logoUrl: true,
                  primaryColor: true,
                  accentColor: true,
                },
              },
            },
          },
          membership: {
            select: {
              userId: true,
              user: {
                select: {
                  email: true,
                  firstName: true,
                  lastName: true,
                },
              },
            },
          },
        },
      });

      if (!assignment) {
        return null;
      }

      return {
        id: assignment.id,
        organizationId: assignment.organizationId,
        courseId: assignment.courseId,
        membershipId: assignment.membershipId,
        userId: assignment.membership.userId,
        learnerName: `${assignment.membership.user.firstName} ${assignment.membership.user.lastName}`.trim(),
        learnerEmail: assignment.membership.user.email,
        courseTitle: assignment.course.title,
        issuerName: assignment.course.organization.name,
        issuerLogoUrl: assignment.course.organization.logoUrl,
        issuerPrimaryColor: assignment.course.organization.primaryColor,
        issuerAccentColor: assignment.course.organization.accentColor,
        credentialProvider: assignment.course.credentialProvider,
        credentialTemplateId: assignment.course.credentialTemplateId,
        status: assignment.status,
      };
    },
    async findCertificateByAssignment(input) {
      return client.certificate.findUnique({
        where: {
          organizationId_assignmentId: {
            organizationId: input.organizationId,
            assignmentId: input.assignmentId,
          },
        },
        select: {
          id: true,
          verificationCode: true,
          verificationUrl: true,
          issuedAt: true,
        },
      });
    },
    async createCertificate(input) {
      return client.certificate.create({
        data: input,
        select: {
          id: true,
          verificationCode: true,
          verificationUrl: true,
          issuedAt: true,
        },
      });
    },
    async recordCredentialIssuance(input) {
      const attemptedAt = input.attemptedAt ?? new Date();

      await client.credentialIssuance.upsert({
        where: {
          organizationId_certificateId_provider: {
            organizationId: input.organizationId,
            certificateId: input.certificateId,
            provider: input.provider,
          },
        },
        create: {
          ...input,
          attemptedAt,
        },
        update: {
          status: input.status,
          providerCredentialId: input.providerCredentialId ?? null,
          providerUrl: input.providerUrl ?? null,
          errorMessage: input.errorMessage ?? null,
          attemptedAt,
        },
      });
    },
    async recordNotificationEnqueueFailure(input) {
      await client.notificationEnqueueFailure.create({
        data: {
          ...input,
          payload: input.payload as Prisma.InputJsonValue,
        },
      });
    },
  };
}
