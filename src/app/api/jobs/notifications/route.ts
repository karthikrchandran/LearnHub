import { processNotificationJobs } from "@/modules/notifications/scheduler";
import { createEmailProviderFromEnv } from "@/modules/providers/email/email-provider";

export const dynamic = "force-dynamic";

const defaultBatchSize = 25;
const maxAttempts = 3;
const processingTimeoutMs = 15 * 60 * 1000;

export async function POST(request: Request): Promise<Response> {
  const [{ env }, { prisma }, { createPrismaNotificationRepository }] = await Promise.all([
    import("@/lib/env"),
    import("@/lib/prisma"),
    import("@/modules/notifications/prisma-repository"),
  ]);
  const configuredSecret = env.NOTIFICATION_JOBS_SECRET;

  if (!configuredSecret?.trim()) {
    return Response.json({ error: "Notification jobs secret is required" }, { status: 503 });
  }

  const providedSecret = readProvidedSecret(request);

  if (!providedSecret) {
    return Response.json({ error: "Notification jobs secret is required" }, { status: 401 });
  }

  if (providedSecret !== configuredSecret) {
    return Response.json({ error: "Notification jobs secret is invalid" }, { status: 403 });
  }

  const result = await processNotificationJobs(
    {
      now: new Date(),
      batchSize: readBatchSize(request),
      maxAttempts,
      processingTimeoutMs,
    },
    createPrismaNotificationRepository(prisma),
    createEmailProviderFromEnv(env, process.env.NODE_ENV),
  );

  return Response.json(result);
}

function readProvidedSecret(request: Request): string | null {
  const authorization = request.headers.get("authorization");

  if (authorization?.startsWith("Bearer ")) {
    return authorization.slice("Bearer ".length).trim();
  }

  return request.headers.get("x-notification-jobs-secret");
}

function readBatchSize(request: Request): number {
  const url = new URL(request.url);
  const batchSize = Number(url.searchParams.get("batchSize"));

  if (!Number.isFinite(batchSize) || batchSize < 1) {
    return defaultBatchSize;
  }

  return Math.min(50, Math.floor(batchSize));
}
