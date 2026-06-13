import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const appRoot = path.join(process.cwd(), "src", "app", "org", "[slug]");

async function readPage(relativePath: string): Promise<string> {
  return readFile(path.join(appRoot, relativePath, "page.tsx"), "utf8");
}

describe("course catalog and assignment page shells", () => {
  it("wires a live admin catalog page shell", async () => {
    const page = await readPage(path.join("admin", "catalog"));

    expect(page).toContain("Categories");
    expect(page).toContain("Tags");
    expect(page).toContain("Courses");
    expect(page).toContain("createCategoryAction");
    expect(page).toContain("createTagAction");
    expect(page).toContain("createCourseAction");
    expect(page).toContain('name="name"');
    expect(page).toContain('name="slug"');
    expect(page).toContain('name="title"');
    expect(page).toContain('name="type"');
    expect(page).toContain('name="categoryId"');
    expect(page).toContain('name="tagIds"');
    expect(page).toContain('name="expectedDurationMinutes"');
    expect(page).toContain('name="estimatedCompletionBusinessDays"');
    expect(page).toContain("updateLifecycleAction");
    expect(page).toContain("Draft");
    expect(page).toContain("Published");
    expect(page).toContain("Deprecated");
    expect(page).toContain("Retired");
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

  it("wires a live admin and manager assignment shell", async () => {
    const page = await readPage(path.join("admin", "assignments"));

    expect(page).toContain("Course selector");
    expect(page).toContain("Learner or direct report");
    expect(page).toContain("Start date");
    expect(page).toContain("publishedCourses");
    expect(page).toContain("eligibleLearners");
    expect(page).toContain("assignCourseAction");
    expect(page).toContain('name="courseId"');
    expect(page).toContain('name="learnerMembershipId"');
    expect(page).toContain('name="startDate"');
    expect(page).toContain("managers only to direct reports");
  });

  it("wires a live learner catalog and self-enrollment shell", async () => {
    const page = await readPage("learn");

    expect(page).toContain("My Courses");
    expect(page).toContain("lh-feature-panel");
    expect(page).toContain("groupLearnerCourses");
  });
});
