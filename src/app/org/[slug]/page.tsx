import { requireOrganizationMemberBySlug } from "@/lib/auth/guards";

export const dynamic = "force-dynamic";

type OrganizationPageProps = {
  params: Promise<{
    slug: string;
  }>;
};

export default async function OrganizationPage({ params }: OrganizationPageProps) {
  const { slug } = await params;
  await requireOrganizationMemberBySlug(slug);

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-6 px-6 py-10">
      <header>
        <p className="text-sm font-medium uppercase tracking-wide text-slate-500">Organization</p>
        <h1 className="text-3xl font-semibold text-slate-950">{slug} workspace shell</h1>
      </header>
      <section className="grid gap-4 md:grid-cols-3">
        {["Assigned courses", "In progress", "Certificates"].map((label) => (
          <div key={label} className="rounded-md border border-slate-200 p-4">
            <p className="text-sm text-slate-500">{label}</p>
            <p className="mt-2 text-2xl font-semibold text-slate-950">0</p>
          </div>
        ))}
      </section>
    </main>
  );
}
