import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Badge, CertificateCard, CourseCover, LearnerAppShell, ProgressBar } from "@/app/ui/learnhub-components";
import { courseGradientForCategory, courseToneForCategory } from "@/app/ui/learnhub-tokens";

const root = process.cwd();
type BadgeTone = NonNullable<Parameters<typeof Badge>[0]["tone"]>;
const BadgeForCreateElement = Badge as (props: { children?: string; tone?: BadgeTone }) => ReturnType<typeof Badge>;
type LearnerAppShellProps = Parameters<typeof LearnerAppShell>[0];
const LearnerAppShellForCreateElement = LearnerAppShell as (
  props: Omit<LearnerAppShellProps, "children"> & { children?: LearnerAppShellProps["children"] },
) => ReturnType<typeof LearnerAppShell>;

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

  it("maps course categories to stable LearnHub tones and gradients", () => {
    expect(courseToneForCategory("security")).toBe("teal");
    expect(courseToneForCategory("customer-care")).toBe("violet");
    expect(courseToneForCategory("missing")).toBe("blue");
    expect(courseToneForCategory(null)).toBe("blue");
    expect(courseGradientForCategory("customer-care")).toBe("from-[#7457d5] to-[#235bdb]");
  });

  it("renders tone-aware badges with the shared LearnHub palette", () => {
    const markup = renderToStaticMarkup(createElement(BadgeForCreateElement, { tone: "violet" }, "Customer care"));

    expect(markup).toContain("var(--learnhub-violet)");
    expect(markup).toContain("var(--learnhub-ink)");
  });

  it("keeps every badge tone on a contrast-safe small-text contract", () => {
    const tones = ["blue", "teal", "green", "amber", "rose", "violet"] as const;

    for (const tone of tones) {
      const markup = renderToStaticMarkup(createElement(BadgeForCreateElement, { tone }, tone));

      expect(markup).toContain("text-[var(--learnhub-ink)]");
      expect(markup).toContain("border-[");
      expect(markup).not.toContain("text-[var(--learnhub-surface)]");
      expect(markup).not.toContain("text-white");
    }
  });

  it("renders certificate stamp text on a contrast-safe surface", () => {
    const markup = renderToStaticMarkup(
      createElement(CertificateCard, {
        action: createElement("span", null, "View"),
        body: "Completed on Jun 12",
        title: "Privacy Basics",
      }),
    );

    expect(markup).toContain("bg-[var(--learnhub-paper)]");
    expect(markup).toContain("text-[var(--learnhub-ink)]");
    expect(markup).not.toContain("text-white");
  });

  it("renders course cover titles above a reusable dark scrim", () => {
    const markup = renderToStaticMarkup(createElement(CourseCover, { categorySlug: "leadership", title: "Bright gradient course" }));

    expect(markup).toContain("relative");
    expect(markup).toContain("bg-black/45");
    expect(markup).toContain("absolute inset-0");
    expect(markup).toContain("relative z-10");
    expect(markup).toContain("Bright gradient course");
  });

  it("renders accessible progress with finite clamped values", () => {
    const negativeMarkup = renderToStaticMarkup(createElement(ProgressBar, { value: -10 }));
    const overflowMarkup = renderToStaticMarkup(createElement(ProgressBar, { value: 140 }));
    const nanMarkup = renderToStaticMarkup(createElement(ProgressBar, { value: Number.NaN }));
    const infinityMarkup = renderToStaticMarkup(createElement(ProgressBar, { value: Number.POSITIVE_INFINITY }));

    expect(negativeMarkup).toContain('role="progressbar"');
    expect(negativeMarkup).toContain('aria-valuemin="0"');
    expect(negativeMarkup).toContain('aria-valuemax="100"');
    expect(negativeMarkup).toContain('aria-valuenow="0"');
    expect(negativeMarkup).toContain("width:0%");
    expect(overflowMarkup).toContain('aria-valuenow="100"');
    expect(overflowMarkup).toContain("width:100%");
    expect(nanMarkup).toContain('aria-valuenow="0"');
    expect(nanMarkup).toContain("width:0%");
    expect(infinityMarkup).toContain('aria-valuenow="0"');
    expect(infinityMarkup).toContain("width:0%");
  });

  it("renders distinct public landing, login, and tenant entry surfaces", () => {
    const home = read("src/app/page.tsx");
    const login = read("src/app/login/page.tsx");
    const org = read("src/app/org/[slug]/page.tsx");

    expect(home).toContain("Launch branded learning programs");
    expect(home).toContain("Sign in to your school");
    expect(home).not.toContain("Commercial LMS foundation");
    expect(home).not.toContain("Acme workspace");
    expect(home).not.toContain("/org/acme");
    expect(home).not.toContain("Acme demo");
    expect(home).not.toContain("<nav");
    expect(login).toContain("Welcome back to LearnHub");
    expect(login).toContain("Use your organization credentials");
    expect(login).toContain("Organization learning");
    expect(login).not.toContain("Acme Learning");
    expect(org).toContain("Learner experience");
    expect(org).toContain("Admin console");
    expect(org).toContain("Reports");
    expect(org).toContain("redirect(`/org/${slug}/learn`)");
  });

  it("keeps tenant entry redirects and management CTAs role-aware", () => {
    const org = read("src/app/org/[slug]/page.tsx");
    const learnerRedirectIndex = org.indexOf("redirect(`/org/${slug}/learn`)");
    const dashboardSummaryIndex = org.indexOf("const summary = await getOrganizationDashboardSummary");

    expect(org).toContain("!context.isPlatformOwner");
    expect(learnerRedirectIndex).toBeGreaterThan(-1);
    expect(dashboardSummaryIndex).toBeGreaterThan(-1);
    expect(learnerRedirectIndex).toBeLessThan(dashboardSummaryIndex);
    expect(org).toContain("Manager workspace");
    expect(org).toContain("/admin/assignments");
  });

  it("seeds a complete learner demo surface", () => {
    const seed = read("prisma/seed.ts");

    expect(seed).toContain("Data Privacy Essentials");
    expect(seed).toContain("Handling Difficult Conversations");
    expect(seed).toContain("Warehouse Safety Fundamentals");
    expect(seed).toContain("Security incident practice quiz");
    expect(seed).toContain("knowledgeCheckAttempt.upsert");
    expect(seed).toContain("certificate.upsert");
    expect(seed).toContain('id: "seed-acme-learner-security-basics"');
    expect(seed).toContain('status: "IN_PROGRESS"');
    expect(seed).toContain("securityAssignmentProgressPayload");
    expect(seed).toContain("assignmentProgress.upsert");
    expect(seed).toContain("videoLessonProgress.upsert");
    expect(seed).toContain("certificatePayload");
    expect(seed).toContain("demoCertificateBaseUrl");
    expect(seed).toContain("update: certificatePayload");
    expect(seed).toContain('id: "seed-acme-learner-manager-coaching"');
    expect(seed).toContain('status: "ASSIGNED"');
    expect(seed).toContain('id: "seed-acme-learner-data-privacy"');
    expect(seed).toContain('id: "seed-kcq-privacy-personal-data"');
    expect(seed).toContain("privacyLessonProgressPayload");
    expect(seed).toContain("privacyKnowledgeCheckAttempt");
    expect(seed).not.toContain("Demo native video course foundation record.");
    expect(seed).not.toContain("Demo published course for manager assignment flows.");
  });

  it("wires My Courses and Catalog learner pages", () => {
    const myCourses = read("src/app/org/[slug]/learn/page.tsx");
    const catalog = read("src/app/org/[slug]/learn/catalog/page.tsx");

    expect(myCourses).toContain("My Courses");
    expect(myCourses).toContain("Continue learning");
    expect(myCourses).toContain("groupLearnerCourses");
    expect(myCourses).toContain("LearnerAppShell");
    expect(myCourses).toContain("CourseCard");
    expect(myCourses).toContain("Learner access required");
    expect(catalog).toContain("Course Catalog");
    expect(catalog).toContain("Find the next course for your role");
    expect(catalog).toContain("selfEnrollFormAction");
    expect(catalog).toContain("LearnerAppShell");
    expect(catalog).toContain("enrollmentError");
    expect(catalog).toContain("redirect(");
    expect(catalog).toContain('type="submit"');
    expect(catalog).not.toContain("No available published courses.");
  });

  it("keeps future course overview links compatible until the overview route ships", () => {
    const compatibilityRoute = read("src/app/org/[slug]/learn/courses/[courseSlug]/page.tsx");

    expect(compatibilityRoute).toContain("redirect(`/org/${slug}/learn/${courseSlug}`)");
  });

  it("hides the assessments nav link until the assessments route is active", () => {
    const coursesMarkup = renderToStaticMarkup(
      createElement(
        LearnerAppShellForCreateElement,
        { organizationName: "Acme Learning", slug: "acme", active: "courses" },
        createElement("span", null, "My Courses"),
      ),
    );
    const assessmentsMarkup = renderToStaticMarkup(
      createElement(
        LearnerAppShellForCreateElement,
        { organizationName: "Acme Learning", slug: "acme", active: "assessments" },
        createElement("span", null, "Assessments"),
      ),
    );

    expect(coursesMarkup).not.toContain("Assessments");
    expect(assessmentsMarkup).toContain("Assessments");
    expect(assessmentsMarkup).toContain("/org/acme/learn/assessments");
  });
});
