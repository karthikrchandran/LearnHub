import { requireOrganizationUsersAdminBySlug } from "@/lib/auth/guards";
import { createPrismaUserSearchRepository } from "@/modules/users/prisma-repository";
import {
  listOrganizationUsers,
  parseUserSearchFilters,
} from "@/modules/users/user-search";

import {
  commitUserImportFormAction,
  issueOrganizationUserPasswordResetFormAction,
  resendOrganizationUserInvitationFormAction,
  updateOrganizationUserLifecycleFormAction,
  validateUserImportFormAction,
} from "./actions";
import { UserImportForm } from "./user-import-form";

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
  const { organizationId } = await requireOrganizationUsersAdminBySlug(slug);
  const resolvedSearchParams = (await searchParams) ?? {};
  const filters = parseUserSearchFilters({
    query: firstParam(resolvedSearchParams.query),
    role: firstParam(resolvedSearchParams.role),
    status: firstParam(resolvedSearchParams.status),
    managerMembershipId: firstParam(resolvedSearchParams.managerMembershipId),
    department: firstParam(resolvedSearchParams.department),
  });
  const { prisma } = await import("@/lib/prisma");
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
  const validateAction = validateUserImportFormAction.bind(null, slug);
  const importAction = commitUserImportFormAction.bind(null, slug);
  const updateLifecycleAction = async (formData: FormData) => {
    "use server";

    await updateOrganizationUserLifecycleFormAction(slug, formData);
  };
  const resendInvitationAction = async (formData: FormData) => {
    "use server";

    await resendOrganizationUserInvitationFormAction(slug, formData);
  };
  const issueResetAction = async (formData: FormData) => {
    "use server";

    await issueOrganizationUserPasswordResetFormAction(slug, formData);
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-6 px-6 py-10">
      <header>
        <p className="text-sm font-medium uppercase tracking-wide text-slate-500">Organization Admin</p>
        <h1 className="text-3xl font-semibold text-slate-950">{slug} users</h1>
      </header>

      <section className="rounded-md border border-slate-200 p-4">
        <h2 className="text-lg font-semibold text-slate-950">User directory</h2>
        <form className="mt-4 grid gap-3 md:grid-cols-3" method="get">
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
            <button
              type="submit"
              className="rounded-md bg-slate-950 px-4 py-2 text-sm font-medium text-white"
            >
              Apply filters
            </button>
          </div>
        </form>

        <div className="mt-5 overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead>
              <tr className="text-left text-slate-500">
                <th className="px-3 py-2 font-medium">User</th>
                <th className="px-3 py-2 font-medium">Roles</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Manager</th>
                <th className="px-3 py-2 font-medium">Department</th>
                <th className="px-3 py-2 font-medium">Title</th>
                <th className="px-3 py-2 font-medium">Employee id</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-4 text-slate-500">
                    No users match the current filters.
                  </td>
                </tr>
              ) : (
                users.map((membership) => (
                  <tr key={membership.id}>
                    <td className="px-3 py-3">
                      <div className="font-medium text-slate-950">
                        {membership.user.firstName} {membership.user.lastName}
                      </div>
                      <div className="text-slate-500">{membership.user.email}</div>
                    </td>
                    <td className="px-3 py-3 text-slate-700">{membership.roles.join(", ")}</td>
                    <td className="px-3 py-3 text-slate-700">{membership.status}</td>
                    <td className="px-3 py-3 text-slate-700">
                      {membership.managerMembership
                        ? `${membership.managerMembership.user.firstName} ${membership.managerMembership.user.lastName}`
                        : "None"}
                    </td>
                    <td className="px-3 py-3 text-slate-700">{membership.department ?? "None"}</td>
                    <td className="px-3 py-3 text-slate-700">{membership.title ?? "None"}</td>
                    <td className="px-3 py-3 text-slate-700">{membership.employeeId ?? "None"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid gap-4">
        <h2 className="text-lg font-semibold text-slate-950">Lifecycle controls</h2>
        {users.length === 0 ? (
          <p className="rounded-md border border-slate-200 p-4 text-sm text-slate-500">
            No users are available for lifecycle edits.
          </p>
        ) : (
          users.map((membership) => (
            <article key={membership.id} className="rounded-md border border-slate-200 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-slate-950">
                    {membership.user.firstName} {membership.user.lastName}
                  </h3>
                  <p className="text-sm text-slate-500">{membership.user.email}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <form action={resendInvitationAction}>
                    <input type="hidden" name="membershipId" value={membership.id} />
                    <button
                      type="submit"
                      disabled={membership.status !== "INVITED"}
                      className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-800 disabled:text-slate-400"
                    >
                      Resend invitation
                    </button>
                  </form>
                  <form action={issueResetAction}>
                    <input type="hidden" name="membershipId" value={membership.id} />
                    <button
                      type="submit"
                      disabled={membership.status === "INACTIVE"}
                      className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-800 disabled:text-slate-400"
                    >
                      Issue reset
                    </button>
                  </form>
                </div>
              </div>

              <form action={updateLifecycleAction} className="mt-4 grid gap-4 md:grid-cols-3">
                <input type="hidden" name="membershipId" value={membership.id} />
                <fieldset className="grid gap-2 text-sm font-medium text-slate-700">
                  <legend>Roles</legend>
                  {(["ADMIN", "MANAGER", "LEARNER"] as const).map((role) => (
                    <label key={role} className="flex items-center gap-2 font-normal">
                      <input
                        name="roles"
                        type="checkbox"
                        value={role}
                        defaultChecked={membership.roles.includes(role)}
                        className="h-4 w-4 rounded border-slate-300"
                      />
                      {role}
                    </label>
                  ))}
                </fieldset>
                <label className="grid gap-2 text-sm font-medium text-slate-700">
                  Manager
                  <select
                    name="managerMembershipId"
                    defaultValue={membership.managerMembershipId ?? ""}
                    className="rounded-md border border-slate-300 px-3 py-2"
                  >
                    <option value="">No manager</option>
                    {managers
                      .filter((manager) => manager.id !== membership.id)
                      .map((manager) => (
                        <option key={manager.id} value={manager.id}>
                          {manager.user.firstName} {manager.user.lastName} ({manager.user.email})
                        </option>
                      ))}
                  </select>
                </label>
                <label className="grid gap-2 text-sm font-medium text-slate-700">
                  Status
                  <select
                    name="status"
                    defaultValue={membership.status}
                    className="rounded-md border border-slate-300 px-3 py-2"
                  >
                    <option value="INVITED">Invited</option>
                    <option value="ACTIVE">Active</option>
                    <option value="INACTIVE">Inactive</option>
                  </select>
                </label>
                <label className="grid gap-2 text-sm font-medium text-slate-700">
                  Employee id
                  <input
                    name="employeeId"
                    defaultValue={membership.employeeId ?? ""}
                    className="rounded-md border border-slate-300 px-3 py-2"
                  />
                </label>
                <label className="grid gap-2 text-sm font-medium text-slate-700">
                  Department
                  <input
                    name="department"
                    defaultValue={membership.department ?? ""}
                    className="rounded-md border border-slate-300 px-3 py-2"
                  />
                </label>
                <label className="grid gap-2 text-sm font-medium text-slate-700">
                  Title
                  <input
                    name="title"
                    defaultValue={membership.title ?? ""}
                    className="rounded-md border border-slate-300 px-3 py-2"
                  />
                </label>
                <div className="flex items-end">
                  <button
                    type="submit"
                    className="rounded-md bg-slate-950 px-4 py-2 text-sm font-medium text-white"
                  >
                    Save user
                  </button>
                </div>
              </form>
            </article>
          ))
        )}
      </section>

      <UserImportForm validateAction={validateAction} importAction={importAction} />
    </main>
  );
}
