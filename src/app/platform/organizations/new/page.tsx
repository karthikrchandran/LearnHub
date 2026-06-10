import { requirePlatformOwner } from "@/lib/auth/guards";

import { provisionOrganizationFormAction } from "./actions";
import { NewOrganizationForm } from "./new-organization-form";

export const dynamic = "force-dynamic";

export default async function NewOrganizationPage() {
  await requirePlatformOwner();

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 px-6 py-10">
      <header>
        <p className="text-sm font-medium uppercase tracking-wide text-slate-500">Platform Owner</p>
        <h1 className="text-3xl font-semibold text-slate-950">New organization</h1>
      </header>
      <NewOrganizationForm action={provisionOrganizationFormAction} />
    </main>
  );
}
