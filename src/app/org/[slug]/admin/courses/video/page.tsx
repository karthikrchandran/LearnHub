import Link from "next/link";

import { AdminAppShell } from "@/app/ui/learnhub-components";

import { getAdminWorkspace } from "../../admin-utils";

export const dynamic = "force-dynamic";

type AdminVideoCoursesPageProps = {
  params: Promise<{
    slug: string;
  }>;
};

export default async function AdminVideoCoursesPage({ params }: AdminVideoCoursesPageProps) {
  const { slug } = await params;
  const { organizationId, organizationName, prisma } = await getAdminWorkspace(slug);
  const courses = await prisma.course.findMany({
    where: {
      organizationId,
      type: "NATIVE_VIDEO",
    },
    orderBy: { title: "asc" },
    select: {
      id: true,
      title: true,
      slug: true,
      status: true,
      _count: {
        select: {
          videoLessons: true,
        },
      },
    },
  });

  return (
    <AdminAppShell organizationName={organizationName} slug={slug} active="video-content">
      <div className="lh-main-inner lh-main-wide">
        <header className="lh-main-head">
          <div>
            <p className="lh-eyebrow">Courses</p>
            <h1>Video Content</h1>
            <p>Open native video courses to add lessons, media links, Mux uploads, chapters, and transcripts.</p>
          </div>
          <Link className="lh-button lh-button-dark" href={`/org/${slug}/admin/courses/new`}>
            Create Course
          </Link>
        </header>

        <section className="grid gap-3">
          {courses.length === 0 ? (
            <p className="rounded-md border border-slate-200 bg-white p-4 text-sm text-slate-500">
              No native video courses have been created.
            </p>
          ) : (
            courses.map((course) => (
              <article key={course.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-slate-200 bg-white p-4">
                <div>
                  <h2 className="font-semibold text-slate-950">{course.title}</h2>
                  <p className="text-sm text-slate-500">
                    /{course.slug} / {course.status} / {course._count.videoLessons} lessons
                  </p>
                </div>
                <Link className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-800" href={`/org/${slug}/admin/courses/${course.slug}/content`}>
                  Video Content
                </Link>
              </article>
            ))
          )}
        </section>
      </div>
    </AdminAppShell>
  );
}
