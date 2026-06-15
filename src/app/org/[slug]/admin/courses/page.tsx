import Link from "next/link";

import { AdminAppShell, Badge } from "@/app/ui/learnhub-components";

import { getAdminWorkspace } from "../admin-utils";

export const dynamic = "force-dynamic";

type AdminCoursesPageProps = {
  params: Promise<{
    slug: string;
  }>;
};

export default async function AdminCoursesPage({ params }: AdminCoursesPageProps) {
  const { slug } = await params;
  const { organizationId, organizationName, prisma } = await getAdminWorkspace(slug);
  const courses = await prisma.course.findMany({
    where: { organizationId },
    orderBy: { title: "asc" },
    select: {
      id: true,
      title: true,
      slug: true,
      type: true,
      status: true,
      expectedDurationMinutes: true,
      estimatedCompletionBusinessDays: true,
      category: { select: { name: true, slug: true } },
      tagLinks: {
        orderBy: { tag: { name: "asc" } },
        select: { tag: { select: { name: true } } },
      },
      _count: {
        select: {
          videoLessons: true,
          scormPackages: true,
        },
      },
    },
  });

  return (
    <AdminAppShell organizationName={organizationName} slug={slug} active="courses">
      <div className="lh-main-inner lh-main-wide">
        <header className="lh-main-head">
          <div>
            <p className="lh-eyebrow">Courses</p>
            <h1>Courses</h1>
            <p>Review course lifecycle, content readiness, and import status.</p>
          </div>
          <Link className="lh-button lh-button-dark" href={`/org/${slug}/admin/courses/new`}>
            Create Course
          </Link>
        </header>

        <section className="overflow-x-auto rounded-md border border-slate-200 bg-white">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead>
              <tr className="text-left text-slate-500">
                <th className="px-4 py-3 font-medium">Course</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">Lifecycle</th>
                <th className="px-4 py-3 font-medium">Content</th>
                <th className="px-4 py-3 font-medium">Timing</th>
                <th className="px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {courses.length === 0 ? (
                <tr>
                  <td className="px-4 py-5 text-slate-500" colSpan={6}>
                    No courses have been created.
                  </td>
                </tr>
              ) : (
                courses.map((course) => {
                  const mediaHref =
                    course.type === "NATIVE_VIDEO"
                      ? `/org/${slug}/admin/courses/${course.slug}/content`
                      : `/org/${slug}/admin/courses/${course.slug}/scorm`;
                  const mediaLabel = course.type === "NATIVE_VIDEO" ? "Video Content" : "SCORM Packages";

                  return (
                    <tr key={course.id}>
                      <td className="px-4 py-4">
                        <div className="font-medium text-slate-950">{course.title}</div>
                        <div className="text-slate-500">/{course.slug}</div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {course.category ? <Badge>{course.category.name}</Badge> : null}
                          {course.tagLinks.map((link) => (
                            <Badge key={link.tag.name} tone="teal">
                              {link.tag.name}
                            </Badge>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-4 text-slate-700">{course.type}</td>
                      <td className="px-4 py-4 text-slate-700">{course.status}</td>
                      <td className="px-4 py-4 text-slate-700">
                        {course.type === "NATIVE_VIDEO"
                          ? `${course._count.videoLessons} lessons`
                          : `${course._count.scormPackages} packages`}
                      </td>
                      <td className="px-4 py-4 text-slate-700">
                        {course.expectedDurationMinutes}m / {course.estimatedCompletionBusinessDays} business days
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex flex-wrap gap-2">
                          <Link className="rounded-md border border-slate-300 px-3 py-2 font-medium text-slate-700" href={`/org/${slug}/admin/courses/${course.slug}`}>
                            Details
                          </Link>
                          <Link className="rounded-md border border-slate-300 px-3 py-2 font-medium text-slate-700" href={mediaHref}>
                            {mediaLabel}
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </section>
      </div>
    </AdminAppShell>
  );
}
