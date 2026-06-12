import { requireOrganizationUsersAdminBySlug } from "@/lib/auth/guards";
import { getEnv, type Env } from "@/lib/env";
import { createMuxVideoProvider } from "@/modules/providers/video/mux-video-provider";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type MuxUploadRouteContext = {
  params: Promise<{
    slug: string;
    courseSlug: string;
    lessonId: string;
  }>;
};

export async function POST(_request: Request, { params }: MuxUploadRouteContext): Promise<Response> {
  try {
    const { slug, courseSlug, lessonId } = await params;
    const { organizationId } = await requireOrganizationUsersAdminBySlug(slug);
    const { prisma } = await import("@/lib/prisma");
    const lesson = await prisma.videoLesson.findFirst({
      where: {
        id: lessonId,
        organizationId,
        course: {
          slug: courseSlug,
          type: "NATIVE_VIDEO",
        },
      },
      select: {
        id: true,
        courseId: true,
        title: true,
      },
    });

    if (!lesson) {
      return Response.json({ error: "Video lesson not found" }, { status: 404 });
    }

    const provider = createMuxVideoProvider(requiredMuxConfig(getEnv()));
    const upload = await provider.createUpload({
      organizationId,
      courseId: lesson.courseId,
      lessonId: lesson.id,
      title: lesson.title,
    });

    await prisma.videoLesson.updateMany({
      where: {
        id: lesson.id,
        organizationId,
        courseId: lesson.courseId,
      },
      data: {
        providerUploadId: upload.providerUploadId,
        providerStatus: "PROCESSING",
        providerError: null,
      },
    });

    return Response.json(upload);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to create Mux upload" }, { status: 400 });
  }
}

function requiredMuxConfig(env: Env) {
  return {
    tokenId: required(env.MUX_TOKEN_ID, "MUX_TOKEN_ID is required"),
    tokenSecret: required(env.MUX_TOKEN_SECRET, "MUX_TOKEN_SECRET is required"),
    webhookSecret: required(env.MUX_WEBHOOK_SECRET, "MUX_WEBHOOK_SECRET is required"),
  };
}

function required(value: string | undefined, message: string): string {
  if (!value?.trim()) {
    throw new Error(message);
  }

  return value.trim();
}
