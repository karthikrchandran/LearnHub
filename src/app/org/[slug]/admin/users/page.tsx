import { requireOrganizationUsersAdminBySlug } from "@/lib/auth/guards";

import { commitUserImportFormAction, validateUserImportFormAction } from "./actions";
import { UserImportForm } from "./user-import-form";

export const dynamic = "force-dynamic";

type OrganizationUsersAdminPageProps = {
  params: Promise<{
    slug: string;
  }>;
};

export default async function OrganizationUsersAdminPage({ params }: OrganizationUsersAdminPageProps) {
  const { slug } = await params;
  await requireOrganizationUsersAdminBySlug(slug);
  const validateAction = validateUserImportFormAction.bind(null, slug);
  const importAction = commitUserImportFormAction.bind(null, slug);

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-6 px-6 py-10">
      <header>
        <p className="text-sm font-medium uppercase tracking-wide text-slate-500">Organization Admin</p>
        <h1 className="text-3xl font-semibold text-slate-950">{slug} users</h1>
      </header>
      <UserImportForm validateAction={validateAction} importAction={importAction} />
    </main>
  );
}
