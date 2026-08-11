import { EmptyActionState, ManagerAppShell } from "@/app/ui/learnhub-components";
import { createPrismaProgressReportRepository } from "@/modules/reports/prisma-repository";
import { canViewTenantReports } from "@/modules/reports/report-access";
import {
  resolveProgressReportScope,
  type ProgressReportRow,
} from "@/modules/reports/progress-report";
import type { ReactNode } from "react";

import {
  getManagerWorkspace,
  hasManagerAccess,
  listManagerDirectReportTargets,
} from "../manager-utils";

export const dynamic = "force-dynamic";

type ManagerReportsPageProps = {
  params: Promise<{
    slug: string;
  }>;
};

export default async function ManagerReportsPage({ params }: ManagerReportsPageProps) {
  const { slug } = await params;
  const workspace = await getManagerWorkspace(slug);

  if (!hasManagerAccess(workspace)) {
    return (
      <ManagerAppShell organizationName={workspace.organization.name} slug={slug} active="reports">
        <div className="lh-main-inner">
          <EmptyActionState
            body="Only active managers can view direct-report reports from the manager workspace."
            title="Manager access required"
          />
        </div>
      </ManagerAppShell>
    );
  }

  if (!canViewTenantReports("manager", workspace.organization)) {
    return (
      <ManagerAppShell organizationName={workspace.organization.name} slug={slug} active="reports">
        <div className="lh-main-inner">
          <EmptyActionState
            body="An admin has disabled manager report access for this organization."
            title="Manager reports disabled"
          />
        </div>
      </ManagerAppShell>
    );
  }

  const directReportTargets = await listManagerDirectReportTargets(workspace.prisma, {
    managerMembershipId: workspace.managerMembership.id,
    organizationId: workspace.organizationId,
  });
  const scope = resolveProgressReportScope(workspace.context, workspace.organizationId, directReportTargets);
  const repository = createPrismaProgressReportRepository(workspace.prisma);
  const [
    rows,
    completionRows,
    scoringRows,
    timingRows,
    satisfactionRows,
    quizDifficultyRows,
    certificateRows,
  ] = await Promise.all([
    repository.listProgressRows({ organizationId: workspace.organizationId, scope }),
    repository.listCourseCompletionRows({ organizationId: workspace.organizationId, scope }),
    repository.listScoringRows({ organizationId: workspace.organizationId, scope }),
    repository.listTimingRows({ organizationId: workspace.organizationId, scope }),
    repository.listSatisfactionRows({ organizationId: workspace.organizationId, scope }),
    repository.listQuizDifficultyRows({ organizationId: workspace.organizationId, scope }),
    repository.listCertificateCredentialRows({ organizationId: workspace.organizationId, scope }),
  ]);
  const exportLinks = [
    ["Progress", "progress.csv"],
    ["Completions", "completions.csv"],
    ["Scoring", "scoring.csv"],
    ["Timing", "timing.csv"],
    ["Satisfaction", "satisfaction.csv"],
    ["Quiz difficulty", "quiz-difficulty.csv"],
    ["Certificates", "certificates.csv"],
  ];

  return (
    <ManagerAppShell organizationName={workspace.organization.name} slug={slug} active="reports">
      <div className="lh-main-inner">
        <header className="lh-main-head">
          <div>
            <p className="lh-eyebrow">Direct-report reports</p>
            <h1>Review team learning outcomes.</h1>
            <p>Reports are scoped to learners who report directly to you.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {workspace.organization.allowCsvExports
              ? exportLinks.map(([label, path]) => (
                  <a
                    key={path}
                    className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-800"
                    href={`/api/org/${encodeURIComponent(slug)}/reports/${path}`}
                  >
                    {label} CSV
                  </a>
                ))
              : null}
          </div>
        </header>

        <ReportGroup title="Learner progress">
          <ProgressReportTable rows={rows} />
        </ReportGroup>
        <ReportGroup title="Compliance and completion">
          <section className="lh-grid-3">
            <MetricCard label="Completion rows" value={String(completionRows.length)} />
            <MetricCard label="Certificates" value={String(certificateRows.length)} />
          </section>
        </ReportGroup>
        <ReportGroup title="Assessment quality">
          <section className="lh-grid-3">
            <MetricCard label="Scoring rows" value={String(scoringRows.length)} />
            <MetricCard label="Quiz rows" value={String(quizDifficultyRows.length)} />
          </section>
        </ReportGroup>
        <ReportGroup title="Engagement">
          <section className="lh-grid-3">
            <MetricCard label="Timing rows" value={String(timingRows.length)} />
            <MetricCard label="Feedback rows" value={String(satisfactionRows.length)} />
          </section>
        </ReportGroup>
      </div>
    </ManagerAppShell>
  );
}

function ReportGroup({ children, title }: { children: ReactNode; title: string }) {
  return (
    <section className="grid gap-4">
      <h2 className="text-xl font-semibold text-slate-950">{title}</h2>
      {children}
    </section>
  );
}

function ProgressReportTable({ rows }: { rows: ProgressReportRow[] }) {
  return (
    <section className="overflow-hidden rounded-md border border-slate-200 bg-white">
      <table className="w-full border-collapse text-left text-sm">
        <thead className="bg-slate-50 text-slate-600">
          <tr>
            <th className="px-4 py-3 font-bold">Learner</th>
            <th className="px-4 py-3 font-bold">Course</th>
            <th className="px-4 py-3 font-bold">Status</th>
            <th className="px-4 py-3 font-bold">Progress</th>
            <th className="px-4 py-3 font-bold">Due</th>
            <th className="px-4 py-3 font-bold">Certificate</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200">
          {rows.length === 0 ? (
            <tr>
              <td className="px-4 py-6 text-slate-500" colSpan={6}>
                No direct-report progress records match your report scope.
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={row.assignmentId}>
                <td className="px-4 py-3">
                  <div className="font-bold text-slate-950">{row.learnerName}</div>
                  <div className="text-slate-500">{row.learnerEmail}</div>
                </td>
                <td className="px-4 py-3 text-slate-700">{row.courseTitle}</td>
                <td className="px-4 py-3 text-slate-700">{row.assignmentStatus}</td>
                <td className="px-4 py-3 text-slate-700">{row.progressPercent}%</td>
                <td className="px-4 py-3 text-slate-700">{row.dueDate.toLocaleDateString()}</td>
                <td className="px-4 py-3">
                  {row.certificateUrl ? (
                    <a className="text-blue-700 underline" href={row.certificateUrl}>
                      Certificate
                    </a>
                  ) : (
                    <span className="text-slate-500">Not issued</span>
                  )}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </section>
  );
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
