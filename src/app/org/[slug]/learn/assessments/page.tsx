import { notFound } from "next/navigation";

import { Badge, EmptyActionState, LearnerAppShell, PrimaryButton } from "@/app/ui/learnhub-components";
import { requireOrganizationMemberBySlug } from "@/lib/auth/guards";
import { createPrismaLearnerExperienceRepository } from "@/modules/learner-experience/prisma-repository";
import {
  buildCompletedKnowledgeCheckAttempts,
  buildPendingRequiredChecks,
  type CompletedKnowledgeCheckAttempt,
  type PendingRequiredCheck,
} from "@/modules/learner-experience/read-model";

export const dynamic = "force-dynamic";

type AssessmentsPageProps = {
  params: Promise<{
    slug: string;
  }>;
};

type LearnerExperienceRepository = ReturnType<typeof createPrismaLearnerExperienceRepository>;
type AssessmentAssignment = Awaited<ReturnType<LearnerExperienceRepository["listAssessments"]>>[number];
type PendingCheck = PendingRequiredCheck<AssessmentAssignment>;
type CompletedAttempt = CompletedKnowledgeCheckAttempt<AssessmentAssignment>;

export default async function AssessmentsPage({ params }: AssessmentsPageProps) {
  const { slug } = await params;
  const { context, organizationId } = await requireOrganizationMemberBySlug(slug);
  const { prisma } = await import("@/lib/prisma");
  const repository = createPrismaLearnerExperienceRepository(prisma);
  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { name: true },
  });

  if (!organization) {
    notFound();
  }

  const learnerMembership = context.memberships.find(
    (membership) =>
      membership.organizationId === organizationId &&
      membership.status === "ACTIVE" &&
      membership.roles.includes("LEARNER"),
  );

  if (!learnerMembership) {
    return (
      <LearnerAppShell organizationName={organization.name} slug={slug} active="assessments">
        <div className="lh-main-inner">
          <header className="lh-main-head">
            <div>
              <p className="lh-eyebrow">Assessments</p>
              <h1>Quizzes and knowledge checks.</h1>
            </div>
          </header>
          <EmptyActionState
            body="Sign in with an active learner membership to view pending checks and submitted results."
            title="Learner access required"
          />
        </div>
      </LearnerAppShell>
    );
  }

  const assessments = await repository.listAssessments({ organizationId, membershipId: learnerMembership.id });
  const pendingChecks = buildPendingRequiredChecks(assessments);
  const completedAttempts = buildCompletedKnowledgeCheckAttempts(assessments);
  const requiredCount = assessments.reduce(
    (sum, assignment) => sum + assignment.course.knowledgeCheckQuestions.filter((check) => check.required).length,
    0,
  );
  const completedRequiredCount = Math.max(0, requiredCount - pendingChecks.length);

  return (
    <LearnerAppShell organizationName={organization.name} slug={slug} active="assessments">
      <div className="lh-main-inner">
        <header className="lh-main-head">
          <div>
            <p className="lh-eyebrow">Assessments</p>
            <h1>Quizzes and knowledge checks.</h1>
            <p>Review required checks first, then revisit submitted results when you need another pass.</p>
          </div>
        </header>

        <section className="grid gap-4 md:grid-cols-3">
          <MetricCard label="Assigned courses" value={String(assessments.length)} />
          <MetricCard label="Required complete" value={`${completedRequiredCount}/${requiredCount}`} />
          <MetricCard label="Submitted attempts" value={String(completedAttempts.length)} />
        </section>

        <section className="lh-assessment-board">
          <div className="lh-question-list">
            <div className="mb-1 flex min-w-0 items-center justify-between gap-3">
              <h2 className="text-2xl font-black text-[var(--learnhub-ink)]">Pending</h2>
              <span className="lh-tag">{pendingChecks.length}</span>
            </div>
            {pendingChecks.length === 0 ? (
              <EmptyActionState
                action={
                  <PrimaryButton href={`/org/${encodeURIComponent(slug)}/learn`} variant="light">
                    Back to courses
                  </PrimaryButton>
                }
                body="All required checks currently have a correct attempt. New assigned checks will appear here."
                title="All required checks completed"
              />
            ) : (
              pendingChecks.map((pending) => (
                <PendingCheckCard key={`${pending.assignment.id}-${pending.check.id}`} pending={pending} slug={slug} />
              ))
            )}
          </div>

          <aside className="lh-question-list">
            <div className="lh-aside-card">
              <p className="lh-eyebrow">Completed</p>
              <h2 className="text-2xl font-black text-[var(--learnhub-ink)]">{completedAttempts.length} submitted</h2>
              <p className="lh-card-copy">Completed answers collect here with score, result, submission date, and feedback status.</p>
            </div>
            {completedAttempts.length === 0 ? (
              <EmptyActionState
                body="Submitted knowledge check results will appear here with score, result, submitted date, and feedback status."
                title="No completed attempts yet"
              />
            ) : (
              completedAttempts.map((completed) => (
                <CompletedAttemptCard completed={completed} key={completed.attempt.id} slug={slug} />
              ))
            )}
          </aside>
        </section>
      </div>
    </LearnerAppShell>
  );
}

