import { requireMobileApiContext, mobileApiErrorResponse } from "@/modules/mobile/mobile-api-auth";
import { createPrismaLearnerExperienceRepository } from "@/modules/learner-experience/prisma-repository";

type RouteContext = { params: Promise<{ slug: string }> };

export async function GET(_request: Request, { params }: RouteContext): Promise<Response> {
  try {
    const { slug } = await params;
    const context = await requireMobileApiContext(_request, slug, "LEARNER");
    const repository = createPrismaLearnerExperienceRepository((await import("@/lib/prisma")).prisma);
    const certificates = await repository.listCertificates({
      organizationId: context.organizationId,
      membershipId: context.membership.id,
    });

    return Response.json({
      organizationId: context.organizationId,
      certificates: certificates.map((certificate) => ({
        id: certificate.id,
        courseTitle: certificate.courseTitle,
        verificationUrl: certificate.verificationUrl,
        issuedAt: certificate.issuedAt.toISOString(),
        credentialProvider: certificate.course.credentialProvider,
      })),
    });
  } catch (error) {
    return mobileApiErrorResponse(error);
  }
}