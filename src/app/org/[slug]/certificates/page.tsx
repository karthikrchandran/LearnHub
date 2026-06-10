import { requireOrganizationMemberBySlug } from "@/lib/auth/guards";

export const dynamic = "force-dynamic";

type CertificatesPageProps = {
  params: Promise<{
    slug: string;
  }>;
};

export default async function CertificatesPage({ params }: CertificatesPageProps) {
  const { slug } = await params;
  const { organizationId } = await requireOrganizationMemberBySlug(slug);
  const { prisma } = await import("@/lib/prisma");

  const certificates = await prisma.certificate.findMany({
    where: { organizationId },
    orderBy: { issuedAt: "desc" },
    select: {
      id: true,
      learnerName: true,
      courseTitle: true,
      issuedAt: true,
      verificationUrl: true,
      credentialIssuances: {
        orderBy: { attemptedAt: "desc" },
        take: 1,
        select: {
          provider: true,
          status: true,
        },
      },
    },
  });

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-6 px-6 py-10">
      <header>
        <p className="text-sm font-medium uppercase tracking-wide text-slate-500">Certificates</p>
        <h1 className="text-3xl font-semibold text-slate-950">{slug} certificate register</h1>
      </header>

      <section className="overflow-hidden rounded-md border border-slate-200">
        <table className="w-full border-collapse text-left text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="px-4 py-3 font-medium">Learner</th>
              <th className="px-4 py-3 font-medium">Course</th>
              <th className="px-4 py-3 font-medium">Issued</th>
              <th className="px-4 py-3 font-medium">Credential</th>
              <th className="px-4 py-3 font-medium">Verification</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {certificates.length === 0 ? (
              <tr>
                <td className="px-4 py-6 text-slate-500" colSpan={5}>
                  No certificates have been issued yet.
                </td>
              </tr>
            ) : (
              certificates.map((certificate) => {
                const credential = certificate.credentialIssuances[0];

                return (
                  <tr key={certificate.id}>
                    <td className="px-4 py-3 font-medium text-slate-950">{certificate.learnerName}</td>
                    <td className="px-4 py-3 text-slate-700">{certificate.courseTitle}</td>
                    <td className="px-4 py-3 text-slate-700">{certificate.issuedAt.toLocaleDateString()}</td>
                    <td className="px-4 py-3 text-slate-700">
                      {credential ? `${credential.provider}: ${credential.status}` : "Not issued"}
                    </td>
                    <td className="px-4 py-3">
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
    </main>
  );
}
