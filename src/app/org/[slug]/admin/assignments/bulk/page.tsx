import Link from "next/link";

import { AdminAppShell } from "@/app/ui/learnhub-components";
import type { AssignmentActionResult } from "@/modules/assignments/server-actions";

import { getAdminWorkspace } from "../../admin-utils";
import { AssignmentActionForm } from "../assignment-action-form";
import { bulkAssignCourseFormAction } from "../actions";

export const dynamic = "force-dynamic";

type BulkAssignmentsAdminPageProps = {
  params: Promise<{
    slug: string;
  }>;
};

export default async function BulkAssignmentsAdminPage({ params }: BulkAssignmentsAdminPageProps) {
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
  const bulkAssignCourseAction = async (_previousState: AssignmentActionResult, formData: FormData) => {
    "use server";

    return bulkAssignCourseFormAction(slug, formData);
  };

  return (
    <AdminAppShell organizationName={organizationName} slug={slug} active="bulk-assignments">
      <div className="lh-main-inner lh-main-wide">
        <header className="lh-main-head">
          <div>
            <p className="lh-eyebrow">Assignments</p>
            <h1>Bulk Assignments</h1>
            <p>Assign one published course to multiple active learners.</p>
          </div>
          <Link className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-800" href={`/org/${slug}/admin/assignments`}>
            Single assignment
          </Link>
        </header>

        <AssignmentActionForm
          action={bulkAssignCourseAction}
          className="grid gap-5 rounded-md border border-slate-200 bg-white p-5"
          pendingLabel="Assigning..."
          submitLabel="Assign selected learners"
        >
          <div className="grid gap-4 md:grid-cols-2">
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
              Start date
              <input name="startDate" type="date" className="rounded-md border border-slate-300 px-3 py-2" />
            </label>
          </div>

          <fieldset className="grid gap-3 text-sm font-medium text-slate-700">
            <legend>Active learners</legend>
            <div className="grid gap-2 md:grid-cols-2">
              {eligibleLearners.length === 0 ? (
                <p className="text-sm font-normal text-slate-500">No active learners are available.</p>
              ) : (
                eligibleLearners.map((learner) => (
                  <label key={learner.id} className="grid gap-1 rounded-md border border-slate-200 p-3 font-normal text-slate-700">
                    <span className="flex items-center gap-2">
                      <input name="learnerMembershipIds" type="checkbox" value={learner.id} className="h-4 w-4 rounded border-slate-300" />
                      <span className="font-medium text-slate-950">
                        {learner.user.firstName} {learner.user.lastName}
                      </span>
                    </span>
                    <span className="pl-6 text-slate-500">{learner.user.email}</span>
                    <span className="pl-6 text-slate-500">
                      {[learner.department, learner.title, learner.employeeId].filter(Boolean).join(" / ") || "No profile metadata"}
                    </span>
                  </label>
                ))
              )}
            </div>
          </fieldset>

        </AssignmentActionForm>
      </div>
    </AdminAppShell>
  );
}
