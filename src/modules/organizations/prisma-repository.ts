import type { PrismaClient } from "@prisma/client";

import type { ProvisionOrganizationRepository } from "./provisioning";

type PrismaOrganizationClient = Pick<PrismaClient, "organization">;

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
