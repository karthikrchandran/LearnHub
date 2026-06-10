import { describe, expect, it, vi } from "vitest";

import { createPrismaUserImportRepository } from "./prisma-repository";

describe("createPrismaUserImportRepository", () => {
  it("does not downgrade an existing global user status during organization import", async () => {
    const upsert = vi.fn(async () => ({ id: "user_1", email: "learner@acme.test" }));
    const repository = createPrismaUserImportRepository({
      $transaction: vi.fn(),
      user: { upsert },
      organizationMembership: {} as never,
      auditLog: {} as never,
      userInvitationToken: {} as never,
      passwordResetToken: {} as never,
    });

    await repository.upsertUser({
      email: "learner@acme.test",
      firstName: "Leela",
      lastName: "Learner",
      status: "INACTIVE",
    });

    expect(upsert).toHaveBeenCalledWith({
      where: { email: "learner@acme.test" },
      update: {
        firstName: "Leela",
        lastName: "Learner",
      },
      create: {
        email: "learner@acme.test",
        firstName: "Leela",
        lastName: "Learner",
        status: "INACTIVE",
      },
      select: {
        id: true,
        email: true,
      },
    });
  });

  it("resolves only active manager memberships as existing managers", async () => {
    const findFirst = vi.fn(async () => null);
    const repository = createPrismaUserImportRepository({
      $transaction: vi.fn(),
      user: {} as never,
      organizationMembership: { findFirst },
      auditLog: {} as never,
      userInvitationToken: {} as never,
      passwordResetToken: {} as never,
    });

    await repository.findMembershipByOrganizationAndEmail({
      organizationId: "org_1",
      email: "manager@acme.test",
    });

    expect(findFirst).toHaveBeenCalledWith({
      where: {
        organizationId: "org_1",
        status: "ACTIVE",
        roles: { has: "MANAGER" },
        user: { email: "manager@acme.test" },
      },
      select: {
        id: true,
        userId: true,
        user: {
          select: {
            email: true,
          },
        },
      },
    });
  });
});
