import { createPrismaRuntimeRouteRepository } from "@/modules/runtime/prisma-repository";
import { requireLearnerLaunchAssignment, RuntimeRouteError } from "@/modules/runtime/runtime-route-service";
import { createPrismaVideoRepository } from "@/modules/video/prisma-repository";
import { launchVideoRuntime } from "@/modules/video/video-runtime";
import { mobileApiErrorResponse, requireMobileApiContext, toMobileMembershipContext } from "@/modules/mobile/mobile-api-auth";
import { getEnv } from "@/lib/env";
import { MuxPlaybackConfigurationError, signMuxRuntimePlayback } from "@/modules/video/mux-playback";

type RouteContext = { params: Promise<{ slug: string; assignmentId: string }> };

export async function GET(request: Request, { params }: RouteContext): Promise<Response> {
  try {
    const { slug, assignmentId } = await params;
    const context = await requireMobileApiContext(request, slug, "LEARNER");
    const { prisma } = await import("@/lib/prisma");
    const actor = toMobileMembershipContext(context);

    await requireLearnerLaunchAssignment({
      organizationId: context.organizationId,
      assignmentId,
      expectedCourseType: "NATIVE_VIDEO",
      actor,
      repository: createPrismaRuntimeRouteRepository(prisma),
    });

    const runtime = await launchVideoRuntime(
      { organizationId: context.organizationId, assignmentId },
      createPrismaVideoRepository(prisma),
    );
    const hasMuxAssets = runtime.lessons.some((lesson) => lesson.providerPlaybackId);
    const env = hasMuxAssets ? getEnv() : null;
    const signedRuntime = signMuxRuntimePlayback(runtime, env?.MUX_SIGNING_KEY_ID?.trim() && env.MUX_SIGNING_PRIVATE_KEY?.trim()
      ? { keyId: env.MUX_SIGNING_KEY_ID, privateKey: env.MUX_SIGNING_PRIVATE_KEY }
      : null);

    return Response.json(signedRuntime, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof MuxPlaybackConfigurationError) {
      return Response.json({ error: { code: "MEDIA_NOT_CONFIGURED", message: error.message } }, { status: 503 });
    }

    if (error instanceof RuntimeRouteError) {
      return Response.json({ error: { code: "RUNTIME_ERROR", message: error.message } }, { status: error.status });
    }

    return mobileApiErrorResponse(error);
  }
}