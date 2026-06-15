import { AdminAppShell } from "@/app/ui/learnhub-components";
import { createPrismaUserSearchRepository } from "@/modules/users/prisma-repository";
import type { UserLifecycleActionResult } from "@/modules/users/server-actions";
import { listOrganizationUsers } from "@/modules/users/user-search";

import { getAdminWorkspace } from "../../admin-utils";
import { updateOrganizationUserLifecycleFormAction } from "../actions";
import { UserLifecycleActionForm } from "../user-lifecycle-action-forms";

export const dynamic = "force-dynamic";

type RemoveAccessAdminPageProps = {
  params: Promise<{
    slug: string;
  }>;
};

export default async function RemoveAccessAdminPage({ params }: RemoveAccessAdminPageProps) {
  const { slug } = await params;
  const { organizationId, organizationName, prisma } = await getAdminWorkspace(slug);
  const users = await listOrganizationUsers(
    {
      organizationId,
      filters: {},
    },
    createPrismaUserSearchRepository(prisma),
  );
  const deactivateAction = async (_previousState: UserLifecycleActionResult, formData: FormData) => {
    "use server";

    return updateOrganizationUserLifecycleFormAction(slug, formData);
  };

  return (
    <AdminAppShell organizationName={organizationName} slug={slug} active="remove-access">
      <div className="lh-main-inner lh-main-wide">
        <header className="lh-main-head">
          <div>
            <p className="lh-eyebrow">Users</p>
            <h1>Deactivate / remove access</h1>
            <p>Deactivation blocks access and preserves progress, certificates, assignments, and audit history.</p>
          </div>
        </header>

        <section className="overflow-x-auto rounded-md border border-slate-200 bg-white">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead>
              <tr className="text-left text-slate-500">
                <th className="px-4 py-3 font-medium">User</th>
                <th className="px-4 py-3 font-medium">Roles</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Department</th>
                <th className="px-4 py-3 font-medium">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.length === 0 ? (
                <tr>
                  <td className="px-4 py-5 text-slate-500" colSpan={5}>
                    No users are available.
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
                    <td className="px-4 py-4 text-slate-700">{membership.department ?? "None"}</td>
                    <td className="px-4 py-4">
                      <UserLifecycleActionForm
                        action={deactivateAction}
                        className="grid gap-2"
                        disabled={membership.status === "INACTIVE"}
                        pendingLabel="Deactivating..."
                        submitLabel="Deactivate / remove access"
                      >
                        <input type="hidden" name="membershipId" value={membership.id} />
                        {membership.roles.map((role) => (
                          <input key={role} type="hidden" name="roles" value={role} />
                        ))}
                        <input type="hidden" name="managerMembershipId" value={membership.managerMembershipId ?? ""} />
                        <input type="hidden" name="employeeId" value={membership.employeeId ?? ""} />
                        <input type="hidden" name="department" value={membership.department ?? ""} />
                        <input type="hidden" name="title" value={membership.title ?? ""} />
                        <input type="hidden" name="status" value="INACTIVE" />
                      </UserLifecycleActionForm>
                    </td>
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
