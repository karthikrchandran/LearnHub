import { env } from "@/lib/env";
import { issueCertificateForCompletedAssignment } from "@/modules/certificates/certificates";
import { createPrismaCertificateRepository } from "@/modules/certificates/prisma-repository";
import { scheduleCertificateNotification } from "@/modules/notifications/notification-jobs";
import { createPrismaNotificationRepository } from "@/modules/notifications/prisma-repository";
import { createConfiguredCredlyCredentialProvider } from "@/modules/providers/credentials/credly-provider";
import { createPrismaRuntimeRouteRepository } from "@/modules/runtime/prisma-repository";
import { requireLearnerLaunchAssignment, RuntimeRouteError } from "@/modules/runtime/runtime-route-service";
import { createPrismaVideoRepository } from "@/modules/video/prisma-repository";
import { launchVideoRuntime, recordVideoProgress } from "@/modules/video/video-runtime";
import { mobileApiErrorResponse, requireMobileApiContext, toMobileMembershipContext } from "@/modules/mobile/mobile-api-auth";
import {
  claimMobileProgressRequest,
  completeMobileProgressRequest,
  hashMobileProgressRequest,
  releaseMobileProgressClaim,
} from "@/modules/mobile/progress-idempotency";
import { isMobileProgressAdvanceAllowed } from "@/modules/mobile/progress-integrity";

type RouteContext = { params: Promise<{ slug: string; assignmentId: string }> };

export async function POST(request: Request, { params }: RouteContext): Promise<Response> {
  try {
    const { slug, assignmentId } = await params;
    const context = await requireMobileApiContext(request, slug, "LEARNER");
    const idempotencyKey = request.headers.get("idempotency-key")?.trim();

    if (!idempotencyKey || idempotencyKey.length > 128) {
      return Response.json({ error: { code: "INVALID_REQUEST", message: "An idempotency key is required." } }, { status: 422 });
    }

    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    const lessonId = body?.lessonId;
    const positionSecond = body?.positionSecond;
    const watchedSecond = body?.watchedSecond;

    if (
      typeof lessonId !== "string" || lessonId.length === 0 ||
      typeof positionSecond !== "number" || !Number.isFinite(positionSecond) ||
      typeof watchedSecond !== "number" || !Number.isFinite(watchedSecond)
    ) {
      return Response.json({ error: { code: "INVALID_REQUEST", message: "lessonId, positionSecond, and watchedSecond are required." } }, { status: 422 });
    }

    const { prisma } = await import("@/lib/prisma");
    const requestHash = hashMobileProgressRequest({ lessonId, positionSecond, watchedSecond });
    const idempotencyScope = {
      organizationId: context.organizationId,
      sessionId: context.sessionId,
      assignmentId,
      lessonId,
      idempotencyKey,
      requestHash,
    };
    await requireLearnerLaunchAssignment({
      organizationId: context.organizationId,
      assignmentId,
      expectedCourseType: "NATIVE_VIDEO",
      actor: toMobileMembershipContext(context),
      repository: createPrismaRuntimeRouteRepository(prisma),
    });
    const currentRuntime = await launchVideoRuntime(
      { organizationId: context.organizationId, assignmentId, lessonId },
      createPrismaVideoRepository(prisma),
    );
    const currentMaxWatchedSecond = currentRuntime.currentLesson.progress.maxWatchedSecond;

    if (!isMobileProgressAdvanceAllowed(currentMaxWatchedSecond, watchedSecond)) {
      return Response.json(
        { error: { code: "PROGRESS_JUMP_TOO_LARGE", message: "Progress must advance through playback checkpoints." } },
        { status: 422 },
      );
    }

    const idempotencyClaim = await claimMobileProgressRequest(prisma, idempotencyScope);

    if (idempotencyClaim.state === "completed") {
      return Response.json(idempotencyClaim.response, { headers: { "Cache-Control": "private, no-store" } });
    }

    if (idempotencyClaim.state === "pending") {
      return Response.json(
        { error: { code: "REQUEST_IN_PROGRESS", message: "This progress update is already being processed. Retry with the same key." } },
        { status: 409, headers: { "Retry-After": "2", "Cache-Control": "private, no-store" } },
      );
    }

    const occurredAt = new Date();
    let result: Awaited<ReturnType<typeof recordVideoProgress>>;

    try {
      result = await recordVideoProgress(
        { organizationId: context.organizationId, assignmentId, lessonId, positionSecond, watchedSecond, occurredAt },
        createPrismaVideoRepository(prisma),
      );

    if (result.completed) {
      const notificationRepository = createPrismaNotificationRepository(prisma);
      const credentialProvider = createConfiguredCredlyCredentialProvider({
        baseUrl: env.CREDLY_BASE_URL,
        apiToken: env.CREDLY_API_TOKEN,
        organizationId: env.CREDLY_ORGANIZATION_ID,
      });
      await issueCertificateForCompletedAssignment(
        {
          organizationId: context.organizationId,
          assignmentId,
          appBaseUrl: env.APP_BASE_URL,
          now: occurredAt,
          ...(credentialProvider ? { credentialProvider } : {}),
        },
        createPrismaCertificateRepository(prisma),
        { scheduleCertificateNotification: (input) => scheduleCertificateNotification(input, notificationRepository) },
      );
    }

      const responsePayload = {
        lessonProgress: {
          ...result.lessonProgress,
          lastWatchedAt: result.lessonProgress.lastWatchedAt?.toISOString() ?? null,
        },
        courseProgressPercent: result.courseProgressPercent,
        completed: result.completed,
      };
      await completeMobileProgressRequest(prisma, {
        ...idempotencyScope,
        response: responsePayload,
      });
    } catch {
      await releaseMobileProgressClaim(prisma, idempotencyScope);
      throw new Error("Unable to complete mobile progress update");
    }

    return Response.json(result);
  } catch (error) {
    if (error instanceof RuntimeRouteError) {
      return Response.json({ error: { code: "RUNTIME_ERROR", message: error.message } }, { status: error.status });
    }

    return mobileApiErrorResponse(error);
  }
}