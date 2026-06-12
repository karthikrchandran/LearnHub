import { requireOrganizationMemberBySlug } from "@/lib/auth/guards";

export const dynamic = "force-dynamic";

type CourseRuntimePageProps = {
  params: Promise<{
    slug: string;
    courseSlug: string;
  }>;
};

export default async function CourseRuntimePage({ params }: CourseRuntimePageProps) {
  const { slug, courseSlug } = await params;
  const { context, organizationId } = await requireOrganizationMemberBySlug(slug);
  const { prisma } = await import("@/lib/prisma");
  const learnerMembership = context.memberships.find(
    (membership) =>
      membership.organizationId === organizationId &&
      membership.status === "ACTIVE" &&
      membership.roles.includes("LEARNER"),
  );
  const assignment = learnerMembership
    ? await prisma.courseAssignment.findFirst({
        where: {
          organizationId,
          membershipId: learnerMembership.id,
          course: {
            slug: courseSlug,
            type: "NATIVE_VIDEO",
          },
        },
        select: {
          id: true,
          status: true,
          progress: {
            select: {
              progressPercent: true,
            },
          },
          course: {
            select: {
              title: true,
            },
          },
        },
      })
    : null;

  if (!assignment) {
    return (
      <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-4 px-6 py-10">
        <header>
          <p className="text-sm font-medium uppercase tracking-wide text-slate-500">Learning runtime</p>
          <h1 className="text-3xl font-semibold text-slate-950">{courseSlug}</h1>
        </header>
        <section className="rounded-md border border-slate-200 p-4">
          <h2 className="text-lg font-semibold text-slate-950">Assigned course required</h2>
          <p className="mt-2 text-sm text-slate-600">Assigned course required to launch this runtime.</p>
        </section>
      </main>
    );
  }

  const videoLaunchPath = `/api/org/${encodeURIComponent(slug)}/assignments/${encodeURIComponent(assignment.id)}/video/launch`;
  const videoProgressPath = `/api/org/${encodeURIComponent(slug)}/assignments/${encodeURIComponent(assignment.id)}/video/progress`;

  return (
    <main
      className="mx-auto grid min-h-screen max-w-7xl gap-6 px-6 py-10 lg:grid-cols-[minmax(0,1fr)_22rem]"
      data-video-launch-path={videoLaunchPath}
      data-video-progress-path={videoProgressPath}
    >
      <section className="flex flex-col gap-4">
        <header>
          <p className="text-sm font-medium uppercase tracking-wide text-slate-500">Learning runtime</p>
          <h1 className="text-3xl font-semibold text-slate-950">{assignment.course.title}</h1>
          <p className="mt-2 text-sm text-slate-600">
            {assignment.status} / {assignment.progress?.progressPercent ?? 0}%
          </p>
        </header>

        <div className="flex aspect-video items-center justify-center rounded-md border border-slate-200 bg-slate-950 text-sm font-medium text-white">
          Video player
        </div>

        <div className="flex flex-wrap gap-3">
          {["Resume", "Previous segment", "Next segment"].map((label) => (
            <button
              key={label}
              type="button"
              disabled
              className="rounded-md border border-slate-200 px-4 py-2 text-sm text-slate-500"
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      <aside className="flex flex-col gap-4">
        <section className="rounded-md border border-slate-200 p-4">
          <h2 className="text-lg font-semibold text-slate-950">Chapters</h2>
          <div className="mt-4 flex flex-col gap-2">
            {["Introduction", "Practice", "Wrap up"].map((label) => (
              <button
                key={label}
                type="button"
                disabled
                className="rounded-md border border-slate-200 px-3 py-2 text-left text-sm text-slate-500"
              >
                {label}
              </button>
            ))}
          </div>
        </section>

        <section className="rounded-md border border-slate-200 p-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-slate-950">Transcript</h2>
            <button type="button" disabled className="rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-500">
              Search transcript
            </button>
          </div>
          <div className="mt-4 space-y-3 text-sm text-slate-600">
            <button type="button" disabled className="block text-left text-slate-500">
              00:00 Welcome and learning goals
            </button>
            <button type="button" disabled className="block text-left text-slate-500">
              00:45 Coaching conversation example
            </button>
          </div>
        </section>
      </aside>
    </main>
  );
}
