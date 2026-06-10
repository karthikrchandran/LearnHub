import { requireOrganizationUsersAdminBySlug } from "@/lib/auth/guards";

export const dynamic = "force-dynamic";

type AssignmentsAdminPageProps = {
  params: Promise<{
    slug: string;
  }>;
};

export default async function AssignmentsAdminPage({ params }: AssignmentsAdminPageProps) {
  const { slug } = await params;
  await requireOrganizationUsersAdminBySlug(slug);

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-6 px-6 py-10">
      <header>
        <p className="text-sm font-medium uppercase tracking-wide text-slate-500">Assignments</p>
        <h1 className="text-3xl font-semibold text-slate-950">{slug} course assignments</h1>
      </header>

      <section className="grid gap-4">
        <label className="grid gap-2 text-sm font-medium text-slate-700">
          Course selector
          <select disabled className="rounded-md border border-slate-200 px-3 py-2 text-slate-500">
            <option>Select a published course</option>
          </select>
        </label>

        <label className="grid gap-2 text-sm font-medium text-slate-700">
          Learner or direct report
          <select disabled className="rounded-md border border-slate-200 px-3 py-2 text-slate-500">
            <option>Select an active learner</option>
          </select>
        </label>

        <label className="grid gap-2 text-sm font-medium text-slate-700">
          Start date
          <input disabled type="date" className="rounded-md border border-slate-200 px-3 py-2 text-slate-500" />
        </label>

        <button type="button" disabled className="w-fit rounded-md border border-slate-200 px-4 py-2 text-sm text-slate-500">
          Assign course
        </button>
      </section>

      <p className="text-sm text-slate-600">
        Admins can assign courses within the organization; managers only to direct reports.
      </p>
    </main>
  );
}
