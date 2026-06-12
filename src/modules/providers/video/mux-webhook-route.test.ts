import { createHmac } from "node:crypto";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "@/app/api/providers/mux/webhook/route";

const mocks = vi.hoisted(() => ({
  getEnv: vi.fn(),
  videoLessonUpdateMany: vi.fn(),
}));

vi.mock("@/lib/env", () => ({
  getEnv: mocks.getEnv,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    videoLesson: {
      updateMany: mocks.videoLessonUpdateMany,
    },
  },
}));

function signedRequest(payload: Record<string, unknown>): Request {
  const body = JSON.stringify(payload);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = createHmac("sha256", "whsec_test").update(`${timestamp}.${body}`).digest("hex");

  return new Request("http://learnhub.test/api/providers/mux/webhook", {
    method: "POST",
    headers: {
      "mux-signature": `t=${timestamp},v1=${signature}`,
    },
    body,
  });
}

describe("Mux webhook route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getEnv.mockReturnValue({ MUX_WEBHOOK_SECRET: "whsec_test" });
    mocks.videoLessonUpdateMany.mockResolvedValue({ count: 1 });
  });

  it("updates ready assets only inside the tenant/course/lesson passthrough scope", async () => {
    const response = await POST(
      signedRequest({
        type: "video.asset.ready",
        data: {
          id: "asset_1",
          upload_id: "upload_1",
          playback_ids: [{ id: "playback_1" }],
          passthrough: JSON.stringify({
            organizationId: "org_1",
            courseId: "course_1",
            lessonId: "lesson_1",
          }),
        },
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.videoLessonUpdateMany).toHaveBeenCalledWith({
      where: {
        organizationId: "org_1",
        courseId: "course_1",
        id: "lesson_1",
        providerUploadId: "upload_1",
      },
      data: {
        providerAssetId: "asset_1",
        providerPlaybackId: "playback_1",
        providerStatus: "READY",
        providerError: null,
        playbackUrl: "https://stream.mux.com/playback_1.m3u8",
      },
    });
  });

  it("does not globally update by provider ID when tenant passthrough is missing", async () => {
    const response = await POST(
      signedRequest({
        type: "video.upload.asset_created",
        data: {
          id: "asset_1",
          upload_id: "upload_1",
        },
      }),
    );

    await expect(response.json()).resolves.toEqual({ error: "Mux webhook tenant context is required" });
    expect(response.status).toBe(400);
    expect(mocks.videoLessonUpdateMany).not.toHaveBeenCalled();
  });
});
