import { requirePlatformOwner } from "@/lib/auth/guards";
import {
  createPrismaDashboardRepository,
  getPlatformDashboardSummary,
} from "@/modules/organizations/dashboard";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function PlatformPage() {
  await requirePlatformOwner();
  const { prisma } = await import("@/lib/prisma");
  const summary = await getPlatformDashboardSummary(
    createPrismaDashboardRepository(prisma),
  );
  const organizations = await prisma.organization.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      slug: true,
      status: true,
      allowAdminBranding: true,
      _count: {
        select: {
          memberships: true,
          courses: true,
        },
      },
    },
  });
  const cards = [
    { label: "Organizations", value: summary.organizations },
    { label: "Active users", value: summary.activeUsers },
    { label: "Completions", value: summary.completions },
    { label: "Overdue assignments", value: summary.overdueAssignments },
    { label: "Provider failures", value: summary.providerFailures },
    { label: "Audit logs", value: summary.auditLogs },
  ];

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-6 px-6 py-10">
      <header>
        <p className="text-sm font-medium uppercase tracking-wide text-slate-500">Platform Owner</p>
        <h1 className="text-3xl font-semibold text-slate-950">Platform dashboard</h1>
      </header>
      <section className="grid gap-4 md:grid-cols-3">
        {cards.map((card) => (
          <div key={card.label} className="rounded-md border border-slate-200 p-4">
            <p className="text-sm text-slate-500">{card.label}</p>
            <p className="mt-2 text-2xl font-semibold text-slate-950">{card.value}</p>
          </div>
        ))}
      </section>

      <section className="rounded-md border border-slate-200 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-slate-950">Organizations</h2>
          <Link
            href="/platform/organizations/new"
            className="rounded-md bg-slate-950 px-3 py-2 text-sm font-medium text-white"
          >
            New organization
          </Link>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead>
              <tr className="text-left text-slate-500">
                <th className="px-3 py-2 font-medium">Name</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Members</th>
                <th className="px-3 py-2 font-medium">Courses</th>
                <th className="px-3 py-2 font-medium">Branding policy</th>
                <th className="px-3 py-2 font-medium">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {organizations.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-4 text-slate-500">
                    No organizations created yet.
                  </td>
                </tr>
              ) : (
                organizations.map((organization) => (
                  <tr key={organization.id}>
                    <td className="px-3 py-3">
                      <div className="font-medium text-slate-950">{organization.name}</div>
                      <div className="text-slate-500">{organization.slug}</div>
                    </td>
                    <td className="px-3 py-3 text-slate-700">{organization.status}</td>
                    <td className="px-3 py-3 text-slate-700">{organization._count.memberships}</td>
                    <td className="px-3 py-3 text-slate-700">{organization._count.courses}</td>
                    <td className="px-3 py-3 text-slate-700">
                      {organization.allowAdminBranding ? "Admin editable" : "Platform controlled"}
                    </td>
                    <td className="px-3 py-3">
                      <Link className="font-medium text-slate-950 underline" href={`/platform/organizations/${organization.slug}`}>
                        Edit
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
