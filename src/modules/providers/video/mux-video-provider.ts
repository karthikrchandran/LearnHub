import { createHmac, createSign, timingSafeEqual } from "node:crypto";

import type {
  CreateVideoUploadInput,
  CreateVideoUploadResult,
  VideoPlaybackSource,
  VideoProvider,
} from "./video-provider";

export type MuxVideoProviderConfig = {
  tokenId: string;
  tokenSecret: string;
  webhookSecret: string;
  corsOrigin: string;
  signingKeyId: string;
  signingPrivateKey: string;
  fetch?: typeof fetch;
  apiBaseUrl?: string;
};

export type MuxPlaybackSigningConfig = {
  keyId: string;
  privateKey: string;
};

export type MuxWebhookPayload = {
  type: string;
  data?: Record<string, unknown>;
};

export type MuxWebhookTenantContext = {
  organizationId: string | null;
  courseId: string | null;
  lessonId: string | null;
};

export type MuxWebhookEvent =
  | ({
      type: "asset.ready";
      providerAssetId: string;
      providerUploadId: string | null;
      playbackId: string;
      playbackPolicy: "signed";
      playbackUrl: string;
      errorMessage: null;
    } & MuxWebhookTenantContext)
  | ({
      type: "asset.failed";
      providerAssetId: string;
      providerUploadId: string | null;
      playbackId: null;
      playbackUrl: null;
      errorMessage: string;
    } & MuxWebhookTenantContext)
  | ({
      type: "upload.asset_created";
      providerAssetId: string;
      providerUploadId: string | null;
      playbackId: null;
      playbackUrl: null;
      errorMessage: null;
    } & MuxWebhookTenantContext);

export function createMuxVideoProvider(config: MuxVideoProviderConfig): VideoProvider {
  const fetcher = config.fetch ?? fetch;
  const baseUrl = config.apiBaseUrl ?? "https://api.mux.com";
  const corsOrigin = parseAllowedCorsOrigin(config.corsOrigin);

  return {
    async createUpload(input: CreateVideoUploadInput): Promise<CreateVideoUploadResult> {
      const response = await fetcher(`${baseUrl}/video/v1/uploads`, {
        method: "POST",
        headers: {
          authorization: basicAuth(config),
          "content-type": "application/json",
        },
        body: JSON.stringify({
          cors_origin: corsOrigin,
          new_asset_settings: {
            playback_policy: ["signed"],
            passthrough: JSON.stringify({
              organizationId: input.organizationId,
              courseId: input.courseId,
              lessonId: input.lessonId,
              title: input.title,
            }),
          },
        }),
      });

      if (!response.ok) {
        throw new Error(`Mux direct upload creation failed with status ${response.status}`);
      }

      const body = (await response.json()) as { data?: { id?: unknown; url?: unknown } };
      const providerUploadId = requireString(body.data?.id, "Mux upload id was not returned");
      const uploadUrl = requireString(body.data?.url, "Mux upload URL was not returned");

      return { uploadUrl, providerUploadId };
    },
    async getPlaybackSource(providerAssetId: string): Promise<VideoPlaybackSource> {
      const response = await fetcher(`${baseUrl}/video/v1/assets/${encodeURIComponent(providerAssetId)}`, {
        headers: {
          authorization: basicAuth(config),
        },
      });

      if (!response.ok) {
        throw new Error(`Mux asset lookup failed with status ${response.status}`);
      }

      const body = (await response.json()) as { data?: Record<string, unknown> };
      const status = requireString(body.data?.status, "Mux asset status was not returned");

      if (status !== "ready") {
        throw new Error("Mux asset is not ready");
      }

      const playbackId = playbackIdFromData(body.data);

      return {
        providerAssetId,
        playbackId,
        playbackUrl: createSignedMuxPlaybackUrl(playbackId, {
          keyId: config.signingKeyId,
          privateKey: config.signingPrivateKey,
        }),
      };
    },
  };
}

export function createMuxPlaybackToken(
  playbackId: string,
  config: MuxPlaybackSigningConfig,
  nowSeconds = Math.floor(Date.now() / 1000),
): string {
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT", kid: config.keyId }));
  const payload = base64Url(JSON.stringify({ sub: playbackId, aud: "v", exp: nowSeconds + 60 * 60 }));
  const unsignedToken = `${header}.${payload}`;
  const signer = createSign("RSA-SHA256");
  signer.update(unsignedToken);
  signer.end();
  const privateKey = config.privateKey.replace(/\\n/g, "\n");
  const signature = signer.sign(privateKey).toString("base64url");

  return `${unsignedToken}.${signature}`;
}

export function createSignedMuxPlaybackUrl(
  playbackId: string,
  config: MuxPlaybackSigningConfig,
  nowSeconds?: number,
): string {
  const playbackUrl = new URL(`https://stream.mux.com/${encodeURIComponent(playbackId)}.m3u8`);
  playbackUrl.searchParams.set("token", createMuxPlaybackToken(playbackId, config, nowSeconds));
  return playbackUrl.toString();
}

