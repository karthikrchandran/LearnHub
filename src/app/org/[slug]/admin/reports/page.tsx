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
  const rows =
    scope.kind === "admin"
      ? await createPrismaProgressReportRepository(prisma).listProgressRows({
          organizationId,
          scope,
        })
      : [];
  const csvPath = `/api/org/${encodeURIComponent(slug)}/reports/progress.csv`;

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-6 px-6 py-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium uppercase tracking-wide text-slate-500">Organization progress</p>
          <h1 className="text-3xl font-semibold text-slate-950">{slug} organization progress</h1>
        </div>
        <a className="rounded-md bg-slate-950 px-4 py-2 text-sm font-medium text-white" href={csvPath}>
          Export CSV
        </a>
      </header>

      {scope.kind === "admin" ? (
        <AdminProgressReportTable rows={rows} />
      ) : (
        <section className="rounded-md border border-slate-200 p-4 text-sm text-slate-600">
          Organization progress is available to admins.
        </section>
      )}
    </main>
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
