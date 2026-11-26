import { encode } from "next-auth/jwt";
import { z } from "zod";

import { authOptions } from "@/lib/auth/next-auth";
import { prisma } from "@/lib/prisma";
import { authenticateWithPassword } from "@/modules/auth/credentials";
import { isLoginRateLimited, resetLoginRateLimit, createPrismaLoginThrottleRepository } from "@/modules/auth/login-rate-limit";
import { createMobileSession } from "@/modules/mobile/mobile-sessions";

const tokenRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const accessTokenLifetimeSeconds = 15 * 60;
const noStoreHeaders = { "Cache-Control": "no-store, private", Pragma: "no-cache" };

export async function POST(request: Request): Promise<Response> {
  const parsed = tokenRequestSchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return Response.json({ error: { code: "INVALID_REQUEST", message: "Email and password are required." } }, { status: 422, headers: noStoreHeaders });
  }

  const ipAddress = clientIpAddress(request);
  const normalizedEmail = parsed.data.email.trim().toLowerCase();
  const throttleScope = { ipAddress, normalizedEmail };
  const throttleRepository = createPrismaLoginThrottleRepository(prisma);

  if (await isLoginRateLimited(throttleScope, throttleRepository)) {
    return Response.json(
      { error: { code: "RATE_LIMITED", message: "Too many sign-in attempts. Try again shortly." } },
      { status: 429, headers: noStoreHeaders },
    );
  }

  const user = await authenticateWithPassword(
    parsed.data,
    {
      findUserByEmail: (email) =>
        prisma.user.findUnique({
          where: { email },
          select: { id: true, email: true, firstName: true, lastName: true, passwordHash: true, status: true, isPlatformOwner: true },
        }),
    },
  );

  if (!user) {
    return Response.json({ error: { code: "INVALID_CREDENTIALS", message: "Email or password is incorrect." } }, { status: 401, headers: noStoreHeaders });
  }

  await resetLoginRateLimit(throttleScope, throttleRepository);

  if (!authOptions.secret) {
    return Response.json({ error: { code: "AUTH_NOT_CONFIGURED", message: "Mobile authentication is not configured." } }, { status: 503, headers: noStoreHeaders });
  }

  const session = await createMobileSession(prisma, user.id);
  const accessToken = await encode({
    secret: authOptions.secret,
    maxAge: accessTokenLifetimeSeconds,
    token: { id: user.id, sub: user.id, sid: session.id, email: user.email, isPlatformOwner: user.isPlatformOwner },
  });

  return Response.json({
    accessToken,
    tokenType: "Bearer",
    expiresIn: accessTokenLifetimeSeconds,
    refreshToken: session.refreshToken,
    user: { id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName },
  }, { headers: noStoreHeaders });
}

function clientIpAddress(request: Request): string {
  return request.headers.get("cf-connecting-ip")?.trim() ||
    request.headers.get("x-real-ip")?.trim() ||
    request.headers.get("x-forwarded-for")?.split(",").at(-1)?.trim() ||
    "unknown";
}