import { requireOrganizationUsersAdminBySlug } from "@/lib/auth/guards";

export const dynamic = "force-dynamic";

type CourseContentAdminPageProps = {
  params: Promise<{
    slug: string;
    courseSlug: string;
  }>;
};

const sections = [
  {
    title: "Modules",
    action: "Add module",
    detail: "Organize lessons into course sections.",
  },
  {
    title: "Video lessons",
    action: "Add lesson",
    detail: "Attach playback assets, duration, and lesson order.",
  },
  {
    title: "Chapters",
    action: "Edit chapters",
    detail: "Define jump points for learner navigation.",
  },
  {
    title: "Transcript",
    action: "Replace transcript",
    detail: "Upload timestamped cues for sync and search.",
  },
];

export default async function CourseContentAdminPage({ params }: CourseContentAdminPageProps) {
  const { slug, courseSlug } = await params;
  await requireOrganizationUsersAdminBySlug(slug);

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-6 px-6 py-10">
      <header>
        <p className="text-sm font-medium uppercase tracking-wide text-slate-500">Course content</p>
        <h1 className="text-3xl font-semibold text-slate-950">
          {slug} / {courseSlug}
        </h1>
      </header>

      <section className="grid gap-4 md:grid-cols-2">
        {sections.map((section) => (
          <div key={section.title} className="rounded-md border border-slate-200 p-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-slate-950">{section.title}</h2>
              <button
                type="button"
                disabled
                className="rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-500"
              >
                {section.action}
              </button>
            </div>
            <p className="mt-3 text-sm text-slate-600">{section.detail}</p>
          </div>
        ))}
      </section>

      <section className="rounded-md border border-slate-200 p-4">
        <h2 className="text-lg font-semibold text-slate-950">Content status</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {["Draft structure", "Transcript uploaded", "Ready for publish"].map((label) => (
            <label key={label} className="flex items-center gap-3 rounded-md bg-slate-50 p-3 text-sm text-slate-700">
              <input type="checkbox" disabled className="h-4 w-4 rounded border-slate-300" />
              {label}
            </label>
          ))}
        </div>
      </section>
    </main>
  );
}
