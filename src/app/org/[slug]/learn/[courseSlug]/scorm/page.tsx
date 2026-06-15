import { LearnerAppShell } from "@/app/ui/learnhub-components";
import { requireOrganizationMemberBySlug } from "@/lib/auth/guards";

import { ScormPlayer } from "./scorm-player";

export const dynamic = "force-dynamic";

type ScormLearnerPageProps = {
  params: Promise<{
    slug: string;
    courseSlug: string;
  }>;
};

export default async function ScormLearnerPage({ params }: ScormLearnerPageProps) {
  const { slug, courseSlug } = await params;
  const { context, organizationId } = await requireOrganizationMemberBySlug(slug);
  const { prisma } = await import("@/lib/prisma");
  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { name: true },
  });
  const organizationName = organization?.name ?? slug;
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
            type: "SCORM_1_2",
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
          scormRegistration: {
            select: {
              scoreRaw: true,
            },
          },
        },
      })
    : null;

  if (!assignment) {
    return (
      <LearnerAppShell organizationName={organizationName} slug={slug} active="courses">
        <div className="lh-main-inner">
          <header className="lh-main-head">
            <div>
              <p className="lh-eyebrow">SCORM player</p>
              <h1>{courseSlug}</h1>
            </div>
          </header>
          <section className="rounded-md border border-slate-200 bg-white p-4">
            <h2 className="text-lg font-semibold text-slate-950">Assigned course required</h2>
            <p className="mt-2 text-sm text-slate-600">Assigned course required to launch this runtime.</p>
          </section>
        </div>
      </LearnerAppShell>
    );
  }

  const scormLaunchPath = `/api/org/${encodeURIComponent(slug)}/assignments/${encodeURIComponent(assignment.id)}/scorm/launch`;
  const scormCommitPath = `/api/org/${encodeURIComponent(slug)}/assignments/${encodeURIComponent(assignment.id)}/scorm/commit`;

  return (
    <LearnerAppShell organizationName={organizationName} slug={slug} active="courses">
      <div
        className="lh-main-inner lh-main-wide"
        data-scorm-launch-path={scormLaunchPath}
        data-scorm-commit-path={scormCommitPath}
      >
        <header className="lh-main-head">
          <div>
            <p className="lh-eyebrow">SCORM player</p>
            <h1>{assignment.course.title}</h1>
            <p>
              {assignment.status} / {assignment.progress?.progressPercent ?? 0}%
            </p>
          </div>
        </header>

        <ScormPlayer
          launchPath={scormLaunchPath}
          commitPath={scormCommitPath}
          initialProgressPercent={assignment.progress?.progressPercent ?? 0}
          initialScore={assignment.scormRegistration?.scoreRaw ?? null}
        />
      </div>
    </LearnerAppShell>
  );
}
