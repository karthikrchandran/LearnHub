import { LogoffLink } from "@/app/ui/logoff-link";
import { requirePlatformOwner } from "@/lib/auth/guards";
import { redirect } from "next/navigation";

import { updatePlatformOrganizationSettingsFormAction } from "./actions";

export const dynamic = "force-dynamic";

type PlatformOrganizationSettingsPageProps = {
  params: Promise<{
    slug: string;
  }>;
};

export default async function PlatformOrganizationSettingsPage({
  params,
}: PlatformOrganizationSettingsPageProps) {
  const { slug } = await params;
  await requirePlatformOwner();
  const { prisma } = await import("@/lib/prisma");
  const organization = await prisma.organization.findUnique({
    where: { slug },
    select: {
      name: true,
      slug: true,
      status: true,
      allowedEmailDomains: true,
      logoUrl: true,
      primaryColor: true,
      accentColor: true,
      enrollmentPolicy: true,
      globalLibraryEnabled: true,
      allowAdminBranding: true,
      allowManagerReports: true,
      allowUserReports: true,
      allowCsvExports: true,
    },
  });

  if (!organization) {
    redirect("/platform");
  }

  const updateAction = async (formData: FormData) => {
    "use server";

    await updatePlatformOrganizationSettingsFormAction(slug, formData);
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-6 px-6 py-10">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium uppercase tracking-wide text-slate-500">
            Platform Owner
          </p>
          <h1 className="text-3xl font-semibold text-slate-950">
            {organization.name} settings
          </h1>
        </div>
        <LogoffLink />
      </header>

      <form action={updateAction} className="grid gap-5 rounded-md border border-slate-200 p-5">
        <div className="grid gap-4 md:grid-cols-2">
          <label className="grid gap-2 text-sm font-medium text-slate-700">
            Name
            <input
              name="name"
              defaultValue={organization.name}
              className="rounded-md border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="grid gap-2 text-sm font-medium text-slate-700">
            Slug
            <input
              name="slug"
              defaultValue={organization.slug}
              className="rounded-md border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="grid gap-2 text-sm font-medium text-slate-700">
            Status
            <select
              name="status"
              defaultValue={organization.status}
              className="rounded-md border border-slate-300 px-3 py-2"
            >
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
            </select>
          </label>
          <label className="grid gap-2 text-sm font-medium text-slate-700">
            Enrollment policy
            <select
              name="enrollmentPolicy"
              defaultValue={organization.enrollmentPolicy}
              className="rounded-md border border-slate-300 px-3 py-2"
            >
              <option value="ASSIGNMENT_ONLY">Assignment only</option>
              <option value="ASSIGNMENT_AND_SELF_ENROLLMENT">
                Assignment and self-enrollment
              </option>
            </select>
          </label>
        </div>

        <label className="grid gap-2 text-sm font-medium text-slate-700">
          Allowed email domains
          <input
            name="allowedEmailDomains"
            defaultValue={organization.allowedEmailDomains.join(", ")}
            className="rounded-md border border-slate-300 px-3 py-2"
          />
        </label>

        <div className="grid gap-4 md:grid-cols-3">
          <label className="grid gap-2 text-sm font-medium text-slate-700">
            Logo URL
            <input
              name="logoUrl"
              defaultValue={organization.logoUrl ?? ""}
              className="rounded-md border border-slate-300 px-3 py-2"
            />
          </label>
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

        <div className="flex flex-wrap gap-5 text-sm font-medium text-slate-700">
          <label className="flex items-center gap-2">
            <input
              name="globalLibraryEnabled"
              type="checkbox"
              value="true"
              defaultChecked={organization.globalLibraryEnabled}
              className="h-4 w-4 rounded border-slate-300"
            />
            Global library access
          </label>
          <label className="flex items-center gap-2">
            <input
              name="allowAdminBranding"
              type="checkbox"
              value="true"
              defaultChecked={organization.allowAdminBranding}
              className="h-4 w-4 rounded border-slate-300"
            />
            Tenant admin branding edits
          </label>
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
          Save organization settings
        </button>
      </form>
    </main>
  );
}
