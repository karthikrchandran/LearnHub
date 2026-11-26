import { createHmac, generateKeyPairSync } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  createMuxVideoProvider,
  mapMuxWebhookEvent,
  verifyMuxWebhookSignature,
} from "./mux-video-provider";

const { privateKey: muxPrivateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const muxSigningPrivateKey = muxPrivateKey.export({ type: "pkcs8", format: "pem" }).toString();

describe("createMuxVideoProvider", () => {
  it("creates direct uploads with tenant and course metadata", async () => {
    let requestBody: Record<string, unknown> | null = null;
    let authorization: string | null = null;
    const provider = createMuxVideoProvider({
      tokenId: "token_id",
      tokenSecret: "token_secret",
      webhookSecret: "whsec_test",
      corsOrigin: "https://learnhub.example.com",
      signingKeyId: "mux-key-id",
      signingPrivateKey: muxSigningPrivateKey,
      fetch: async (_url, init) => {
        authorization = new Headers(init?.headers).get("authorization");
        requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return Response.json({
          data: {
            id: "upload_1",
            url: "https://storage.mux.com/direct-upload",
          },
        });
      },
    });

    const result = await provider.createUpload({
      organizationId: "org_1",
      courseId: "course_1",
      lessonId: "lesson_1",
      title: "Orientation",
    });

    expect(result).toEqual({
      uploadUrl: "https://storage.mux.com/direct-upload",
      providerUploadId: "upload_1",
    });
    expect(authorization).toBe(`Basic ${Buffer.from("token_id:token_secret").toString("base64")}`);
    expect(requestBody).toMatchObject({
      cors_origin: "https://learnhub.example.com",
      new_asset_settings: {
        playback_policy: ["signed"],
      },
    });
    const muxRequestBody = requestBody as unknown as { new_asset_settings: { passthrough: string } };
    expect(JSON.parse(muxRequestBody.new_asset_settings.passthrough)).toMatchObject({
      organizationId: "org_1",
      courseId: "course_1",
      lessonId: "lesson_1",
      title: "Orientation",
    });
  });

  it("returns playback sources only after the asset is ready", async () => {
    const provider = createMuxVideoProvider({
      tokenId: "token_id",
      tokenSecret: "token_secret",
      webhookSecret: "whsec_test",
      corsOrigin: "https://learnhub.example.com",
      signingKeyId: "mux-key-id",
      signingPrivateKey: muxSigningPrivateKey,
      fetch: async () =>
        Response.json({
          data: {
            id: "asset_1",
            status: "ready",
            playback_ids: [{ id: "playback_1", policy: "signed" }],
          },
        }),
    });

    await expect(provider.getPlaybackSource("asset_1")).resolves.toEqual({
      providerAssetId: "asset_1",
      playbackId: "playback_1",
      playbackUrl: expect.stringMatching(/^https:\/\/stream\.mux\.com\/playback_1\.m3u8\?token=/),
    });

    const processingProvider = createMuxVideoProvider({
      tokenId: "token_id",
      tokenSecret: "token_secret",
      webhookSecret: "whsec_test",
      corsOrigin: "https://learnhub.example.com",
      signingKeyId: "mux-key-id",
      signingPrivateKey: muxSigningPrivateKey,
      fetch: async () => Response.json({ data: { id: "asset_2", status: "preparing", playback_ids: [] } }),
    });

    await expect(processingProvider.getPlaybackSource("asset_2")).rejects.toThrow("Mux asset is not ready");
  });

  it("rejects playback IDs without signed policy", async () => {
    const provider = createMuxVideoProvider({
      tokenId: "token_id",
      tokenSecret: "token_secret",
      webhookSecret: "whsec_test",
      corsOrigin: "https://learnhub.example.com",
      signingKeyId: "mux-key-id",
      signingPrivateKey: muxSigningPrivateKey,
      fetch: async () => Response.json({ data: { status: "ready", playback_ids: [{ id: "public-id", policy: "public" }] } }),
    });

    await expect(provider.getPlaybackSource("asset_public")).rejects.toThrow("Mux asset must use signed playback policy");
  });
});

describe("Mux webhook helpers", () => {
  it("verifies Mux webhook signatures before parsing events", () => {
    const body = JSON.stringify({
      type: "video.asset.ready",
      data: {
        id: "asset_1",
        upload_id: "upload_1",
        status: "ready",
        playback_ids: [{ id: "playback_1", policy: "signed" }],
        passthrough: JSON.stringify({ organizationId: "org_1", courseId: "course_1" }),
      },
    });
    const timestamp = "1781341200";
    const signature = createHmac("sha256", "whsec_test").update(`${timestamp}.${body}`).digest("hex");

    expect(
      verifyMuxWebhookSignature({
        rawBody: body,
        signatureHeader: `t=${timestamp},v1=${signature}`,
        webhookSecret: "whsec_test",
        now: () => new Date(Number(timestamp) * 1000),
      }),
    ).toBe(true);
    expect(() =>
      verifyMuxWebhookSignature({
        rawBody: body,
        signatureHeader: `t=${timestamp},v1=bad`,
        webhookSecret: "whsec_test",
        now: () => new Date(Number(timestamp) * 1000),
      }),
    ).toThrow("Invalid Mux webhook signature");
  });

  it("normalizes asset-ready and asset-failed events", () => {
    expect(
      mapMuxWebhookEvent({
        type: "video.asset.ready",
        data: {
          id: "asset_1",
          upload_id: "upload_1",
          status: "ready",
          playback_ids: [{ id: "playback_1", policy: "signed" }],
          passthrough: JSON.stringify({
            organizationId: "org_1",
            courseId: "course_1",
            lessonId: "lesson_1",
          }),
        },
      }),
    ).toEqual({
      type: "asset.ready",
      organizationId: "org_1",
      courseId: "course_1",
      lessonId: "lesson_1",
      providerAssetId: "asset_1",
      providerUploadId: "upload_1",
      playbackId: "playback_1",
      playbackPolicy: "signed",
      playbackUrl: "https://stream.mux.com/playback_1.m3u8",
      errorMessage: null,
    });
    expect(
      mapMuxWebhookEvent({
        type: "video.asset.errored",
        data: {
          id: "asset_2",
          upload_id: "upload_2",
          errors: { messages: ["transcode failed"] },
        },
      }),
    ).toMatchObject({
      type: "asset.failed",
      providerAssetId: "asset_2",
      providerUploadId: "upload_2",
      errorMessage: "transcode failed",
    });
  });
});
