import type { OrganizationRole, UserStatus } from "@prisma/client";

export type UserSearchFilters = {
  query?: string;
  role?: OrganizationRole;
  status?: UserStatus;
  managerMembershipId?: string;
  department?: string;
};

export type OrganizationUserSearchRecord = {
  id: string;
  organizationId: string;
  roles: OrganizationRole[];
  status: UserStatus;
  managerMembershipId: string | null;
  employeeId: string | null;
  department: string | null;
  title: string | null;
  user: {
    firstName: string;
    lastName: string;
    email: string;
  };
  managerMembership: {
    user: {
      firstName: string;
      lastName: string;
      email: string;
    };
  } | null;
};

export type UserSearchRepository = {
  listOrganizationUsers(input: {
    organizationId: string;
    filters: UserSearchFilters;
  }): Promise<OrganizationUserSearchRecord[]>;
};

const validRoles = new Set<OrganizationRole>(["ADMIN", "MANAGER", "LEARNER"]);
const validStatuses = new Set<UserStatus>(["INVITED", "ACTIVE", "INACTIVE"]);

export function parseUserSearchFilters(input: {
  query?: string | null;
  role?: string | null;
  status?: string | null;
  managerMembershipId?: string | null;
  department?: string | null;
}): UserSearchFilters {
  const query = normalizeOptional(input.query);
  const role = normalizeOptional(input.role);
  const status = normalizeOptional(input.status);
  const managerMembershipId = normalizeOptional(input.managerMembershipId);
  const department = normalizeOptional(input.department);

  return {
    ...(query ? { query } : {}),
    ...(role && validRoles.has(role as OrganizationRole)
      ? { role: role as OrganizationRole }
      : {}),
    ...(status && validStatuses.has(status as UserStatus)
      ? { status: status as UserStatus }
      : {}),
    ...(managerMembershipId ? { managerMembershipId } : {}),
    ...(department ? { department } : {}),
  };
}

export function membershipMatchesUserSearch(
  membership: OrganizationUserSearchRecord,
  filters: UserSearchFilters,
): boolean {
  if (filters.role && !membership.roles.includes(filters.role)) {
    return false;
  }

  if (filters.status && membership.status !== filters.status) {
    return false;
  }

  if (
    filters.managerMembershipId &&
    membership.managerMembershipId !== filters.managerMembershipId
  ) {
    return false;
  }

  if (filters.department && membership.department !== filters.department) {
    return false;
  }

  if (!filters.query) {
    return true;
  }

  const query = filters.query.toLowerCase();

  return [
    membership.user.firstName,
    membership.user.lastName,
    membership.user.email,
    membership.employeeId,
    membership.department,
    membership.title,
  ]
    .filter((value): value is string => Boolean(value))
    .some((value) => value.toLowerCase().includes(query));
}

export function createPrismaUserSearchWhere(
  organizationId: string,
  filters: UserSearchFilters,
): Record<string, unknown> {
  return {
    organizationId,
    ...(filters.role ? { roles: { has: filters.role } } : {}),
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.managerMembershipId
      ? { managerMembershipId: filters.managerMembershipId }
      : {}),
    ...(filters.department ? { department: filters.department } : {}),
    ...(filters.query
      ? {
          OR: [
            { employeeId: containsInsensitive(filters.query) },
            { department: containsInsensitive(filters.query) },
            { title: containsInsensitive(filters.query) },
            { user: { firstName: containsInsensitive(filters.query) } },
            { user: { lastName: containsInsensitive(filters.query) } },
            { user: { email: containsInsensitive(filters.query) } },
          ],
        }
      : {}),
  };
}

export function listOrganizationUsers(
  input: { organizationId: string; filters: UserSearchFilters },
  repository: UserSearchRepository,
): Promise<OrganizationUserSearchRecord[]> {
  return repository.listOrganizationUsers(input);
}

function normalizeOptional(value: string | null | undefined): string | undefined {
  const normalized = value?.trim();

  return normalized ? normalized : undefined;
}

function containsInsensitive(value: string): {
  contains: string;
  mode: "insensitive";
} {
  return {
    contains: value,
    mode: "insensitive",
  };
}
