import { AdminAppShell } from "@/app/ui/learnhub-components";

import { getAdminWorkspace } from "../admin-utils";

export const dynamic = "force-dynamic";

type AdminCertificatesPageProps = {
  params: Promise<{
    slug: string;
  }>;
};

export default async function AdminCertificatesPage({ params }: AdminCertificatesPageProps) {
  const { slug } = await params;
  const { organizationId, organizationName, prisma } = await getAdminWorkspace(slug);
  const certificates = await prisma.certificate.findMany({
    where: { organizationId },
    orderBy: { issuedAt: "desc" },
    take: 100,
    select: {
      id: true,
      learnerName: true,
      learnerEmail: true,
      courseTitle: true,
      issuedAt: true,
      verificationUrl: true,
      credentialIssuances: {
        orderBy: { attemptedAt: "desc" },
        take: 1,
        select: {
          provider: true,
          status: true,
          providerUrl: true,
          errorMessage: true,
        },
      },
    },
  });

  return (
    <AdminAppShell organizationName={organizationName} slug={slug} active="certificates">
      <div className="lh-main-inner lh-main-wide">
      <header className="lh-main-head">
        <div>
          <p className="lh-eyebrow">Certificates</p>
          <h1>{organizationName} certificate operations</h1>
        </div>
      </header>

      <section className="overflow-x-auto rounded-md border border-slate-200">
        <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="px-3 py-2 font-medium">Learner</th>
              <th className="px-3 py-2 font-medium">Course</th>
              <th className="px-3 py-2 font-medium">Issued</th>
              <th className="px-3 py-2 font-medium">Credential</th>
              <th className="px-3 py-2 font-medium">Verification</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {certificates.length === 0 ? (
              <tr>
                <td className="px-3 py-5 text-slate-500" colSpan={5}>
                  No certificates have been issued for this organization.
                </td>
              </tr>
            ) : (
              certificates.map((certificate) => {
                const credential = certificate.credentialIssuances[0];

                return (
                  <tr key={certificate.id}>
                    <td className="px-3 py-3">
                      <div className="font-medium text-slate-950">{certificate.learnerName}</div>
                      <div className="text-slate-500">{certificate.learnerEmail}</div>
                    </td>
                    <td className="px-3 py-3 text-slate-700">{certificate.courseTitle}</td>
                    <td className="px-3 py-3 text-slate-700">{certificate.issuedAt.toLocaleDateString()}</td>
                    <td className="px-3 py-3 text-slate-700">
                      {credential ? (
                        <div>
                          <div>{credential.provider}: {credential.status}</div>
                          {credential.providerUrl ? (
                            <a className="text-blue-700 underline" href={credential.providerUrl}>
                              Provider credential
                            </a>
                          ) : null}
                          {credential.errorMessage ? <div className="text-red-700">{credential.errorMessage}</div> : null}
                        </div>
                      ) : (
                        "Not issued"
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <a className="text-blue-700 underline" href={certificate.verificationUrl}>
                        Verify
                      </a>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </section>
      </div>
    </AdminAppShell>
  );
}
