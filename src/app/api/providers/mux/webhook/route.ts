import { getEnv } from "@/lib/env";
import {
  mapMuxWebhookEvent,
  verifyMuxWebhookSignature,
  type MuxWebhookPayload,
} from "@/modules/providers/video/mux-video-provider";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  const rawBody = await request.text();
  const webhookSecret = getEnv().MUX_WEBHOOK_SECRET;

  if (!webhookSecret) {
    return Response.json({ error: "Mux webhook secret is not configured" }, { status: 500 });
  }

  try {
    verifyMuxWebhookSignature({
      rawBody,
      signatureHeader: request.headers.get("mux-signature"),
      webhookSecret,
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Invalid Mux webhook signature" }, { status: 401 });
  }

  const payload = JSON.parse(rawBody) as MuxWebhookPayload;
  const event = mapMuxWebhookEvent(payload);

  if (!event) {
    return Response.json({ status: "ignored" });
  }

  if (!hasTenantContext(event)) {
    return Response.json({ error: "Mux webhook tenant context is required" }, { status: 400 });
  }

  const { prisma } = await import("@/lib/prisma");
  const where = event.providerUploadId
    ? {
        organizationId: event.organizationId,
        courseId: event.courseId,
        id: event.lessonId,
        providerUploadId: event.providerUploadId,
      }
    : {
        organizationId: event.organizationId,
        courseId: event.courseId,
        id: event.lessonId,
        providerAssetId: event.providerAssetId,
      };

  if (event.type === "asset.ready") {
    await prisma.videoLesson.updateMany({
      where,
      data: {
        providerAssetId: event.providerAssetId,
        providerPlaybackId: event.playbackId,
        providerStatus: "READY",
        providerError: null,
        playbackUrl: event.playbackUrl,
      },
    });
  }

  if (event.type === "asset.failed") {
    await prisma.videoLesson.updateMany({
      where,
      data: {
        providerAssetId: event.providerAssetId,
        providerStatus: "FAILED",
        providerError: event.errorMessage,
      },
    });
  }

  if (event.type === "upload.asset_created") {
    await prisma.videoLesson.updateMany({
      where,
      data: {
        providerAssetId: event.providerAssetId,
        providerStatus: "PROCESSING",
        providerError: null,
      },
    });
  }

  return Response.json({ status: "processed", event: event.type });
}

function hasTenantContext(event: ReturnType<typeof mapMuxWebhookEvent>): event is NonNullable<ReturnType<typeof mapMuxWebhookEvent>> & {
  organizationId: string;
  courseId: string;
  lessonId: string;
} {
  return Boolean(event?.organizationId && event.courseId && event.lessonId);
}
