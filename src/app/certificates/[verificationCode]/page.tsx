import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

type CertificateVerificationPageProps = {
  params: Promise<{
    verificationCode: string;
  }>;
};

export default async function CertificateVerificationPage({ params }: CertificateVerificationPageProps) {
  const { verificationCode } = await params;

  const certificate = await prisma.certificate.findUnique({
    where: { verificationCode },
    select: {
      learnerName: true,
      courseTitle: true,
      issuedAt: true,
      organization: {
        select: {
          name: true,
        },
      },
    },
  });

  if (!certificate) {
    notFound();
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-6 px-6 py-10">
      <header>
        <p className="text-sm font-medium uppercase tracking-wide text-emerald-700">Verified certificate</p>
        <h1 className="mt-2 text-3xl font-semibold text-slate-950">{certificate.courseTitle}</h1>
      </header>

      <section className="rounded-md border border-slate-200 p-6">
        <dl className="grid gap-4 text-sm">
          <div>
            <dt className="font-medium text-slate-500">Learner</dt>
            <dd className="mt-1 text-lg font-semibold text-slate-950">{certificate.learnerName}</dd>
          </div>
          <div>
            <dt className="font-medium text-slate-500">Issuer</dt>
            <dd className="mt-1 text-slate-800">{certificate.organization.name}</dd>
          </div>
          <div>
            <dt className="font-medium text-slate-500">Issued</dt>
            <dd className="mt-1 text-slate-800">{certificate.issuedAt.toLocaleDateString()}</dd>
          </div>
        </dl>
      </section>
    </main>
  );
}
