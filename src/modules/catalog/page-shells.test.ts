import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const appRoot = path.join(process.cwd(), "src", "app", "org", "[slug]");

async function readPage(relativePath: string): Promise<string> {
  return readFile(path.join(appRoot, relativePath, "page.tsx"), "utf8");
}

describe("course catalog and assignment page shells", () => {
  it("adds a non-destructive admin catalog shell", async () => {
    const page = await readPage(path.join("admin", "catalog"));

    expect(page).toContain("Categories");
    expect(page).toContain("Tags");
    expect(page).toContain("Courses");
    expect(page).toContain("Draft");
    expect(page).toContain("Published");
    expect(page).toContain("Deprecated");
    expect(page).toContain("Retired");
    expect(page).toContain("disabled");
  });

  it("adds a non-destructive admin course detail shell", async () => {
    const page = await readPage(path.join("admin", "courses", "[courseSlug]"));

    expect(page).toContain("Course detail");
    expect(page).toContain("Type");
    expect(page).toContain("Lifecycle");
    expect(page).toContain("Category");
    expect(page).toContain("Tags");
    expect(page).toContain("Estimated business days");
    expect(page).toContain("disabled");
  });

  it("adds a non-destructive admin assignment shell", async () => {
    const page = await readPage(path.join("admin", "assignments"));

    expect(page).toContain("Course selector");
    expect(page).toContain("Learner or direct report");
    expect(page).toContain("Start date");
    expect(page).toContain("managers only to direct reports");
    expect(page).toContain("disabled");
  });

  it("adds a non-destructive learner catalog shell", async () => {
    const page = await readPage("learn");

    expect(page).toContain("Assigned courses");
    expect(page).toContain("Available courses");
    expect(page).toContain("Related courses");
    expect(page).toContain("Self-enroll");
    expect(page).toContain("disabled");
  });
});
