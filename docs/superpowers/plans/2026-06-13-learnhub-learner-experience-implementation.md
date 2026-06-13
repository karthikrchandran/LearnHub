# LearnHub Learner Experience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the approved polished learner-first LearnHub experience: landing, branded login, role-aware tenant entry, My Courses, Catalog, Course Overview, Lesson Page, Assessments, Certificates, and rich demo seed data.

**Architecture:** Add a shared learner UI system and a focused learner read-model module so route files stay thin. Preserve existing auth, assignment, runtime, assessment, feedback, and certificate services; new pages compose those capabilities into a complete LMS experience. Keep learner, tenant admin, and platform owner surfaces visually related but behaviorally distinct.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Tailwind CSS 4, Prisma 7, PostgreSQL, NextAuth 4-style auth, Vitest, Playwright CLI for manual smoke.

---

## Scope Check

This is a large user-facing UI slice, but it is one cohesive subsystem: the learner experience. It should execute as one branch with task-level commits because the routes share visual primitives, read models, and seed data. Do not mix unrelated admin/reporting feature expansion into this work.

## Current State

- `/` is a sparse scaffold with links to `/platform` and `/org/acme`.
- `/login` is a plain form.
- `/org/[slug]` is a mixed organization dashboard.
- `/org/[slug]/learn` has assigned and available course data, but it looks like a shell.
- `/org/[slug]/learn/[courseSlug]` renders the video runtime and knowledge checks directly.
- `/org/[slug]/certificates` is table-based and empty when no certificates exist.
- Assessment, feedback, certificate, runtime, catalog, and assignment modules exist and should be reused.

## File Structure

Create:

- `src/app/ui/learnhub-tokens.ts` - shared color, course-gradient, and status-token definitions.
- `src/app/ui/learnhub-components.tsx` - reusable app shell, buttons, cards, progress, empty action, and badges.
- `src/modules/learner-experience/read-model.ts` - pure learner view-model builders.
- `src/modules/learner-experience/prisma-repository.ts` - Prisma data queries for learner surfaces.
- `src/modules/learner-experience/read-model.test.ts` - pure tests for status grouping and action labels.
- `src/modules/learner-experience/prisma-repository.test.ts` - query-shape tests with a mocked Prisma client.
- `src/modules/learner-experience/page-shells.test.ts` - static page-shell tests for route wiring and no shell text.
- `src/app/org/[slug]/learn/catalog/page.tsx` - learner catalog route.
- `src/app/org/[slug]/learn/courses/[courseSlug]/page.tsx` - learner course overview route.
- `src/app/org/[slug]/learn/courses/[courseSlug]/lessons/[lessonSlug]/page.tsx` - learner lesson route.
- `src/app/org/[slug]/learn/assessments/page.tsx` - learner assessment center route.

Modify:

- `src/app/globals.css` - add shared CSS variables and base page background.
- `src/app/page.tsx` - public landing page.
- `src/app/login/page.tsx` - branded login layout.
- `src/app/login/login-form.tsx` - apply shared form styling without changing auth behavior.
- `src/app/org/[slug]/page.tsx` - role-aware tenant entry.
- `src/app/org/[slug]/learn/page.tsx` - My Courses home.
- `src/app/org/[slug]/learn/[courseSlug]/page.tsx` - compatibility redirect to course overview.
- `src/app/org/[slug]/learn/[courseSlug]/scorm/page.tsx` - keep SCORM launch behavior and shared visual wrapper.
- `src/app/org/[slug]/learn/[courseSlug]/video-player.tsx` - reuse inside lesson route if needed.
- `src/app/org/[slug]/learn/[courseSlug]/knowledge-check-panel.tsx` - keep submit behavior, allow embedded lesson styling if needed.
- `src/app/org/[slug]/certificates/page.tsx` - certificate wallet.
- `src/lib/auth/redirects.ts` - route learner-only users directly to My Courses.
- `src/lib/auth/redirects.test.ts` - update redirect expectations.
- `prisma/seed.ts` - enrich demo content.
- Existing page-shell tests in `src/modules/catalog/page-shells.test.ts`, `src/modules/video/page-shells.test.ts`, and `src/modules/reports/page-shells.test.ts` when assertions reference old learner labels.

Do not modify:

- Existing dirty plan files unless explicitly continuing their work.
- Provider implementations unrelated to rendering the learner product surface.

---

### Task 1: Shared LearnHub Visual System

**Files:**
- Create: `src/app/ui/learnhub-tokens.ts`
- Create: `src/app/ui/learnhub-components.tsx`
- Modify: `src/app/globals.css`
- Test: `src/modules/learner-experience/page-shells.test.ts`

- [ ] **Step 1: Write the failing visual-token/page-shell test**

Create `src/modules/learner-experience/page-shells.test.ts` with this initial content:

```ts
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
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```powershell
npm run test -- src/modules/learner-experience/page-shells.test.ts
```

Expected: fail because `src/app/ui/learnhub-tokens.ts` does not exist.

- [ ] **Step 3: Add shared tokens**

Create `src/app/ui/learnhub-tokens.ts`:

```ts
export const learnhubColors = {
  ink: "#111827",
  muted: "#667085",
  mutedStrong: "#475467",
  paper: "#fffaf0",
  app: "#f6f8fb",
  surface: "#ffffff",
  line: "#d7dce5",
  blue: "#235bdb",
  teal: "#12b8a6",
  green: "#1b8a5a",
  amber: "#f5b544",
  rose: "#d94a64",
  violet: "#7457d5",
} as const;

export type CourseTone = "blue" | "teal" | "green" | "amber" | "rose" | "violet";

const categoryToneMap: Record<string, CourseTone> = {
  compliance: "blue",
  security: "teal",
  leadership: "amber",
  "customer-care": "violet",
  privacy: "green",
  safety: "rose",
};

export function courseToneForCategory(categorySlug: string | null | undefined): CourseTone {
  if (!categorySlug) {
    return "blue";
  }

  return categoryToneMap[categorySlug] ?? "blue";
}

export function courseGradientForCategory(categorySlug: string | null | undefined): string {
  switch (courseToneForCategory(categorySlug)) {
    case "teal":
      return "from-[#235bdb] to-[#12b8a6]";
    case "green":
      return "from-[#1b8a5a] to-[#12b8a6]";
    case "amber":
      return "from-[#f5b544] to-[#d94a64]";
    case "rose":
      return "from-[#d94a64] to-[#7457d5]";
    case "violet":
      return "from-[#7457d5] to-[#235bdb]";
    case "blue":
    default:
      return "from-[#235bdb] to-[#12b8a6]";
  }
}
```

- [ ] **Step 4: Add shared components**

Create `src/app/ui/learnhub-components.tsx`:

```tsx
import Link from "next/link";
import type { ReactNode } from "react";

import { courseGradientForCategory } from "./learnhub-tokens";

type NavItem = {
  label: string;
  href: string;
  active?: boolean;
};

export function BrandMark({ label = "L" }: { label?: string }) {
  return (
    <span className="grid h-9 w-9 place-items-center rounded-xl bg-[var(--learnhub-blue)] text-sm font-black text-white">
      {label.slice(0, 1).toUpperCase()}
    </span>
  );
}

