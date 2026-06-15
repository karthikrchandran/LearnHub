import { notFound } from "next/navigation";

import { EmptyActionState, ManagerAppShell, PrimaryButton, ProgressBar } from "@/app/ui/learnhub-components";

import {
  getManagerWorkspace,
  hasManagerAccess,
  listManagerDirectReportDetail,
  type ManagerDirectReportDetail,
} from "../../manager-utils";

export const dynamic = "force-dynamic";

type ManagerDirectReportPageProps = {
  params: Promise<{
    slug: string;
    membershipId: string;
  }>;
};

export default async function ManagerDirectReportPage({ params }: ManagerDirectReportPageProps) {
  const { slug, membershipId } = await params;
  const workspace = await getManagerWorkspace(slug);

  if (!hasManagerAccess(workspace)) {
    return (
      <ManagerAppShell organizationName={workspace.organization.name} slug={slug} active="team">
        <div className="lh-main-inner">
          <EmptyActionState
            body="Only active managers can inspect direct-report learning detail."
            title="Manager access required"
          />
        </div>
      </ManagerAppShell>
    );
  }

  const report = await listManagerDirectReportDetail(workspace.prisma, {
    managerMembershipId: workspace.managerMembership.id,
    membershipId,
    organizationId: workspace.organizationId,
  });

  if (!report) {
    notFound();
  }

  const assignments = report.learningAssignments;
  const overdueAssignments = assignments.filter((assignment) => assignment.status === "OVERDUE");
  const completedAssignments = assignments.filter((assignment) => assignment.status === "COMPLETED");
  const averageProgress = averageAssignmentProgress(assignments);

  return (
    <ManagerAppShell organizationName={workspace.organization.name} slug={slug} active="team">
      <div className="lh-main-inner lh-main-wide">
        <header className="lh-main-head">
          <div>
            <p className="lh-eyebrow">Compliance detail</p>
            <h1>
              {report.user.firstName} {report.user.lastName}
            </h1>
            <p>
              {report.title ?? "Learner"} / {report.department ?? "No department"} / {report.user.email}
            </p>
          </div>
          <PrimaryButton href={`/org/${slug}/manager/assignments`} variant="light">
            Assign learning
          </PrimaryButton>
        </header>

        <section className="lh-grid-3">
          <MetricCard label="Assignments" value={String(assignments.length)} />
          <MetricCard label="Overdue" value={String(overdueAssignments.length)} />
          <MetricCard label="Completed" value={String(completedAssignments.length)} />
          <MetricCard label="Average progress" value={`${averageProgress}%`} />
          <MetricCard label="Certificates" value={String(report.certificates.length)} />
          <MetricCard label="Employee id" value={report.employeeId ?? "None"} />
        </section>

        <section className="lh-feature-panel">
          <div>
            <p className="lh-eyebrow">Assignment history</p>
            <h2>{overdueAssignments.length > 0 ? "Overdue learning needs follow-up." : "Learning is on track."}</h2>
            <p>
              Review each assigned course, progress, due date, completion state, and certificate status before assigning more learning.
            </p>
          </div>
          <div className="lh-progress-ring">{averageProgress}%</div>
        </section>

        <AssignmentHistoryTable assignments={assignments} />
        <CertificateStatus certificates={report.certificates} />
      </div>
    </ManagerAppShell>
  );
}

function AssignmentHistoryTable({
  assignments,
}: {
  assignments: NonNullable<ManagerDirectReportDetail>["learningAssignments"];
}) {
  return (
    <section className="overflow-hidden rounded-md border border-slate-200 bg-white">
      <div className="border-b border-slate-200 px-4 py-3">
        <h2 className="text-lg font-semibold text-slate-950">Assignment history</h2>
      </div>
      <table className="w-full border-collapse text-left text-sm">
        <thead className="bg-slate-50 text-slate-600">
          <tr>
            <th className="px-4 py-3 font-medium">Course</th>
            <th className="px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3 font-medium">Progress</th>
            <th className="px-4 py-3 font-medium">Due</th>
            <th className="px-4 py-3 font-medium">Certificate status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {assignments.length === 0 ? (
            <tr>
              <td className="px-4 py-5 text-slate-500" colSpan={5}>
                This direct report has no assignments yet.
              </td>
            </tr>
          ) : (
            assignments.map((assignment) => (
              <tr key={assignment.id}>
                <td className="px-4 py-4">
                  <div className="font-medium text-slate-950">{assignment.course.title}</div>
                  <div className="text-slate-500">
                    {assignment.course.type} / {assignment.course.expectedDurationMinutes} min
                  </div>
                </td>
                <td className="px-4 py-4 text-slate-700">{assignment.status}</td>
                <td className="px-4 py-4">
                  <ProgressBar value={assignment.progress?.progressPercent ?? 0} />
                  <div className="mt-1 text-slate-500">{assignment.progress?.progressPercent ?? 0}%</div>
                </td>
                <td className="px-4 py-4 text-slate-700">{assignment.dueDate.toLocaleDateString()}</td>
                <td className="px-4 py-4">
                  {assignment.certificate ? (
                    <a className="text-blue-700 underline" href={`/certificates/${encodeURIComponent(assignment.certificate.verificationCode)}`}>
                      Issued {assignment.certificate.issuedAt.toLocaleDateString()}
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

function CertificateStatus({
  certificates,
}: {
  certificates: NonNullable<ManagerDirectReportDetail>["certificates"];
}) {
  return (
    <section className="rounded-md border border-slate-200 bg-white p-4">
      <h2 className="text-lg font-semibold text-slate-950">Certificate status</h2>
      {certificates.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">No certificates have been issued yet.</p>
      ) : (
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {certificates.map((certificate) => (
            <article key={certificate.id} className="rounded-md border border-slate-200 p-3">
              <h3 className="font-medium text-slate-950">{certificate.courseTitle}</h3>
              <p className="mt-1 text-sm text-slate-500">Issued {certificate.issuedAt.toLocaleDateString()}</p>
              <a className="mt-2 inline-block text-sm font-medium text-blue-700 underline" href={`/certificates/${encodeURIComponent(certificate.verificationCode)}`}>
                Verify certificate
              </a>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function averageAssignmentProgress(assignments: NonNullable<ManagerDirectReportDetail>["learningAssignments"]): number {
  if (assignments.length === 0) {
    return 0;
  }

  return Math.round(
    assignments.reduce((sum, assignment) => sum + (assignment.progress?.progressPercent ?? 0), 0) / assignments.length,
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
