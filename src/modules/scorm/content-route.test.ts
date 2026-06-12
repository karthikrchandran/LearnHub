import { createHmac } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GET } from "@/app/scorm/[...path]/route";

const mocks = vi.hoisted(() => ({
  env: {
    R2_ACCOUNT_ID: undefined as string | undefined,
    R2_ACCESS_KEY_ID: undefined as string | undefined,
    R2_SECRET_ACCESS_KEY: undefined as string | undefined,
    R2_BUCKET_NAME: undefined as string | undefined,
    NEXTAUTH_SECRET: "test-secret" as string | undefined,
  },
  getSignedReadUrl: vi.fn(),
}));

vi.mock("@/lib/env", () => ({
  getEnv: vi.fn(() => mocks.env),
}));

vi.mock("@/modules/providers/storage/r2-object-storage-provider", () => ({
  createR2ObjectStorageProvider: vi.fn(() => ({
    getSignedReadUrl: mocks.getSignedReadUrl,
  })),
}));

let contentRoot: string;
let testRoot: string;

beforeEach(async () => {
  vi.clearAllMocks();
  mocks.env = {
    R2_ACCOUNT_ID: undefined,
    R2_ACCESS_KEY_ID: undefined,
    R2_SECRET_ACCESS_KEY: undefined,
    R2_BUCKET_NAME: undefined,
    NEXTAUTH_SECRET: "test-secret",
  };
  contentRoot = join(process.cwd(), ".learnhub", "scorm");
  testRoot = join(contentRoot, "test-route");
  await rm(testRoot, { recursive: true, force: true });
});

afterEach(async () => {
  vi.unstubAllGlobals();
  await rm(testRoot, { recursive: true, force: true });
});

describe("SCORM content route", () => {
  it("serves files under the configured SCORM content root", async () => {
    await mkdir(testRoot, { recursive: true });
    await writeFile(join(testRoot, "index.html"), "<h1>SCORM</h1>");

    const response = await GET(new Request("http://learnhub.test/scorm/test-route/index.html"), {
      params: Promise.resolve({ path: ["test-route", "index.html"] }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(await response.text()).toContain("SCORM");
  });

  it("rejects traversal paths before reading from disk", async () => {
    const response = await GET(new Request("http://learnhub.test/scorm/test-route/../secret.txt"), {
      params: Promise.resolve({ path: ["test-route", "..", "secret.txt"] }),
    });

    expect(response.status).toBe(400);
  });

  it("returns not found for missing content", async () => {
    const response = await GET(new Request("http://learnhub.test/scorm/test-route/missing.html"), {
      params: Promise.resolve({ path: ["test-route", "missing.html"] }),
    });

    expect(response.status).toBe(404);
  });

  it("rejects production SCORM content reads without a launch token before signing storage access", async () => {
    mocks.env = {
      R2_ACCOUNT_ID: "account",
      R2_ACCESS_KEY_ID: "access",
      R2_SECRET_ACCESS_KEY: "secret",
      R2_BUCKET_NAME: "learnhub-media",
      NEXTAUTH_SECRET: "test-secret",
    };

    const response = await GET(
      new Request("http://learnhub.test/scorm/org/org_1/courses/course_1/scorm/pkg_course_1/content/index.html"),
      {
        params: Promise.resolve({
          path: ["org", "org_1", "courses", "course_1", "scorm", "pkg_course_1", "content", "index.html"],
        }),
      },
    );

    expect(response.status).toBe(403);
    expect(mocks.getSignedReadUrl).not.toHaveBeenCalled();
  });

  it("rejects launch tokens scoped to a different SCORM content root", async () => {
    mocks.env = {
      R2_ACCOUNT_ID: "account",
      R2_ACCESS_KEY_ID: "access",
      R2_SECRET_ACCESS_KEY: "secret",
      R2_BUCKET_NAME: "learnhub-media",
      NEXTAUTH_SECRET: "test-secret",
    };
    const requestUrl = signedScormContentUrl({
      objectKey: "org/org_1/courses/course_1/scorm/pkg_course_1/content/index.html",
      contentRootKey: "org/org_1/courses/course_1/scorm/pkg_other/content",
    });

    const response = await GET(new Request(requestUrl), {
      params: Promise.resolve({
        path: ["org", "org_1", "courses", "course_1", "scorm", "pkg_course_1", "content", "index.html"],
      }),
    });

    expect(response.status).toBe(403);
    expect(mocks.getSignedReadUrl).not.toHaveBeenCalled();
  });

  it("proxies authorized production SCORM content through signed storage access", async () => {
    mocks.env = {
      R2_ACCOUNT_ID: "account",
      R2_ACCESS_KEY_ID: "access",
      R2_SECRET_ACCESS_KEY: "secret",
      R2_BUCKET_NAME: "learnhub-media",
      NEXTAUTH_SECRET: "test-secret",
    };
    mocks.getSignedReadUrl.mockResolvedValueOnce(
      "https://account.r2.cloudflarestorage.com/learnhub-media/org/org_1/courses/course_1/scorm/pkg_course_1/content/index.html?X-Amz-Signature=signed",
    );
    const fetchStorage = vi.fn().mockResolvedValue(
      new Response("<html>Launch</html>", {
        headers: {
          "content-type": "text/html; charset=utf-8",
        },
      }),
    );
    vi.stubGlobal("fetch", fetchStorage);
    const requestUrl = signedScormContentUrl({
      objectKey: "org/org_1/courses/course_1/scorm/pkg_course_1/content/index.html",
      contentRootKey: "org/org_1/courses/course_1/scorm/pkg_course_1/content",
    });

    const response = await GET(
      new Request(requestUrl),
      {
        params: Promise.resolve({
          path: ["org", "org_1", "courses", "course_1", "scorm", "pkg_course_1", "content", "index.html"],
        }),
      },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(response.headers.get("set-cookie")).toContain("learnhub_scorm_access=");
    await expect(response.text()).resolves.toContain("Launch");
    expect(mocks.getSignedReadUrl).toHaveBeenCalledWith(
      "org/org_1/courses/course_1/scorm/pkg_course_1/content/index.html",
    );
    expect(fetchStorage).toHaveBeenCalledWith(
      "https://account.r2.cloudflarestorage.com/learnhub-media/org/org_1/courses/course_1/scorm/pkg_course_1/content/index.html?X-Amz-Signature=signed",
    );
  });
});

function signedScormContentUrl(input: {
  objectKey: string;
  contentRootKey: string;
  expiresAtSeconds?: number;
}): string {
  const expiresAtSeconds = input.expiresAtSeconds ?? 4_102_444_800;
  const token = createHmac("sha256", "test-secret")
    .update(`${input.contentRootKey}:${expiresAtSeconds}`)
    .digest("base64url");
  const url = new URL(`http://learnhub.test/scorm/${input.objectKey}`);
  url.searchParams.set("lh_scorm_expires", String(expiresAtSeconds));
  url.searchParams.set("lh_scorm_token", token);
  return url.toString();
}
