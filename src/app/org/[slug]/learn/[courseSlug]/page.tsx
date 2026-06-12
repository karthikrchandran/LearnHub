import { requireOrganizationMemberBySlug } from "@/lib/auth/guards";

import { KnowledgeCheckPanel } from "./knowledge-check-panel";
import { VideoPlayer } from "./video-player";

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
          courseId: true,
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
  const checks = await prisma.courseKnowledgeCheckQuestion.findMany({
    where: {
      organizationId,
      courseId: assignment.courseId,
      active: true,
    },
    orderBy: [{ lessonId: "asc" }, { sortOrder: "asc" }],
    select: {
      id: true,
      prompt: true,
      questionType: true,
      answers: {
        where: { organizationId },
        orderBy: { sortOrder: "asc" },
        select: { id: true, text: true },
      },
    },
  });

  return (
    <main
      className="mx-auto flex min-h-screen max-w-7xl flex-col gap-6 px-6 py-10"
      data-video-launch-path={videoLaunchPath}
      data-video-progress-path={videoProgressPath}
    >
      <VideoPlayer
        launchPath={videoLaunchPath}
        progressPath={videoProgressPath}
        initialProgressPercent={assignment.progress?.progressPercent ?? 0}
      />
      <KnowledgeCheckPanel
        slug={slug}
        assignmentId={assignment.id}
        checks={checks}
        feedbackEndpoint={`/api/org/${encodeURIComponent(slug)}/assignments/${encodeURIComponent(assignment.id)}/feedback`}
      />
    </main>
  );
}
