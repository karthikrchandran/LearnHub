import { requireOrganizationUsersAdminBySlug } from "@/lib/auth/guards";
import { createPrismaCredentialOperationsRepository } from "@/modules/credentials/prisma-repository";

import { retryCredentialFormAction } from "./actions";

export const dynamic = "force-dynamic";

type AdminCredentialsPageProps = {
  params: Promise<{
    slug: string;
  }>;
};

export default async function AdminCredentialsPage({ params }: AdminCredentialsPageProps) {
  const { slug } = await params;
  const { organizationId } = await requireOrganizationUsersAdminBySlug(slug);
  const { prisma } = await import("@/lib/prisma");
  const rows = await createPrismaCredentialOperationsRepository(prisma).listCredentialOperations({
    organizationId,
  });
  const retryAction = async (formData: FormData) => {
    "use server";

    await retryCredentialFormAction(slug, formData);
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-6 px-6 py-10">
      <header>
        <p className="text-sm font-medium uppercase tracking-wide text-slate-500">Credentials</p>
        <h1 className="text-3xl font-semibold text-slate-950">{slug} credential operations</h1>
      </header>

      <section className="overflow-x-auto rounded-md border border-slate-200">
        <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="px-3 py-2 font-medium">Learner</th>
              <th className="px-3 py-2 font-medium">Course</th>
              <th className="px-3 py-2 font-medium">Provider</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Provider URL</th>
              <th className="px-3 py-2 font-medium">Last attempt</th>
              <th className="px-3 py-2 font-medium">Failure</th>
              <th className="px-3 py-2 font-medium">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.length === 0 ? (
              <tr>
                <td className="px-3 py-5 text-slate-500" colSpan={8}>
                  No certificates are available for credential issuance.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.certificateId}>
                  <td className="px-3 py-3">
                    <div className="font-medium text-slate-950">{row.learnerName}</div>
                    <div className="text-slate-500">{row.learnerEmail}</div>
                  </td>
                  <td className="px-3 py-3">
                    <div className="font-medium text-slate-950">{row.courseTitle}</div>
                    <a className="text-blue-700 underline" href={row.verificationUrl}>
                      Certificate
                    </a>
                  </td>
                  <td className="px-3 py-3 text-slate-700">
                    {row.provider ? `${row.provider} (${row.credentialTemplateId ?? "no template"})` : "Not mapped"}
                  </td>
                  <td className="px-3 py-3 text-slate-700">{row.credentialStatus}</td>
                  <td className="px-3 py-3">
                    {row.providerUrl ? (
                      <a className="text-blue-700 underline" href={row.providerUrl}>
                        Provider credential
                      </a>
                    ) : (
                      <span className="text-slate-500">None</span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-slate-700">
                    {row.lastAttemptedAt ? row.lastAttemptedAt.toLocaleString() : "Not attempted"}
                  </td>
                  <td className="max-w-xs px-3 py-3 text-slate-700">{row.failureMessage ?? "None"}</td>
                  <td className="px-3 py-3">
                    {row.provider === "CREDLY" && row.credentialStatus !== "SUCCEEDED" ? (
                      <form action={retryAction}>
                        <input type="hidden" name="certificateId" value={row.certificateId} />
                        <input type="hidden" name="provider" value="CREDLY" />
                        <button type="submit" className="rounded-md bg-slate-950 px-3 py-2 text-xs font-medium text-white">
                          Retry
                        </button>
                      </form>
                    ) : (
                      <span className="text-slate-500">None</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
    </main>
  );
}
