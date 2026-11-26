import { prisma } from "@/lib/prisma";
import { mobileApiErrorResponse, requireMobileApiContext } from "@/modules/mobile/mobile-api-auth";

type RouteContext = { params: Promise<{ slug: string; deviceId: string }> };

export async function DELETE(request: Request, { params }: RouteContext): Promise<Response> {
  try {
    const { slug, deviceId } = await params;
    const context = await requireMobileApiContext(request, slug);
    await prisma.mobileDevice.updateMany({
      where: { id: deviceId, userId: context.userId, organizationId: context.organizationId },
      data: { revokedAt: new Date() },
    });

    return Response.json({ revoked: true });
  } catch (error) {
    return mobileApiErrorResponse(error);
  }
}