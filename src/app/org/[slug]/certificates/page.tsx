import { notFound } from "next/navigation";

import { CertificateCard, EmptyActionState, LearnerAppShell, PrimaryButton } from "@/app/ui/learnhub-components";
import { requireOrganizationMemberBySlug } from "@/lib/auth/guards";
import { createPrismaLearnerExperienceRepository } from "@/modules/learner-experience/prisma-repository";

export const dynamic = "force-dynamic";

type CertificatesPageProps = {
  params: Promise<{
    slug: string;
  }>;
};

type LearnerExperienceRepository = ReturnType<typeof createPrismaLearnerExperienceRepository>;
type LearnerCertificate = Awaited<ReturnType<LearnerExperienceRepository["listCertificates"]>>[number];
type LearnerAssignment = Awaited<ReturnType<LearnerExperienceRepository["listLearnerAssignments"]>>[number];
type AvailableCourse = Awaited<ReturnType<LearnerExperienceRepository["listAvailableCourses"]>>[number];

type LockedCertificate = {
  id: string;
  title: string;
  body: string;
  href: string;
  actionLabel: string;
};

export default async function CertificatesPage({ params }: CertificatesPageProps) {
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
      <LearnerAppShell organizationName={organization.name} slug={slug} active="certificates">
        <div className="mx-auto grid max-w-7xl gap-6">
          <header>
            <p className="text-xs font-black uppercase tracking-[0.14em] text-[var(--learnhub-blue)]">Certificate wallet</p>
            <h1 className="mt-2 text-4xl font-black text-[var(--learnhub-ink)]">Your earned credentials.</h1>
          </header>
          <EmptyActionState
            body="Sign in with an active learner membership to view earned certificates and upcoming credentials."
            title="Learner access required"
          />
        </div>
      </LearnerAppShell>
    );
  }

  const certificates = await repository.listCertificates({ organizationId, membershipId: learnerMembership.id });
  const assignments = await repository.listLearnerAssignments({ organizationId, membershipId: learnerMembership.id });
  const assignedCourseIds = assignments.map((assignment) => assignment.courseId);
  const availableCourses = await repository.listAvailableCourses({ organizationId, excludedCourseIds: assignedCourseIds });
  const earnedCourseIds = new Set(certificates.map((certificate) => certificate.courseId));
  const lockedCertificates = buildLockedCertificates({
    assignments,
    availableCourses,
    earnedCourseIds,
    slug,
  });

  return (
    <LearnerAppShell organizationName={organization.name} slug={slug} active="certificates">
      <div className="mx-auto grid max-w-7xl gap-6">
        <header>
          <p className="text-xs font-black uppercase tracking-[0.14em] text-[var(--learnhub-blue)]">Certificate wallet</p>
          <h1 className="mt-2 text-4xl font-black text-[var(--learnhub-ink)]">Your earned credentials.</h1>
          <p className="mt-3 max-w-3xl text-base text-[var(--learnhub-muted-strong)]">
            Verify completed certificates, download issued artifacts, and see which course credentials are still locked.
          </p>
        </header>

        <section className="grid gap-4 md:grid-cols-3">
          <MetricCard label="Earned" value={String(certificates.length)} />
          <MetricCard label="Upcoming" value={String(lockedCertificates.length)} />
          <MetricCard label="Credential-ready courses" value={String(certificates.length + lockedCertificates.length)} />
        </section>

        <section>
          <div className="mb-4 flex min-w-0 items-center justify-between gap-3">
            <h2 className="text-2xl font-black text-[var(--learnhub-ink)]">Earned certificates</h2>
            <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-[var(--learnhub-muted-strong)]">
              {certificates.length}
            </span>
          </div>
          {certificates.length === 0 ? (
            <EmptyActionState
              action={
                <PrimaryButton href={`/org/${encodeURIComponent(slug)}/learn`} variant="light">
                  Continue learning
                </PrimaryButton>
              }
              body="Complete eligible courses to collect verifiable certificates in this wallet."
              title="No certificates earned yet"
            />
          ) : (
            <div className="grid gap-4">
              {certificates.map((certificate) => (
                <EarnedCertificateCard certificate={certificate} key={certificate.id} />
              ))}
            </div>
          )}
        </section>

        <section>
          <div className="mb-4 flex min-w-0 items-center justify-between gap-3">
            <h2 className="text-2xl font-black text-[var(--learnhub-ink)]">Upcoming and locked certificates</h2>
            <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-[var(--learnhub-muted-strong)]">
              {lockedCertificates.length}
            </span>
          </div>
          {lockedCertificates.length === 0 ? (
            <EmptyActionState
              body="No locked certificates are waiting right now. New assigned or catalog credentials will appear here."
              title="No locked certificates"
            />
          ) : (
            <div className="grid gap-4">
              {lockedCertificates.map((certificate) => (
                <CertificateCard
                  action={
                    <PrimaryButton href={certificate.href} variant="light">
                      {certificate.actionLabel}
                    </PrimaryButton>
                  }
                  body={certificate.body}
                  key={certificate.id}
                  locked
                  title={certificate.title}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </LearnerAppShell>
  );
}

function EarnedCertificateCard({ certificate }: { certificate: LearnerCertificate }) {
  return (
    <CertificateCard
      action={
        <div className="flex flex-wrap gap-2">
          <PrimaryButton href={certificate.verificationUrl} variant="light">Verify</PrimaryButton>
          <PrimaryButton href={`/certificates/${encodeURIComponent(certificate.verificationCode)}/download`} variant="blue">Download</PrimaryButton>
        </div>
      }
      body={`${formatDate(certificate.issuedAt)} / ${credentialStatus(certificate)}`}
      title={certificate.courseTitle}
    />
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <section className="rounded-2xl border border-[var(--learnhub-line)] bg-white p-5 shadow-[0_14px_36px_rgba(22,34,58,0.07)]">
      <p className="text-xs font-black uppercase tracking-[0.14em] text-[var(--learnhub-muted-strong)]">{label}</p>
      <p className="mt-2 text-3xl font-black text-[var(--learnhub-ink)]">{value}</p>
    </section>
  );
}

function buildLockedCertificates({
  assignments,
  availableCourses,
  earnedCourseIds,
  slug,
}: {
  assignments: LearnerAssignment[];
  availableCourses: AvailableCourse[];
  earnedCourseIds: Set<string>;
  slug: string;
}): LockedCertificate[] {
  const assignedCertificates = assignments
    .filter((assignment) => !earnedCourseIds.has(assignment.courseId))
    .map((assignment) => ({
      id: `assignment-${assignment.id}`,
      title: assignment.course.title,
      body: lockedAssignmentBody(assignment),
      href: `/org/${encodeURIComponent(slug)}/learn/courses/${encodeURIComponent(assignment.course.slug)}`,
      actionLabel: assignment.status === "COMPLETED" ? "Review course" : "Continue course",
    }));

  const availableCertificates = availableCourses
    .filter((course) => !earnedCourseIds.has(course.id))
    .map((course) => ({
      id: `available-${course.id}`,
      title: course.title,
      body: `${formatCourseType(course.type)} / ${course.expectedDurationMinutes} min / ${credentialLabel(course.credentialProvider)} eligible when enrolled and completed.`,
      href: `/org/${encodeURIComponent(slug)}/learn/courses/${encodeURIComponent(course.slug)}`,
      actionLabel: "View course",
    }));

  return [...assignedCertificates, ...availableCertificates];
}

function lockedAssignmentBody(assignment: LearnerAssignment): string {
  const dueDate = assignment.dueDate ? ` / Due ${formatDate(assignment.dueDate)}` : "";
  const progress = assignment.progress?.progressPercent ?? (assignment.status === "COMPLETED" ? 100 : 0);

  if (assignment.status === "COMPLETED") {
    return `Completed / certificate issue pending / ${credentialLabel(assignment.course.credentialProvider)}`;
  }

  return `${formatAssignmentStatus(assignment.status)} / ${progress}% complete${dueDate} / ${credentialLabel(assignment.course.credentialProvider)}`;
}

function credentialStatus(certificate: LearnerCertificate): string {
  const issuance = certificate.credentialIssuances[0];

  if (!issuance) {
    return certificate.course.credentialProvider ? `${certificate.course.credentialProvider}: pending` : "LearnHub certificate";
  }

  return `${issuance.provider}: ${formatAssignmentStatus(issuance.status)}`;
}

function credentialLabel(provider: string | null): string {
  return provider ? `${provider} credential` : "LearnHub certificate";
}

function formatAssignmentStatus(status: string): string {
  return status
    .split("_")
    .map((part) => part.slice(0, 1) + part.slice(1).toLowerCase())
    .join(" ");
}

function formatCourseType(type: string): string {
  return type === "SCORM_1_2" ? "SCORM" : "Native video";
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
