import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function read(relativePath: string): string {
  return readFileSync(join(root, relativePath), "utf8");
}

describe("manager experience page shells", () => {
  it("defines a dedicated manager shell with learner-style navigation plus reports", () => {
    const components = read("src/app/ui/learnhub-components.tsx");

    expect(components).toContain("ManagerAppShell");
    expect(components).toContain("Manager workspace");
    expect(components).toContain("Team");
    expect(components).toContain("Assignments");
    expect(components).toContain("Reports");
    expect(components).toContain("Profile");
    expect(components).toContain("/org/${slug}/manager");
    expect(components).toContain("/org/${slug}/manager/assignments");
    expect(components).toContain("/org/${slug}/manager/reports");
  });

  it("wires manager dashboard, assignments, and reports routes", () => {
    const dashboard = read("src/app/org/[slug]/manager/page.tsx");
    const detail = read("src/app/org/[slug]/manager/team/[membershipId]/page.tsx");
    const assignments = read("src/app/org/[slug]/manager/assignments/page.tsx");
    const reports = read("src/app/org/[slug]/manager/reports/page.tsx");
    const orgEntry = read("src/app/org/[slug]/page.tsx");

    expect(dashboard).toContain("ManagerAppShell");
    expect(dashboard).toContain("Team dashboard");
    expect(dashboard).toContain("listManagerDirectReports");
    expect(dashboard).toContain("/manager/team/${encodeURIComponent(report.id)}");
    expect(detail).toContain("ManagerAppShell");
    expect(detail).toContain("listManagerDirectReportDetail");
    expect(detail).toContain("Assignment history");
    expect(detail).toContain("Certificate status");
    expect(detail).toContain("Compliance detail");
    expect(assignments).toContain("ManagerAppShell");
    expect(assignments).toContain("Assign learning");
    expect(assignments).toContain("assignCourseFormAction");
    expect(assignments).toContain("listManagerDirectReports");
    expect(reports).toContain("ManagerAppShell");
    expect(reports).toContain("Direct-report reports");
    expect(reports).toContain("resolveProgressReportScope");
    expect(reports).toContain("listManagerDirectReportTargets");
    expect(orgEntry).toContain("href: `/org/${slug}/manager`");
  });

  it("keeps manager detail progress selects aligned with the Prisma assignment progress schema", () => {
    const utilities = read("src/app/org/[slug]/manager/manager-utils.ts");

    expect(utilities).toContain("lastEventAt: true");
    expect(utilities).not.toContain("completedAt: true");
    expect(utilities).not.toContain("lastActivityAt: true");
  });
});
