import { renderCertificateArtifact } from "@/modules/certificates/certificate-renderer";

type CertificateDownloadRouteContext = {
  params: Promise<{
    verificationCode: string;
  }>;
};

export async function GET(_request: Request, { params }: CertificateDownloadRouteContext): Promise<Response> {
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
    return Response.json({ error: "Certificate not found" }, { status: 404 });
  }

  return new Response(renderCertificateArtifact(certificate), {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Disposition": `attachment; filename="learnhub-certificate-${certificate.verificationCode}.html"`,
      "Cache-Control": "public, max-age=3600",
    },
  });
}
