import { LogoffLink } from "@/app/ui/logoff-link";
import { requireOrganizationMemberBySlug } from "@/lib/auth/guards";
import {
  createPrismaDashboardRepository,
  getOrganizationDashboardSummary,
} from "@/modules/organizations/dashboard";
import { PrimaryButton } from "@/app/ui/learnhub-components";
import { redirect } from "next/navigation";
import type { CSSProperties } from "react";

export const dynamic = "force-dynamic";

type OrganizationPageProps = {
  params: Promise<{
    slug: string;
  }>;
};

export default async function OrganizationPage({ params }: OrganizationPageProps) {
  const { slug } = await params;
  const { context, organizationId } = await requireOrganizationMemberBySlug(slug);
  const activeMembership = context.memberships.find(
    (membership) => membership.organizationId === organizationId && membership.status === "ACTIVE",
  );
  const roles = activeMembership?.roles ?? [];
  const isLearnerOnly =
    !context.isPlatformOwner &&
    roles.includes("LEARNER") &&
    !roles.some((role) => role === "ADMIN" || role === "MANAGER");

  if (isLearnerOnly) {
    redirect(`/org/${slug}/learn`);
  }

  const isAdminEntry = context.isPlatformOwner || roles.includes("ADMIN");
  const managementEntry = isAdminEntry
    ? {
        body: "Manage catalog setup, assignments, users, branding, and notifications.",
        href: `/org/${slug}/admin`,
        title: "Admin console",
      }
    : {
        body: "Assign courses, monitor direct-report progress, and keep team learning moving.",
        href: `/org/${slug}/manager`,
        title: "Manager workspace",
      };

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
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-4">
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
        </div>
        <LogoffLink />
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
      <section className="grid gap-4 md:grid-cols-3">
        <article className="flex flex-col justify-between rounded-md border border-slate-200 bg-white p-5">
          <div>
            <p className="text-sm font-medium uppercase tracking-wide text-slate-500">Courses</p>
            <h2 className="mt-2 text-xl font-semibold text-slate-950">Learner experience</h2>
            <p className="mt-2 text-sm text-slate-600">
              Continue assigned courses, browse the catalog, and view certificates.
            </p>
          </div>
          <div className="mt-5">
            <PrimaryButton href={`/org/${slug}/learn`} variant="blue">
              Learner experience
            </PrimaryButton>
          </div>
        </article>
        <article className="flex flex-col justify-between rounded-md border border-slate-200 bg-white p-5">
          <div>
            <p className="text-sm font-medium uppercase tracking-wide text-slate-500">Management</p>
            <h2 className="mt-2 text-xl font-semibold text-slate-950">{managementEntry.title}</h2>
            <p className="mt-2 text-sm text-slate-600">{managementEntry.body}</p>
          </div>
          <div className="mt-5">
            <PrimaryButton href={managementEntry.href} variant="light">
              {managementEntry.title}
            </PrimaryButton>
          </div>
        </article>
        <article className="flex flex-col justify-between rounded-md border border-slate-200 bg-white p-5">
          <div>
            <p className="text-sm font-medium uppercase tracking-wide text-slate-500">Insights</p>
            <h2 className="mt-2 text-xl font-semibold text-slate-950">Reports</h2>
            <p className="mt-2 text-sm text-slate-600">
              Review learner progress, completion, scoring, timing, and credential trends.
            </p>
          </div>
          <div className="mt-5">
            <PrimaryButton href={`/org/${slug}/reports`} variant="light">
              Reports
            </PrimaryButton>
          </div>
        </article>
      </section>
    </main>
  );
}
