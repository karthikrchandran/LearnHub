import { describe, expect, it, vi } from "vitest";

import { createCommitUserImportAction, createValidateUserImportAction } from "./server-actions";
import type { CommitUserImportRepository } from "./user-import";

function formData(entries: Record<string, string>): FormData {
  const data = new FormData();

  for (const [key, value] of Object.entries(entries)) {
    data.set(key, value);
  }

  return data;
}

const validCsv = [
  "email,firstName,lastName,role,managerEmail,employeeId,department,title,status",
  "manager@acme.test,Mohan,Manager,MANAGER,,MGR-1,Operations,Manager,ACTIVE",
  "learner@acme.test,Leela,Learner,LEARNER,manager@acme.test,EMP-1,Operations,Specialist,",
].join("\n");

describe("user import server actions", () => {
  it("validates CSV using organization domains and existing managers", async () => {
    const action = createValidateUserImportAction({
      getOrganizationImportContext: vi.fn(async () => ({
        organizationId: "org_1",
        allowedEmailDomains: ["acme.test"],
        existingManagerEmails: [],
      })),
    });

    const result = await action("acme", formData({ userCsv: validCsv }));

    expect(result.status).toBe("success");
    expect(result.plan?.rows).toHaveLength(2);
    expect(result.plan?.errors).toEqual([]);
  });

  it("commits a valid CSV import for an authorized actor", async () => {
    const repository: CommitUserImportRepository = {
      runInTransaction: vi.fn(async (operation) => operation()),
      upsertUser: vi.fn(async (data) => ({ id: `user:${data.email}`, email: data.email })),
      upsertMembership: vi.fn(async (data) => ({
        id: `membership:${data.userId}`,
        userId: data.userId,
        email: data.userId.replace("user:", ""),
      })),
      findMembershipByOrganizationAndEmail: vi.fn(async () => null),
      setMembershipManager: vi.fn(),
      createInvitation: vi.fn(),
      recordAuditLog: vi.fn(),
    };
    const action = createCommitUserImportAction({
      getActor: async () => ({ userId: "admin_1" }),
      getOrganizationImportContext: async () => ({
        organizationId: "org_1",
        allowedEmailDomains: ["acme.test"],
        existingManagerEmails: [],
      }),
      repository,
      now: () => new Date("2026-06-09T12:00:00.000Z"),
    });

    const result = await action("acme", formData({ userCsv: validCsv }));

    expect(result).toEqual({
      status: "success",
      message: "Imported 2 users.",
      importedCount: 2,
    });
    expect(repository.recordAuditLog).toHaveBeenCalledWith({
      organizationId: "org_1",
      actorId: "admin_1",
      importedCount: 2,
    });
  });
});
