import { requireOrganizationUsersAdminBySlug } from "@/lib/auth/guards";
import { redirect } from "next/navigation";

import { updateOrganizationBrandingFormAction } from "./actions";

export const dynamic = "force-dynamic";

type OrganizationSettingsPageProps = {
  params: Promise<{
    slug: string;
  }>;
};

export default async function OrganizationSettingsPage({
  params,
}: OrganizationSettingsPageProps) {
  const { slug } = await params;
  await requireOrganizationUsersAdminBySlug(slug);
  const { prisma } = await import("@/lib/prisma");
  const organization = await prisma.organization.findUnique({
    where: { slug },
    select: {
      name: true,
      logoUrl: true,
      primaryColor: true,
      accentColor: true,
      allowAdminBranding: true,
    },
  });

  if (!organization) {
    redirect("/org");
  }

  const updateAction = async (formData: FormData) => {
    "use server";

    await updateOrganizationBrandingFormAction(slug, formData);
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 px-6 py-10">
      <header>
        <p className="text-sm font-medium uppercase tracking-wide text-slate-500">
          Organization Admin
        </p>
        <h1 className="text-3xl font-semibold text-slate-950">
          {organization.name} branding
        </h1>
      </header>

      <form action={updateAction} className="grid gap-5 rounded-md border border-slate-200 p-5">
        <fieldset
          disabled={!organization.allowAdminBranding}
          className="grid gap-4 disabled:opacity-60"
        >
          <label className="grid gap-2 text-sm font-medium text-slate-700">
            Logo URL
            <input
              name="logoUrl"
              defaultValue={organization.logoUrl ?? ""}
              className="rounded-md border border-slate-300 px-3 py-2"
            />
          </label>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-2 text-sm font-medium text-slate-700">
              Primary color
              <input
                name="primaryColor"
                defaultValue={organization.primaryColor}
                className="rounded-md border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="grid gap-2 text-sm font-medium text-slate-700">
              Accent color
              <input
                name="accentColor"
                defaultValue={organization.accentColor}
                className="rounded-md border border-slate-300 px-3 py-2"
              />
            </label>
          </div>
          <button
            type="submit"
            className="w-fit rounded-md bg-slate-950 px-4 py-2 text-sm font-medium text-white"
          >
            Save branding
          </button>
        </fieldset>
        {!organization.allowAdminBranding ? (
          <p className="text-sm text-slate-600">
            Branding edits are controlled by the platform owner for this organization.
          </p>
        ) : null}
      </form>
    </main>
  );
}
