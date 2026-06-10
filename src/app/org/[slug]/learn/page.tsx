import { requireOrganizationMemberBySlug } from "@/lib/auth/guards";

export const dynamic = "force-dynamic";

type LearnerCatalogPageProps = {
  params: Promise<{
    slug: string;
  }>;
};

export default async function LearnerCatalogPage({ params }: LearnerCatalogPageProps) {
  const { slug } = await params;
  await requireOrganizationMemberBySlug(slug);

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-6 px-6 py-10">
      <header>
        <p className="text-sm font-medium uppercase tracking-wide text-slate-500">Learning</p>
        <h1 className="text-3xl font-semibold text-slate-950">{slug} learner catalog</h1>
      </header>

      <section className="grid gap-4 lg:grid-cols-3">
        {["Assigned courses", "Available courses", "Related courses"].map((label) => (
          <div key={label} className="rounded-md border border-slate-200 p-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-slate-950">{label}</h2>
              <button type="button" disabled className="rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-500">
                Self-enroll
              </button>
            </div>
            <p className="mt-3 text-sm text-slate-600">Catalog data appears here when read models are wired.</p>
          </div>
        ))}
      </section>
    </main>
  );
}
