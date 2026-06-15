import Link from "next/link";

import { AdminAppShell } from "@/app/ui/learnhub-components";
import type { AssignmentActionResult } from "@/modules/assignments/server-actions";

import { getAdminWorkspace } from "../admin-utils";
import { AssignmentActionForm } from "./assignment-action-form";
import { assignCourseFormAction } from "./actions";

export const dynamic = "force-dynamic";

type AssignmentsAdminPageProps = {
  params: Promise<{
    slug: string;
  }>;
};

export default async function AssignmentsAdminPage({ params }: AssignmentsAdminPageProps) {
  const { slug } = await params;
  const { organizationId, organizationName, prisma } = await getAdminWorkspace(slug);
  const [publishedCourses, eligibleLearners] = await Promise.all([
    prisma.course.findMany({
      where: {
        organizationId,
        status: "PUBLISHED",
      },
      orderBy: { title: "asc" },
      select: {
        id: true,
        title: true,
        slug: true,
        type: true,
      },
    }),
    prisma.organizationMembership.findMany({
      where: {
        organizationId,
        status: "ACTIVE",
        roles: { has: "LEARNER" },
      },
      orderBy: {
        user: { email: "asc" },
      },
      select: {
        id: true,
        employeeId: true,
        department: true,
        title: true,
        user: {
          select: {
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    }),
  ]);
  const assignCourseAction = async (_previousState: AssignmentActionResult, formData: FormData) => {
    "use server";

    return assignCourseFormAction(slug, formData);
  };

  return (
    <AdminAppShell organizationName={organizationName} slug={slug} active="assignments">
      <div className="lh-main-inner lh-main-wide">
        <header className="lh-main-head">
          <div>
            <p className="lh-eyebrow">Assignments</p>
            <h1>Assign one learner</h1>
            <p>Assign a published course to a single active learner.</p>
          </div>
          <Link className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-800" href={`/org/${slug}/admin/assignments/bulk`}>
            Bulk Assignments
          </Link>
        </header>

        <section className="grid gap-4 rounded-md border border-slate-200 bg-white p-5">
          <AssignmentActionForm
            action={assignCourseAction}
            className="grid gap-4"
            pendingLabel="Assigning..."
            submitLabel="Assign course"
          >
            <label className="grid gap-2 text-sm font-medium text-slate-700">
              Course selector
              <select name="courseId" className="rounded-md border border-slate-300 px-3 py-2">
                <option value="">Select a published course</option>
                {publishedCourses.map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.title} ({course.type})
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-2 text-sm font-medium text-slate-700">
              Learner
              <select name="learnerMembershipId" className="rounded-md border border-slate-300 px-3 py-2">
                <option value="">Select an active learner</option>
                {eligibleLearners.map((learner) => (
                  <option key={learner.id} value={learner.id}>
                    {learner.user.firstName} {learner.user.lastName} ({learner.user.email})
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-2 text-sm font-medium text-slate-700">
              Start date
              <input name="startDate" type="date" className="rounded-md border border-slate-300 px-3 py-2" />
            </label>
          </AssignmentActionForm>
        </section>

        <section className="overflow-x-auto rounded-md border border-slate-200 bg-white">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead>
              <tr className="text-left text-slate-500">
                <th className="px-4 py-3 font-medium">Learner</th>
                <th className="px-4 py-3 font-medium">Department</th>
                <th className="px-4 py-3 font-medium">Title</th>
                <th className="px-4 py-3 font-medium">Employee id</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {eligibleLearners.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-5 text-slate-500">
                    No active learners are available.
                  </td>
                </tr>
              ) : (
                eligibleLearners.map((learner) => (
                  <tr key={learner.id}>
                    <td className="px-4 py-4">
                      <div className="font-medium text-slate-950">
                        {learner.user.firstName} {learner.user.lastName}
                      </div>
                      <div className="text-slate-500">{learner.user.email}</div>
                    </td>
                    <td className="px-4 py-4 text-slate-700">{learner.department ?? "None"}</td>
                    <td className="px-4 py-4 text-slate-700">{learner.title ?? "None"}</td>
                    <td className="px-4 py-4 text-slate-700">{learner.employeeId ?? "None"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </section>
      </div>
    </AdminAppShell>
  );
}
