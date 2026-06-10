import { requireOrganizationUsersAdminBySlug } from "@/lib/auth/guards";

export const dynamic = "force-dynamic";

type CourseDetailAdminPageProps = {
  params: Promise<{
    slug: string;
    courseSlug: string;
  }>;
};

const fields = [
  ["Title", "Course title appears here"],
  ["Type", "Native video or SCORM"],
  ["Lifecycle", "Draft, Published, Deprecated, or Retired"],
  ["Category", "Catalog category"],
  ["Tags", "Catalog tags"],
  ["Duration", "Expected duration minutes"],
  ["Estimated business days", "Completion estimate"],
];

export default async function CourseDetailAdminPage({ params }: CourseDetailAdminPageProps) {
  const { slug, courseSlug } = await params;
  await requireOrganizationUsersAdminBySlug(slug);

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-6 px-6 py-10">
      <header>
        <p className="text-sm font-medium uppercase tracking-wide text-slate-500">Course detail</p>
        <h1 className="text-3xl font-semibold text-slate-950">
          {slug} / {courseSlug}
        </h1>
      </header>

      <section className="grid gap-4 md:grid-cols-2">
        {fields.map(([label, value]) => (
          <div key={label} className="rounded-md border border-slate-200 p-4">
            <p className="text-sm font-medium text-slate-500">{label}</p>
            <p className="mt-2 text-base text-slate-950">{value}</p>
          </div>
        ))}
      </section>

      <section className="flex flex-wrap gap-3">
        {["Publish", "Deprecate", "Retire"].map((label) => (
          <button key={label} type="button" disabled className="rounded-md border border-slate-200 px-4 py-2 text-sm text-slate-500">
            {label}
          </button>
        ))}
      </section>
    </main>
  );
}
