import { EmptyActionState, ManagerAppShell, PrimaryButton, ProgressBar } from "@/app/ui/learnhub-components";

import {
  getManagerWorkspace,
  hasManagerAccess,
  listManagerDirectReports,
  type ManagerDirectReport,
} from "./manager-utils";

export const dynamic = "force-dynamic";

type ManagerDashboardPageProps = {
  params: Promise<{
    slug: string;
  }>;
};

export default async function ManagerDashboardPage({ params }: ManagerDashboardPageProps) {
  const { slug } = await params;
  const workspace = await getManagerWorkspace(slug);

  if (!hasManagerAccess(workspace)) {
    return (
      <ManagerAppShell organizationName={workspace.organization.name} slug={slug} active="team">
        <div className="lh-main-inner">
          <header className="lh-main-head">
            <div>
              <p className="lh-eyebrow">Team dashboard</p>
              <h1>Manager access required.</h1>
            </div>
          </header>
          <EmptyActionState
            body="Sign in with an active manager membership to view direct reports, assignments, and reports."
            title="No manager workspace"
          />
        </div>
      </ManagerAppShell>
    );
  }

  const directReports = await listManagerDirectReports(workspace.prisma, {
    managerMembershipId: workspace.managerMembership.id,
    organizationId: workspace.organizationId,
  });
  const assignmentCount = directReports.reduce((sum, report) => sum + report.learningAssignments.length, 0);
  const overdueCount = directReports.reduce(
    (sum, report) => sum + report.learningAssignments.filter((assignment) => assignment.status === "OVERDUE").length,
    0,
  );
  const completedCount = directReports.reduce(
    (sum, report) => sum + report.learningAssignments.filter((assignment) => assignment.status === "COMPLETED").length,
    0,
  );
  const averageProgress = averageDirectReportProgress(directReports);

  return (
    <ManagerAppShell organizationName={workspace.organization.name} slug={slug} active="team">
      <div className="lh-main-inner">
        <header className="lh-main-head">
          <div>
            <p className="lh-eyebrow">Team dashboard</p>
            <h1>Keep direct-report learning moving.</h1>
            <p>Monitor progress, assign courses, and review learning outcomes for your team.</p>
          </div>
          <PrimaryButton href={`/org/${slug}/manager/reports`} variant="blue">
            View reports
          </PrimaryButton>
        </header>

        <section className="lh-grid-3">
          <MetricCard label="Direct reports" value={String(directReports.length)} />
          <MetricCard label="Assignments" value={String(assignmentCount)} />
          <MetricCard label="Overdue" value={String(overdueCount)} />
          <MetricCard label="Completed" value={String(completedCount)} />
          <MetricCard label="Average progress" value={`${averageProgress}%`} />
          <MetricCard label="Certificates" value={String(totalCertificates(directReports))} />
        </section>

        <section className="lh-feature-panel">
          <div>
            <p className="lh-eyebrow">Manager focus</p>
            <h2>{overdueCount > 0 ? "Start with overdue assignments." : "Your team is ready for the next push."}</h2>
            <p>
              Assign the next course from your team workspace, then use reports to track completion,
              scoring, timing, feedback, and certificates.
            </p>
            <div className="lh-feature-actions">
              <PrimaryButton href={`/org/${slug}/manager/assignments`} variant="light">
                Assign learning
              </PrimaryButton>
              <PrimaryButton href={`/org/${slug}/manager/reports`} variant="light">
                Review reports
              </PrimaryButton>
            </div>
          </div>
          <div className="lh-progress-ring">{averageProgress}%</div>
        </section>

        <section className="lh-grid-3">
          {directReports.length > 0 ? (
            directReports.map((report) => <DirectReportCard key={report.id} report={report} slug={slug} />)
          ) : (
            <EmptyActionState
              body="Direct reports appear here after an admin assigns learners to your manager profile."
              title="No direct reports yet"
            />
          )}
        </section>
      </div>
    </ManagerAppShell>
  );
}

function DirectReportCard({ report, slug }: { report: ManagerDirectReport; slug: string }) {
  const assignmentCount = report.learningAssignments.length;
  const completedCount = report.learningAssignments.filter((assignment) => assignment.status === "COMPLETED").length;
  const progress = averageAssignmentProgress(report.learningAssignments);

  return (
    <article className="lh-learn-card">
      <div className="lh-learn-card-body">
        <div>
          <p className="lh-eyebrow">{report.department ?? "Team member"}</p>
          <h3 className="lh-card-title">
            {report.user.firstName} {report.user.lastName}
          </h3>
          <p className="lh-card-copy">{report.title ?? report.user.email}</p>
        </div>
        <ProgressBar value={progress} />
        <div className="lh-meta">
          <span className="lh-tag lh-tag-blue">{assignmentCount} assignments</span>
          <span className="lh-tag lh-tag-green">{completedCount} completed</span>
          <span className="lh-tag lh-tag-teal">{report.certificates.length} certificates</span>
        </div>
        <PrimaryButton href={`/org/${slug}/manager/team/${encodeURIComponent(report.id)}`} variant="light">
          View learner
        </PrimaryButton>
      </div>
    </article>
  );
}

function averageDirectReportProgress(reports: ManagerDirectReport[]): number {
  const assignments = reports.flatMap((report) => report.learningAssignments);

  return averageAssignmentProgress(assignments);
}

function averageAssignmentProgress(assignments: ManagerDirectReport["learningAssignments"]): number {
  if (assignments.length === 0) {
    return 0;
  }

  return Math.round(
    assignments.reduce((sum, assignment) => sum + (assignment.progress?.progressPercent ?? 0), 0) /
      assignments.length,
  );
}

function totalCertificates(reports: ManagerDirectReport[]): number {
  return reports.reduce((sum, report) => sum + report.certificates.length, 0);
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <article className="lh-learn-card">
      <div className="lh-learn-card-body">
        <p className="lh-card-copy">{label}</p>
        <h3 className="lh-card-title">{value}</h3>
      </div>
    </article>
  );
}
