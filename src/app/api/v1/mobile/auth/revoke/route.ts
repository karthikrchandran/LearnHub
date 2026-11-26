import { requireMobileSession, mobileApiErrorResponse } from "@/modules/mobile/mobile-api-auth";
import { prisma } from "@/lib/prisma";
import { revokeMobileSession } from "@/modules/mobile/mobile-sessions";

export async function POST(request: Request): Promise<Response> {
  try {
    const { token, session } = await requireMobileSession(request);
    const userId = typeof token?.id === "string" ? token.id : token?.sub;

    if (!userId) {
      return Response.json({ error: { code: "UNAUTHENTICATED", message: "Authentication is required." } }, { status: 401 });
    }

    await revokeMobileSession(prisma, session.id, userId);
    return Response.json({ revoked: true }, { headers: { "Cache-Control": "no-store, private", Pragma: "no-cache" } });
  } catch (error) {
    return mobileApiErrorResponse(error);
  }
}