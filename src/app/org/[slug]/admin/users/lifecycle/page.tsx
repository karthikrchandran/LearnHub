import { AdminAppShell } from "@/app/ui/learnhub-components";
import { createPrismaUserSearchRepository } from "@/modules/users/prisma-repository";
import {
  listOrganizationUsers,
  parseUserSearchFilters,
} from "@/modules/users/user-search";
import type { UserLifecycleActionResult } from "@/modules/users/server-actions";

import { getAdminWorkspace } from "../../admin-utils";
import {
  issueOrganizationUserPasswordResetFormAction,
  resendOrganizationUserInvitationFormAction,
  updateOrganizationUserLifecycleFormAction,
} from "../actions";
import {
  UserInlineActionForm,
  UserLifecycleActionForm,
} from "../user-lifecycle-action-forms";

export const dynamic = "force-dynamic";

type UserLifecycleAdminPageProps = {
  params: Promise<{
    slug: string;
  }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function UserLifecycleAdminPage({ params, searchParams }: UserLifecycleAdminPageProps) {
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
  const [users, managers] = await Promise.all([
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
  ]);
  const updateLifecycleAction = async (_previousState: UserLifecycleActionResult, formData: FormData) => {
    "use server";

    return updateOrganizationUserLifecycleFormAction(slug, formData);
  };
  const resendInvitationAction = async (_previousState: UserLifecycleActionResult, formData: FormData) => {
    "use server";

    return resendOrganizationUserInvitationFormAction(slug, formData);
  };
  const issueResetAction = async (_previousState: UserLifecycleActionResult, formData: FormData) => {
    "use server";

    return issueOrganizationUserPasswordResetFormAction(slug, formData);
  };

  return (
    <AdminAppShell organizationName={organizationName} slug={slug} active="user-lifecycle">
      <div className="lh-main-inner lh-main-wide">
        <header className="lh-main-head">
          <div>
            <p className="lh-eyebrow">Users</p>
            <h1>Lifecycle controls</h1>
            <p>Edit roles, manager relationships, profile fields, invitations, resets, and status.</p>
          </div>
        </header>

        <form className="grid gap-3 rounded-md border border-slate-200 bg-white p-4 md:grid-cols-4" method="get">
          <label className="grid gap-2 text-sm font-medium text-slate-700">
            Search
            <input name="query" defaultValue={filters.query ?? ""} className="rounded-md border border-slate-300 px-3 py-2" />
          </label>
          <label className="grid gap-2 text-sm font-medium text-slate-700">
            Role
            <select name="role" defaultValue={filters.role ?? ""} className="rounded-md border border-slate-300 px-3 py-2">
              <option value="">All roles</option>
              <option value="ADMIN">Admin</option>
              <option value="MANAGER">Manager</option>
              <option value="LEARNER">Learner</option>
            </select>
          </label>
          <label className="grid gap-2 text-sm font-medium text-slate-700">
            Status
            <select name="status" defaultValue={filters.status ?? ""} className="rounded-md border border-slate-300 px-3 py-2">
              <option value="">All statuses</option>
              <option value="INVITED">Invited</option>
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
            </select>
          </label>
          <div className="flex items-end">
            <button type="submit" className="rounded-md bg-slate-950 px-4 py-2 text-sm font-medium text-white">
              Apply filters
            </button>
          </div>
        </form>

        <section className="grid gap-4">
          {users.length === 0 ? (
            <p className="rounded-md border border-slate-200 bg-white p-4 text-sm text-slate-500">
              No users are available for lifecycle edits.
            </p>
          ) : (
            users.map((membership) => (
              <article key={membership.id} className="rounded-md border border-slate-200 bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="font-semibold text-slate-950">
                      {membership.user.firstName} {membership.user.lastName}
                    </h2>
                    <p className="text-sm text-slate-500">{membership.user.email}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <UserInlineActionForm action={resendInvitationAction}>
                      <input type="hidden" name="membershipId" value={membership.id} />
                      <button
                        type="submit"
                        disabled={membership.status !== "INVITED"}
                        className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-800 disabled:text-slate-400"
                      >
                        Resend invitation
                      </button>
                    </UserInlineActionForm>
                    <UserInlineActionForm action={issueResetAction}>
                      <input type="hidden" name="membershipId" value={membership.id} />
                      <button
                        type="submit"
                        disabled={membership.status === "INACTIVE"}
                        className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-800 disabled:text-slate-400"
                      >
                        Issue reset
                      </button>
                    </UserInlineActionForm>
                  </div>
                </div>

                <UserLifecycleActionForm
                  action={updateLifecycleAction}
                  className="mt-4 grid gap-4 md:grid-cols-3"
                  pendingLabel="Saving..."
                  submitLabel="Save user"
                >
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
                    <select name="managerMembershipId" defaultValue={membership.managerMembershipId ?? ""} className="rounded-md border border-slate-300 px-3 py-2">
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
                    <select name="status" defaultValue={membership.status} className="rounded-md border border-slate-300 px-3 py-2">
                      <option value="INVITED">Invited</option>
                      <option value="ACTIVE">Active</option>
                      <option value="INACTIVE">Inactive</option>
                    </select>
                  </label>
                  <label className="grid gap-2 text-sm font-medium text-slate-700">
                    Employee id
                    <input name="employeeId" defaultValue={membership.employeeId ?? ""} className="rounded-md border border-slate-300 px-3 py-2" />
                  </label>
                  <label className="grid gap-2 text-sm font-medium text-slate-700">
                    Department
                    <input name="department" defaultValue={membership.department ?? ""} className="rounded-md border border-slate-300 px-3 py-2" />
                  </label>
                  <label className="grid gap-2 text-sm font-medium text-slate-700">
                    Title
                    <input name="title" defaultValue={membership.title ?? ""} className="rounded-md border border-slate-300 px-3 py-2" />
                  </label>
                </UserLifecycleActionForm>
              </article>
            ))
          )}
        </section>
      </div>
    </AdminAppShell>
  );
}
