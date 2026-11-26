import { createVerify, generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";

import { signMuxRuntimePlayback } from "./mux-playback";
import { createMuxPlaybackToken } from "@/modules/providers/video/mux-video-provider";
import type { VideoRuntimeLaunch } from "./video-runtime";

describe("signMuxRuntimePlayback", () => {
  it("creates an RS256 playback token with a bounded one-hour expiry", () => {
    const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const token = createMuxPlaybackToken("playback-123", {
      keyId: "mux-key-id",
      privateKey: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    }, 1_800_000_000);
    const [encodedHeader, encodedPayload, encodedSignature] = token.split(".");
    const verifier = createVerify("RSA-SHA256");
    verifier.update(`${encodedHeader}.${encodedPayload}`);
    verifier.end();

    expect(JSON.parse(Buffer.from(encodedHeader, "base64url").toString())).toMatchObject({ alg: "RS256", kid: "mux-key-id" });
    expect(JSON.parse(Buffer.from(encodedPayload, "base64url").toString())).toMatchObject({
      sub: "playback-123",
      aud: "v",
      exp: 1_800_003_600,
    });
    expect(verifier.verify(publicKey, Buffer.from(encodedSignature, "base64url"))).toBe(true);
  });

  it("signs Mux playback IDs and retains non-Mux demo URLs", () => {
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const lesson = {
      id: "mux-lesson",
      providerPlaybackId: "playback-123",
      playbackUrl: "https://stream.mux.com/playback-123.m3u8",
    };
    const runtime = {
      lessons: [lesson, { id: "demo-lesson", providerPlaybackId: null, playbackUrl: "/api/demo/video/demo" }],
      currentLesson: lesson,
    } as unknown as VideoRuntimeLaunch;

    const signed = signMuxRuntimePlayback(runtime, {
      keyId: "mux-key-id",
      privateKey: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    }, 1_800_000_000);

    expect(signed.lessons[0].playbackUrl).toMatch(/^https:\/\/stream\.mux\.com\/playback-123\.m3u8\?token=/);
    expect(signed.currentLesson.playbackUrl).toBe(signed.lessons[0].playbackUrl);
    expect(signed.lessons[1].playbackUrl).toBe("/api/demo/video/demo");
  });
});