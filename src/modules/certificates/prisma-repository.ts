import type { PrismaClient } from "@prisma/client";

import type { CertificateRepository } from "./certificates";

type PrismaCertificateClient = Pick<PrismaClient, "courseAssignment" | "certificate" | "credentialIssuance">;

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
      await client.credentialIssuance.create({
        data: input,
      });
    },
  };
}
