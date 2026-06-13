import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function read(relativePath: string): string {
  return readFileSync(join(root, relativePath), "utf8");
}

describe("learner experience page shells", () => {
  it("defines the shared LearnHub palette and UI primitives", () => {
    const tokens = read("src/app/ui/learnhub-tokens.ts");
    const components = read("src/app/ui/learnhub-components.tsx");
    const globals = read("src/app/globals.css");

    expect(tokens).toContain("learnhubColors");
    expect(tokens).toContain("#111827");
    expect(tokens).toContain("#235bdb");
    expect(tokens).toContain("#12b8a6");
    expect(tokens).toContain("#fffaf0");
    expect(tokens).toContain("courseGradientForCategory");
    expect(components).toContain("LearnerAppShell");
    expect(components).toContain("CourseCard");
    expect(components).toContain("CertificateCard");
    expect(components).toContain("EmptyActionState");
    expect(globals).toContain("--learnhub-ink");
    expect(globals).toContain("--learnhub-blue");
    expect(globals).toContain("--learnhub-teal");
  });
});
