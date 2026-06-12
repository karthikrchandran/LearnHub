import type { Prisma, PrismaClient } from "@prisma/client";

import type { ProvisionOrganizationRepository } from "./provisioning";
import type { OrganizationSettingsRepository } from "./settings";

type PrismaOrganizationClient = Pick<PrismaClient, "organization">;
type PrismaOrganizationSettingsClient = Pick<PrismaClient, "organization" | "auditLog">;

export function createPrismaProvisionOrganizationRepository(
  client: PrismaOrganizationClient,
): ProvisionOrganizationRepository {
  return {
    createOrganization(data) {
      return client.organization.create({
        data,
        select: {
          id: true,
          slug: true,
        },
      });
    },
  };
}

export function createPrismaOrganizationSettingsRepository(
  client: PrismaOrganizationSettingsClient,
): OrganizationSettingsRepository {
  return {
    findOrganizationSettings(input) {
      return client.organization.findUnique({
        where: { id: input.organizationId },
        select: {
          id: true,
          name: true,
          slug: true,
          status: true,
          allowedEmailDomains: true,
          logoUrl: true,
          primaryColor: true,
          accentColor: true,
          enrollmentPolicy: true,
          globalLibraryEnabled: true,
          allowAdminBranding: true,
        },
      });
    },
    saveOrganizationSettings(data) {
      const { id, ...settings } = data;

      return client.organization.update({
        where: { id },
        data: settings,
        select: {
          id: true,
          name: true,
          slug: true,
          status: true,
          allowedEmailDomains: true,
          logoUrl: true,
          primaryColor: true,
          accentColor: true,
          enrollmentPolicy: true,
          globalLibraryEnabled: true,
          allowAdminBranding: true,
        },
      });
    },
    async recordAuditLog(data) {
      await client.auditLog.create({
        data: {
          organizationId: data.organizationId,
          actorId: data.actorId,
          action: data.action,
          targetType: data.targetType,
          targetId: data.targetId,
          metadata: data.metadata as Prisma.InputJsonObject,
        },
      });
    },
  };
}
