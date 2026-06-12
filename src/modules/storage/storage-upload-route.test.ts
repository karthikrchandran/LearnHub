import { beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "@/app/api/org/[slug]/storage/upload/route";

const mocks = vi.hoisted(() => ({
  requireOrganizationUsersAdminBySlug: vi.fn(),
  getEnv: vi.fn(),
  getSignedWriteUrl: vi.fn(),
  createR2ObjectStorageProvider: vi.fn(),
  courseFindFirst: vi.fn(),
  videoLessonFindFirst: vi.fn(),
  certificateFindFirst: vi.fn(),
}));

vi.mock("@/lib/auth/guards", () => ({
  requireOrganizationUsersAdminBySlug: mocks.requireOrganizationUsersAdminBySlug,
}));

vi.mock("@/lib/env", () => ({
  getEnv: mocks.getEnv,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    course: {
      findFirst: mocks.courseFindFirst,
    },
    videoLesson: {
      findFirst: mocks.videoLessonFindFirst,
    },
    certificate: {
      findFirst: mocks.certificateFindFirst,
    },
  },
}));

vi.mock("@/modules/providers/storage/r2-object-storage-provider", () => ({
  createR2ObjectStorageProvider: mocks.createR2ObjectStorageProvider,
}));

const routeContext = {
  params: Promise.resolve({ slug: "acme" }),
};

function uploadRequest(body: Record<string, unknown>): Request {
  return new Request("http://learnhub.test/api/org/acme/storage/upload", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("storage upload route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireOrganizationUsersAdminBySlug.mockResolvedValue({ organizationId: "org_1" });
    mocks.getEnv.mockReturnValue({
      R2_ACCOUNT_ID: "account",
      R2_ACCESS_KEY_ID: "access",
      R2_SECRET_ACCESS_KEY: "secret",
      R2_BUCKET_NAME: "learnhub-media",
    });
    mocks.getSignedWriteUrl.mockResolvedValue("https://r2.example/upload");
    mocks.createR2ObjectStorageProvider.mockReturnValue({
      getSignedWriteUrl: mocks.getSignedWriteUrl,
    });
    mocks.courseFindFirst.mockResolvedValue({ id: "course_1" });
    mocks.videoLessonFindFirst.mockResolvedValue({ id: "lesson_1" });
    mocks.certificateFindFirst.mockResolvedValue({ id: "certificate_1" });
  });

  it("mints a SCORM zip key only after validating the SCORM course belongs to the organization", async () => {
    const response = await POST(
      uploadRequest({
        purpose: "scorm_zip",
        fileName: "policy.zip",
        contentType: "application/zip",
        courseId: "course_1",
        packageId: "pkg_course_1",
      }),
      routeContext,
    );

    await expect(response.json()).resolves.toEqual({
      key: "org/org_1/courses/course_1/scorm/pkg_course_1/source/policy.zip",
      uploadUrl: "https://r2.example/upload",
    });
    expect(response.status).toBe(200);
    expect(mocks.courseFindFirst).toHaveBeenCalledWith({
      where: {
        id: "course_1",
        organizationId: "org_1",
        type: "SCORM_1_2",
      },
      select: { id: true },
    });
    expect(mocks.getSignedWriteUrl).toHaveBeenCalledWith({
      key: "org/org_1/courses/course_1/scorm/pkg_course_1/source/policy.zip",
      contentType: "application/zip",
    });
  });

  it("rejects SCORM zip uploads when the package ID does not match the course package key", async () => {
    const response = await POST(
      uploadRequest({
        purpose: "scorm_zip",
        fileName: "policy.zip",
        contentType: "application/zip",
        courseId: "course_1",
        packageId: "package_1",
      }),
      routeContext,
    );

    await expect(response.json()).resolves.toEqual({ error: "packageId must match the SCORM course package id" });
    expect(response.status).toBe(400);
    expect(mocks.createR2ObjectStorageProvider).not.toHaveBeenCalled();
    expect(mocks.getSignedWriteUrl).not.toHaveBeenCalled();
  });

  it("rejects transcript uploads when the lesson is not owned by the organization and course", async () => {
    mocks.videoLessonFindFirst.mockResolvedValueOnce(null);

    const response = await POST(
      uploadRequest({
        purpose: "video_transcript",
        fileName: "captions.vtt",
        contentType: "text/vtt",
        courseId: "course_1",
        lessonId: "lesson_1",
      }),
      routeContext,
    );

    await expect(response.json()).resolves.toEqual({ error: "Video lesson not found" });
    expect(response.status).toBe(400);
    expect(mocks.videoLessonFindFirst).toHaveBeenCalledWith({
      where: {
        id: "lesson_1",
        organizationId: "org_1",
        courseId: "course_1",
      },
      select: { id: true },
    });
    expect(mocks.getSignedWriteUrl).not.toHaveBeenCalled();
  });

  it("rejects certificate uploads when the certificate does not belong to the organization", async () => {
    mocks.certificateFindFirst.mockResolvedValueOnce(null);

    const response = await POST(
      uploadRequest({
        purpose: "certificate",
        fileName: "certificate.pdf",
        contentType: "application/pdf",
        certificateId: "certificate_1",
      }),
      routeContext,
    );

    await expect(response.json()).resolves.toEqual({ error: "Certificate not found" });
    expect(response.status).toBe(400);
    expect(mocks.certificateFindFirst).toHaveBeenCalledWith({
      where: {
        id: "certificate_1",
        organizationId: "org_1",
      },
      select: { id: true },
    });
    expect(mocks.getSignedWriteUrl).not.toHaveBeenCalled();
  });
});
