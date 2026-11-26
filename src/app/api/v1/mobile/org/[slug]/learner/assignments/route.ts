import { requireMobileApiContext, mobileApiErrorResponse } from "@/modules/mobile/mobile-api-auth";
import { createPrismaLearnerExperienceRepository } from "@/modules/learner-experience/prisma-repository";
import { toMobileLearnerAssignmentsResponse } from "@/modules/mobile/learner-contracts";

type RouteContext = { params: Promise<{ slug: string }> };

export async function GET(_request: Request, { params }: RouteContext): Promise<Response> {
  try {
    const { slug } = await params;
    const context = await requireMobileApiContext(_request, slug, "LEARNER");
    const repository = createPrismaLearnerExperienceRepository((await import("@/lib/prisma")).prisma);
    const assignments = await repository.listLearnerAssignments({
      organizationId: context.organizationId,
      membershipId: context.membership.id,
    });

    return Response.json(toMobileLearnerAssignmentsResponse(context.organizationId, assignments));
  } catch (error) {
    return mobileApiErrorResponse(error);
  }
}