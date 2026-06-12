import { describe, expect, it } from "vitest";

import { createR2ObjectStorageProvider } from "./r2-object-storage-provider";

describe("createR2ObjectStorageProvider", () => {
  const config = {
    accountId: "account_1",
    accessKeyId: "access_key",
    secretAccessKey: "secret_key",
    bucketName: "learnhub-media",
    now: () => new Date("2026-06-13T05:00:00.000Z"),
  };

  it("creates signed read and write URLs for tenant-scoped keys", async () => {
    const provider = createR2ObjectStorageProvider(config);

    const readUrl = await provider.getSignedReadUrl("org/org_1/courses/course_1/file.txt");
    const writeUrl = await provider.getSignedWriteUrl({
      key: "org/org_1/courses/course_1/file.txt",
      contentType: "text/plain",
    });

    expect(readUrl).toContain("https://account_1.r2.cloudflarestorage.com/learnhub-media/org/org_1/courses/course_1/file.txt");
    expect(readUrl).toContain("X-Amz-Algorithm=AWS4-HMAC-SHA256");
    expect(readUrl).toContain("X-Amz-Credential=access_key%2F20260613%2Fauto%2Fs3%2Faws4_request");
    expect(readUrl).toContain("X-Amz-SignedHeaders=host");
    expect(writeUrl).toContain("X-Amz-Signature=");
  });

  it("writes objects through signed PUT requests", async () => {
    const requests: Array<{ url: string; method: string; body: BodyInit | null | undefined; contentType: string | null }> = [];
    const provider = createR2ObjectStorageProvider({
      ...config,
      fetch: async (url, init) => {
        const headers = new Headers(init?.headers);
        requests.push({
          url: String(url),
          method: init?.method ?? "GET",
          body: init?.body,
          contentType: headers.get("content-type"),
        });
        return new Response(null, { status: 200 });
      },
    });

    const stored = await provider.putObject({
      key: "org/org_1/courses/course_1/file.txt",
      contentType: "text/plain",
      body: "hello",
    });

    expect(stored.key).toBe("org/org_1/courses/course_1/file.txt");
    expect(stored.url).toContain("X-Amz-Signature=");
    expect(requests).toMatchObject([
      {
        method: "PUT",
        body: "hello",
        contentType: "text/plain",
      },
    ]);
  });

  it("requires explicit tenant-scoped keys for read, write, and delete operations", async () => {
    const deleteRequests: string[] = [];
    const provider = createR2ObjectStorageProvider({
      ...config,
      fetch: async (url, init) => {
        if (init?.method === "DELETE") {
          deleteRequests.push(String(url));
        }
        return new Response(null, { status: 204 });
      },
    });

    await expect(provider.getSignedReadUrl("unscoped/file.txt")).rejects.toThrow("Object key must be tenant-scoped");
    await expect(
      provider.putObject({ key: "org/../file.txt", contentType: "text/plain", body: "bad" }),
    ).rejects.toThrow("Object key must not contain traversal");
    await expect(provider.deleteObject("org/org_1/courses/course_1/file.txt")).resolves.toBeUndefined();

    expect(deleteRequests).toHaveLength(1);
    expect(deleteRequests[0]).toContain("X-Amz-Signature=");
  });
});
