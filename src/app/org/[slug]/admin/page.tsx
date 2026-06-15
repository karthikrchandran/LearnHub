import Link from "next/link";

import { AdminAppShell } from "@/app/ui/learnhub-components";

import { getAdminWorkspace } from "./admin-utils";

export const dynamic = "force-dynamic";

type AdminDashboardPageProps = {
  params: Promise<{
    slug: string;
  }>;
};

export default async function AdminDashboardPage({ params }: AdminDashboardPageProps) {
  const { slug } = await params;
  const { organizationId, organizationName, prisma } = await getAdminWorkspace(slug);
  const [courseCount, videoCourseCount, scormCourseCount, userCount, activeLearnerCount, assignmentCount] =
    await Promise.all([
      prisma.course.count({ where: { organizationId } }),
      prisma.course.count({ where: { organizationId, type: "NATIVE_VIDEO" } }),
      prisma.course.count({ where: { organizationId, type: "SCORM_1_2" } }),
      prisma.organizationMembership.count({ where: { organizationId } }),
      prisma.organizationMembership.count({
        where: {
          organizationId,
          status: "ACTIVE",
          roles: { has: "LEARNER" },
        },
      }),
      prisma.courseAssignment.count({ where: { organizationId } }),
    ]);

  const metrics = [
    { label: "Courses", value: courseCount },
    { label: "Video courses", value: videoCourseCount },
    { label: "SCORM courses", value: scormCourseCount },
    { label: "Users", value: userCount },
    { label: "Active learners", value: activeLearnerCount },
    { label: "Assignments", value: assignmentCount },
  ];
  const tasks = [
    {
      title: "Create Course",
      body: "Start a native video or SCORM course and continue directly into the right import screen.",
      href: `/org/${slug}/admin/courses/new`,
    },
    {
      title: "Bulk User Import",
      body: "Validate and commit a CSV user import in its own workflow.",
      href: `/org/${slug}/admin/users/import`,
    },
    {
      title: "Bulk Assignments",
      body: "Assign one published course to many selected learners.",
      href: `/org/${slug}/admin/assignments/bulk`,
    },
    {
      title: "Remove Access",
      body: "Deactivate users without deleting learning history or certificates.",
      href: `/org/${slug}/admin/users/remove`,
    },
  ];

  return (
    <AdminAppShell organizationName={organizationName} slug={slug} active="dashboard">
      <div className="lh-main-inner lh-main-wide">
        <header className="lh-main-head">
          <div>
            <p className="lh-eyebrow">Admin</p>
            <h1>{organizationName} dashboard</h1>
            <p>Manage courses, users, assignments, reports, and tenant settings.</p>
          </div>
        </header>

        <section className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
          {metrics.map((metric) => (
            <div key={metric.label} className="rounded-md border border-slate-200 bg-white p-4">
              <p className="text-sm font-medium text-slate-500">{metric.label}</p>
              <p className="mt-2 text-2xl font-semibold text-slate-950">{metric.value}</p>
            </div>
          ))}
        </section>

        <section className="grid gap-4 md:grid-cols-2">
          {tasks.map((task) => (
            <article key={task.href} className="rounded-md border border-slate-200 bg-white p-5">
              <h2 className="text-lg font-semibold text-slate-950">{task.title}</h2>
              <p className="mt-2 text-sm text-slate-600">{task.body}</p>
              <Link className="mt-4 inline-flex rounded-md bg-slate-950 px-4 py-2 text-sm font-medium text-white" href={task.href}>
                Open
              </Link>
            </article>
          ))}
        </section>
      </div>
    </AdminAppShell>
  );
}
