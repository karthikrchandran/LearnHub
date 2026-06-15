import Link from "next/link";

import { AdminAppShell } from "@/app/ui/learnhub-components";

import { getAdminWorkspace } from "../../admin-utils";

export const dynamic = "force-dynamic";

type AdminScormCoursesPageProps = {
  params: Promise<{
    slug: string;
  }>;
};

export default async function AdminScormCoursesPage({ params }: AdminScormCoursesPageProps) {
  const { slug } = await params;
  const { organizationId, organizationName, prisma } = await getAdminWorkspace(slug);
  const courses = await prisma.course.findMany({
    where: {
      organizationId,
      type: "SCORM_1_2",
    },
    orderBy: { title: "asc" },
    select: {
      id: true,
      title: true,
      slug: true,
      status: true,
      scormPackages: {
        where: { active: true },
        orderBy: { updatedAt: "desc" },
        take: 1,
        select: {
          originalFileName: true,
          extractionStatus: true,
          malwareScanStatus: true,
        },
      },
    },
  });

  return (
    <AdminAppShell organizationName={organizationName} slug={slug} active="scorm-packages">
      <div className="lh-main-inner lh-main-wide">
        <header className="lh-main-head">
          <div>
            <p className="lh-eyebrow">Courses</p>
            <h1>SCORM Packages</h1>
            <p>Open SCORM 1.2 courses to upload packages and review extraction status.</p>
          </div>
          <Link className="lh-button lh-button-dark" href={`/org/${slug}/admin/courses/new`}>
            Create Course
          </Link>
        </header>

        <section className="grid gap-3">
          {courses.length === 0 ? (
            <p className="rounded-md border border-slate-200 bg-white p-4 text-sm text-slate-500">
              No SCORM courses have been created.
            </p>
          ) : (
            courses.map((course) => {
              const activePackage = course.scormPackages[0] ?? null;

              return (
                <article key={course.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-slate-200 bg-white p-4">
                  <div>
                    <h2 className="font-semibold text-slate-950">{course.title}</h2>
                    <p className="text-sm text-slate-500">
                      /{course.slug} / {course.status} / {activePackage?.originalFileName ?? "No active package"}
                    </p>
                    {activePackage ? (
                      <p className="mt-1 text-sm text-slate-500">
                        Extraction {activePackage.extractionStatus} / scan {activePackage.malwareScanStatus}
                      </p>
                    ) : null}
                  </div>
                  <Link className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-800" href={`/org/${slug}/admin/courses/${course.slug}/scorm`}>
                    SCORM Packages
                  </Link>
                </article>
              );
            })
          )}
        </section>
      </div>
    </AdminAppShell>
  );
}
