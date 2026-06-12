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
  const rows = await createPrismaProgressReportRepository(prisma).listProgressRows({
    organizationId,
    scope,
  });
  const csvPath = `/api/org/${encodeURIComponent(slug)}/reports/progress.csv`;

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-6 px-6 py-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium uppercase tracking-wide text-slate-500">Progress report</p>
          <h1 className="text-3xl font-semibold text-slate-950">{slug} learning progress</h1>
        </div>
        <a className="rounded-md bg-slate-950 px-4 py-2 text-sm font-medium text-white" href={csvPath}>
          Export CSV
        </a>
      </header>

      <ProgressReportTable rows={rows} emptyMessage="No progress records match your report scope." />
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
