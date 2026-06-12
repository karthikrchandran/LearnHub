import { requireOrganizationUsersAdminBySlug } from "@/lib/auth/guards";

import { uploadScormPackageFormAction } from "./actions";

export const dynamic = "force-dynamic";

type ScormAdminPageProps = {
  params: Promise<{
    slug: string;
    courseSlug: string;
  }>;
};

export default async function ScormAdminPage({ params }: ScormAdminPageProps) {
  const { slug, courseSlug } = await params;
  const { organizationId } = await requireOrganizationUsersAdminBySlug(slug);
  const { prisma } = await import("@/lib/prisma");
  const course = await prisma.course.findFirst({
    where: {
      organizationId,
      slug: courseSlug,
      type: "SCORM_1_2",
    },
    select: {
      id: true,
      title: true,
      scormPackages: {
        where: { active: true },
        orderBy: { updatedAt: "desc" },
        take: 1,
        select: {
          id: true,
          originalFileName: true,
          contentType: true,
          byteSize: true,
          storageKey: true,
          contentRootKey: true,
          launchPath: true,
          manifestTitle: true,
          extractionStatus: true,
          extractionError: true,
          malwareScanStatus: true,
          malwareScanError: true,
          updatedAt: true,
        },
      },
    },
  });
  const activePackage = course?.scormPackages[0] ?? null;
  const uploadPackageAction = async (formData: FormData) => {
    "use server";

    await uploadScormPackageFormAction(slug, courseSlug, formData);
  };

  if (!course) {
    return (
      <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-4 px-6 py-10">
        <header>
          <p className="text-sm font-medium uppercase tracking-wide text-slate-500">SCORM package</p>
          <h1 className="text-3xl font-semibold text-slate-950">
            {slug} / {courseSlug}
          </h1>
        </header>
        <section className="rounded-md border border-slate-200 p-4">
          <h2 className="text-lg font-semibold text-slate-950">SCORM course not found</h2>
          <p className="mt-2 text-sm text-slate-600">Create or select a SCORM 1.2 course before editing package metadata.</p>
        </section>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-6 px-6 py-10">
      <header>
        <p className="text-sm font-medium uppercase tracking-wide text-slate-500">SCORM package</p>
        <h1 className="text-3xl font-semibold text-slate-950">{course.title}</h1>
        <p className="mt-2 text-sm text-slate-600">
          {slug} / {courseSlug}
        </p>
      </header>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <form action={uploadPackageAction} className="grid gap-4 rounded-md border border-slate-200 p-4 md:grid-cols-2">
          <h2 className="text-lg font-semibold text-slate-950 md:col-span-2">Upload zip metadata</h2>
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Original file name
            <input name="originalFileName" placeholder="package.zip" className="rounded-md border border-slate-300 px-3 py-2" />
          </label>
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Content type
            <input name="contentType" defaultValue="application/zip" className="rounded-md border border-slate-300 px-3 py-2" />
          </label>
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Byte size
            <input name="byteSize" type="number" min="1" className="rounded-md border border-slate-300 px-3 py-2" />
          </label>
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Launch path
            <input name="launchPath" placeholder="index.html" className="rounded-md border border-slate-300 px-3 py-2" />
          </label>
          <label className="grid gap-1 text-sm font-medium text-slate-700 md:col-span-2">
            Manifest title
            <input name="manifestTitle" className="rounded-md border border-slate-300 px-3 py-2" />
          </label>
          <button type="submit" className="rounded-md bg-slate-950 px-4 py-2 text-sm font-medium text-white md:col-span-2">
            Save package metadata
          </button>
        </form>

        <aside className="rounded-md border border-slate-200 p-4">
          <h2 className="text-lg font-semibold text-slate-950">Active package</h2>
          {activePackage ? (
            <dl className="mt-4 grid gap-3 text-sm">
              <div className="rounded-md bg-slate-50 p-3">
                <dt className="font-medium text-slate-500">Upload zip</dt>
                <dd className="mt-1 break-words text-slate-950">{activePackage.storageKey}</dd>
              </div>
              <div className="rounded-md bg-slate-50 p-3">
                <dt className="font-medium text-slate-500">contentRootKey</dt>
                <dd className="mt-1 break-words text-slate-950">{activePackage.contentRootKey}</dd>
              </div>
              <div className="rounded-md bg-slate-50 p-3">
                <dt className="font-medium text-slate-500">Launch path</dt>
                <dd className="mt-1 break-words text-slate-950">{activePackage.launchPath}</dd>
              </div>
              <div className="rounded-md bg-slate-50 p-3">
                <dt className="font-medium text-slate-500">Manifest</dt>
                <dd className="mt-1 text-slate-950">{activePackage.manifestTitle ?? "Not recorded"}</dd>
              </div>
              <div className="rounded-md bg-slate-50 p-3">
                <dt className="font-medium text-slate-500">Extraction status</dt>
                <dd className="mt-1 text-slate-950">{activePackage.extractionStatus}</dd>
                {activePackage.extractionError ? <dd className="mt-1 text-xs text-red-700">{activePackage.extractionError}</dd> : null}
              </div>
              <div className="rounded-md bg-slate-50 p-3">
                <dt className="font-medium text-slate-500">Malware scan</dt>
                <dd className="mt-1 text-slate-950">{activePackage.malwareScanStatus}</dd>
                {activePackage.malwareScanError ? <dd className="mt-1 text-xs text-red-700">{activePackage.malwareScanError}</dd> : null}
              </div>
            </dl>
          ) : (
            <p className="mt-4 text-sm text-slate-500">No SCORM package metadata saved yet.</p>
          )}
        </aside>
      </section>

      <section className="rounded-md border border-slate-200 p-4">
        <h2 className="text-lg font-semibold text-slate-950">Runtime tracking</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {["Lesson status", "Score", "Total time"].map((label) => (
            <div key={label} className="rounded-md bg-slate-50 p-3 text-sm font-medium text-slate-700">
              {label}
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
