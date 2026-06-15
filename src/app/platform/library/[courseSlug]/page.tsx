import { LogoffLink } from "@/app/ui/logoff-link";
import { requirePlatformOwner } from "@/lib/auth/guards";
import { ensureGlobalLibraryOrganization } from "@/modules/library/prisma-repository";
import Link from "next/link";
import { redirect } from "next/navigation";

import { updateGlobalLibraryCourseLifecycleFormAction } from "../actions";

export const dynamic = "force-dynamic";

type PlatformLibraryCoursePageProps = {
  params: Promise<{
    courseSlug: string;
  }>;
};

const lifecycleStatuses = ["DRAFT", "PUBLISHED", "DEPRECATED", "RETIRED"] as const;

export default async function PlatformLibraryCoursePage({ params }: PlatformLibraryCoursePageProps) {
  const { courseSlug } = await params;
  await requirePlatformOwner();
  const { prisma } = await import("@/lib/prisma");
  const globalLibraryOrganization = await ensureGlobalLibraryOrganization(prisma);
  const course = await prisma.course.findFirst({
    where: {
      slug: courseSlug,
      organizationId: globalLibraryOrganization.id,
      isGlobalLibraryCourse: true,
    },
    select: {
      id: true,
      title: true,
      slug: true,
      description: true,
      type: true,
      status: true,
      expectedDurationMinutes: true,
      estimatedCompletionBusinessDays: true,
      category: {
        select: { name: true },
      },
      tagLinks: {
        orderBy: { tag: { name: "asc" } },
        select: {
          tag: {
            select: { name: true },
          },
        },
      },
      videoLessons: {
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          title: true,
          durationSeconds: true,
          required: true,
        },
      },
      scormPackages: {
        where: { active: true },
        take: 1,
        orderBy: { updatedAt: "desc" },
        select: {
          id: true,
          originalFileName: true,
          launchPath: true,
          manifestTitle: true,
        },
      },
    },
  });

  if (!course) {
    redirect("/platform/library");
  }

  const updateLifecycleAction = async (formData: FormData) => {
    "use server";

    await updateGlobalLibraryCourseLifecycleFormAction(formData);
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-6 px-6 py-10">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium uppercase tracking-wide text-slate-500">Global Library</p>
          <h1 className="text-3xl font-semibold text-slate-950">{course.title}</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-600">{course.description || "No description yet."}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/platform/library" className="rounded-md border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700">
            Back to library
          </Link>
          <LogoffLink />
        </div>
      </header>

      <section className="grid gap-4 md:grid-cols-4">
        <div className="rounded-md border border-slate-200 p-4">
          <p className="text-sm text-slate-500">Lifecycle</p>
          <p className="mt-2 text-xl font-semibold text-slate-950">{course.status}</p>
        </div>
        <div className="rounded-md border border-slate-200 p-4">
          <p className="text-sm text-slate-500">Type</p>
          <p className="mt-2 text-xl font-semibold text-slate-950">{course.type}</p>
        </div>
        <div className="rounded-md border border-slate-200 p-4">
          <p className="text-sm text-slate-500">Duration</p>
          <p className="mt-2 text-xl font-semibold text-slate-950">{course.expectedDurationMinutes}m</p>
        </div>
        <div className="rounded-md border border-slate-200 p-4">
          <p className="text-sm text-slate-500">Business days</p>
          <p className="mt-2 text-xl font-semibold text-slate-950">{course.estimatedCompletionBusinessDays}</p>
        </div>
      </section>

      <section className="rounded-md border border-slate-200 p-4">
        <h2 className="text-lg font-semibold text-slate-950">Lifecycle controls</h2>
        <form action={updateLifecycleAction} className="mt-4 flex flex-wrap gap-2">
          <input type="hidden" name="courseId" value={course.id} />
          <input type="hidden" name="courseSlug" value={course.slug} />
          {lifecycleStatuses.map((status) => (
            <button
              key={status}
              name="status"
              value={status}
              type="submit"
              className="rounded-md border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700"
            >
              {status === course.status ? `${status} current` : status}
            </button>
          ))}
        </form>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-md border border-slate-200 p-4">
          <h2 className="text-lg font-semibold text-slate-950">Taxonomy</h2>
          <p className="mt-3 text-sm text-slate-700">Category: {course.category?.name ?? "Uncategorized"}</p>
          <p className="mt-2 text-sm text-slate-700">
            Tags: {course.tagLinks.map((link) => link.tag.name).join(", ") || "No tags"}
          </p>
        </div>

        <div className="rounded-md border border-slate-200 p-4">
          <h2 className="text-lg font-semibold text-slate-950">SCORM metadata</h2>
          {course.scormPackages.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">No active SCORM package.</p>
          ) : (
            <div className="mt-3 text-sm text-slate-700">
              <p>{course.scormPackages[0].manifestTitle ?? course.scormPackages[0].originalFileName}</p>
              <p className="text-slate-500">Launch: {course.scormPackages[0].launchPath}</p>
            </div>
          )}
        </div>
      </section>

      <section className="rounded-md border border-slate-200 p-4">
        <h2 className="text-lg font-semibold text-slate-950">Video lessons</h2>
        <div className="mt-4 space-y-2">
          {course.videoLessons.length === 0 ? (
            <p className="text-sm text-slate-500">No video lessons attached.</p>
          ) : (
            course.videoLessons.map((lesson) => (
              <div key={lesson.id} className="rounded-md bg-slate-50 p-3 text-sm text-slate-700">
                <span className="font-medium text-slate-950">{lesson.title}</span> / {lesson.durationSeconds}s /{" "}
                {lesson.required ? "Required" : "Optional"}
              </div>
            ))
          )}
        </div>
      </section>
    </main>
  );
}
