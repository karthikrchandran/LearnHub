import { EmptyActionState, ManagerAppShell } from "@/app/ui/learnhub-components";
import type { AssignmentActionResult } from "@/modules/assignments/server-actions";

import { AssignmentActionForm } from "../../admin/assignments/assignment-action-form";
import { assignCourseFormAction } from "../../admin/assignments/actions";
import {
  getManagerWorkspace,
  hasManagerAccess,
  listManagerDirectReports,
} from "../manager-utils";

export const dynamic = "force-dynamic";

type ManagerAssignmentsPageProps = {
  params: Promise<{
    slug: string;
  }>;
};

export default async function ManagerAssignmentsPage({ params }: ManagerAssignmentsPageProps) {
  const { slug } = await params;
  const workspace = await getManagerWorkspace(slug);

  if (!hasManagerAccess(workspace)) {
    return (
      <ManagerAppShell organizationName={workspace.organization.name} slug={slug} active="assignments">
        <div className="lh-main-inner">
          <EmptyActionState
            body="Only active managers can assign courses from the manager workspace."
            title="Manager access required"
          />
        </div>
      </ManagerAppShell>
    );
  }

  const [publishedCourses, directReports] = await Promise.all([
    workspace.prisma.course.findMany({
      where: {
        organizationId: workspace.organizationId,
        status: "PUBLISHED",
      },
      orderBy: { title: "asc" },
      select: {
        id: true,
        title: true,
        type: true,
      },
    }),
    listManagerDirectReports(workspace.prisma, {
      managerMembershipId: workspace.managerMembership.id,
      organizationId: workspace.organizationId,
    }),
  ]);
  const assignCourseAction = async (_previousState: AssignmentActionResult, formData: FormData) => {
    "use server";

    return assignCourseFormAction(slug, formData);
  };

  return (
    <ManagerAppShell organizationName={workspace.organization.name} slug={slug} active="assignments">
      <div className="lh-main-inner">
        <header className="lh-main-head">
          <div>
            <p className="lh-eyebrow">Assign learning</p>
            <h1>Assign courses to direct reports.</h1>
            <p>Managers can assign published courses only to learners assigned to them.</p>
          </div>
        </header>

        <section className="lh-learn-card">
          <AssignmentActionForm
            action={assignCourseAction}
            className="grid gap-4 p-5"
            pendingLabel="Assigning..."
            submitLabel="Assign course"
          >
            <label className="grid gap-2 text-sm font-bold text-slate-700">
              Course
              <select name="courseId" className="rounded-md border border-slate-300 px-3 py-2">
                <option value="">Select a published course</option>
                {publishedCourses.map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.title} ({course.type})
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-2 text-sm font-bold text-slate-700">
              Direct report
              <select name="learnerMembershipId" className="rounded-md border border-slate-300 px-3 py-2">
                <option value="">Select a direct report</option>
                {directReports.map((report) => (
                  <option key={report.id} value={report.id}>
                    {report.user.firstName} {report.user.lastName} ({report.user.email})
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-2 text-sm font-bold text-slate-700">
              Start date
              <input name="startDate" type="date" className="rounded-md border border-slate-300 px-3 py-2" />
            </label>
          </AssignmentActionForm>
        </section>

        <section className="lh-grid-3">
          {directReports.length > 0 ? (
            directReports.map((report) => (
              <article key={report.id} className="lh-learn-card">
                <div className="lh-learn-card-body">
                  <p className="lh-eyebrow">{report.department ?? "Direct report"}</p>
                  <h3 className="lh-card-title">
                    {report.user.firstName} {report.user.lastName}
                  </h3>
                  <p className="lh-card-copy">{report.title ?? report.user.email}</p>
                </div>
              </article>
            ))
          ) : (
            <EmptyActionState
              body="An admin must assign learners to you before you can assign courses."
              title="No direct reports available"
            />
          )}
        </section>
      </div>
    </ManagerAppShell>
  );
}
