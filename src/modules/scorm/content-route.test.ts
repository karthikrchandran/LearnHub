import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { GET } from "@/app/scorm/[...path]/route";

let contentRoot: string;
let testRoot: string;

beforeEach(async () => {
  contentRoot = join(process.cwd(), ".learnhub", "scorm");
  testRoot = join(contentRoot, "test-route");
  await rm(testRoot, { recursive: true, force: true });
});

afterEach(async () => {
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
});
