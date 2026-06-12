import { requireOrganizationMemberBySlug } from "@/lib/auth/guards";

import { selfEnrollFormAction } from "./actions";

export const dynamic = "force-dynamic";

type LearnerCatalogPageProps = {
  params: Promise<{
    slug: string;
  }>;
};

export default async function LearnerCatalogPage({ params }: LearnerCatalogPageProps) {
  const { slug } = await params;
  const { context, organizationId } = await requireOrganizationMemberBySlug(slug);
  const { prisma } = await import("@/lib/prisma");
  const learnerMembership = context.memberships.find(
    (membership) =>
      membership.organizationId === organizationId &&
      membership.status === "ACTIVE" &&
      membership.roles.includes("LEARNER"),
  );
  const assignedCourses = learnerMembership
    ? await prisma.courseAssignment.findMany({
        where: {
          organizationId,
          membershipId: learnerMembership.id,
        },
        orderBy: { dueDate: "asc" },
        select: {
          id: true,
          status: true,
          dueDate: true,
          progress: {
            select: {
              progressPercent: true,
            },
          },
          course: {
            select: {
              id: true,
              title: true,
              slug: true,
              type: true,
              status: true,
            },
          },
        },
      })
    : [];
  const assignedCourseIds = assignedCourses.map((assignment) => assignment.course.id);
  const availableCourses = learnerMembership
    ? await prisma.course.findMany({
        where: {
          organizationId,
          status: "PUBLISHED",
          id: { notIn: assignedCourseIds },
        },
        orderBy: { title: "asc" },
        select: {
          id: true,
          title: true,
          slug: true,
          type: true,
          expectedDurationMinutes: true,
          estimatedCompletionBusinessDays: true,
          category: {
            select: { name: true },
          },
          tagLinks: {
            select: {
              tag: {
                select: { name: true },
              },
            },
            orderBy: { tag: { name: "asc" } },
          },
        },
      })
    : [];
  const relatedCourses = availableCourses.slice(0, 3);
  const today = new Date().toISOString().slice(0, 10);
  const selfEnrollAction = async (formData: FormData) => {
    "use server";

    await selfEnrollFormAction(slug, formData);
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-6 px-6 py-10">
      <header>
        <p className="text-sm font-medium uppercase tracking-wide text-slate-500">Learning</p>
        <h1 className="text-3xl font-semibold text-slate-950">{slug} learner catalog</h1>
      </header>

      <section className="grid gap-4 lg:grid-cols-3">
        <section className="rounded-md border border-slate-200 p-4">
          <h2 className="text-lg font-semibold text-slate-950">Assigned courses</h2>
          <div className="mt-4 space-y-3">
            {assignedCourses.length === 0 ? (
              <p className="text-sm text-slate-500">No courses assigned yet.</p>
            ) : (
              assignedCourses.map((assignment) => (
                <article key={assignment.id} className="rounded-md bg-slate-50 p-3">
                  <h3 className="font-medium text-slate-950">{assignment.course.title}</h3>
                  <p className="text-sm text-slate-600">
                    {assignment.course.type} / {assignment.status} / {assignment.progress?.progressPercent ?? 0}%
                  </p>
                  <p className="text-sm text-slate-500">Due {assignment.dueDate.toLocaleDateString()}</p>
                </article>
              ))
            )}
          </div>
        </section>

        <section className="rounded-md border border-slate-200 p-4">
          <h2 className="text-lg font-semibold text-slate-950">Available courses</h2>
          <div className="mt-4 space-y-3">
            {!learnerMembership ? (
              <p className="text-sm text-slate-500">Learner membership is required for self-enrollment.</p>
            ) : availableCourses.length === 0 ? (
              <p className="text-sm text-slate-500">No available published courses.</p>
            ) : (
              availableCourses.map((course) => (
                <article key={course.id} className="rounded-md bg-slate-50 p-3">
                  <h3 className="font-medium text-slate-950">{course.title}</h3>
                  <p className="text-sm text-slate-600">
                    {course.type} / {course.expectedDurationMinutes}m / {course.estimatedCompletionBusinessDays} business days
                  </p>
                  <p className="text-sm text-slate-500">
                    {course.category?.name ?? "Uncategorized"} /{" "}
                    {course.tagLinks.map((link) => link.tag.name).join(", ") || "No tags"}
                  </p>
                  <form action={selfEnrollAction} className="mt-3">
                    <input type="hidden" name="courseId" value={course.id} />
                    <input type="hidden" name="learnerMembershipId" value={learnerMembership.id} />
                    <input type="hidden" name="startDate" value={today} />
                    <button type="submit" className="rounded-md bg-slate-950 px-3 py-2 text-sm font-medium text-white">
                      Self-enroll
                    </button>
                  </form>
                </article>
              ))
            )}
          </div>
        </section>

        <section className="rounded-md border border-slate-200 p-4">
          <h2 className="text-lg font-semibold text-slate-950">Related courses</h2>
          <div className="mt-4 space-y-3">
            {relatedCourses.length === 0 ? (
              <p className="text-sm text-slate-500">Related courses appear after more catalog data is available.</p>
            ) : (
              relatedCourses.map((course) => (
                <article key={course.id} className="rounded-md bg-slate-50 p-3">
                  <h3 className="font-medium text-slate-950">{course.title}</h3>
                  <p className="text-sm text-slate-600">{course.category?.name ?? "Uncategorized"}</p>
                </article>
              ))
            )}
          </div>
        </section>
      </section>
    </main>
  );
}
