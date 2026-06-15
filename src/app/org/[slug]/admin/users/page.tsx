import Link from "next/link";

import { AdminAppShell } from "@/app/ui/learnhub-components";
import { createPrismaUserSearchRepository } from "@/modules/users/prisma-repository";
import {
  listOrganizationUsers,
  parseUserSearchFilters,
} from "@/modules/users/user-search";

import { getAdminWorkspace } from "../admin-utils";

export const dynamic = "force-dynamic";

type OrganizationUsersAdminPageProps = {
  params: Promise<{
    slug: string;
  }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function OrganizationUsersAdminPage({
  params,
  searchParams,
}: OrganizationUsersAdminPageProps) {
  const { slug } = await params;
  const { organizationId, organizationName, prisma } = await getAdminWorkspace(slug);
  const resolvedSearchParams = (await searchParams) ?? {};
  const filters = parseUserSearchFilters({
    query: firstParam(resolvedSearchParams.query),
    role: firstParam(resolvedSearchParams.role),
    status: firstParam(resolvedSearchParams.status),
    managerMembershipId: firstParam(resolvedSearchParams.managerMembershipId),
    department: firstParam(resolvedSearchParams.department),
  });
  const [users, managers, departments] = await Promise.all([
    listOrganizationUsers(
      {
        organizationId,
        filters,
      },
      createPrismaUserSearchRepository(prisma),
    ),
    prisma.organizationMembership.findMany({
      where: {
        organizationId,
        status: "ACTIVE",
        roles: { has: "MANAGER" },
      },
      orderBy: { user: { email: "asc" } },
      select: {
        id: true,
        user: {
          select: {
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    }),
    prisma.organizationMembership.findMany({
      where: {
        organizationId,
        department: { not: null },
      },
      distinct: ["department"],
      orderBy: { department: "asc" },
      select: { department: true },
    }),
  ]);

  return (
    <AdminAppShell organizationName={organizationName} slug={slug} active="users">
      <div className="lh-main-inner lh-main-wide">
        <header className="lh-main-head">
          <div>
            <p className="lh-eyebrow">Users</p>
            <h1>User directory</h1>
            <p>Search organization users and open focused workflows for import, lifecycle edits, or access removal.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-800" href={`/org/${slug}/admin/users/import`}>
              Bulk User Import
            </Link>
            <Link className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-800" href={`/org/${slug}/admin/users/lifecycle`}>
              User Lifecycle
            </Link>
            <Link className="rounded-md bg-slate-950 px-3 py-2 text-sm font-medium text-white" href={`/org/${slug}/admin/users/remove`}>
              Remove Access
            </Link>
          </div>
        </header>

        <section className="rounded-md border border-slate-200 bg-white p-4">
          <form className="grid gap-3 md:grid-cols-3" method="get">
            <label className="grid gap-2 text-sm font-medium text-slate-700">
              Search
              <input
                name="query"
                defaultValue={filters.query ?? ""}
                className="rounded-md border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="grid gap-2 text-sm font-medium text-slate-700">
              Role
              <select
                name="role"
                defaultValue={filters.role ?? ""}
                className="rounded-md border border-slate-300 px-3 py-2"
              >
                <option value="">All roles</option>
                <option value="ADMIN">Admin</option>
                <option value="MANAGER">Manager</option>
                <option value="LEARNER">Learner</option>
              </select>
            </label>
            <label className="grid gap-2 text-sm font-medium text-slate-700">
              Status
              <select
                name="status"
                defaultValue={filters.status ?? ""}
                className="rounded-md border border-slate-300 px-3 py-2"
              >
                <option value="">All statuses</option>
                <option value="INVITED">Invited</option>
                <option value="ACTIVE">Active</option>
                <option value="INACTIVE">Inactive</option>
              </select>
            </label>
            <label className="grid gap-2 text-sm font-medium text-slate-700">
              Manager
              <select
                name="managerMembershipId"
                defaultValue={filters.managerMembershipId ?? ""}
                className="rounded-md border border-slate-300 px-3 py-2"
              >
                <option value="">All managers</option>
                {managers.map((manager) => (
                  <option key={manager.id} value={manager.id}>
                    {manager.user.firstName} {manager.user.lastName} ({manager.user.email})
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-2 text-sm font-medium text-slate-700">
              Department
              <select
                name="department"
                defaultValue={filters.department ?? ""}
                className="rounded-md border border-slate-300 px-3 py-2"
              >
                <option value="">All departments</option>
                {departments
                  .filter((department): department is { department: string } => Boolean(department.department))
                  .map((department) => (
                    <option key={department.department} value={department.department}>
                      {department.department}
                    </option>
                  ))}
              </select>
            </label>
            <div className="flex items-end">
              <button type="submit" className="rounded-md bg-slate-950 px-4 py-2 text-sm font-medium text-white">
                Apply filters
              </button>
            </div>
          </form>
        </section>

        <section className="overflow-x-auto rounded-md border border-slate-200 bg-white">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead>
              <tr className="text-left text-slate-500">
                <th className="px-4 py-3 font-medium">User</th>
                <th className="px-4 py-3 font-medium">Roles</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Manager</th>
                <th className="px-4 py-3 font-medium">Department</th>
                <th className="px-4 py-3 font-medium">Title</th>
                <th className="px-4 py-3 font-medium">Employee id</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-5 text-slate-500">
                    No users match the current filters.
                  </td>
                </tr>
              ) : (
                users.map((membership) => (
                  <tr key={membership.id}>
                    <td className="px-4 py-4">
                      <div className="font-medium text-slate-950">
                        {membership.user.firstName} {membership.user.lastName}
                      </div>
                      <div className="text-slate-500">{membership.user.email}</div>
                    </td>
                    <td className="px-4 py-4 text-slate-700">{membership.roles.join(", ")}</td>
                    <td className="px-4 py-4 text-slate-700">{membership.status}</td>
                    <td className="px-4 py-4 text-slate-700">
                      {membership.managerMembership
                        ? `${membership.managerMembership.user.firstName} ${membership.managerMembership.user.lastName}`
                        : "None"}
                    </td>
                    <td className="px-4 py-4 text-slate-700">{membership.department ?? "None"}</td>
                    <td className="px-4 py-4 text-slate-700">{membership.title ?? "None"}</td>
                    <td className="px-4 py-4 text-slate-700">{membership.employeeId ?? "None"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </section>
      </div>
    </AdminAppShell>
  );
}
