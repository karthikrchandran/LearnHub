import { notFound } from "next/navigation";
import { CertificateRenderer } from "@/modules/certificates/certificate-renderer";
import { buildCertificateShareLinks } from "@/modules/certificates/share-links";

export const dynamic = "force-dynamic";

type CertificateVerificationPageProps = {
  params: Promise<{
    verificationCode: string;
  }>;
};

export default async function CertificateVerificationPage({ params }: CertificateVerificationPageProps) {
  const { verificationCode } = await params;
  const { prisma } = await import("@/lib/prisma");

  const certificate = await prisma.certificate.findUnique({
    where: { verificationCode },
    select: {
      learnerName: true,
      courseTitle: true,
      issuedAt: true,
      issuerName: true,
      issuerLogoUrl: true,
      issuerPrimaryColor: true,
      issuerAccentColor: true,
      verificationCode: true,
      verificationUrl: true,
    },
  });

  if (!certificate) {
    notFound();
  }

  const shareLinks = buildCertificateShareLinks(certificate);

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-6 px-6 py-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium uppercase tracking-wide text-emerald-700">Verified certificate</p>
          <h1 className="mt-2 text-3xl font-semibold text-slate-950">{certificate.courseTitle}</h1>
        </div>
        <a
          className="rounded-md bg-slate-950 px-4 py-2 text-sm font-medium text-white"
          href={`/certificates/${encodeURIComponent(certificate.verificationCode)}/download`}
        >
          Download
        </a>
      </header>

      <CertificateRenderer certificate={certificate} />

      <section className="grid gap-3 rounded-md border border-slate-200 p-4 text-sm text-slate-700">
        <p className="font-medium text-slate-950">Share this certificate</p>
        <div className="flex flex-wrap gap-3">
          <a className="text-blue-700 underline" href={shareLinks.linkedInUrl}>
            LinkedIn
          </a>
          <a className="text-blue-700 underline" href={shareLinks.emailUrl}>
            Email
          </a>
          <span className="break-all text-slate-600">{shareLinks.copyUrl}</span>
        </div>
      </section>
    </main>
  );
}
