import type { UserImportPlan, UserImportRole, UserImportStatus } from "./csv-import";

export type CommitUserImportInput = {
  organizationId: string;
  actorId: string;
  plan: UserImportPlan;
  now: Date;
};

export type CommitUserImportRepository = {
  upsertUser(data: {
    email: string;
    firstName: string;
    lastName: string;
    status: UserImportStatus;
  }): Promise<{ id: string; email: string }>;
  upsertMembership(data: {
    organizationId: string;
    userId: string;
    roles: UserImportRole[];
    employeeId: string | null;
    department: string | null;
    title: string | null;
    status: UserImportStatus;
  }): Promise<{ id: string; userId: string; email: string }>;
  setMembershipManager(data: {
    organizationId: string;
    membershipId: string;
    managerMembershipId: string | null;
  }): Promise<void>;
  createInvitation(data: {
    organizationId: string;
    membershipId: string;
    userId: string;
    now: Date;
  }): Promise<void>;
  recordAuditLog(data: {
    organizationId: string;
    actorId: string;
    importedCount: number;
  }): Promise<void>;
};

type ImportedMembership = {
  id: string;
  userId: string;
  email: string;
  managerEmail: string | null;
  status: UserImportStatus;
};

export async function commitUserImport(
  input: CommitUserImportInput,
  repository: CommitUserImportRepository,
): Promise<{ importedCount: number }> {
  if (input.plan.errors.length > 0) {
    throw new Error("Cannot commit a user import plan with validation errors");
  }

  const memberships: ImportedMembership[] = [];
  const membershipsByEmail = new Map<string, ImportedMembership>();

  for (const row of input.plan.rows) {
    const user = await repository.upsertUser({
      email: row.email,
      firstName: row.firstName,
      lastName: row.lastName,
      status: row.status,
    });
    const membership = await repository.upsertMembership({
      organizationId: input.organizationId,
      userId: user.id,
      roles: [row.role],
      employeeId: row.employeeId,
      department: row.department,
      title: row.title,
      status: row.status,
    });
    const importedMembership = {
      id: membership.id,
      userId: user.id,
      email: user.email,
      managerEmail: row.managerEmail,
      status: row.status,
    };

    memberships.push(importedMembership);
    membershipsByEmail.set(user.email, importedMembership);
  }

  for (const membership of memberships) {
    await repository.setMembershipManager({
      organizationId: input.organizationId,
      membershipId: membership.id,
      managerMembershipId: membership.managerEmail ? membershipsByEmail.get(membership.managerEmail)?.id ?? null : null,
    });
  }

  for (const membership of memberships) {
    if (membership.status !== "INVITED") {
      continue;
    }

    await repository.createInvitation({
      organizationId: input.organizationId,
      membershipId: membership.id,
      userId: membership.userId,
      now: input.now,
    });
  }

  await repository.recordAuditLog({
    organizationId: input.organizationId,
    actorId: input.actorId,
    importedCount: input.plan.rows.length,
  });

  return { importedCount: input.plan.rows.length };
}
