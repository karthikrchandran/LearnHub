import { beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "@/app/api/org/[slug]/courses/[courseSlug]/video/lessons/[lessonId]/mux-upload/route";

const mocks = vi.hoisted(() => ({
  requireOrganizationUsersAdminBySlug: vi.fn(),
  getEnv: vi.fn(),
  createMuxVideoProvider: vi.fn(),
  createUpload: vi.fn(),
  videoLessonFindFirst: vi.fn(),
  videoLessonUpdateMany: vi.fn(),
}));

vi.mock("@/lib/auth/guards", () => ({
  requireOrganizationUsersAdminBySlug: mocks.requireOrganizationUsersAdminBySlug,
}));

vi.mock("@/lib/env", () => ({
  getEnv: mocks.getEnv,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    videoLesson: {
      findFirst: mocks.videoLessonFindFirst,
      updateMany: mocks.videoLessonUpdateMany,
    },
  },
}));

vi.mock("@/modules/providers/video/mux-video-provider", () => ({
  createMuxVideoProvider: mocks.createMuxVideoProvider,
}));

const routeContext = {
  params: Promise.resolve({
    slug: "acme",
    courseSlug: "policy",
    lessonId: "lesson_1",
  }),
};

describe("Mux direct upload route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireOrganizationUsersAdminBySlug.mockResolvedValue({ organizationId: "org_1" });
    mocks.getEnv.mockReturnValue({
      MUX_TOKEN_ID: "token_id",
      MUX_TOKEN_SECRET: "token_secret",
      MUX_WEBHOOK_SECRET: "whsec_test",
      MUX_SIGNING_KEY_ID: "mux-key-id",
      MUX_SIGNING_PRIVATE_KEY: "mux-private-key",
      APP_BASE_URL: "https://learnhub.example.com/app/",
    });
    mocks.createUpload.mockResolvedValue({
      uploadUrl: "https://storage.mux.com/direct-upload",
      providerUploadId: "upload_1",
    });
    mocks.createMuxVideoProvider.mockReturnValue({
      createUpload: mocks.createUpload,
    });
    mocks.videoLessonFindFirst.mockResolvedValue({
      id: "lesson_1",
      courseId: "course_1",
      title: "Policy introduction",
    });
    mocks.videoLessonUpdateMany.mockResolvedValue({ count: 1 });
  });

  it("creates a Mux direct upload for an org-owned native video lesson and stores upload-created state", async () => {
    const response = await POST(new Request("http://learnhub.test", { method: "POST" }), routeContext);

    await expect(response.json()).resolves.toEqual({
      uploadUrl: "https://storage.mux.com/direct-upload",
      providerUploadId: "upload_1",
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.requireOrganizationUsersAdminBySlug).toHaveBeenCalledWith("acme");
    expect(mocks.videoLessonFindFirst).toHaveBeenCalledWith({
      where: {
        id: "lesson_1",
        organizationId: "org_1",
        course: {
          slug: "policy",
          type: "NATIVE_VIDEO",
        },
      },
      select: {
        id: true,
        courseId: true,
        title: true,
      },
    });
    expect(mocks.createMuxVideoProvider).toHaveBeenCalledWith({
      tokenId: "token_id",
      tokenSecret: "token_secret",
      webhookSecret: "whsec_test",
      signingKeyId: "mux-key-id",
      signingPrivateKey: "mux-private-key",
      corsOrigin: "https://learnhub.example.com",
    });
    expect(mocks.createUpload).toHaveBeenCalledWith({
      organizationId: "org_1",
      courseId: "course_1",
      lessonId: "lesson_1",
      title: "Policy introduction",
    });
    expect(mocks.videoLessonUpdateMany).toHaveBeenCalledWith({
      where: {
        id: "lesson_1",
        organizationId: "org_1",
        courseId: "course_1",
      },
      data: {
        providerUploadId: "upload_1",
        providerStatus: "UPLOAD_CREATED",
        providerError: null,
      },
    });
  });

  it("does not create a Mux upload when the lesson is not in the authorized organization/course", async () => {
    mocks.videoLessonFindFirst.mockResolvedValueOnce(null);

    const response = await POST(new Request("http://learnhub.test", { method: "POST" }), routeContext);

    await expect(response.json()).resolves.toEqual({ error: "Video lesson not found" });
    expect(response.status).toBe(404);
    expect(mocks.createUpload).not.toHaveBeenCalled();
    expect(mocks.videoLessonUpdateMany).not.toHaveBeenCalled();
  });
});
