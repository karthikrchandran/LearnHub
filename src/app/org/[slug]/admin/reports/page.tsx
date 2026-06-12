import { requireOrganizationMemberBySlug } from "@/lib/auth/guards";
import { createPrismaProgressReportRepository } from "@/modules/reports/prisma-repository";
import {
  resolveProgressReportScope,
  type ProgressReportRow,
} from "@/modules/reports/progress-report";

export const dynamic = "force-dynamic";

type AdminProgressReportsPageProps = {
  params: Promise<{
    slug: string;
  }>;
};

export default async function AdminProgressReportsPage({ params }: AdminProgressReportsPageProps) {
  const { slug } = await params;
  const { context, organizationId } = await requireOrganizationMemberBySlug(slug);
  const { prisma } = await import("@/lib/prisma");
  const scope = resolveProgressReportScope(context, organizationId);
  const repository = createPrismaProgressReportRepository(prisma);
  const [
    rows,
    completionRows,
    scoringRows,
    timingRows,
    satisfactionRows,
    quizDifficultyRows,
    certificateRows,
  ] =
    scope.kind === "admin"
      ? await Promise.all([
          repository.listProgressRows({ organizationId, scope }),
          repository.listCourseCompletionRows({ organizationId, scope }),
          repository.listScoringRows({ organizationId, scope }),
          repository.listTimingRows({ organizationId, scope }),
          repository.listSatisfactionRows({ organizationId, scope }),
          repository.listQuizDifficultyRows({ organizationId, scope }),
          repository.listCertificateCredentialRows({ organizationId, scope }),
        ])
      : [[], [], [], [], [], [], []];
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
          <p className="text-sm font-medium uppercase tracking-wide text-slate-500">Organization progress</p>
          <h1 className="text-3xl font-semibold text-slate-950">{slug} organization progress</h1>
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

      {scope.kind === "admin" ? (
        <>
          <AdminProgressReportTable rows={rows} />
          <AdminSimpleReportTable
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
          />
          <AdminSimpleReportTable
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
          />
          <AdminSimpleReportTable
            title="Timing"
            headers={["Course", "Learners", "Average seconds", "Total seconds", "Last activity"]}
            rows={timingRows.map((row) => [
              row.courseTitle,
              row.learnerCount,
              row.averageTimeSeconds,
              row.totalTimeSeconds,
              row.lastActivityAt?.toLocaleString() ?? "None",
            ])}
          />
          <AdminSimpleReportTable
            title="Satisfaction"
            headers={["Course", "Responses", "Average stars", "Latest feedback", "Submitted"]}
            rows={satisfactionRows.map((row) => [
              row.courseTitle,
              row.responseCount,
              row.averageStars,
              row.latestFeedbackText ?? "None",
              row.latestFeedbackAt?.toLocaleString() ?? "None",
            ])}
          />
          <AdminSimpleReportTable
            title="Quiz difficulty"
            headers={["Course", "Question", "Attempts", "Correct rate"]}
            rows={quizDifficultyRows.map((row) => [row.courseTitle, row.prompt, row.attempts, `${row.correctRate}%`])}
          />
          <AdminSimpleReportTable
            title="Certificates and credentials"
            headers={["Learner", "Course", "Issued", "Credential", "Failure"]}
            rows={certificateRows.map((row) => [
              row.learnerName,
              row.courseTitle,
              row.issuedAt.toLocaleDateString(),
              row.credentialProvider ? `${row.credentialProvider}: ${row.credentialStatus ?? "PENDING"}` : "Not issued",
              row.failureMessage ?? "None",
            ])}
          />
        </>
      ) : (
        <section className="rounded-md border border-slate-200 p-4 text-sm text-slate-600">
          Organization progress is available to admins.
        </section>
      )}
    </main>
  );
}

function AdminSimpleReportTable({
  title,
  headers,
  rows,
}: {
  title: string;
  headers: string[];
  rows: Array<Array<string | number>>;
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
                No rows.
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

function AdminProgressReportTable({ rows }: { rows: ProgressReportRow[] }) {
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
            <th className="px-4 py-3 font-medium">Last event</th>
            <th className="px-4 py-3 font-medium">Certificate</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200">
          {rows.length === 0 ? (
            <tr>
              <td className="px-4 py-6 text-slate-500" colSpan={7}>
                No progress records for this organization yet.
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
                <td className="px-4 py-3 text-slate-700">
                  {row.lastEventAt ? row.lastEventAt.toLocaleDateString() : "None"}
                </td>
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
