import { requireOrganizationMemberBySlug } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma";
import { createPrismaRuntimeRouteRepository } from "@/modules/runtime/prisma-repository";
import {
  RuntimeRouteError,
  requireLearnerLaunchAssignment,
} from "@/modules/runtime/runtime-route-service";
import { createPrismaVideoRepository } from "@/modules/video/prisma-repository";
import { recordVideoProgress } from "@/modules/video/video-runtime";

type VideoProgressRouteContext = {
  params: Promise<{
    slug: string;
    assignmentId: string;
  }>;
};

export async function POST(request: Request, { params }: VideoProgressRouteContext): Promise<Response> {
  try {
    const { slug, assignmentId } = await params;
    const { context, organizationId } = await requireOrganizationMemberBySlug(slug);

    await requireLearnerLaunchAssignment({
      organizationId,
      assignmentId,
      expectedCourseType: "NATIVE_VIDEO",
      actor: context,
      repository: createPrismaRuntimeRouteRepository(prisma),
    });

    const body = await readJsonObject(request);
    const lessonId = body.lessonId;

    if (typeof lessonId !== "string" || lessonId.trim().length === 0) {
      return Response.json({ error: "lessonId is required" }, { status: 400 });
    }

    const positionSecond = readNumber(body.positionSecond, "positionSecond");
    const watchedSecond = readNumber(body.watchedSecond, "watchedSecond");
    const result = await recordVideoProgress(
      {
        organizationId,
        assignmentId,
        lessonId,
        positionSecond,
        watchedSecond,
        occurredAt: new Date(),
      },
      createPrismaVideoRepository(prisma),
    );

    return Response.json(result);
  } catch (error) {
    return videoRuntimeErrorResponse(error);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function readJsonObject(request: Request): Promise<Record<string, unknown>> {
  try {
    const body = await request.json();

    if (isRecord(body)) {
      return body;
    }
  } catch {
    // handled below
  }

  throw new Error("Request body must be a JSON object");
}

function readNumber(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${field} must be a number`);
  }

  return value;
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
