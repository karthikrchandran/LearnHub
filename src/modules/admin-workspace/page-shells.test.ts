import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const appRoot = path.join(root, "src", "app", "org", "[slug]");

async function readAppFile(...segments: string[]): Promise<string> {
  return readFile(path.join(appRoot, ...segments), "utf8");
}

async function readRootFile(...segments: string[]): Promise<string> {
  return readFile(path.join(root, ...segments), "utf8");
}

describe("admin workspace page shells", () => {
  it("provides a dedicated admin shell with separate task navigation", async () => {
    const components = await readRootFile("src", "app", "ui", "learnhub-components.tsx");

    expect(components).toContain("AdminAppShell");
    expect(components).toContain("Admin workspace");
    expect(components).toContain("Dashboard");
    expect(components).toContain("Courses");
    expect(components).toContain("Create Course");
    expect(components).toContain("Video Content");
    expect(components).toContain("SCORM Packages");
    expect(components).toContain("Users");
    expect(components).toContain("Bulk User Import");
    expect(components).toContain("Remove Access");
    expect(components).toContain("Assignments");
    expect(components).toContain("Bulk Assignments");
    expect(components).toContain("Reports");
    expect(components).toContain("Library");
    expect(components).toContain("Certificates");
    expect(components).toContain("Credentials");
    expect(components).toContain("Notifications");
    expect(components).toContain("Settings");
  });

  it("wraps all admin operational pages in the shared shell and nav", async () => {
    const pages = [
      ["admin", "library", "page.tsx"],
      ["admin", "certificates", "page.tsx"],
      ["admin", "credentials", "page.tsx"],
      ["admin", "notifications", "page.tsx"],
    ];

    for (const pageSegments of pages) {
      const page = await readAppFile(...pageSegments);

      expect(page).toContain("AdminAppShell");
      expect(page).toContain("getAdminWorkspace");
      expect(page).not.toContain("min-h-screen max-w-6xl");
    }
  });

  it("splits catalog setup from course creation and media import handoff", async () => {
    const dashboard = await readAppFile("admin", "page.tsx");
    const courses = await readAppFile("admin", "courses", "page.tsx");
    const createCourse = await readAppFile("admin", "courses", "new", "page.tsx");
    const createCourseActions = await readAppFile("admin", "courses", "new", "actions.ts");
    const catalog = await readAppFile("admin", "catalog", "page.tsx");

    expect(dashboard).toContain("AdminAppShell");
    expect(dashboard).toContain("/admin/courses/new");
    expect(courses).toContain("AdminAppShell");
    expect(courses).toContain("/admin/courses/${course.slug}/content");
    expect(courses).toContain("/admin/courses/${course.slug}/scorm");
    expect(createCourse).toContain("createAdminCourseFormAction");
    expect(createCourse).toContain('name="type"');
    expect(createCourseActions).toContain("redirect(");
    expect(createCourseActions).toContain("/content");
    expect(createCourseActions).toContain("/scorm");
    expect(catalog).toContain("Catalog setup");
    expect(catalog).not.toContain('name="title"');
    expect(catalog).not.toContain("Course lifecycle");
  });

  it("wires course detail lifecycle actions with feedback", async () => {
    const courseDetail = await readAppFile("admin", "courses", "[courseSlug]", "page.tsx");
    const lifecycleForm = await readAppFile("admin", "courses", "[courseSlug]", "course-lifecycle-action-form.tsx");

    expect(courseDetail).toContain("CourseLifecycleActionForm");
    expect(courseDetail).toContain("updateCourseLifecycleFormAction");
    expect(courseDetail).toContain('name="status" value="PUBLISHED"');
    expect(courseDetail).toContain('name="status" value="DEPRECATED"');
    expect(courseDetail).toContain('name="status" value="RETIRED"');
    expect(courseDetail).not.toContain('type="button" disabled');
    expect(lifecycleForm).toContain("useActionState");
    expect(lifecycleForm).toContain('role="status"');
  });

  it("splits user directory, bulk import, lifecycle editing, and safe removal", async () => {
    const users = await readAppFile("admin", "users", "page.tsx");
    const importPage = await readAppFile("admin", "users", "import", "page.tsx");
    const lifecycle = await readAppFile("admin", "users", "lifecycle", "page.tsx");
    const removeAccess = await readAppFile("admin", "users", "remove", "page.tsx");

    expect(users).toContain("User directory");
    expect(users).toContain("/admin/users/import");
    expect(users).toContain("/admin/users/remove");
    expect(users).not.toContain("UserImportForm");
    expect(importPage).toContain("UserImportForm");
    expect(lifecycle).toContain("Lifecycle controls");
    expect(removeAccess).toContain("Deactivate / remove access");
    expect(removeAccess).toContain('value="INACTIVE"');
    expect(removeAccess).toContain("preserves progress");
  });

  it("keeps bulk user import CSV text controlled between validate and import actions", async () => {
    const importForm = await readAppFile("admin", "users", "user-import-form.tsx");

    expect(importForm).toContain("useState");
    expect(importForm).toContain("csvValue");
    expect(importForm).toContain("setCsvValue");
    expect(importForm).toContain("value={csvValue}");
    expect(importForm).toContain("onChange={(event) => setCsvValue(event.target.value)}");
  });

  it("keeps single and bulk assignment screens separate", async () => {
    const singleAssignment = await readAppFile("admin", "assignments", "page.tsx");
    const bulkAssignment = await readAppFile("admin", "assignments", "bulk", "page.tsx");
    const assignmentActions = await readAppFile("admin", "assignments", "actions.ts");

    expect(singleAssignment).toContain("AssignmentActionForm");
    expect(singleAssignment).toContain("Assign one learner");
    expect(singleAssignment).toContain("/admin/assignments/bulk");
    expect(singleAssignment).toContain('name="learnerMembershipId"');
    expect(bulkAssignment).toContain("AssignmentActionForm");
    expect(bulkAssignment).toContain("Bulk Assignments");
    expect(bulkAssignment).toContain('name="learnerMembershipIds"');
    expect(bulkAssignment).toContain("bulkAssignCourseFormAction");
    expect(assignmentActions).toContain("createBulkAssignCourseAction");
  });

  it("surfaces action results on assignment and user lifecycle forms", async () => {
    const assignmentForm = await readAppFile("admin", "assignments", "assignment-action-form.tsx");
    const lifecycleForm = await readAppFile("admin", "users", "user-lifecycle-action-forms.tsx");
    const lifecycle = await readAppFile("admin", "users", "lifecycle", "page.tsx");
    const removeAccess = await readAppFile("admin", "users", "remove", "page.tsx");

    expect(assignmentForm).toContain("useActionState");
    expect(assignmentForm).toContain('role="status"');
    expect(lifecycleForm).toContain("useActionState");
    expect(lifecycleForm).toContain('role="status"');
    expect(lifecycle).toContain("UserLifecycleActionForm");
    expect(lifecycle).toContain("UserInlineActionForm");
    expect(removeAccess).toContain("UserLifecycleActionForm");
  });
});
