import { requireOrganizationUsersAdminBySlug } from "@/lib/auth/guards";
import {
  createPrismaNotificationRepository,
  type NotificationInspectionJob,
} from "@/modules/notifications/prisma-repository";

export const dynamic = "force-dynamic";

type AdminNotificationsPageProps = {
  params: Promise<{
    slug: string;
  }>;
};

export default async function AdminNotificationsPage({ params }: AdminNotificationsPageProps) {
  const { slug } = await params;
  const { organizationId } = await requireOrganizationUsersAdminBySlug(slug);
  const { prisma } = await import("@/lib/prisma");
  const jobs = await createPrismaNotificationRepository(prisma).listTenantNotificationJobs({
    organizationId,
  });

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-6 px-6 py-10">
      <header>
        <p className="text-sm font-medium uppercase tracking-wide text-slate-500">Notifications</p>
        <h1 className="text-3xl font-semibold text-slate-950">{slug} notification jobs</h1>
      </header>

      <NotificationJobsTable jobs={jobs} emptyMessage="No pending or failed notification jobs for this organization." />
    </main>
  );
}

export function NotificationJobsTable({
  jobs,
  emptyMessage,
  showOrganization = false,
}: {
  jobs: NotificationInspectionJob[];
  emptyMessage: string;
  showOrganization?: boolean;
}) {
  const columnCount = showOrganization ? 9 : 8;

  return (
    <section className="overflow-x-auto rounded-md border border-slate-200">
      <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
        <thead className="bg-slate-50 text-slate-600">
          <tr>
            {showOrganization ? <th className="px-3 py-2 font-medium">Organization</th> : null}
            <th className="px-3 py-2 font-medium">Type</th>
            <th className="px-3 py-2 font-medium">Recipient</th>
            <th className="px-3 py-2 font-medium">Course</th>
            <th className="px-3 py-2 font-medium">Status</th>
            <th className="px-3 py-2 font-medium">Attempts</th>
            <th className="px-3 py-2 font-medium">Next run</th>
            <th className="px-3 py-2 font-medium">Sent</th>
            <th className="px-3 py-2 font-medium">Last error</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {jobs.length === 0 ? (
            <tr>
              <td className="px-3 py-5 text-slate-500" colSpan={columnCount}>
                {emptyMessage}
              </td>
            </tr>
          ) : (
            jobs.map((job) => (
              <tr key={job.id}>
                {showOrganization ? (
                  <td className="px-3 py-3 text-slate-700">
                    <div className="font-medium text-slate-950">{job.organizationName ?? job.organizationId}</div>
                    <div className="text-slate-500">{job.organizationSlug ?? job.organizationId}</div>
                  </td>
                ) : null}
                <td className="px-3 py-3 text-slate-700">{job.type}</td>
                <td className="px-3 py-3">
                  <div className="font-medium text-slate-950">{job.recipientName ?? job.recipientEmail}</div>
                  <div className="text-slate-500">{job.recipientEmail}</div>
                </td>
                <td className="px-3 py-3 text-slate-700">{job.courseTitle ?? job.assignmentId}</td>
                <td className="px-3 py-3 text-slate-700">{job.status}</td>
                <td className="px-3 py-3 text-slate-700">{job.attempts}</td>
                <td className="px-3 py-3 text-slate-700">{formatDate(job.nextRunAt)}</td>
                <td className="px-3 py-3 text-slate-700">{job.sentAt ? formatDate(job.sentAt) : "Not sent"}</td>
                <td className="max-w-xs px-3 py-3 text-slate-700">{job.lastError ?? "None"}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </section>
  );
}

function formatDate(date: Date): string {
  return date.toISOString().replace("T", " ").slice(0, 16);
}
