import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();

function readPage(relativePath: string): string {
  return readFileSync(join(root, relativePath), "utf8");
}

describe("SCORM page shells", () => {
  it("includes the expected admin upload sections and disabled controls", () => {
    const page = readPage("src/app/org/[slug]/admin/courses/[courseSlug]/scorm/page.tsx");

    expect(page).toContain("requireOrganizationUsersAdminBySlug");
    expect(page).toContain("SCORM package");
    expect(page).toContain("Upload zip");
    expect(page).toContain("Launch path");
    expect(page).toContain("disabled");
  });

  it("includes the expected learner launch sections and disabled controls", () => {
    const page = readPage("src/app/org/[slug]/learn/[courseSlug]/scorm/page.tsx");

    expect(page).toContain("requireOrganizationMemberBySlug");
    expect(page).toContain("data-scorm-launch-path");
    expect(page).toContain("data-scorm-commit-path");
    expect(page).toContain("/api/org/${encodeURIComponent(slug)}/assignments/${encodeURIComponent(assignment.id)}/scorm/launch");
    expect(page).toContain("Assigned course required to launch this runtime.");
    expect(page).toContain("SCORM player");
    expect(page).toContain("Launch");
    expect(page).toContain("Progress");
    expect(page).toContain("Score");
    expect(page).toContain("disabled");
  });
});
