import { z } from "zod";

import { getEnv } from "@/lib/env";
import { requireOrganizationUsersAdminBySlug } from "@/lib/auth/guards";
import { generateAiVideoLessonDraft } from "@/modules/video/ai-video-creator";

type RouteContext = { params: Promise<{ slug: string; courseSlug: string }> };

const requestSchema = z.object({
  brief: z.string().trim().min(1).max(2_000),
  audience: z.string().trim().min(1).max(240),
  tone: z.string().trim().max(120).default("Clear and engaging"),
  durationMinutes: z.number().int().min(1).max(20),
});

export async function POST(request: Request, { params }: RouteContext): Promise<Response> {
  const { slug, courseSlug } = await params;
  const { organizationId } = await requireOrganizationUsersAdminBySlug(slug);

  try {
    const body = requestSchema.safeParse(await request.json().catch(() => null));

    if (!body.success) {
      return Response.json({ error: "Add a learning brief, audience, and duration (1-20 minutes)." }, { status: 422 });
    }

    const { prisma } = await import("@/lib/prisma");
    const course = await prisma.course.findFirst({
      where: { slug: courseSlug, organizationId, type: "NATIVE_VIDEO" },
      select: { id: true },
    });

    if (!course) {
      return Response.json({ error: "Native video course not found." }, { status: 404 });
    }

    const env = getEnv();

    if (!env.OPENAI_API_KEY?.trim()) {
      return Response.json({ error: "AI authoring is not configured. Set OPENAI_API_KEY on the server." }, { status: 503 });
    }

    const draft = await generateAiVideoLessonDraft(body.data, {
      apiKey: env.OPENAI_API_KEY,
      model: env.OPENAI_VIDEO_MODEL,
    });

    return Response.json(draft);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to generate the AI video lesson draft.";
    return Response.json({ error: message }, { status: 502 });
  }
}