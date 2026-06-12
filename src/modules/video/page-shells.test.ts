import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();

function readPage(relativePath: string): string {
  return readFileSync(join(root, relativePath), "utf8");
}

describe("native video page shells", () => {
  it("includes live admin content forms and server action wiring", () => {
    const page = readPage("src/app/org/[slug]/admin/courses/[courseSlug]/content/page.tsx");

    expect(page).toContain("requireOrganizationUsersAdminBySlug");
    expect(page).toContain("createLessonFormAction");
    expect(page).toContain("replaceChaptersFormAction");
    expect(page).toContain("replaceTranscriptFormAction");
    expect(page).toContain("<form action={createLessonAction}");
    expect(page).toContain("<form action={replaceChaptersAction}");
    expect(page).toContain("<form action={replaceTranscriptAction}");
    expect(page).toContain("Modules");
    expect(page).toContain("Video lessons");
    expect(page).toContain("Chapters");
    expect(page).toContain("Transcript");
    expect(page).not.toContain("disabled");
  });

  it("includes live learner video player wiring", () => {
    const page = readPage("src/app/org/[slug]/learn/[courseSlug]/page.tsx");

    expect(page).toContain("requireOrganizationMemberBySlug");
    expect(page).toContain("VideoPlayer");
    expect(page).toContain("data-video-launch-path");
    expect(page).toContain("data-video-progress-path");
    expect(page).toContain("/api/org/${encodeURIComponent(slug)}/assignments/${encodeURIComponent(assignment.id)}/video/launch");
    expect(page).toContain("Assigned course required to launch this runtime.");
    expect(page).toContain("initialProgressPercent");
    expect(page).not.toContain("disabled");
  });
});
