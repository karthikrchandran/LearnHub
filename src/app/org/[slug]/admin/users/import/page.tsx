import { AdminAppShell } from "@/app/ui/learnhub-components";

import { getAdminWorkspace } from "../../admin-utils";
import {
  commitUserImportFormAction,
  validateUserImportFormAction,
} from "../actions";
import { UserImportForm } from "../user-import-form";

export const dynamic = "force-dynamic";

type UserImportAdminPageProps = {
  params: Promise<{
    slug: string;
  }>;
};

export default async function UserImportAdminPage({ params }: UserImportAdminPageProps) {
  const { slug } = await params;
  const { organizationName } = await getAdminWorkspace(slug);
  const validateAction = validateUserImportFormAction.bind(null, slug);
  const importAction = commitUserImportFormAction.bind(null, slug);

  return (
    <AdminAppShell organizationName={organizationName} slug={slug} active="bulk-users">
      <div className="lh-main-inner">
        <header className="lh-main-head">
          <div>
            <p className="lh-eyebrow">Users</p>
            <h1>Bulk User Import</h1>
            <p>Validate and commit user CSV imports before learners receive access.</p>
          </div>
        </header>

        <UserImportForm validateAction={validateAction} importAction={importAction} />
      </div>
    </AdminAppShell>
  );
}
