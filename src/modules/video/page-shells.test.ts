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
    expect(page).toContain("Provider status");
    expect(page).toContain("Create Mux upload");
    expect(page).toContain("/mux-upload");
    expect(page).toContain("Chapters");
    expect(page).toContain("Transcript");
    expect(page).toContain("/admin/courses/${encodeURIComponent(courseSlug)}/checks");
    expect(page).toContain("Manage knowledge checks");
    expect(page).not.toContain("disabled");
  });

  it("includes live admin knowledge check forms and server action wiring", () => {
    const page = readPage("src/app/org/[slug]/admin/courses/[courseSlug]/checks/page.tsx");
    const actions = readPage("src/app/org/[slug]/admin/courses/[courseSlug]/checks/actions.ts");

    expect(page).toContain("requireOrganizationUsersAdminBySlug");
    expect(page).toContain("createPrismaKnowledgeCheckRepository");
    expect(page).toContain("Knowledge checks");
    expect(page).toContain("Single answer");
    expect(page).toContain("Multiple answer");
    expect(page).toContain("True/false");
    expect(page).toContain("Explanation");
    expect(page).toContain("Answer feedback");
    expect(page).toContain("Activate");
    expect(page).toContain("Deactivate");
    expect(page).toContain("Reorder");
    expect(page).toContain("createCheckFormAction");
    expect(page).toContain("updateCheckFormAction");
    expect(actions).toContain("requireOrganizationUsersAdminBySlug");
    expect(actions).toContain("createKnowledgeCheckAdminActions");
    expect(actions).toContain("createPrismaKnowledgeCheckRepository");
  });

  it("includes learner lesson runtime paths and panels", () => {
    const page = readPage("src/app/org/[slug]/learn/courses/[courseSlug]/lessons/[lessonSlug]/page.tsx");

    expect(page).toContain("VideoPlayer");
    expect(page).toContain("KnowledgeCheckPanel");
    expect(page).toContain("data-video-launch-path");
    expect(page).toContain("data-video-progress-path");
    expect(page).toContain("/video/launch");
    expect(page).toContain("/video/progress");
    expect(page).toContain("/feedback");
  });
});
