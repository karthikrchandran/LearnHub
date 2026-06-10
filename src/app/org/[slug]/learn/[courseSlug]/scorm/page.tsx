import { requireOrganizationMemberBySlug } from "@/lib/auth/guards";

export const dynamic = "force-dynamic";

type ScormLearnerPageProps = {
  params: Promise<{
    slug: string;
    courseSlug: string;
  }>;
};

export default async function ScormLearnerPage({ params }: ScormLearnerPageProps) {
  const { slug, courseSlug } = await params;
  await requireOrganizationMemberBySlug(slug);

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-6 px-6 py-10">
      <header>
        <p className="text-sm font-medium uppercase tracking-wide text-slate-500">SCORM player</p>
        <h1 className="text-3xl font-semibold text-slate-950">{courseSlug}</h1>
      </header>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="flex aspect-video items-center justify-center rounded-md border border-slate-200 bg-slate-950 text-sm font-medium text-white">
          SCORM player
        </div>

        <aside className="rounded-md border border-slate-200 p-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-slate-950">Launch</h2>
            <button type="button" disabled className="rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-500">
              Start
            </button>
          </div>
          <dl className="mt-4 grid gap-3 text-sm">
            <div className="rounded-md bg-slate-50 p-3">
              <dt className="font-medium text-slate-500">Progress</dt>
              <dd className="mt-1 text-slate-950">0%</dd>
            </div>
            <div className="rounded-md bg-slate-50 p-3">
              <dt className="font-medium text-slate-500">Score</dt>
              <dd className="mt-1 text-slate-950">Not reported</dd>
            </div>
          </dl>
        </aside>
      </section>
    </main>
  );
}
