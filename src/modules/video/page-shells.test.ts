import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();

function readPage(relativePath: string): string {
  return readFileSync(join(root, relativePath), "utf8");
}

describe("native video page shells", () => {
  it("includes the expected admin content sections and disabled controls", () => {
    const page = readPage("src/app/org/[slug]/admin/courses/[courseSlug]/content/page.tsx");

    expect(page).toContain("requireOrganizationUsersAdminBySlug");
    expect(page).toContain("Modules");
    expect(page).toContain("Video lessons");
    expect(page).toContain("Chapters");
    expect(page).toContain("Transcript");
    expect(page).toContain("disabled");
  });

  it("includes the expected learner runtime sections and disabled controls", () => {
    const page = readPage("src/app/org/[slug]/learn/[courseSlug]/page.tsx");

    expect(page).toContain("requireOrganizationMemberBySlug");
    expect(page).toContain("data-video-launch-path");
    expect(page).toContain("data-video-progress-path");
    expect(page).toContain("/api/org/${encodeURIComponent(slug)}/assignments/${encodeURIComponent(assignment.id)}/video/launch");
    expect(page).toContain("Assigned course required to launch this runtime.");
    expect(page).toContain("Video player");
    expect(page).toContain("Chapters");
    expect(page).toContain("Transcript");
    expect(page).toContain("Search transcript");
    expect(page).toContain("Resume");
    expect(page).toContain("disabled");
  });
});
