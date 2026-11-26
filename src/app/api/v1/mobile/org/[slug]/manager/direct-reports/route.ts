import { requireMobileApiContext, mobileApiErrorResponse } from "@/modules/mobile/mobile-api-auth";
import { listManagerDirectReports } from "@/app/org/[slug]/manager/manager-utils";
import { toMobileManagerDirectReportsResponse } from "@/modules/mobile/manager-contracts";

type RouteContext = { params: Promise<{ slug: string }> };

export async function GET(_request: Request, { params }: RouteContext): Promise<Response> {
  try {
    const { slug } = await params;
    const context = await requireMobileApiContext(_request, slug, "MANAGER");
    const reports = await listManagerDirectReports((await import("@/lib/prisma")).prisma, {
      organizationId: context.organizationId,
      managerMembershipId: context.membership.id,
    });

    return Response.json(toMobileManagerDirectReportsResponse(context.organizationId, reports));
  } catch (error) {
    return mobileApiErrorResponse(error);
  }
}