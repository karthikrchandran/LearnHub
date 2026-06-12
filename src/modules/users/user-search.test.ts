import { describe, expect, it } from "vitest";

import {
  createPrismaUserSearchWhere,
  listOrganizationUsers,
  membershipMatchesUserSearch,
  parseUserSearchFilters,
  type OrganizationUserSearchRecord,
  type UserSearchRepository,
} from "./user-search";

const learner: OrganizationUserSearchRecord = {
  id: "membership_1",
  organizationId: "org_1",
  roles: ["LEARNER"],
  status: "ACTIVE",
  managerMembershipId: "manager_1",
  employeeId: "EMP-101",
  department: "Operations",
  title: "Support Specialist",
  user: {
    firstName: "Leela",
    lastName: "Learner",
    email: "leela@acme.test",
  },
  managerMembership: {
    user: {
      firstName: "Mohan",
      lastName: "Manager",
      email: "mohan@acme.test",
    },
  },
};

describe("user search", () => {
  it("normalizes form-like search filter values", () => {
    expect(
      parseUserSearchFilters({
        query: " leela ",
        role: "LEARNER",
        status: "ACTIVE",
        managerMembershipId: " manager_1 ",
        department: " Operations ",
      }),
    ).toEqual({
      query: "leela",
      role: "LEARNER",
      status: "ACTIVE",
      managerMembershipId: "manager_1",
      department: "Operations",
    });
  });

  it("matches free-text search across name, email, employee id, title, and department", () => {
    for (const query of [
      "leela",
      "learner",
      "leela@acme",
      "EMP-101",
      "support",
      "operations",
    ]) {
      expect(membershipMatchesUserSearch(learner, { query })).toBe(true);
    }

    expect(membershipMatchesUserSearch(learner, { query: "finance" })).toBe(false);
  });

  it("matches role, status, manager, and department filters", () => {
    expect(
      membershipMatchesUserSearch(learner, {
        role: "LEARNER",
        status: "ACTIVE",
        managerMembershipId: "manager_1",
        department: "Operations",
      }),
    ).toBe(true);
    expect(membershipMatchesUserSearch(learner, { role: "ADMIN" })).toBe(false);
    expect(membershipMatchesUserSearch(learner, { status: "INACTIVE" })).toBe(false);
    expect(membershipMatchesUserSearch(learner, { managerMembershipId: "manager_2" })).toBe(false);
    expect(membershipMatchesUserSearch(learner, { department: "Support" })).toBe(false);
  });

  it("creates a Prisma where object that remains organization scoped", () => {
    expect(
      createPrismaUserSearchWhere("org_1", {
        query: "leela",
        role: "LEARNER",
        status: "ACTIVE",
        managerMembershipId: "manager_1",
        department: "Operations",
      }),
    ).toEqual({
      organizationId: "org_1",
      roles: { has: "LEARNER" },
      status: "ACTIVE",
      managerMembershipId: "manager_1",
      department: "Operations",
      OR: [
        { employeeId: { contains: "leela", mode: "insensitive" } },
        { department: { contains: "leela", mode: "insensitive" } },
        { title: { contains: "leela", mode: "insensitive" } },
        { user: { firstName: { contains: "leela", mode: "insensitive" } } },
        { user: { lastName: { contains: "leela", mode: "insensitive" } } },
        { user: { email: { contains: "leela", mode: "insensitive" } } },
      ],
    });
  });

  it("lists users through a scoped repository", async () => {
    const repository: UserSearchRepository = {
      async listOrganizationUsers(input) {
        expect(input).toEqual({
          organizationId: "org_1",
          filters: { role: "LEARNER" },
        });

        return [learner];
      },
    };

    await expect(
      listOrganizationUsers(
        { organizationId: "org_1", filters: { role: "LEARNER" } },
        repository,
      ),
    ).resolves.toEqual([learner]);
  });
});
