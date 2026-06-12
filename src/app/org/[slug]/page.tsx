import { requireOrganizationMemberBySlug } from "@/lib/auth/guards";
import {
  createPrismaDashboardRepository,
  getOrganizationDashboardSummary,
} from "@/modules/organizations/dashboard";
import Link from "next/link";
import type { CSSProperties } from "react";

export const dynamic = "force-dynamic";

type OrganizationPageProps = {
  params: Promise<{
    slug: string;
  }>;
};

export default async function OrganizationPage({ params }: OrganizationPageProps) {
  const { slug } = await params;
  const { organizationId } = await requireOrganizationMemberBySlug(slug);
  const { prisma } = await import("@/lib/prisma");
  const summary = await getOrganizationDashboardSummary(
    { organizationId },
    createPrismaDashboardRepository(prisma),
  );
  const cards = [
    { label: "Assigned courses", value: summary.assignedCourses },
    { label: "In progress", value: summary.inProgressAssignments },
    { label: "Overdue", value: summary.overdueAssignments },
    { label: "Certificates", value: summary.certificates },
    { label: "Average progress", value: `${summary.averageProgressPercent}%` },
  ];
  const brandStyle = {
    "--organization-primary": summary.organization.primaryColor,
    "--organization-accent": summary.organization.accentColor,
  } as CSSProperties;
  const logoStyle = summary.organization.logoUrl
    ? ({
        backgroundImage: `url("${summary.organization.logoUrl}")`,
      } as CSSProperties)
    : undefined;

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-6 px-6 py-10" style={brandStyle}>
      <header className="flex flex-wrap items-center gap-4">
        {logoStyle ? (
          <div
            aria-hidden="true"
            className="h-14 w-14 rounded-md border border-slate-200 bg-contain bg-center bg-no-repeat"
            style={logoStyle}
          />
        ) : null}
        <div>
          <p className="text-sm font-medium uppercase tracking-wide text-slate-500">Organization</p>
          <h1 className="text-3xl font-semibold text-slate-950">
            {summary.organization.name}
          </h1>
        </div>
      </header>
      <section className="h-2 rounded-sm bg-[var(--organization-primary)]" />
      <section className="grid gap-4 md:grid-cols-3">
        {cards.map((card) => (
          <div key={card.label} className="rounded-md border border-slate-200 p-4">
            <p className="text-sm text-slate-500">{card.label}</p>
            <p className="mt-2 text-2xl font-semibold text-slate-950">{card.value}</p>
          </div>
        ))}
      </section>
      <nav className="flex flex-wrap gap-3 text-sm font-medium">
        <Link href={`/org/${slug}/learn`} className="rounded-md border border-slate-300 px-3 py-2 text-slate-800">
          Learning
        </Link>
        <Link href={`/org/${slug}/admin/users`} className="rounded-md border border-slate-300 px-3 py-2 text-slate-800">
          Users
        </Link>
        <Link href={`/org/${slug}/admin/settings`} className="rounded-md border border-slate-300 px-3 py-2 text-slate-800">
          Branding
        </Link>
        <Link
          href={`/org/${slug}/reports`}
          className="rounded-md bg-[var(--organization-accent)] px-3 py-2 text-slate-950"
        >
          Reports
        </Link>
      </nav>
    </main>
  );
}