export function PrimaryButton({
  href,
  children,
  variant = "dark",
}: {
  href: string;
  children: ReactNode;
  variant?: "dark" | "blue" | "light";
}) {
  const className =
    variant === "light"
      ? "inline-flex min-h-10 items-center justify-center rounded-full border border-[var(--learnhub-line)] bg-white px-4 text-sm font-bold text-[var(--learnhub-ink)]"
      : variant === "blue"
        ? "inline-flex min-h-10 items-center justify-center rounded-full bg-[var(--learnhub-blue)] px-4 text-sm font-bold text-white"
        : "inline-flex min-h-10 items-center justify-center rounded-full bg-[var(--learnhub-ink)] px-4 text-sm font-bold text-white";

  return (
    <Link className={className} href={href}>
      {children}
    </Link>
  );
}

export function LearnerAppShell({
  organizationName,
  slug,
  active,
  children,
}: {
  organizationName: string;
  slug: string;
  active: "courses" | "catalog" | "assessments" | "certificates";
  children: ReactNode;
}) {
  const navItems: NavItem[] = [
    { label: "My Courses", href: `/org/${slug}/learn`, active: active === "courses" },
    { label: "Catalog", href: `/org/${slug}/learn/catalog`, active: active === "catalog" },
    { label: "Assessments", href: `/org/${slug}/learn/assessments`, active: active === "assessments" },
    { label: "Certificates", href: `/org/${slug}/certificates`, active: active === "certificates" },
  ];

  return (
    <main className="min-h-screen bg-[var(--learnhub-app)]">
      <div className="grid min-h-screen lg:grid-cols-[16rem_minmax(0,1fr)]">
        <aside className="bg-[var(--learnhub-ink)] px-4 py-6 text-slate-300">
          <div className="mb-8 flex items-center gap-3 text-lg font-black text-white">
            <BrandMark label={organizationName} />
            {organizationName}
          </div>
          <nav className="grid gap-2">
            {navItems.map((item) => (
              <Link
                key={item.href}
                className={
                  item.active
                    ? "rounded-xl bg-white px-3 py-3 text-sm font-bold text-[var(--learnhub-ink)]"
                    : "rounded-xl px-3 py-3 text-sm font-bold text-slate-300 hover:bg-white/10"
                }
                href={item.href}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </aside>
        <section className="px-5 py-6 lg:px-8">{children}</section>
      </div>
    </main>
  );
}

export function Badge({ children, tone = "blue" }: { children: ReactNode; tone?: "blue" | "teal" | "green" | "amber" | "rose" }) {
  const classes = {
    blue: "bg-blue-50 text-blue-800",
    teal: "bg-teal-50 text-teal-800",
    green: "bg-green-50 text-green-800",
    amber: "bg-amber-50 text-amber-800",
    rose: "bg-rose-50 text-rose-800",
  };

  return <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${classes[tone]}`}>{children}</span>;
}

export function ProgressBar({ value }: { value: number }) {
  const safeValue = Math.min(100, Math.max(0, value));

  return (
    <div className="h-2.5 overflow-hidden rounded-full bg-slate-200">
      <span className="block h-full rounded-full bg-[var(--learnhub-teal)]" style={{ width: `${safeValue}%` }} />
    </div>
  );
}

export function CourseCover({ title, categorySlug }: { title: string; categorySlug?: string | null }) {
  return (
    <div className={`flex h-32 items-end bg-gradient-to-br ${courseGradientForCategory(categorySlug)} p-4 text-white`}>
      <h3 className="text-xl font-black leading-tight">{title}</h3>
    </div>
  );
}

export function CourseCard({
  title,
  description,
  categorySlug,
  meta,
  progressPercent,
  action,
}: {
  title: string;
  description: string;
  categorySlug?: string | null;
  meta: string[];
  progressPercent?: number;
  action: ReactNode;
}) {
  return (
    <article className="overflow-hidden rounded-2xl border border-[var(--learnhub-line)] bg-white shadow-[0_16px_40px_rgba(22,34,58,0.08)]">
      <CourseCover title={title} categorySlug={categorySlug} />
      <div className="grid min-h-56 gap-3 p-4">
        <div>
          <h3 className="text-lg font-black text-[var(--learnhub-ink)]">{title}</h3>
          <p className="mt-2 text-sm text-[var(--learnhub-muted)]">{description}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {meta.map((item) => (
            <Badge key={item}>{item}</Badge>
          ))}
        </div>
        {typeof progressPercent === "number" ? <ProgressBar value={progressPercent} /> : null}
        <div className="mt-auto">{action}</div>
      </div>
    </article>
  );
}

export function EmptyActionState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-dashed border-[var(--learnhub-line)] bg-white p-6">
      <h3 className="text-lg font-black text-[var(--learnhub-ink)]">{title}</h3>
      <p className="mt-2 text-sm text-[var(--learnhub-muted)]">{body}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </section>
  );
}

export function CertificateCard({
  title,
  body,
  action,
  locked = false,
}: {
  title: string;
  body: string;
  action: ReactNode;
  locked?: boolean;
}) {
  return (
    <article className="grid gap-4 rounded-2xl border border-[var(--learnhub-line)] bg-white p-4 shadow-[0_14px_36px_rgba(22,34,58,0.07)] md:grid-cols-[6rem_minmax(0,1fr)_auto] md:items-center">
      <div className="grid h-20 place-items-center rounded-2xl bg-gradient-to-br from-[#f5b544] to-[#235bdb] text-sm font-black text-white">
        {locked ? "LOCKED" : "CERT"}
      </div>
      <div>
        <h3 className="text-lg font-black text-[var(--learnhub-ink)]">{title}</h3>
        <p className="mt-1 text-sm text-[var(--learnhub-muted)]">{body}</p>
      </div>
      <div>{action}</div>
    </article>
  );
}
```

- [ ] **Step 5: Add global CSS variables**

Modify `src/app/globals.css`:

```css
@import "tailwindcss";

:root {
  --background: #fffaf0;
  --foreground: #111827;
  --learnhub-ink: #111827;
  --learnhub-muted: #667085;
  --learnhub-muted-strong: #475467;
  --learnhub-paper: #fffaf0;
  --learnhub-app: #f6f8fb;
  --learnhub-surface: #ffffff;
  --learnhub-line: #d7dce5;
  --learnhub-blue: #235bdb;
  --learnhub-teal: #12b8a6;
  --learnhub-green: #1b8a5a;
  --learnhub-amber: #f5b544;
  --learnhub-rose: #d94a64;
  --learnhub-violet: #7457d5;
}

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --font-sans: var(--font-geist-sans);
  --font-mono: var(--font-geist-mono);
}

body {
  background:
    radial-gradient(circle at 10% 8%, rgba(18, 184, 166, 0.14), transparent 30%),
    radial-gradient(circle at 90% 0%, rgba(35, 91, 219, 0.12), transparent 30%),
    linear-gradient(180deg, var(--learnhub-paper) 0%, var(--learnhub-app) 48%, #f9fafb 100%);
  color: var(--foreground);
  font-family: Arial, Helvetica, sans-serif;
}
```

- [ ] **Step 6: Run the focused test and verify it passes**

Run:

```powershell
npm run test -- src/modules/learner-experience/page-shells.test.ts
```

Expected: pass.

- [ ] **Step 7: Commit**

```powershell
git add src/app/ui/learnhub-tokens.ts src/app/ui/learnhub-components.tsx src/app/globals.css src/modules/learner-experience/page-shells.test.ts
git commit -m "feat: add LearnHub learner design system"
```

---

### Task 2: Public Landing, Branded Login, And Role-Aware Tenant Entry

**Files:**
- Modify: `src/app/page.tsx`
- Modify: `src/app/login/page.tsx`
- Modify: `src/app/login/login-form.tsx`
- Modify: `src/app/org/[slug]/page.tsx`
- Modify: `src/lib/auth/redirects.ts`
- Modify: `src/lib/auth/redirects.test.ts`
- Test: `src/modules/learner-experience/page-shells.test.ts`

- [ ] **Step 1: Add failing shell and redirect tests**

Append to `src/modules/learner-experience/page-shells.test.ts`:

```ts
  it("renders distinct public landing, login, and tenant entry surfaces", () => {
    const home = read("src/app/page.tsx");
    const login = read("src/app/login/page.tsx");
    const org = read("src/app/org/[slug]/page.tsx");

    expect(home).toContain("Launch branded learning programs");
    expect(home).toContain("Sign in to your school");
    expect(home).not.toContain("Commercial LMS foundation");
    expect(home).not.toContain("Acme workspace");
    expect(login).toContain("Welcome back to LearnHub");
    expect(login).toContain("Use your organization credentials");
    expect(org).toContain("Learner experience");
    expect(org).toContain("Admin console");
    expect(org).toContain("Reports");
    expect(org).toContain("redirect(`/org/${slug}/learn`)");
  });
```

Update `src/lib/auth/redirects.test.ts` by adding a learner-only context and expectation:

```ts
const learnerOnly: PostLoginRedirectContext = {
  isPlatformOwner: false,
  memberships: [
    {
      organizationSlug: "acme",
      status: "ACTIVE",
      roles: ["LEARNER"],
    },
  ],
};

it("sends learner-only users directly to My Courses", () => {
  expect(resolvePostLoginRedirect(learnerOnly)).toBe("/org/acme/learn");
});
```

- [ ] **Step 2: Run the focused tests and verify they fail**

Run:

```powershell
npm run test -- src/lib/auth/redirects.test.ts src/modules/learner-experience/page-shells.test.ts
```

Expected: fail because `roles` is not part of `PostLoginRedirectContext` and pages still contain scaffold text.

- [ ] **Step 3: Extend post-login redirect context**

Modify `src/lib/auth/redirects.ts`:

```ts
import type { OrganizationRole, UserStatus } from "@prisma/client";

export type PostLoginRedirectContext = {
  isPlatformOwner: boolean;
  memberships: {
    organizationSlug: string;
    status: UserStatus;
    roles?: OrganizationRole[];
  }[];
};

export function resolvePostLoginRedirect(context: PostLoginRedirectContext | null): string {
  if (!context) {
    return "/login";
  }

  if (context.isPlatformOwner) {
    return "/platform";
  }

  const activeMembership = context.memberships.find((membership) => membership.status === "ACTIVE");

  if (!activeMembership) {
    return "/platform";
  }

  const roles = activeMembership.roles ?? [];
  const isLearnerOnly = roles.includes("LEARNER") && !roles.some((role) => role === "ADMIN" || role === "MANAGER");

  return isLearnerOnly ? `/org/${activeMembership.organizationSlug}/learn` : `/org/${activeMembership.organizationSlug}`;
}
```

Modify `src/app/org/page.tsx` membership select and mapping to include roles:

```ts
roles: true,
```

and:

```ts
roles: membership.roles,
```

- [ ] **Step 4: Replace the public landing page**

Modify `src/app/page.tsx` to use `BrandMark` and `PrimaryButton`. Include these required strings:

```tsx
import { BrandMark, CourseCard, PrimaryButton } from "./ui/learnhub-components";

export default function HomePage() {
  return (
    <main className="min-h-screen">
      <header className="mx-auto flex max-w-7xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-3 text-xl font-black text-[var(--learnhub-ink)]">
          <BrandMark />
          LearnHub
        </div>
        <nav className="hidden items-center gap-6 text-sm font-bold text-[var(--learnhub-muted-strong)] md:flex">
          <span>Courses</span>
          <span>For teams</span>
          <span>Certificates</span>
          <PrimaryButton href="/login" variant="light">Sign in</PrimaryButton>
        </nav>
      </header>
      <section className="mx-auto grid max-w-7xl gap-10 px-6 py-12 lg:grid-cols-[minmax(0,1fr)_26rem] lg:items-center">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.14em] text-[var(--learnhub-blue)]">
            Team learning that feels like a course business
          </p>
          <h1 className="mt-3 max-w-4xl text-5xl font-black leading-tight text-[var(--learnhub-ink)]">
            Launch branded learning programs without handing learners a spreadsheet.
          </h1>
          <p className="mt-5 max-w-2xl text-lg text-[var(--learnhub-muted-strong)]">
            LearnHub gives each organization a polished course site, structured lessons, assessments,
            progress, and certificates while admins keep control of assignments and reporting.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <PrimaryButton href="/login">Sign in to your school</PrimaryButton>
            <PrimaryButton href="/org/acme/learn" variant="light">Preview Acme demo</PrimaryButton>
          </div>
        </div>
        <CourseCard
          title="Workplace Security Basics"
          description="Assigned learning with lessons, a required assessment, and certificate eligibility."
          categorySlug="security"
          meta={["5 lessons", "45 min", "Certificate"]}
          progressPercent={58}
          action={<PrimaryButton href="/login" variant="blue">Continue lesson</PrimaryButton>}
        />
      </section>
    </main>
  );
}
```

- [ ] **Step 5: Update branded login**

Modify `src/app/login/page.tsx`:

```tsx
import { BrandMark } from "../ui/learnhub-components";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <main className="grid min-h-screen lg:grid-cols-[minmax(0,1fr)_30rem]">
      <section className="hidden bg-[var(--learnhub-ink)] px-10 py-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="flex items-center gap-3 text-xl font-black">
          <BrandMark />
          LearnHub
        </div>
        <div>
          <p className="text-sm font-black uppercase tracking-[0.14em] text-teal-200">Acme Learning</p>
          <h1 className="mt-3 text-5xl font-black leading-tight">Return to your courses, assessments, and certificates.</h1>
          <p className="mt-5 max-w-xl text-base text-slate-300">
            Your school workspace keeps assigned courses, progress, and credentials in one place.
          </p>
        </div>
      </section>
      <section className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-md">
          <header className="mb-6">
            <p className="text-sm font-black uppercase tracking-[0.14em] text-[var(--learnhub-blue)]">Welcome back to LearnHub</p>
            <h1 className="mt-2 text-3xl font-black text-[var(--learnhub-ink)]">Sign in</h1>
            <p className="mt-2 text-sm text-[var(--learnhub-muted)]">Use your organization credentials to continue learning.</p>
          </header>
          <LoginForm />
        </div>
      </section>
    </main>
  );
}
```

Modify `src/app/login/login-form.tsx` class names only; keep `signIn("credentials", { callbackUrl: "/org" })` unchanged.

- [ ] **Step 6: Make tenant entry role-aware**

Modify `src/app/org/[slug]/page.tsx` so after loading `context`, `organizationId`, and `summary`, it computes:

```ts
const activeMembership = context.memberships.find(
  (membership) => membership.organizationId === organizationId && membership.status === "ACTIVE",
);
const roles = activeMembership?.roles ?? [];
const isLearnerOnly = roles.includes("LEARNER") && !roles.some((role) => role === "ADMIN" || role === "MANAGER");

if (isLearnerOnly) {
  redirect(`/org/${slug}/learn`);
}
```

Import `redirect` from `next/navigation`. Render a workspace page with three distinct action cards:

```tsx
<PrimaryButton href={`/org/${slug}/learn`} variant="blue">Learner experience</PrimaryButton>
<PrimaryButton href={`/org/${slug}/admin/catalog`} variant="light">Admin console</PrimaryButton>
<PrimaryButton href={`/org/${slug}/reports`} variant="light">Reports</PrimaryButton>
```

- [ ] **Step 7: Run focused tests**

Run:

```powershell
npm run test -- src/lib/auth/redirects.test.ts src/modules/learner-experience/page-shells.test.ts
```

Expected: pass.

- [ ] **Step 8: Commit**

```powershell
git add src/app/page.tsx src/app/login/page.tsx src/app/login/login-form.tsx src/app/org/page.tsx src/app/org/[slug]/page.tsx src/lib/auth/redirects.ts src/lib/auth/redirects.test.ts src/modules/learner-experience/page-shells.test.ts
git commit -m "feat: separate public login and tenant entry surfaces"
```

---

### Task 3: Learner Experience Read Models

**Files:**
- Create: `src/modules/learner-experience/read-model.ts`
- Create: `src/modules/learner-experience/prisma-repository.ts`
- Create: `src/modules/learner-experience/read-model.test.ts`
- Create: `src/modules/learner-experience/prisma-repository.test.ts`

- [ ] **Step 1: Write failing pure read-model tests**

Create `src/modules/learner-experience/read-model.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { buildCourseAction, buildCourseMeta, groupLearnerCourses } from "./read-model";

describe("learner experience read models", () => {
  it("groups assigned, in-progress, completed, and available courses", () => {
    const grouped = groupLearnerCourses([
      { id: "a1", assignmentId: "as1", status: "ASSIGNED", progressPercent: 0, certificateIssued: false },
      { id: "a2", assignmentId: "as2", status: "IN_PROGRESS", progressPercent: 58, certificateIssued: false },
      { id: "a3", assignmentId: "as3", status: "COMPLETED", progressPercent: 100, certificateIssued: true },
      { id: "a4", assignmentId: null, status: "AVAILABLE", progressPercent: 0, certificateIssued: false },
    ]);

    expect(grouped.assigned.map((course) => course.id)).toEqual(["a1"]);
    expect(grouped.inProgress.map((course) => course.id)).toEqual(["a2"]);
    expect(grouped.completed.map((course) => course.id)).toEqual(["a3"]);
    expect(grouped.available.map((course) => course.id)).toEqual(["a4"]);
  });

  it("builds learner course action labels", () => {
    expect(buildCourseAction({ slug: "acme", courseSlug: "security", assignmentId: "as1", status: "IN_PROGRESS" })).toEqual({
      label: "Resume",
      href: "/org/acme/learn/courses/security",
      variant: "blue",
    });
    expect(buildCourseAction({ slug: "acme", courseSlug: "privacy", assignmentId: "as2", status: "COMPLETED" })).toEqual({
      label: "View certificate",
      href: "/org/acme/certificates",
      variant: "light",
    });
    expect(buildCourseAction({ slug: "acme", courseSlug: "coaching", assignmentId: null, status: "AVAILABLE" })).toEqual({
      label: "Enroll",
      href: "/org/acme/learn/courses/coaching",
      variant: "light",
    });
  });

  it("builds compact course metadata", () => {
    expect(buildCourseMeta({ durationMinutes: 45, lessonCount: 5, certificateEligible: true })).toEqual([
      "45 min",
      "5 lessons",
      "Certificate",
    ]);
  });
});
```

- [ ] **Step 2: Run the pure test and verify it fails**

Run:

```powershell
npm run test -- src/modules/learner-experience/read-model.test.ts
```

Expected: fail because `read-model.ts` does not exist.

- [ ] **Step 3: Add read-model types and builders**

Create `src/modules/learner-experience/read-model.ts`:

```ts
export type LearnerCourseStatus = "ASSIGNED" | "IN_PROGRESS" | "COMPLETED" | "OVERDUE" | "AVAILABLE";
export type LearnerActionVariant = "blue" | "light";

export type LearnerCourseCard = {
  id: string;
  assignmentId: string | null;
  status: LearnerCourseStatus;
  progressPercent: number;
  certificateIssued: boolean;
};

export type LearnerCourseActionInput = {
  slug: string;
  courseSlug: string;
  assignmentId: string | null;
  status: LearnerCourseStatus;
};

export type LearnerCourseAction = {
  label: string;
  href: string;
  variant: LearnerActionVariant;
};

export function groupLearnerCourses(courses: LearnerCourseCard[]) {
  return {
    assigned: courses.filter((course) => course.status === "ASSIGNED" || course.status === "OVERDUE"),
    inProgress: courses.filter((course) => course.status === "IN_PROGRESS"),
    completed: courses.filter((course) => course.status === "COMPLETED"),
    available: courses.filter((course) => course.status === "AVAILABLE"),
  };
}

export function buildCourseAction(input: LearnerCourseActionInput): LearnerCourseAction {
  if (input.status === "COMPLETED") {
    return { label: "View certificate", href: `/org/${input.slug}/certificates`, variant: "light" };
  }

  if (input.status === "AVAILABLE") {
    return { label: "Enroll", href: `/org/${input.slug}/learn/courses/${input.courseSlug}`, variant: "light" };
  }

  if (input.status === "IN_PROGRESS") {
    return { label: "Resume", href: `/org/${input.slug}/learn/courses/${input.courseSlug}`, variant: "blue" };
  }

  return { label: "Start", href: `/org/${input.slug}/learn/courses/${input.courseSlug}`, variant: "blue" };
}

export function buildCourseMeta(input: {
  durationMinutes: number;
  lessonCount: number;
  certificateEligible: boolean;
}): string[] {
  return [
    `${input.durationMinutes} min`,
    `${input.lessonCount} ${input.lessonCount === 1 ? "lesson" : "lessons"}`,
    ...(input.certificateEligible ? ["Certificate"] : []),
  ];
}
```

- [ ] **Step 4: Run the pure test and verify it passes**

Run:

```powershell
npm run test -- src/modules/learner-experience/read-model.test.ts
```

Expected: pass.

- [ ] **Step 5: Write failing repository query-shape tests**

Create `src/modules/learner-experience/prisma-repository.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

import { createPrismaLearnerExperienceRepository } from "./prisma-repository";

describe("Prisma learner experience repository", () => {
  it("loads assigned learner courses with progress, lessons, checks, and certificate state", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const repository = createPrismaLearnerExperienceRepository({
      courseAssignment: { findMany, findFirst: vi.fn() },
      course: { findMany: vi.fn(), findFirst: vi.fn() },
      organization: { findUnique: vi.fn() },
      organizationMembership: { findFirst: vi.fn() },
      certificate: { findMany: vi.fn() },
      courseKnowledgeCheckQuestion: { findMany: vi.fn() },
      knowledgeCheckAttempt: { findMany: vi.fn() },
    });

    await repository.listLearnerAssignments({ organizationId: "org_1", membershipId: "mem_1" });

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { organizationId: "org_1", membershipId: "mem_1" },
      select: expect.objectContaining({
        id: true,
        status: true,
        dueDate: true,
        progress: expect.any(Object),
        certificate: expect.any(Object),
        course: expect.objectContaining({
          select: expect.objectContaining({
            title: true,
            slug: true,
            description: true,
            expectedDurationMinutes: true,
            videoLessons: expect.any(Object),
            knowledgeCheckQuestions: expect.any(Object),
          }),
        }),
      }),
    }));
  });

  it("loads available published courses excluding assigned course ids", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const repository = createPrismaLearnerExperienceRepository({
      courseAssignment: { findMany: vi.fn(), findFirst: vi.fn() },
      course: { findMany, findFirst: vi.fn() },
      organization: { findUnique: vi.fn() },
      organizationMembership: { findFirst: vi.fn() },
      certificate: { findMany: vi.fn() },
      courseKnowledgeCheckQuestion: { findMany: vi.fn() },
      knowledgeCheckAttempt: { findMany: vi.fn() },
    });

    await repository.listAvailableCourses({
      organizationId: "org_1",
      excludedCourseIds: ["course_1"],
    });

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        organizationId: "org_1",
        status: "PUBLISHED",
        id: { notIn: ["course_1"] },
      },
    }));
  });
});
```

- [ ] **Step 6: Run repository tests and verify they fail**

Run:

```powershell
npm run test -- src/modules/learner-experience/prisma-repository.test.ts
```

Expected: fail because `prisma-repository.ts` does not exist.

- [ ] **Step 7: Add the Prisma repository**

Create `src/modules/learner-experience/prisma-repository.ts` with a client type covering:

```ts
type LearnerExperiencePrismaClient = {
  organization: Pick<PrismaClient["organization"], "findUnique">;
  organizationMembership: Pick<PrismaClient["organizationMembership"], "findFirst">;
  courseAssignment: Pick<PrismaClient["courseAssignment"], "findMany" | "findFirst">;
  course: Pick<PrismaClient["course"], "findMany" | "findFirst">;
  certificate: Pick<PrismaClient["certificate"], "findMany">;
  courseKnowledgeCheckQuestion: Pick<PrismaClient["courseKnowledgeCheckQuestion"], "findMany">;
  knowledgeCheckAttempt: Pick<PrismaClient["knowledgeCheckAttempt"], "findMany">;
};
```

Export `createPrismaLearnerExperienceRepository(client)` with methods:

```ts
listLearnerAssignments(input: { organizationId: string; membershipId: string })
listAvailableCourses(input: { organizationId: string; excludedCourseIds: string[] })
findCourseOverview(input: { organizationId: string; courseSlug: string; membershipId: string })
findLesson(input: { organizationId: string; courseSlug: string; lessonSlug: string; membershipId: string })
listAssessments(input: { organizationId: string; membershipId: string })
listCertificates(input: { organizationId: string; membershipId: string })
```

Use Prisma selects that include these fields:

```ts
course: {
  select: {
    id: true,
    title: true,
    slug: true,
    description: true,
    type: true,
    expectedDurationMinutes: true,
    estimatedCompletionBusinessDays: true,
    credentialProvider: true,
    category: { select: { name: true, slug: true } },
    tagLinks: { select: { tag: { select: { name: true, slug: true } } }, orderBy: { tag: { name: "asc" } } },
    modules: { orderBy: { sortOrder: "asc" }, select: { id: true, title: true, slug: true, sortOrder: true } },
    videoLessons: {
      orderBy: { sortOrder: "asc" },
      select: {
        id: true,
        moduleId: true,
        title: true,
        slug: true,
        sortOrder: true,
        durationSeconds: true,
        required: true,
        chapters: { orderBy: { sortOrder: "asc" }, select: { title: true, startSecond: true, endSecond: true } },
        transcriptCues: { orderBy: { startSecond: "asc" }, take: 5, select: { startSecond: true, endSecond: true, text: true } },
      },
    },
    knowledgeCheckQuestions: {
      where: { active: true },
      orderBy: [{ lessonId: "asc" }, { sortOrder: "asc" }],
      select: { id: true, lessonId: true, prompt: true, required: true, questionType: true },
    },
  },
}
```

- [ ] **Step 8: Run read-model and repository tests**

Run:

```powershell
npm run test -- src/modules/learner-experience/read-model.test.ts src/modules/learner-experience/prisma-repository.test.ts
```

Expected: pass.

- [ ] **Step 9: Commit**

```powershell
git add src/modules/learner-experience
git commit -m "feat: add learner experience read models"
```

---

### Task 4: Rich Demo Seed Data

**Files:**
- Modify: `prisma/seed.ts`
- Test: `src/modules/learner-experience/page-shells.test.ts`

- [ ] **Step 1: Add failing static seed coverage test**

Append to `src/modules/learner-experience/page-shells.test.ts`:

```ts
  it("seeds a complete learner demo surface", () => {
    const seed = read("prisma/seed.ts");

    expect(seed).toContain("Data Privacy Essentials");
    expect(seed).toContain("Handling Difficult Conversations");
    expect(seed).toContain("Warehouse Safety Fundamentals");
    expect(seed).toContain("Security incident practice quiz");
    expect(seed).toContain("knowledgeCheckAttempt.upsert");
    expect(seed).toContain("certificate.upsert");
    expect(seed).not.toContain("Demo native video course foundation record.");
    expect(seed).not.toContain("Demo published course for manager assignment flows.");
  });
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```powershell
npm run test -- src/modules/learner-experience/page-shells.test.ts
```

Expected: fail because the seed does not yet contain the complete demo content.

- [ ] **Step 3: Replace thin demo descriptions**

In `prisma/seed.ts`, update existing course descriptions:

```ts
description: "Learn how to spot phishing, protect company devices, and report suspicious requests before they become incidents.",
```

and:

```ts
description: "Practice one-on-one coaching habits that help managers listen, ask better questions, and close with clear commitments.",
```

- [ ] **Step 4: Add demo categories and tags**

Add categories with stable slugs:

```ts
const privacyCategory = await upsertCategory("privacy", "Data Privacy");
const customerCareCategory = await upsertCategory("customer-care", "Customer Care");
const safetyCategory = await upsertCategory("safety", "Safety");
```

Use local helpers in `main()`:

```ts
async function upsertCategory(slug: string, name: string) {
  return prisma.courseCategory.upsert({
    where: { organizationId_slug: { organizationId: organization.id, slug } },
    update: { name },
    create: { organizationId: organization.id, slug, name },
  });
}

async function upsertTag(slug: string, name: string) {
  return prisma.courseTag.upsert({
    where: { organizationId_slug: { organizationId: organization.id, slug } },
    update: { name },
    create: { organizationId: organization.id, slug, name },
  });
}
```

- [ ] **Step 5: Add six published courses**

Ensure the seed has these published courses:

```ts
[
  "Workplace Security Basics",
  "Manager Coaching Basics",
  "Data Privacy Essentials",
  "Handling Difficult Conversations",
  "Warehouse Safety Fundamentals",
  "Inclusive Team Communication",
]
```

Each course must set:

```ts
status: "PUBLISHED",
type: "NATIVE_VIDEO",
expectedDurationMinutes: <realistic number>,
estimatedCompletionBusinessDays: <realistic number>,
categoryId: <category.id>,
```

- [ ] **Step 6: Add modules, lessons, chapters, and transcript cues**

For each published native course, upsert at least one module and three lessons using `courseModule.upsert` and `videoLesson.upsert`. For the Workplace Security course, use:

```ts
[
  ["welcome-and-course-goals", "Welcome and Course Goals", 240],
  ["password-and-device-hygiene", "Password and Device Hygiene", 540],
  ["recognize-suspicious-requests", "Recognize Suspicious Requests", 660],
  ["reporting-security-incidents", "Reporting Security Incidents", 420],
]
```

Set `playbackUrl` to stable local-demo URLs such as:

```ts
playbackUrl: `https://video.learnhub.local/demo/${lessonSlug}.mp4`,
```

- [ ] **Step 7: Add knowledge checks and attempts**

Create at least seven active questions. Include this required check:

```ts
prompt: "Security incident practice quiz: which message should be reported?",
questionType: "SINGLE_CHOICE",
required: true,
active: true,
explanation: "Unexpected urgency, payment pressure, and external links are common incident signals.",
```

Create one completed `knowledgeCheckAttempt` for the learner assignment:

```ts
await prisma.knowledgeCheckAttempt.upsert({
  where: {
    organizationId_assignmentId_questionId_attemptNumber: {
      organizationId: organization.id,
      assignmentId: "seed-acme-learner-security-basics",
      questionId: completedQuestion.id,
      attemptNumber: 1,
    },
  },
  update: {
    selectedAnswerIds: [correctAnswer.id],
    correct: true,
    scorePercent: 100,
    submittedAt: new Date("2026-06-12T15:00:00.000Z"),
  },
  create: {
    organizationId: organization.id,
    assignmentId: "seed-acme-learner-security-basics",
    questionId: completedQuestion.id,
    attemptNumber: 1,
    selectedAnswerIds: [correctAnswer.id],
    correct: true,
    scorePercent: 100,
    submittedAt: new Date("2026-06-12T15:00:00.000Z"),
  },
});
```

- [ ] **Step 8: Add completed assignment and certificate**

Create a completed Data Privacy assignment for the learner with `status: "COMPLETED"` and progress `100`, then upsert a certificate:

```ts
await prisma.certificate.upsert({
  where: {
    organizationId_assignmentId: {
      organizationId: organization.id,
      assignmentId: completedAssignment.id,
    },
  },
  update: {
    courseTitle: "Data Privacy Essentials",
    verificationCode: "LHACMEDATAPRIVACY1",
    verificationUrl: "http://localhost:3100/certificates/LHACMEDATAPRIVACY1",
    issuedAt: new Date("2026-06-10T14:00:00.000Z"),
  },
  create: {
    organizationId: organization.id,
    assignmentId: completedAssignment.id,
    courseId: privacyCourse.id,
    membershipId: learnerMembership.id,
    userId: learner.id,
    learnerName: "Leela Learner",
    learnerEmail: "learner@acme.test",
    courseTitle: "Data Privacy Essentials",
    issuerName: organization.name,
    issuerLogoUrl: organization.logoUrl,
    issuerPrimaryColor: organization.primaryColor,
    issuerAccentColor: organization.accentColor,
    verificationCode: "LHACMEDATAPRIVACY1",
    verificationUrl: "http://localhost:3100/certificates/LHACMEDATAPRIVACY1",
    issuedAt: new Date("2026-06-10T14:00:00.000Z"),
  },
});
```

- [ ] **Step 9: Run seed and focused test**

Run:

```powershell
npm run test -- src/modules/learner-experience/page-shells.test.ts
npm run prisma:seed
```

Expected: test passes and seed completes without unique constraint errors.

- [ ] **Step 10: Commit**

```powershell
git add prisma/seed.ts src/modules/learner-experience/page-shells.test.ts
git commit -m "feat: seed complete learner demo content"
```

---

### Task 5: My Courses And Catalog Pages

**Files:**
- Modify: `src/app/org/[slug]/learn/page.tsx`
- Create: `src/app/org/[slug]/learn/catalog/page.tsx`
- Modify: `src/app/org/[slug]/learn/actions.ts`
- Test: `src/modules/learner-experience/page-shells.test.ts`
- Test: `src/modules/catalog/page-shells.test.ts`

- [ ] **Step 1: Add failing shell tests**

Append to `src/modules/learner-experience/page-shells.test.ts`:

```ts
  it("wires My Courses and Catalog learner pages", () => {
    const myCourses = read("src/app/org/[slug]/learn/page.tsx");
    const catalog = read("src/app/org/[slug]/learn/catalog/page.tsx");

    expect(myCourses).toContain("My Courses");
    expect(myCourses).toContain("Continue learning");
    expect(myCourses).toContain("groupLearnerCourses");
    expect(myCourses).toContain("LearnerAppShell");
    expect(myCourses).toContain("CourseCard");
    expect(catalog).toContain("Course Catalog");
    expect(catalog).toContain("Find the next course for your role");
    expect(catalog).toContain("selfEnrollFormAction");
    expect(catalog).toContain("LearnerAppShell");
    expect(catalog).not.toContain("No available published courses.");
  });
```

Update `src/modules/catalog/page-shells.test.ts` learner catalog assertions from the old single-page catalog to the new split:

```ts
expect(page).toContain("My Courses");
expect(page).toContain("Continue learning");
expect(page).toContain("groupLearnerCourses");
```

- [ ] **Step 2: Run focused tests and verify they fail**

Run:

```powershell
npm run test -- src/modules/learner-experience/page-shells.test.ts src/modules/catalog/page-shells.test.ts
```

Expected: fail because `learn/catalog/page.tsx` does not exist and `learn/page.tsx` is still the old three-column page.

- [ ] **Step 3: Replace My Courses route**

Modify `src/app/org/[slug]/learn/page.tsx` to:

- call `requireOrganizationMemberBySlug(slug)`;
- find the active learner membership;
- use `createPrismaLearnerExperienceRepository(prisma)`;
- load assigned and available courses;
- build grouped cards with `groupLearnerCourses`;
- render `LearnerAppShell` with `active="courses"`;
- render a continue-learning panel if an in-progress course exists;
- render Assigned, In Progress, Completed, and Recommended sections using `CourseCard`;
- show `EmptyActionState` with action text when a section has no items.

The continue-learning panel must include:

```tsx
<h2 className="text-3xl font-black text-white">Continue learning</h2>
```

Course actions must use:

```tsx
const action = buildCourseAction({
  slug,
  courseSlug: course.slug,
  assignmentId: course.assignmentId,
  status: course.status,
});
```

- [ ] **Step 4: Create Catalog route**

Create `src/app/org/[slug]/learn/catalog/page.tsx` with the same repository and shell pattern. It must render:

```tsx
<LearnerAppShell organizationName={organization.name} slug={slug} active="catalog">
  <header>
    <p>Course Catalog</p>
    <h1>Find the next course for your role.</h1>
  </header>
```

For available courses, render a form:

```tsx
<form action={selfEnrollAction}>
  <input type="hidden" name="courseId" value={course.id} />
  <input type="hidden" name="learnerMembershipId" value={learnerMembership.id} />
  <input type="hidden" name="startDate" value={today} />
  <button className="inline-flex min-h-10 items-center rounded-full border border-[var(--learnhub-line)] bg-white px-4 text-sm font-bold text-[var(--learnhub-ink)]">
    Enroll
  </button>
</form>
```

- [ ] **Step 5: Run focused tests**

Run:

```powershell
npm run test -- src/modules/learner-experience/page-shells.test.ts src/modules/catalog/page-shells.test.ts src/modules/learner-experience/read-model.test.ts src/modules/learner-experience/prisma-repository.test.ts
```

Expected: pass.

- [ ] **Step 6: Commit**

```powershell
git add src/app/org/[slug]/learn/page.tsx src/app/org/[slug]/learn/catalog/page.tsx src/app/org/[slug]/learn/actions.ts src/modules/catalog/page-shells.test.ts src/modules/learner-experience/page-shells.test.ts
git commit -m "feat: add learner my courses and catalog pages"
```

---

### Task 6: Course Overview And Compatibility Redirect

**Files:**
- Create: `src/app/org/[slug]/learn/courses/[courseSlug]/page.tsx`
- Modify: `src/app/org/[slug]/learn/[courseSlug]/page.tsx`
- Test: `src/modules/learner-experience/page-shells.test.ts`
- Test: `src/modules/video/page-shells.test.ts`

- [ ] **Step 1: Add failing shell tests**

Append to `src/modules/learner-experience/page-shells.test.ts`:

```ts
  it("wires learner course overview and legacy course redirect", () => {
    const overview = read("src/app/org/[slug]/learn/courses/[courseSlug]/page.tsx");
    const legacy = read("src/app/org/[slug]/learn/[courseSlug]/page.tsx");

    expect(overview).toContain("Course details");
    expect(overview).toContain("What you will earn");
    expect(overview).toContain("Curriculum");
    expect(overview).toContain("LearnerAppShell");
    expect(overview).toContain("findCourseOverview");
    expect(legacy).toContain("redirect(`/org/${slug}/learn/courses/${courseSlug}`)");
  });
```

Update `src/modules/video/page-shells.test.ts` so the legacy page expectation becomes:

```ts
expect(page).toContain("redirect(`/org/${slug}/learn/courses/${courseSlug}`)");
```

Move runtime expectations to the new lesson page in Task 7.

- [ ] **Step 2: Run focused tests and verify they fail**

Run:

```powershell
npm run test -- src/modules/learner-experience/page-shells.test.ts src/modules/video/page-shells.test.ts
```

Expected: fail because the new course overview route does not exist.

- [ ] **Step 3: Create course overview route**

Create `src/app/org/[slug]/learn/courses/[courseSlug]/page.tsx`:

- require organization membership;
- load learner membership;
- call `repository.findCourseOverview({ organizationId, courseSlug, membershipId })`;
- show assignment requirement or enrollment CTA if not assigned;
- render course hero, progress, curriculum, assessment count, certificate eligibility, and details;
- link first current lesson to `/org/${slug}/learn/courses/${courseSlug}/lessons/${lesson.slug}`;
- use `LearnerAppShell`.

The curriculum rows must include the lesson route:

```tsx
href={`/org/${encodeURIComponent(slug)}/learn/courses/${encodeURIComponent(courseSlug)}/lessons/${encodeURIComponent(lesson.slug)}`}
```

- [ ] **Step 4: Replace legacy course route with redirect**

Modify `src/app/org/[slug]/learn/[courseSlug]/page.tsx`:

```tsx
import { redirect } from "next/navigation";

type CourseRuntimePageProps = {
  params: Promise<{
    slug: string;
    courseSlug: string;
  }>;
};

export default async function CourseRuntimePage({ params }: CourseRuntimePageProps) {
  const { slug, courseSlug } = await params;

  redirect(`/org/${slug}/learn/courses/${courseSlug}`);
}
```

- [ ] **Step 5: Run focused tests**

Run:

```powershell
npm run test -- src/modules/learner-experience/page-shells.test.ts src/modules/video/page-shells.test.ts
```

Expected: pass after Task 7 moves runtime assertions; if `video/page-shells.test.ts` still expects runtime strings in the legacy page, update it in Task 7 before committing both tasks together.

- [ ] **Step 6: Commit**

```powershell
git add src/app/org/[slug]/learn/courses/[courseSlug]/page.tsx src/app/org/[slug]/learn/[courseSlug]/page.tsx src/modules/learner-experience/page-shells.test.ts src/modules/video/page-shells.test.ts
git commit -m "feat: add learner course overview"
```

---

### Task 7: Lesson Page With Runtime, Outline, And Knowledge Check Entry

**Files:**
- Create: `src/app/org/[slug]/learn/courses/[courseSlug]/lessons/[lessonSlug]/page.tsx`
- Modify: `src/app/org/[slug]/learn/[courseSlug]/video-player.tsx`
- Modify: `src/app/org/[slug]/learn/[courseSlug]/knowledge-check-panel.tsx`
- Test: `src/modules/learner-experience/page-shells.test.ts`
- Test: `src/modules/video/page-shells.test.ts`
- Test: `src/app/org/[slug]/learn/[courseSlug]/video-player.test.tsx`
- Test: `src/app/org/[slug]/learn/[courseSlug]/knowledge-check-panel.test.tsx`

- [ ] **Step 1: Add failing shell tests**

Append to `src/modules/learner-experience/page-shells.test.ts`:

```ts
  it("wires learner lesson page with runtime and assessments", () => {
    const lesson = read("src/app/org/[slug]/learn/courses/[courseSlug]/lessons/[lessonSlug]/page.tsx");

    expect(lesson).toContain("VideoPlayer");
    expect(lesson).toContain("KnowledgeCheckPanel");
    expect(lesson).toContain("findLesson");
    expect(lesson).toContain("data-video-launch-path");
    expect(lesson).toContain("Next up");
    expect(lesson).toContain("Chapters");
    expect(lesson).toContain("Transcript");
  });
```

Update `src/modules/video/page-shells.test.ts` runtime page read path:

```ts
const page = readPage("src/app/org/[slug]/learn/courses/[courseSlug]/lessons/[lessonSlug]/page.tsx");
```

- [ ] **Step 2: Run focused tests and verify they fail**

Run:

```powershell
npm run test -- src/modules/learner-experience/page-shells.test.ts src/modules/video/page-shells.test.ts src/app/org/[slug]/learn/[courseSlug]/video-player.test.tsx src/app/org/[slug]/learn/[courseSlug]/knowledge-check-panel.test.tsx
```

Expected: fail because the lesson route does not exist.

- [ ] **Step 3: Create lesson page route**

Create `src/app/org/[slug]/learn/courses/[courseSlug]/lessons/[lessonSlug]/page.tsx`:

- require organization membership;
- find learner membership;
- call `repository.findLesson({ organizationId, courseSlug, lessonSlug, membershipId })`;
- render a dark lesson shell with left outline, central `VideoPlayer`, and right `KnowledgeCheckPanel`;
- preserve launch/progress paths:

```ts
const videoLaunchPath = `/api/org/${encodeURIComponent(slug)}/assignments/${encodeURIComponent(assignment.id)}/video/launch`;
const videoProgressPath = `/api/org/${encodeURIComponent(slug)}/assignments/${encodeURIComponent(assignment.id)}/video/progress`;
```

- include:

```tsx
data-video-launch-path={videoLaunchPath}
data-video-progress-path={videoProgressPath}
```

- pass only active checks for the lesson first, with course-level checks shown if no lesson-level check exists.

- [ ] **Step 4: Keep component tests passing**

If `VideoPlayer` or `KnowledgeCheckPanel` needs class-name changes, keep behavior unchanged. Existing tests must still pass:

```powershell
npm run test -- src/app/org/[slug]/learn/[courseSlug]/video-player.test.tsx src/app/org/[slug]/learn/[courseSlug]/knowledge-check-panel.test.tsx
```

Expected: pass; fetch URLs and payloads must remain unchanged.

- [ ] **Step 5: Run focused tests**

Run:

```powershell
npm run test -- src/modules/learner-experience/page-shells.test.ts src/modules/video/page-shells.test.ts src/app/org/[slug]/learn/[courseSlug]/video-player.test.tsx src/app/org/[slug]/learn/[courseSlug]/knowledge-check-panel.test.tsx
```

Expected: pass.

- [ ] **Step 6: Commit**

```powershell
git add src/app/org/[slug]/learn/courses/[courseSlug]/lessons/[lessonSlug]/page.tsx src/app/org/[slug]/learn/[courseSlug]/video-player.tsx src/app/org/[slug]/learn/[courseSlug]/knowledge-check-panel.tsx src/modules/learner-experience/page-shells.test.ts src/modules/video/page-shells.test.ts
git commit -m "feat: add learner lesson page"
```

---

### Task 8: Assessment Center And Certificate Wallet

**Files:**
- Create: `src/app/org/[slug]/learn/assessments/page.tsx`
- Modify: `src/app/org/[slug]/certificates/page.tsx`
- Test: `src/modules/learner-experience/page-shells.test.ts`

- [ ] **Step 1: Add failing shell tests**

Append to `src/modules/learner-experience/page-shells.test.ts`:

```ts
  it("wires learner assessments and certificate wallet", () => {
    const assessments = read("src/app/org/[slug]/learn/assessments/page.tsx");
    const certificates = read("src/app/org/[slug]/certificates/page.tsx");

    expect(assessments).toContain("Quizzes and knowledge checks");
    expect(assessments).toContain("listAssessments");
    expect(assessments).toContain("Pending");
    expect(assessments).toContain("Completed");
    expect(assessments).toContain("LearnerAppShell");
    expect(certificates).toContain("Certificate wallet");
    expect(certificates).toContain("listCertificates");
    expect(certificates).toContain("CertificateCard");
    expect(certificates).toContain("locked certificates");
    expect(certificates).not.toContain("<table");
  });
```

- [ ] **Step 2: Run focused test and verify it fails**

Run:

```powershell
npm run test -- src/modules/learner-experience/page-shells.test.ts
```

Expected: fail because the assessment route does not exist and certificates still render a table.

- [ ] **Step 3: Create assessments page**

Create `src/app/org/[slug]/learn/assessments/page.tsx`:

- require organization membership;
- find learner membership;
- call `repository.listAssessments({ organizationId, membershipId })`;
- render `LearnerAppShell` with `active="assessments"`;
- show pending required checks first;
- show completed attempts with score, result, submitted date, feedback availability;
- use an action state when all required checks are done.

Required strings:

```tsx
<h1>Quizzes and knowledge checks.</h1>
<h2>Pending</h2>
<h2>Completed</h2>
```

- [ ] **Step 4: Replace certificate table with wallet cards**

Modify `src/app/org/[slug]/certificates/page.tsx`:

- use `LearnerAppShell` with `active="certificates"`;
- call `repository.listCertificates({ organizationId, membershipId })`;
- render earned certificates with `CertificateCard`;
- render locked/upcoming certificates based on assigned or available certificate-eligible courses;
- keep verification and download links for issued certificates:

```tsx
<PrimaryButton href={certificate.verificationUrl} variant="light">Verify</PrimaryButton>
<PrimaryButton href={`/certificates/${encodeURIComponent(certificate.verificationCode)}/download`} variant="blue">Download</PrimaryButton>
```

- [ ] **Step 5: Run focused tests**

Run:

```powershell
npm run test -- src/modules/learner-experience/page-shells.test.ts
```

Expected: pass.

- [ ] **Step 6: Commit**

```powershell
git add src/app/org/[slug]/learn/assessments/page.tsx src/app/org/[slug]/certificates/page.tsx src/modules/learner-experience/page-shells.test.ts
git commit -m "feat: add learner assessments and certificate wallet"
```

---

### Task 9: End-To-End Local Smoke And Gate Run

**Files:**
- Modify only if smoke reveals a defect in files changed by Tasks 1-8.

- [ ] **Step 1: Re-run seed**

Run:

```powershell
npm run prisma:seed
```

Expected: completes without unique constraint failures.

- [ ] **Step 2: Run focused learner tests**

Run:

```powershell
npm run test -- src/modules/learner-experience/read-model.test.ts src/modules/learner-experience/prisma-repository.test.ts src/modules/learner-experience/page-shells.test.ts src/modules/catalog/page-shells.test.ts src/modules/video/page-shells.test.ts src/app/org/[slug]/learn/[courseSlug]/video-player.test.tsx src/app/org/[slug]/learn/[courseSlug]/knowledge-check-panel.test.tsx
```

Expected: pass.

- [ ] **Step 3: Run full tests**

Run:

```powershell
npm run test
```

Expected: pass.

- [ ] **Step 4: Run repo gates sequentially**

Run:

```powershell
npm run lint
npx prisma validate
npm run prisma:generate
npx tsc --noEmit --incremental false
npm run build
```

Expected: every command exits 0.

- [ ] **Step 5: Launch local app on an open port**

If port 3100 is available:

```powershell
$env:NEXTAUTH_URL='http://localhost:3100'
$env:APP_BASE_URL='http://localhost:3100'
npx next dev --port 3100
```

If port 3100 is busy, choose the next free port and set both environment variables to that port.

- [ ] **Step 6: Manual Playwright smoke**

Run these browser checks:

```powershell
playwright-cli goto http://localhost:3100/
playwright-cli snapshot --filename=smoke-landing.yml
playwright-cli goto http://localhost:3100/login
playwright-cli snapshot --filename=smoke-login.yml
```

Then login as learner:

```powershell
playwright-cli fill <email-ref> learner@acme.test
playwright-cli fill <password-ref> LearnHubDemo123!
playwright-cli click <sign-in-ref>
```

Visit:

```powershell
playwright-cli goto http://localhost:3100/org/acme/learn
playwright-cli goto http://localhost:3100/org/acme/learn/catalog
playwright-cli goto http://localhost:3100/org/acme/learn/courses/workplace-security-basics
playwright-cli goto http://localhost:3100/org/acme/learn/courses/workplace-security-basics/lessons/recognize-suspicious-requests
playwright-cli goto http://localhost:3100/org/acme/learn/assessments
playwright-cli goto http://localhost:3100/org/acme/certificates
```

Expected:

- Landing page shows polished LearnHub public experience.
- Learner login lands on My Courses or redirects there from `/org/acme`.
- My Courses shows assigned, in-progress, completed, and recommended courses.
- Catalog shows multiple published courses.
- Course overview shows curriculum and certificate eligibility.
- Lesson page shows outline, player, transcript/chapters, and assessment entry.
- Assessments shows pending and completed checks.
- Certificates shows one earned certificate and locked/upcoming certificate paths.
- No learner route shows an empty table or shell copy.

- [ ] **Step 7: Commit final smoke fixes if needed**

Only if Step 6 required fixes:

```powershell
git add <changed-files>
git commit -m "fix: stabilize learner experience smoke flow"
```

- [ ] **Step 8: Record final status**

Run:

```powershell
git status --short --branch
git log --oneline -8
```

Expected: branch contains learner-experience commits and only unrelated pre-existing dirty files remain.

---

## Self-Review Checklist

- Spec coverage:
  - Public landing: Task 2.
  - Branded login: Task 2.
  - Role-aware tenant entry: Task 2.
  - Shared colors: Task 1.
  - My Courses: Task 5.
  - Catalog: Task 5.
  - Course overview: Task 6.
  - Lesson page: Task 7.
  - Assessments: Task 8.
  - Certificates: Task 8.
  - Rich demo seed: Task 4.
  - No empty learner pages: Tasks 4, 5, 8, 9.
  - Existing runtime/assessment/certificate behavior: Tasks 7, 8, 9.
- Verification:
  - Focused tests are included per task.
  - Full gates are included in Task 9.
  - Manual browser smoke is included in Task 9.
- Scope:
  - Admin/platform pages are separated from learner default behavior.
  - Billing, public signup, and SCORM 2004/cmi5/xAPI remain out of scope.
