import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { mobileApiErrorResponse, requireMobileApiContext } from "@/modules/mobile/mobile-api-auth";

const deviceSchema = z.object({
  platform: z.enum(["IOS", "ANDROID"]),
  pushToken: z.string().min(20).max(512),
  appVersion: z.string().trim().max(64).optional(),
  permissionStatus: z.string().trim().max(32).optional(),
});

type RouteContext = { params: Promise<{ slug: string }> };

export async function POST(request: Request, { params }: RouteContext): Promise<Response> {
  try {
    const { slug } = await params;
    const body = deviceSchema.safeParse(await request.json().catch(() => null));

    if (!body.success) {
      return Response.json({ error: { code: "INVALID_REQUEST", message: "A valid device registration is required." } }, { status: 422 });
    }

    const context = await requireMobileApiContext(request, slug);
    const device = await prisma.mobileDevice.upsert({
      where: { pushToken: body.data.pushToken },
      create: {
        userId: context.userId,
        organizationId: context.organizationId,
        platform: body.data.platform,
        pushToken: body.data.pushToken,
        appVersion: body.data.appVersion,
        permissionStatus: body.data.permissionStatus,
      },
      update: {
        userId: context.userId,
        organizationId: context.organizationId,
        platform: body.data.platform,
        appVersion: body.data.appVersion,
        permissionStatus: body.data.permissionStatus,
        revokedAt: null,
        lastSeenAt: new Date(),
      },
      select: { id: true, platform: true, appVersion: true, permissionStatus: true },
    });

    return Response.json({ device });
  } catch (error) {
    return mobileApiErrorResponse(error);
  }
}