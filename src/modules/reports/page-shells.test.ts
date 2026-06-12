import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const orgRoot = path.join(process.cwd(), "src", "app", "org", "[slug]");

async function readPage(relativePath: string): Promise<string> {
  return readFile(path.join(orgRoot, relativePath, "page.tsx"), "utf8");
}

describe("progress report page shells", () => {
  it("renders learner and manager progress reports with CSV export", async () => {
    const page = await readPage("reports");

    expect(page).toContain("requireOrganizationMemberBySlug");
    expect(page).toContain("resolveProgressReportScope");
    expect(page).toContain("createPrismaProgressReportRepository");
    expect(page).toContain("Progress report");
    expect(page).toContain("Learner");
    expect(page).toContain("Course");
    expect(page).toContain("Status");
    expect(page).toContain("Progress");
    expect(page).toContain("Certificate");
    expect(page).toContain("/api/org/${encodeURIComponent(slug)}/reports/progress.csv");
    expect(page).toContain("No progress records match your report scope.");
  });

  it("renders admin organization-wide progress reports with CSV export", async () => {
    const page = await readPage(path.join("admin", "reports"));

    expect(page).toContain("requireOrganizationMemberBySlug");
    expect(page).toContain("resolveProgressReportScope");
    expect(page).toContain("createPrismaProgressReportRepository");
    expect(page).toContain("Organization progress");
    expect(page).toContain("Learner");
    expect(page).toContain("Course");
    expect(page).toContain("Due");
    expect(page).toContain("Last event");
    expect(page).toContain("/api/org/${encodeURIComponent(slug)}/reports/progress.csv");
    expect(page).toContain("No progress records for this organization yet.");
  });
});
