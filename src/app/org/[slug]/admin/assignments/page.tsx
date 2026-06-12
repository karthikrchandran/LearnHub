import { requireOrganizationMemberBySlug } from "@/lib/auth/guards";

import { assignCourseFormAction } from "./actions";

export const dynamic = "force-dynamic";

type AssignmentsAdminPageProps = {
  params: Promise<{
    slug: string;
  }>;
};

export default async function AssignmentsAdminPage({ params }: AssignmentsAdminPageProps) {
  const { slug } = await params;
  const { context, organizationId } = await requireOrganizationMemberBySlug(slug);
  const { prisma } = await import("@/lib/prisma");
  const activeMembership = context.memberships.find(
    (membership) => membership.organizationId === organizationId && membership.status === "ACTIVE",
  );
  const canAssignAll = context.isPlatformOwner || Boolean(activeMembership?.roles.includes("ADMIN"));
  const canAssignDirectReports = Boolean(activeMembership?.roles.includes("MANAGER"));
  const publishedCourses = await prisma.course.findMany({
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
  });
  const eligibleLearners =
    canAssignAll || canAssignDirectReports
      ? await prisma.organizationMembership.findMany({
          where: {
            organizationId,
            status: "ACTIVE",
            roles: { has: "LEARNER" },
            ...(canAssignAll ? {} : { managerMembershipId: activeMembership?.id }),
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
        })
      : [];
  const assignCourseAction = async (formData: FormData) => {
    "use server";

    await assignCourseFormAction(slug, formData);
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-6 px-6 py-10">
      <header>
        <p className="text-sm font-medium uppercase tracking-wide text-slate-500">Assignments</p>
        <h1 className="text-3xl font-semibold text-slate-950">{slug} course assignments</h1>
      </header>

      <section className="grid gap-4">
        {canAssignAll || canAssignDirectReports ? (
          <form action={assignCourseAction} className="grid gap-4">
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
              Learner or direct report
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

            <button type="submit" className="w-fit rounded-md bg-slate-950 px-4 py-2 text-sm font-medium text-white">
              Assign course
            </button>
          </form>
        ) : (
          <p className="rounded-md border border-slate-200 p-4 text-sm text-slate-600">
            Assignment controls are available to organization admins and managers with direct reports.
          </p>
        )}
      </section>

      <section className="rounded-md border border-slate-200 p-4">
        <h2 className="text-lg font-semibold text-slate-950">Eligible learners</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead>
              <tr className="text-left text-slate-500">
                <th className="px-3 py-2 font-medium">Learner</th>
                <th className="px-3 py-2 font-medium">Department</th>
                <th className="px-3 py-2 font-medium">Title</th>
                <th className="px-3 py-2 font-medium">Employee id</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {eligibleLearners.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-3 py-4 text-slate-500">
                    No eligible learners for your assignment scope.
                  </td>
                </tr>
              ) : (
                eligibleLearners.map((learner) => (
                  <tr key={learner.id}>
                    <td className="px-3 py-3">
                      <div className="font-medium text-slate-950">
                        {learner.user.firstName} {learner.user.lastName}
                      </div>
                      <div className="text-slate-500">{learner.user.email}</div>
                    </td>
                    <td className="px-3 py-3 text-slate-700">{learner.department ?? "None"}</td>
                    <td className="px-3 py-3 text-slate-700">{learner.title ?? "None"}</td>
                    <td className="px-3 py-3 text-slate-700">{learner.employeeId ?? "None"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <p className="text-sm text-slate-600">
        Admins can assign courses within the organization; managers only to direct reports.
      </p>
    </main>
  );
}