export function verifyMuxWebhookSignature(input: {
  rawBody: string;
  signatureHeader: string | null;
  webhookSecret: string;
  now?: () => Date;
  toleranceSeconds?: number;
}): true {
  const parsed = parseMuxSignatureHeader(input.signatureHeader);
  const toleranceSeconds = input.toleranceSeconds ?? 5 * 60;
  const now = input.now?.() ?? new Date();
  const ageSeconds = Math.abs(now.getTime() / 1000 - parsed.timestamp);

  if (ageSeconds > toleranceSeconds) {
    throw new Error("Mux webhook signature timestamp is outside tolerance");
  }

  const expected = createHmac("sha256", input.webhookSecret).update(`${parsed.timestamp}.${input.rawBody}`).digest("hex");

  if (!constantTimeEqual(expected, parsed.signature)) {
    throw new Error("Invalid Mux webhook signature");
  }

  return true;
}

export function mapMuxWebhookEvent(payload: MuxWebhookPayload): MuxWebhookEvent | null {
  const data = payload.data ?? {};
  const providerAssetId = optionalString(data.id);
  const providerUploadId = optionalString(data.upload_id);
  const tenantContext = muxTenantContext(data);

  if (!providerAssetId) {
    return null;
  }

  if (payload.type === "video.asset.ready") {
    const playbackId = playbackIdFromData(data);

    return {
      type: "asset.ready",
      providerAssetId,
      providerUploadId,
      playbackId,
      playbackPolicy: "signed",
      playbackUrl: playbackUrlForId(playbackId),
      errorMessage: null,
      ...tenantContext,
    };
  }

  if (payload.type === "video.asset.errored") {
    return {
      type: "asset.failed",
      providerAssetId,
      providerUploadId,
      playbackId: null,
      playbackUrl: null,
      errorMessage: muxErrorMessage(data),
      ...tenantContext,
    };
  }

  if (payload.type === "video.upload.asset_created") {
    return {
      type: "upload.asset_created",
      providerAssetId,
      providerUploadId,
      playbackId: null,
      playbackUrl: null,
      errorMessage: null,
      ...tenantContext,
    };
  }

  return null;
}

function muxTenantContext(data: Record<string, unknown>): MuxWebhookTenantContext {
  const passthrough = optionalString(data.passthrough);

  if (!passthrough) {
    return { organizationId: null, courseId: null, lessonId: null };
  }

  try {
    const parsed = JSON.parse(passthrough) as Record<string, unknown>;

    return {
      organizationId: optionalString(parsed.organizationId),
      courseId: optionalString(parsed.courseId),
      lessonId: optionalString(parsed.lessonId),
    };
  } catch {
    return { organizationId: null, courseId: null, lessonId: null };
  }
}

function basicAuth(config: Pick<MuxVideoProviderConfig, "tokenId" | "tokenSecret">): string {
  return `Basic ${Buffer.from(`${config.tokenId}:${config.tokenSecret}`).toString("base64")}`;
}

function playbackIdFromData(data: Record<string, unknown> | undefined): string {
  const playbackIds = data?.playback_ids;

  if (!Array.isArray(playbackIds)) {
    throw new Error("Mux playback id was not returned");
  }

  const firstPlaybackId = playbackIds[0];

  if (typeof firstPlaybackId !== "object" || firstPlaybackId === null || !("id" in firstPlaybackId)) {
    throw new Error("Mux playback id was not returned");
  }

  if (optionalString(firstPlaybackId.policy) !== "signed") {
    throw new Error("Mux asset must use signed playback policy");
  }

  return requireString(firstPlaybackId.id, "Mux playback id was not returned");
}

function playbackUrlForId(playbackId: string): string {
  return `https://stream.mux.com/${playbackId}.m3u8`;
}

function parseAllowedCorsOrigin(origin: string): string {
  const parsed = new URL(origin);

  if (parsed.origin !== origin || parsed.protocol !== "https:" && parsed.hostname !== "localhost") {
    throw new Error("Mux CORS origin must be an HTTPS origin");
  }

  return parsed.origin;
}

function requireString(value: unknown, message: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(message);
  }

  return value;
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function parseMuxSignatureHeader(header: string | null): { timestamp: number; signature: string } {
  if (!header) {
    throw new Error("Mux webhook signature is required");
  }

  const parts = Object.fromEntries(
    header.split(",").map((part) => {
      const [key, ...value] = part.split("=");
      return [key, value.join("=")];
    }),
  );
  const timestamp = Number(parts.t);

  if (!Number.isFinite(timestamp) || !parts.v1) {
    throw new Error("Mux webhook signature is malformed");
  }

  return { timestamp, signature: parts.v1 };
}

function constantTimeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function base64Url(value: string): string {
  return Buffer.from(value).toString("base64url");
}

function muxErrorMessage(data: Record<string, unknown>): string {
  const errors = data.errors;

  if (typeof errors === "object" && errors !== null && "messages" in errors && Array.isArray(errors.messages)) {
    return errors.messages.filter((message): message is string => typeof message === "string").join("; ") || "Mux asset failed";
  }

  return "Mux asset failed";
}
