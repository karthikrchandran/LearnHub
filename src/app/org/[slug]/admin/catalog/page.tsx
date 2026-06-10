import { requireOrganizationUsersAdminBySlug } from "@/lib/auth/guards";

export const dynamic = "force-dynamic";

type CatalogAdminPageProps = {
  params: Promise<{
    slug: string;
  }>;
};

const lifecycleLabels = ["Draft", "Published", "Deprecated", "Retired"];

export default async function CatalogAdminPage({ params }: CatalogAdminPageProps) {
  const { slug } = await params;
  await requireOrganizationUsersAdminBySlug(slug);

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-6 px-6 py-10">
      <header>
        <p className="text-sm font-medium uppercase tracking-wide text-slate-500">Catalog Admin</p>
        <h1 className="text-3xl font-semibold text-slate-950">{slug} course catalog</h1>
      </header>

      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded-md border border-slate-200 p-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-slate-950">Categories</h2>
            <button type="button" disabled className="rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-500">
              Create category
            </button>
          </div>
          <p className="mt-3 text-sm text-slate-600">Group courses for browsing and related-course matching.</p>
        </div>

        <div className="rounded-md border border-slate-200 p-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-slate-950">Tags</h2>
            <button type="button" disabled className="rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-500">
              Create tag
            </button>
          </div>
          <p className="mt-3 text-sm text-slate-600">Label courses for discovery, assignments, and recommendations.</p>
        </div>

        <div className="rounded-md border border-slate-200 p-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-slate-950">Courses</h2>
            <button type="button" disabled className="rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-500">
              Create course
            </button>
          </div>
          <p className="mt-3 text-sm text-slate-600">Publishable catalog records are managed here when actions are wired.</p>
        </div>
      </section>

      <section className="rounded-md border border-slate-200 p-4">
        <h2 className="text-lg font-semibold text-slate-950">Course lifecycle</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-4">
          {lifecycleLabels.map((label) => (
            <div key={label} className="rounded-md bg-slate-50 p-3 text-sm font-medium text-slate-700">
              {label}
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
