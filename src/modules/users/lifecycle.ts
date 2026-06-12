import type { OrganizationRole, UserStatus } from "@prisma/client";

import {
  canManageOrganizationUsers,
  type MembershipAuthContext,
} from "../auth/permissions";

export type OrganizationUserLifecycleRecord = {
  id: string;
  organizationId: string;
  userId: string;
  roles: OrganizationRole[];
  status: UserStatus;
  managerMembershipId: string | null;
  employeeId: string | null;
  department: string | null;
  title: string | null;
  user: {
    email: string;
    status: UserStatus;
  };
};

export type OrganizationUserLifecycleChanges = {
  roles: OrganizationRole[];
  managerMembershipId: string | null;
  employeeId: string | null;
  department: string | null;
  title: string | null;
  status: UserStatus;
};

export type OrganizationUserLifecycleRepository = {
  runInTransaction<T>(operation: () => Promise<T>): Promise<T>;
  findMembershipForLifecycle(input: {
    organizationId: string;
    membershipId: string;
  }): Promise<OrganizationUserLifecycleRecord | null>;
  findManagerMembership(input: {
    organizationId: string;
    managerMembershipId: string;
  }): Promise<OrganizationUserLifecycleRecord | null>;
  saveMembershipLifecycle(input: {
    organizationId: string;
    membershipId: string;
    roles: OrganizationRole[];
    managerMembershipId: string | null;
    employeeId: string | null;
    department: string | null;
    title: string | null;
    status: UserStatus;
  }): Promise<OrganizationUserLifecycleRecord>;
  saveUserStatus(input: { userId: string; status: UserStatus }): Promise<void>;
  createInvitation(input: {
    organizationId: string;
    membershipId: string;
    userId: string;
    now: Date;
  }): Promise<{ rawToken: string; expiresAt: Date }>;
  createPasswordReset(input: {
    userId: string;
    now: Date;
  }): Promise<{ rawToken: string; expiresAt: Date }>;
  recordAuditLog(input: {
    organizationId: string;
    actorId: string;
    action: string;
    targetType: string;
    targetId: string;
    metadata: Record<string, unknown>;
  }): Promise<void>;
};

const lifecycleFieldOrder = [
  "roles",
  "managerMembershipId",
  "employeeId",
  "department",
  "title",
  "status",
] as const;
const validRoles = new Set<OrganizationRole>(["ADMIN", "MANAGER", "LEARNER"]);
const validStatuses = new Set<UserStatus>(["INVITED", "ACTIVE", "INACTIVE"]);

type LifecycleField = (typeof lifecycleFieldOrder)[number];

export async function updateOrganizationUserLifecycle(
  input: {
    actor: MembershipAuthContext;
    organizationId: string;
    membershipId: string;
    changes: OrganizationUserLifecycleChanges;
  },
  repository: OrganizationUserLifecycleRepository,
): Promise<OrganizationUserLifecycleRecord> {
  requireUserManager(input.actor, input.organizationId);

  return repository.runInTransaction(async () => {
    const current = await requireMembership(input, repository);
    const normalized = normalizeLifecycleChanges(input.changes);

    await requireValidManager(
      {
        organizationId: input.organizationId,
        targetMembershipId: current.id,
        managerMembershipId: normalized.managerMembershipId,
      },
      repository,
    );

    const changed = changedFields(current, normalized);

    if (changed.length === 0) {
      return current;
    }

    if (current.user.status !== normalized.status) {
      await repository.saveUserStatus({
        userId: current.userId,
        status: normalized.status,
      });
    }

    const next = await repository.saveMembershipLifecycle({
      organizationId: input.organizationId,
      membershipId: current.id,
      ...normalized,
    });

    await repository.recordAuditLog({
      organizationId: input.organizationId,
      actorId: input.actor.userId,
      action: "users.lifecycle.updated",
      targetType: "organizationMembership",
      targetId: current.id,
      metadata: {
        ...buildLifecycleAuditMetadata(current, normalized, changed),
        userEmail: current.user.email,
      },
    });

    return next;
  });
}

export async function resendOrganizationUserInvitation(
  input: {
    actor: MembershipAuthContext;
    organizationId: string;
    membershipId: string;
    now: Date;
  },
  repository: OrganizationUserLifecycleRepository,
): Promise<{ rawToken: string; expiresAt: Date }> {
  requireUserManager(input.actor, input.organizationId);

  return repository.runInTransaction(async () => {
    const membership = await requireMembership(input, repository);

    if (membership.status !== "INVITED") {
      throw new Error("Invitations can only be resent to invited users");
    }

    const invitation = await repository.createInvitation({
      organizationId: input.organizationId,
      membershipId: membership.id,
      userId: membership.userId,
      now: input.now,
    });

    await repository.recordAuditLog({
      organizationId: input.organizationId,
      actorId: input.actor.userId,
      action: "users.invitation.resent",
      targetType: "organizationMembership",
      targetId: membership.id,
      metadata: {
        userEmail: membership.user.email,
        membershipStatus: membership.status,
      },
    });

    return invitation;
  });
}

