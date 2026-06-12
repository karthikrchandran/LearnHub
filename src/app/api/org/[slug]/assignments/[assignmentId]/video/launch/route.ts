import { requireOrganizationMemberBySlug } from "@/lib/auth/guards";
import { createPrismaRuntimeRouteRepository } from "@/modules/runtime/prisma-repository";
import {
  RuntimeRouteError,
  requireLearnerLaunchAssignment,
} from "@/modules/runtime/runtime-route-service";
import { createPrismaVideoRepository } from "@/modules/video/prisma-repository";
import { launchVideoRuntime } from "@/modules/video/video-runtime";

type VideoLaunchRouteContext = {
  params: Promise<{
    slug: string;
    assignmentId: string;
  }>;
};

export async function GET(_request: Request, { params }: VideoLaunchRouteContext): Promise<Response> {
  try {
    const { slug, assignmentId } = await params;
    const { context, organizationId } = await requireOrganizationMemberBySlug(slug);
    const { prisma } = await import("@/lib/prisma");

    await requireLearnerLaunchAssignment({
      organizationId,
      assignmentId,
      expectedCourseType: "NATIVE_VIDEO",
      actor: context,
      repository: createPrismaRuntimeRouteRepository(prisma),
    });

    const runtime = await launchVideoRuntime(
      {
        organizationId,
        assignmentId,
      },
      createPrismaVideoRepository(prisma),
    );

    return Response.json(runtime);
  } catch (error) {
    return videoRuntimeErrorResponse(error);
  }
}

function videoRuntimeErrorResponse(error: unknown): Response {
  if (error instanceof RuntimeRouteError) {
    return Response.json({ error: error.message }, { status: error.status });
  }

  if (error instanceof Error) {
    return Response.json({ error: error.message }, { status: 400 });
  }

  return Response.json({ error: "Unexpected runtime error" }, { status: 500 });
}
