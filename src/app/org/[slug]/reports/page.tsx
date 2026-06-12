import { requireOrganizationMemberBySlug } from "@/lib/auth/guards";
import { createPrismaProgressReportRepository } from "@/modules/reports/prisma-repository";
import {
  resolveProgressReportScope,
  type ProgressReportRow,
  type ProgressReportTargetMembership,
} from "@/modules/reports/progress-report";

export const dynamic = "force-dynamic";

type ProgressReportsPageProps = {
  params: Promise<{
    slug: string;
  }>;
};

export default async function ProgressReportsPage({ params }: ProgressReportsPageProps) {
  const { slug } = await params;
  const { context, organizationId } = await requireOrganizationMemberBySlug(slug);
  const { prisma } = await import("@/lib/prisma");
  const directReports = await loadDirectReportTargets(context, organizationId, prisma);
  const scope = resolveProgressReportScope(context, organizationId, directReports);
  const repository = createPrismaProgressReportRepository(prisma);
  const [
    rows,
    completionRows,
    scoringRows,
    timingRows,
    popularityRows,
    satisfactionRows,
    quizDifficultyRows,
    certificateRows,
  ] = await Promise.all([
    repository.listProgressRows({ organizationId, scope }),
    repository.listCourseCompletionRows({ organizationId, scope }),
    repository.listScoringRows({ organizationId, scope }),
    repository.listTimingRows({ organizationId, scope }),
    repository.getPopularityRows({ organizationId, scope }),
    repository.listSatisfactionRows({ organizationId, scope }),
    repository.listQuizDifficultyRows({ organizationId, scope }),
    repository.listCertificateCredentialRows({ organizationId, scope }),
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
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-6 px-6 py-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium uppercase tracking-wide text-slate-500">Progress report</p>
          <h1 className="text-3xl font-semibold text-slate-950">{slug} learning progress</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          {exportLinks.map(([label, path]) => (
            <a
              key={path}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-800"
              href={`/api/org/${encodeURIComponent(slug)}/reports/${path}`}
            >
              {label} CSV
            </a>
          ))}
        </div>
      </header>

      <ProgressReportTable rows={rows} emptyMessage="No progress records match your report scope." />
      <section className="grid gap-4 md:grid-cols-4">
        <MetricCard label="Most viewed" value={popularityRows.mostViewed?.courseTitle ?? "None"} />
        <MetricCard label="Most enrolled" value={popularityRows.mostEnrolled?.courseTitle ?? "None"} />
        <MetricCard label="Most completed" value={popularityRows.mostCompleted?.courseTitle ?? "None"} />
        <MetricCard label="Highest rated" value={popularityRows.highestRated?.courseTitle ?? "None"} />
      </section>
      <SimpleReportTable
        title="Course completion"
        headers={["Course", "Assigned", "Started", "Completed", "Overdue", "Rate"]}
        rows={completionRows.map((row) => [
          row.courseTitle,
          row.assignedCount,
          row.startedCount,
          row.completedCount,
          row.overdueCount,
          `${row.completionRate}%`,
        ])}
        emptyMessage="No completion rows match your report scope."
      />
      <SimpleReportTable
        title="Scoring"
        headers={["Course", "Attempts", "Average", "Best", "Latest", "Pass rate"]}
        rows={scoringRows.map((row) => [
          row.courseTitle,
          row.attemptCount,
          row.averageScore,
          row.bestScore,
          row.latestScore,
          `${row.passRate}%`,
        ])}
        emptyMessage="No scoring attempts match your report scope."
      />
      <SimpleReportTable
        title="Timing"
        headers={["Course", "Learners", "Average seconds", "Total seconds", "Last activity"]}
        rows={timingRows.map((row) => [
          row.courseTitle,
          row.learnerCount,
          row.averageTimeSeconds,
          row.totalTimeSeconds,
          row.lastActivityAt?.toLocaleString() ?? "None",
        ])}
        emptyMessage="No timing rows match your report scope."
      />
      <SimpleReportTable
        title="Satisfaction"
        headers={["Course", "Responses", "Average stars", "Latest feedback", "Submitted"]}
        rows={satisfactionRows.map((row) => [
          row.courseTitle,
          row.responseCount,
          row.averageStars,
          row.latestFeedbackText ?? "None",
          row.latestFeedbackAt?.toLocaleString() ?? "None",
        ])}
        emptyMessage="No satisfaction responses match your report scope."
      />
      <SimpleReportTable
        title="Quiz difficulty"
        headers={["Course", "Question", "Attempts", "Correct rate"]}
        rows={quizDifficultyRows.map((row) => [row.courseTitle, row.prompt, row.attempts, `${row.correctRate}%`])}
        emptyMessage="No quiz attempts match your report scope."
      />
      <SimpleReportTable
        title="Certificates and credentials"
        headers={["Learner", "Course", "Issued", "Credential", "Failure"]}
        rows={certificateRows.map((row) => [
          row.learnerName,
          row.courseTitle,
          row.issuedAt.toLocaleDateString(),
          row.credentialProvider ? `${row.credentialProvider}: ${row.credentialStatus ?? "PENDING"}` : "Not issued",
          row.failureMessage ?? "None",
        ])}
        emptyMessage="No certificates match your report scope."
      />
    </main>
  );
}

async function loadDirectReportTargets(
  context: Awaited<ReturnType<typeof requireOrganizationMemberBySlug>>["context"],
  organizationId: string,
  prisma: Awaited<typeof import("@/lib/prisma")>["prisma"],
): Promise<ProgressReportTargetMembership[]> {
  const activeManagerMembership = context.memberships.find(
    (membership) =>
      membership.organizationId === organizationId &&
      membership.status === "ACTIVE" &&
      membership.roles.includes("MANAGER") &&
      !membership.roles.includes("ADMIN"),
  );

  if (!activeManagerMembership || context.isPlatformOwner) {
    return [];
  }

  return prisma.organizationMembership.findMany({
    where: {
      organizationId,
      status: "ACTIVE",
      managerMembershipId: activeManagerMembership.id,
    },
    select: {
      id: true,
      organizationId: true,
    },
  });
}

function ProgressReportTable({
  rows,
  emptyMessage,
}: {
  rows: ProgressReportRow[];
  emptyMessage: string;
}) {
  return (
    <section className="overflow-hidden rounded-md border border-slate-200">
      <table className="w-full border-collapse text-left text-sm">
        <thead className="bg-slate-50 text-slate-600">
          <tr>
            <th className="px-4 py-3 font-medium">Learner</th>
            <th className="px-4 py-3 font-medium">Course</th>
            <th className="px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3 font-medium">Progress</th>
            <th className="px-4 py-3 font-medium">Due</th>
            <th className="px-4 py-3 font-medium">Certificate</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200">
          {rows.length === 0 ? (
            <tr>
              <td className="px-4 py-6 text-slate-500" colSpan={6}>
                {emptyMessage}
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={row.assignmentId}>
                <td className="px-4 py-3">
                  <div className="font-medium text-slate-950">{row.learnerName}</div>
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
    <div className="rounded-md border border-slate-200 p-4">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-2 text-base font-semibold text-slate-950">{value}</p>
    </div>
  );
}

function SimpleReportTable({
  title,
  headers,
  rows,
  emptyMessage,
}: {
  title: string;
  headers: string[];
  rows: Array<Array<string | number>>;
  emptyMessage: string;
}) {
  return (
    <section className="overflow-hidden rounded-md border border-slate-200">
      <div className="border-b border-slate-200 px-4 py-3">
        <h2 className="text-lg font-semibold text-slate-950">{title}</h2>
      </div>
      <table className="w-full border-collapse text-left text-sm">
        <thead className="bg-slate-50 text-slate-600">
          <tr>
            {headers.map((header) => (
              <th key={header} className="px-4 py-3 font-medium">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200">
          {rows.length === 0 ? (
            <tr>
              <td className="px-4 py-6 text-slate-500" colSpan={headers.length}>
                {emptyMessage}
              </td>
            </tr>
          ) : (
            rows.map((row, index) => (
              <tr key={`${title}-${index}`}>
                {row.map((value, cellIndex) => (
                  <td key={`${title}-${index}-${cellIndex}`} className="px-4 py-3 text-slate-700">
                    {value}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </section>
  );
}