export async function issueOrganizationUserPasswordReset(
  input: {
    actor: MembershipAuthContext;
    organizationId: string;
    membershipId: string;
    now: Date;
  },
  repository: OrganizationUserLifecycleRepository,
): Promise<{ rawToken: string; expiresAt: Date; email: string }> {
  requireUserManager(input.actor, input.organizationId);

  return repository.runInTransaction(async () => {
    const membership = await requireMembership(input, repository);

    if (
      !["ACTIVE", "INVITED"].includes(membership.status) ||
      !["ACTIVE", "INVITED"].includes(membership.user.status)
    ) {
      throw new Error(
        "Password reset can only be issued for active or invited users",
      );
    }

    const reset = await repository.createPasswordReset({
      userId: membership.userId,
      now: input.now,
    });

    await repository.recordAuditLog({
      organizationId: input.organizationId,
      actorId: input.actor.userId,
      action: "users.password_reset.issued",
      targetType: "organizationMembership",
      targetId: membership.id,
      metadata: {
        userEmail: membership.user.email,
        membershipStatus: membership.status,
      },
    });

    return {
      ...reset,
      email: membership.user.email,
    };
  });
}

function requireUserManager(
  actor: MembershipAuthContext,
  organizationId: string,
): void {
  if (!canManageOrganizationUsers(actor, organizationId)) {
    throw new Error("Not allowed to manage organization users");
  }
}

async function requireMembership(
  input: { organizationId: string; membershipId: string },
  repository: OrganizationUserLifecycleRepository,
): Promise<OrganizationUserLifecycleRecord> {
  const membership = await repository.findMembershipForLifecycle(input);

  if (!membership) {
    throw new Error("Organization membership was not found");
  }

  return membership;
}

async function requireValidManager(
  input: {
    organizationId: string;
    targetMembershipId: string;
    managerMembershipId: string | null;
  },
  repository: OrganizationUserLifecycleRepository,
): Promise<void> {
  if (!input.managerMembershipId) {
    return;
  }

  if (input.managerMembershipId === input.targetMembershipId) {
    throw new Error("Manager membership was not found");
  }

  const manager = await repository.findManagerMembership({
    organizationId: input.organizationId,
    managerMembershipId: input.managerMembershipId,
  });

  if (
    !manager ||
    manager.organizationId !== input.organizationId ||
    manager.status !== "ACTIVE" ||
    !manager.roles.includes("MANAGER")
  ) {
    throw new Error("Manager membership was not found");
  }
}

function normalizeLifecycleChanges(
  changes: OrganizationUserLifecycleChanges,
): OrganizationUserLifecycleChanges {
  const roles = Array.from(new Set(changes.roles));

  if (roles.length === 0 || roles.some((role) => !validRoles.has(role))) {
    throw new Error("At least one valid role is required");
  }

  if (!validStatuses.has(changes.status)) {
    throw new Error("Membership status is invalid");
  }

  return {
    roles,
    managerMembershipId: normalizeOptionalString(changes.managerMembershipId),
    employeeId: normalizeOptionalString(changes.employeeId),
    department: normalizeOptionalString(changes.department),
    title: normalizeOptionalString(changes.title),
    status: changes.status,
  };
}

function normalizeOptionalString(value: string | null): string | null {
  const normalized = value?.trim();

  return normalized ? normalized : null;
}

function changedFields(
  current: OrganizationUserLifecycleRecord,
  next: OrganizationUserLifecycleChanges,
): LifecycleField[] {
  return lifecycleFieldOrder.filter(
    (field) => !valuesEqual(current[field], next[field]),
  );
}

function valuesEqual(left: unknown, right: unknown): boolean {
  if (Array.isArray(left) && Array.isArray(right)) {
    return (
      left.length === right.length &&
      left.every((value, index) => value === right[index])
    );
  }

  return left === right;
}

function buildLifecycleAuditMetadata(
  current: OrganizationUserLifecycleRecord,
  next: OrganizationUserLifecycleChanges,
  changed: LifecycleField[],
): Record<string, unknown> {
  return {
    changed,
    previous: Object.fromEntries(
      changed.map((field) => [field, current[field]]),
    ),
    next: Object.fromEntries(changed.map((field) => [field, next[field]])),
  };
}
