import { beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "@/app/api/jobs/scorm-extraction/route";

const mocks = vi.hoisted(() => ({
  getEnv: vi.fn(),
  processNextScormExtractionJob: vi.fn(),
  createR2ObjectStorageProvider: vi.fn(),
  getSignedReadUrl: vi.fn(),
}));

vi.mock("@/lib/env", () => ({
  getEnv: mocks.getEnv,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {},
}));

vi.mock("@/modules/providers/storage/r2-object-storage-provider", () => ({
  createR2ObjectStorageProvider: mocks.createR2ObjectStorageProvider,
}));

vi.mock("@/modules/scorm/scorm-package-jobs", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/modules/scorm/scorm-package-jobs")>()),
  processNextScormExtractionJob: mocks.processNextScormExtractionJob,
}));

describe("SCORM extraction job route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getEnv.mockReturnValue({
      R2_ACCOUNT_ID: "account",
      R2_ACCESS_KEY_ID: "access",
      R2_SECRET_ACCESS_KEY: "secret",
      R2_BUCKET_NAME: "learnhub-media",
      SCORM_EXTRACTION_JOB_SECRET: "job_secret",
    });
    mocks.processNextScormExtractionJob.mockResolvedValue({ status: "skipped" });
    mocks.getSignedReadUrl.mockResolvedValue("https://r2.example/source.zip");
    mocks.createR2ObjectStorageProvider.mockReturnValue({
      getSignedReadUrl: mocks.getSignedReadUrl,
      putObject: vi.fn(),
    });
  });

  it("fails closed when the job secret is not configured", async () => {
    mocks.getEnv.mockReturnValueOnce({
      R2_ACCOUNT_ID: "account",
      R2_ACCESS_KEY_ID: "access",
      R2_SECRET_ACCESS_KEY: "secret",
      R2_BUCKET_NAME: "learnhub-media",
      SCORM_EXTRACTION_JOB_SECRET: undefined,
    });

    const response = await POST(new Request("http://learnhub.test/api/jobs/scorm-extraction", { method: "POST" }));

    await expect(response.json()).resolves.toEqual({ error: "Not allowed to run SCORM extraction jobs" });
    expect(response.status).toBe(403);
    expect(mocks.processNextScormExtractionJob).not.toHaveBeenCalled();
    expect(mocks.createR2ObjectStorageProvider).not.toHaveBeenCalled();
  });

  it("fails closed when the job secret does not match", async () => {
    const response = await POST(
      new Request("http://learnhub.test/api/jobs/scorm-extraction", {
        method: "POST",
        headers: {
          "x-learnhub-job-secret": "wrong_secret",
        },
      }),
    );

    await expect(response.json()).resolves.toEqual({ error: "Not allowed to run SCORM extraction jobs" });
    expect(response.status).toBe(403);
    expect(mocks.processNextScormExtractionJob).not.toHaveBeenCalled();
    expect(mocks.createR2ObjectStorageProvider).not.toHaveBeenCalled();
  });

  it("rejects oversized SCORM package downloads before buffering the response body", async () => {
    const arrayBuffer = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({
          "content-length": String(512 * 1024 * 1024 + 1),
        }),
        arrayBuffer,
        body: null,
      }),
    );
    mocks.processNextScormExtractionJob.mockImplementationOnce(async ({ storage }) => {
      await storage.getObjectBytes("org/org_1/courses/course_1/scorm/pkg_1/source/package.zip");
      return { status: "processed" };
    });

    const response = await POST(
      new Request("http://learnhub.test/api/jobs/scorm-extraction", {
        method: "POST",
        headers: {
          "x-learnhub-job-secret": "job_secret",
        },
      }),
    );

    await expect(response.json()).resolves.toEqual({ error: "SCORM package exceeds the maximum compressed size" });
    expect(response.status).toBe(500);
    expect(arrayBuffer).not.toHaveBeenCalled();
  });
});
