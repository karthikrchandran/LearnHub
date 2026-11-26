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

  let event: ReturnType<typeof mapMuxWebhookEvent>;

  try {
    const payload = JSON.parse(rawBody) as MuxWebhookPayload;
    event = mapMuxWebhookEvent(payload);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Invalid Mux webhook payload" }, { status: 400 });
  }

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

  const data =
    event.type === "asset.ready"
      ? {
          providerAssetId: event.providerAssetId,
          providerPlaybackId: event.playbackId,
          muxPlaybackPolicy: event.playbackPolicy,
          providerStatus: "READY" as const,
          providerError: null,
          playbackUrl: event.playbackUrl,
        }
      : event.type === "asset.failed"
        ? {
            providerAssetId: event.providerAssetId,
          muxPlaybackPolicy: null,
            providerStatus: "FAILED" as const,
            providerError: event.errorMessage,
          }
        : {
            providerAssetId: event.providerAssetId,
          muxPlaybackPolicy: null,
            providerStatus: "PROCESSING" as const,
            providerError: null,
          };
  const updateResult = await prisma.videoLesson.updateMany({ where, data });

  if (updateResult.count === 0) {
    return Response.json({ error: "Mux webhook target was not found" }, { status: 404 });
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
