import { AdminAppShell } from "@/app/ui/learnhub-components";
import { redirect } from "next/navigation";

import { getAdminWorkspace } from "../admin-utils";
import {
  updateOrganizationBrandingFormAction,
  updateOrganizationReportAccessFormAction,
} from "./actions";

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
  const { organizationName, prisma } = await getAdminWorkspace(slug);
  const organization = await prisma.organization.findUnique({
    where: { slug },
    select: {
      name: true,
      logoUrl: true,
      primaryColor: true,
      accentColor: true,
      allowAdminBranding: true,
      allowManagerReports: true,
      allowUserReports: true,
      allowCsvExports: true,
    },
  });

  if (!organization) {
    redirect("/org");
  }

  const updateAction = async (formData: FormData) => {
    "use server";

    await updateOrganizationBrandingFormAction(slug, formData);
  };
  const updateReportAccessAction = async (formData: FormData) => {
    "use server";

    await updateOrganizationReportAccessFormAction(slug, formData);
  };

  return (
    <AdminAppShell organizationName={organizationName} slug={slug} active="settings">
      <div className="lh-main-inner">
        <header className="lh-main-head">
          <div>
            <p className="lh-eyebrow">Settings</p>
            <h1>{organization.name} branding</h1>
            <p>Manage tenant logo and color settings.</p>
          </div>
        </header>

        <form action={updateAction} className="grid gap-5 rounded-md border border-slate-200 bg-white p-5">
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

        <form action={updateReportAccessAction} className="grid gap-5 rounded-md border border-slate-200 bg-white p-5">
          <header>
            <h2 className="text-lg font-semibold text-slate-950">Report access</h2>
            <p className="mt-1 text-sm text-slate-600">
              Control manager and user report visibility and CSV export access for this organization.
            </p>
          </header>
          <div className="grid gap-3 text-sm font-medium text-slate-700">
            <label className="flex items-center gap-2">
              <input
                name="allowManagerReports"
                type="checkbox"
                value="true"
                defaultChecked={organization.allowManagerReports}
                className="h-4 w-4 rounded border-slate-300"
              />
              Manager report access
            </label>
            <label className="flex items-center gap-2">
              <input
                name="allowUserReports"
                type="checkbox"
                value="true"
                defaultChecked={organization.allowUserReports}
                className="h-4 w-4 rounded border-slate-300"
              />
              User report access
            </label>
            <label className="flex items-center gap-2">
              <input
                name="allowCsvExports"
                type="checkbox"
                value="true"
                defaultChecked={organization.allowCsvExports}
                className="h-4 w-4 rounded border-slate-300"
              />
              CSV export access
            </label>
          </div>
          <button
            type="submit"
            className="w-fit rounded-md bg-slate-950 px-4 py-2 text-sm font-medium text-white"
          >
            Save report access
          </button>
        </form>
      </div>
    </AdminAppShell>
  );
}