function PendingCheckCard({ pending, slug }: { pending: PendingCheck; slug: string }) {
  const retryNeeded = Boolean(pending.latestAttempt && !pending.latestAttempt.correct);

  return (
    <article className="lh-question">
      <div className="flex flex-wrap gap-2">
        <Badge tone={retryNeeded ? "amber" : "blue"}>{retryNeeded ? "Retry needed" : "Not started"}</Badge>
        <Badge>{formatQuestionType(pending.check.questionType)}</Badge>
      </div>
      <div className="min-w-0">
        <h3 className="min-w-0 break-words text-lg font-black text-[var(--learnhub-ink)]">{pending.check.prompt}</h3>
        <p className="mt-1 min-w-0 break-words text-sm font-bold text-[var(--learnhub-muted-strong)]">
          {pending.assignment.course.title}
        </p>
        <p className="mt-2 text-sm text-[var(--learnhub-muted)]">
          Required checks stay pending until a correct attempt is submitted.
        </p>
      </div>
      {pending.latestAttempt ? (
        <dl className="grid gap-2 text-sm md:grid-cols-3">
          <DetailRow label="Latest score" value={`${pending.latestAttempt.scorePercent}%`} />
          <DetailRow label="Latest result" value={pending.latestAttempt.correct ? "Correct" : "Review needed"} />
          <DetailRow label="Submitted" value={formatDate(pending.latestAttempt.submittedAt)} />
        </dl>
      ) : null}
      <PrimaryButton
        href={`/org/${encodeURIComponent(slug)}/learn/courses/${encodeURIComponent(pending.assignment.course.slug)}`}
        variant="blue"
      >
        Open course
      </PrimaryButton>
    </article>
  );
}

function CompletedAttemptCard({ completed, slug }: { completed: CompletedAttempt; slug: string }) {
  return (
    <article className="lh-question">
      <div className="flex flex-wrap gap-2">
        <Badge tone={completed.attempt.correct ? "green" : "amber"}>
          {completed.attempt.correct ? "Correct" : "Review needed"}
        </Badge>
        <Badge>{formatQuestionType(completed.check.questionType)}</Badge>
      </div>
      <div className="min-w-0">
        <h3 className="min-w-0 break-words text-lg font-black text-[var(--learnhub-ink)]">{completed.check.prompt}</h3>
        <p className="mt-1 min-w-0 break-words text-sm font-bold text-[var(--learnhub-muted-strong)]">
          {completed.assignment.course.title}
        </p>
      </div>
      <dl className="grid gap-2 text-sm md:grid-cols-4">
        <DetailRow label="Score" value={`${completed.attempt.scorePercent}%`} />
        <DetailRow label="Result" value={completed.attempt.correct ? "Correct" : "Review needed"} />
        <DetailRow label="Submitted" value={formatDate(completed.attempt.submittedAt)} />
        <DetailRow
          label="Feedback"
          value={completed.attempt.selectedAnswerIds.length > 0 ? "Available after submission" : "Not available"}
        />
      </dl>
      <PrimaryButton
        href={`/org/${encodeURIComponent(slug)}/learn/courses/${encodeURIComponent(completed.assignment.course.slug)}`}
        variant="light"
      >
        Review course
      </PrimaryButton>
    </article>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <section className="lh-metric-card">
      <p className="text-xs font-black uppercase tracking-[0.14em] text-[var(--learnhub-muted-strong)]">{label}</p>
      <p className="mt-2 text-3xl font-black text-[var(--learnhub-ink)]">{value}</p>
    </section>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-black uppercase tracking-[0.12em] text-[var(--learnhub-muted-strong)]">{label}</dt>
      <dd className="mt-1 min-w-0 break-words font-bold text-[var(--learnhub-ink)]">{value}</dd>
    </div>
  );
}

function formatQuestionType(type: string): string {
  return type
    .split("_")
    .map((part) => part.slice(0, 1) + part.slice(1).toLowerCase())
    .join(" ");
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
