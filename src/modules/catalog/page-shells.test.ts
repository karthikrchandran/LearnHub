import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const appRoot = path.join(process.cwd(), "src", "app", "org", "[slug]");

async function readPage(relativePath: string): Promise<string> {
  return readFile(path.join(appRoot, relativePath, "page.tsx"), "utf8");
}

describe("course catalog and assignment page shells", () => {
  it("wires a live admin catalog setup page shell", async () => {
    const page = await readPage(path.join("admin", "catalog"));

    expect(page).toContain("AdminAppShell");
    expect(page).toContain("Catalog setup");
    expect(page).toContain("Categories");
    expect(page).toContain("Tags");
    expect(page).toContain("createCategoryAction");
    expect(page).toContain("createTagAction");
    expect(page).toContain('name="name"');
    expect(page).toContain('name="slug"');
    expect(page).not.toContain("createCourseAction");
    expect(page).not.toContain('name="title"');
    expect(page).not.toContain("Course lifecycle");
  });

  it("adds a non-destructive admin course detail shell", async () => {
    const page = await readPage(path.join("admin", "courses", "[courseSlug]"));

    expect(page).toContain("Course detail");
    expect(page).toContain("Type");
    expect(page).toContain("Lifecycle");
    expect(page).toContain("Category");
    expect(page).toContain("Tags");
    expect(page).toContain("Estimated business days");
    expect(page).toContain("CourseLifecycleActionForm");
    expect(page).toContain("updateCourseLifecycleFormAction");
    expect(page).toContain('name="status" value="PUBLISHED"');
    expect(page).not.toContain('type="button" disabled');
  });

  it("wires a live admin single assignment shell", async () => {
    const page = await readPage(path.join("admin", "assignments"));

    expect(page).toContain("AdminAppShell");
    expect(page).toContain("Assign one learner");
    expect(page).toContain("Course selector");
    expect(page).toContain("Learner");
    expect(page).toContain("Start date");
    expect(page).toContain("publishedCourses");
    expect(page).toContain("eligibleLearners");
    expect(page).toContain("assignCourseAction");
    expect(page).toContain("Bulk Assignments");
    expect(page).toContain('name="courseId"');
    expect(page).toContain('name="learnerMembershipId"');
    expect(page).toContain('name="startDate"');
  });

  it("wires a live learner catalog and self-enrollment shell", async () => {
    const page = await readPage("learn");

    expect(page).toContain("My Courses");
    expect(page).toContain("lh-feature-panel");
    expect(page).toContain("groupLearnerCourses");
  });
});
