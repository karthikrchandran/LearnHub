import { encode } from "next-auth/jwt";
import { z } from "zod";

import { authOptions } from "@/lib/auth/next-auth";
import { prisma } from "@/lib/prisma";
import { rotateMobileSession } from "@/modules/mobile/mobile-sessions";

const refreshRequestSchema = z.object({ refreshToken: z.string().min(32) });
const accessTokenLifetimeSeconds = 15 * 60;
const noStoreHeaders = { "Cache-Control": "no-store, private", Pragma: "no-cache" };

export async function POST(request: Request): Promise<Response> {
  const parsed = refreshRequestSchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success || !authOptions.secret) {
    return Response.json({ error: { code: "INVALID_REFRESH_TOKEN", message: "The refresh token is invalid." } }, { status: 401, headers: noStoreHeaders });
  }

  const session = await rotateMobileSession(prisma, parsed.data.refreshToken);

  if (!session) {
    return Response.json({ error: { code: "INVALID_REFRESH_TOKEN", message: "The refresh token is invalid." } }, { status: 401, headers: noStoreHeaders });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { id: true, email: true, firstName: true, lastName: true, status: true, isPlatformOwner: true },
  });

  if (!user || user.status !== "ACTIVE") {
    return Response.json({ error: { code: "INVALID_REFRESH_TOKEN", message: "The refresh token is invalid." } }, { status: 401, headers: noStoreHeaders });
  }

  const accessToken = await encode({
    secret: authOptions.secret,
    maxAge: accessTokenLifetimeSeconds,
    token: { id: user.id, sub: user.id, sid: session.id, email: user.email, isPlatformOwner: user.isPlatformOwner },
  });

  return Response.json({
    accessToken,
    refreshToken: session.refreshToken,
    tokenType: "Bearer",
    expiresIn: accessTokenLifetimeSeconds,
    user: { id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName },
  }, { headers: noStoreHeaders });
}