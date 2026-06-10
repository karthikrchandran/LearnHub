import { requireOrganizationUsersAdminBySlug } from "@/lib/auth/guards";

export const dynamic = "force-dynamic";

type ScormAdminPageProps = {
  params: Promise<{
    slug: string;
    courseSlug: string;
  }>;
};

export default async function ScormAdminPage({ params }: ScormAdminPageProps) {
  const { slug, courseSlug } = await params;
  await requireOrganizationUsersAdminBySlug(slug);

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-6 px-6 py-10">
      <header>
        <p className="text-sm font-medium uppercase tracking-wide text-slate-500">SCORM package</p>
        <h1 className="text-3xl font-semibold text-slate-950">
          {slug} / {courseSlug}
        </h1>
      </header>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded-md border border-slate-200 p-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-slate-950">Upload zip</h2>
            <button type="button" disabled className="rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-500">
              Upload
            </button>
          </div>
          <p className="mt-3 text-sm text-slate-600">SCORM 1.2 zip package metadata appears here.</p>
        </div>

        <div className="rounded-md border border-slate-200 p-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-slate-950">Launch path</h2>
            <button type="button" disabled className="rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-500">
              Validate
            </button>
          </div>
          <p className="mt-3 text-sm text-slate-600">The package launch file is stored as a relative path.</p>
        </div>
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
