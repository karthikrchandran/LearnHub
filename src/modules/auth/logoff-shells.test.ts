import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function read(relativePath: string): string {
  return readFileSync(join(root, relativePath), "utf8");
}

describe("portal logoff links", () => {
  it("wires the shared learner, manager, and admin shells to the logoff control", () => {
    const components = read("src/app/ui/learnhub-components.tsx");

    expect(components).toContain("LogoffLink");
    expect(components).toContain("from \"./logoff-link\"");
    expect(components.match(/<LogoffLink \/>/g)).toHaveLength(3);
  });

  it("adds logoff to platform owner portal pages", () => {
    for (const page of [
      "src/app/platform/page.tsx",
      "src/app/platform/library/page.tsx",
      "src/app/platform/library/[courseSlug]/page.tsx",
      "src/app/platform/organizations/[slug]/page.tsx",
      "src/app/platform/organizations/new/page.tsx",
    ]) {
      const source = read(page);

      expect(source).toContain("LogoffLink");
      expect(source).toContain("@/app/ui/logoff-link");
      expect(source).toContain("<LogoffLink />");
    }
  });

  it("adds logoff to the tenant entry portal page", () => {
    const source = read("src/app/org/[slug]/page.tsx");

    expect(source).toContain("LogoffLink");
    expect(source).toContain("@/app/ui/logoff-link");
    expect(source).toContain("<LogoffLink />");
  });
});
