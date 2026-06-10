# Course Catalog And Assignments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add tenant-owned course catalog management, lifecycle gates, assignment creation, learner self-enrollment, related-course matching, and thin catalog/assignment pages.

**Architecture:** Keep catalog and assignment business rules in `src/modules/catalog` and `src/modules/assignments`. Use pure validation and permission helpers first, then repository-backed services with explicit transaction boundaries for writes. Keep Next.js pages as non-destructive shells until server actions are intentionally wired.

**Tech Stack:** Next.js App Router, TypeScript, Prisma 7 with PostgreSQL adapter, PostgreSQL, Vitest, existing auth permission helpers, existing business-day date helper.

---

## Scope Boundary

This plan implements course catalog and assignment foundations only. It does not implement video lessons, SCORM package upload/runtime, completion tracking, certificates, reminder jobs, report dashboards, global library copy, or real page mutations.

## File Structure

Create or modify these files:

- `prisma/schema.prisma`: add duplicate assignment uniqueness.
- `prisma/migrations/20260609020000_course_catalog_assignments/migration.sql`: migration for duplicate assignment prevention.
- `prisma/seed.ts`: add one extra published course and one draft/deprecated course for demo catalog surfaces.
- `src/modules/catalog/catalog-validation.ts`: slug, duration, estimated-day, title, and lifecycle validation helpers.
- `src/modules/catalog/catalog-validation.test.ts`: validation tests.
- `src/modules/catalog/catalog-permissions.ts`: catalog permission helpers.
- `src/modules/catalog/catalog-permissions.test.ts`: catalog permission tests.
- `src/modules/catalog/course-lifecycle.ts`: assign/enroll lifecycle gate helpers.
- `src/modules/catalog/course-lifecycle.test.ts`: lifecycle tests.
- `src/modules/catalog/course-service.ts`: repository-backed category/tag/course create/update service.
- `src/modules/catalog/course-service.test.ts`: service tests with fake repository.
- `src/modules/assignments/assignment-permissions.ts`: admin/manager/learner assignment permission helpers.
- `src/modules/assignments/assignment-permissions.test.ts`: assignment permission tests.
- `src/modules/assignments/assignment-service.ts`: repository-backed assignment creation and self-enrollment service.
- `src/modules/assignments/assignment-service.test.ts`: service tests with fake repository.
- `src/modules/catalog/related-courses.ts`: deterministic related-course ranking.
- `src/modules/catalog/related-courses.test.ts`: related-course tests.
- `src/modules/catalog/catalog-read-models.ts`: tenant-scoped catalog query assembly helpers.
- `src/modules/catalog/catalog-read-models.test.ts`: read-model tests.
- `src/app/org/[slug]/admin/catalog/page.tsx`: catalog management shell.
- `src/app/org/[slug]/admin/courses/[courseSlug]/page.tsx`: course detail shell.
- `src/app/org/[slug]/admin/assignments/page.tsx`: assignment shell.
- `src/app/org/[slug]/learn/page.tsx`: learner catalog shell.

## Task 1: Add Assignment Uniqueness And Demo Catalog Seed Data

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260609020000_course_catalog_assignments/migration.sql`
- Modify: `prisma/seed.ts`

- [ ] **Step 1: Add duplicate-assignment uniqueness**

In `prisma/schema.prisma`, add this unique constraint to `CourseAssignment`:

```prisma
  @@unique([organizationId, courseId, membershipId])
```

Keep the existing assignment indexes.

- [ ] **Step 2: Create migration SQL**

Create `prisma/migrations/20260609020000_course_catalog_assignments/migration.sql`:

```sql
CREATE UNIQUE INDEX "CourseAssignment_organizationId_courseId_membershipId_key"
ON "CourseAssignment"("organizationId", "courseId", "membershipId");
```

- [ ] **Step 3: Extend seed catalog data**

In `prisma/seed.ts`, add two additional Acme courses after the existing category/tag setup:

```ts
const leadershipTag = await prisma.courseTag.upsert({
  where: {
    organizationId_slug: {
      organizationId: organization.id,
      slug: "leadership",
    },
  },
  update: {},
  create: {
    organizationId: organization.id,
    name: "Leadership",
    slug: "leadership",
  },
});

const coachingCourse = await prisma.course.upsert({
  where: {
    organizationId_slug: {
      organizationId: organization.id,
      slug: "manager-coaching-basics",
    },
  },
  update: {},
  create: {
    organizationId: organization.id,
    title: "Manager Coaching Basics",
    slug: "manager-coaching-basics",
    description: "Demo published course for manager assignment flows.",
    status: "PUBLISHED",
    type: "NATIVE_VIDEO",
    estimatedCompletionBusinessDays: 3,
    expectedDurationMinutes: 30,
    categoryId: category.id,
  },
});

await prisma.courseTagLink.upsert({
  where: {
    organizationId_courseId_tagId: {
      organizationId: organization.id,
      courseId: coachingCourse.id,
      tagId: leadershipTag.id,
    },
  },
  update: {},
  create: {
    organizationId: organization.id,
    courseId: coachingCourse.id,
    tagId: leadershipTag.id,
  },
});

await prisma.course.upsert({
  where: {
    organizationId_slug: {
      organizationId: organization.id,
      slug: "archived-policy-orientation",
    },
  },
  update: {},
  create: {
    organizationId: organization.id,
    title: "Archived Policy Orientation",
    slug: "archived-policy-orientation",
    description: "Demo deprecated course for lifecycle gating.",
    status: "DEPRECATED",
    type: "SCORM_1_2",
    estimatedCompletionBusinessDays: 5,
    expectedDurationMinutes: 40,
    categoryId: category.id,
  },
});
```

- [ ] **Step 4: Validate schema and generate Prisma client**

Run:

```powershell
npx prisma validate
npm run prisma:generate
```

Expected: both commands exit `0`.

- [ ] **Step 5: Commit schema and seed changes**

Run:

```powershell
git add prisma/schema.prisma prisma/migrations/20260609020000_course_catalog_assignments/migration.sql prisma/seed.ts
git commit -m "feat: add catalog assignment schema guard"
```

## Task 2: Add Catalog Validation And Lifecycle Helpers

**Files:**
- Create: `src/modules/catalog/catalog-validation.test.ts`
- Create: `src/modules/catalog/catalog-validation.ts`
- Create: `src/modules/catalog/course-lifecycle.test.ts`
- Create: `src/modules/catalog/course-lifecycle.ts`

- [ ] **Step 1: Write catalog validation tests**

Create `src/modules/catalog/catalog-validation.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
  normalizeCatalogSlug,
  requireCatalogTitle,
  requireNonNegativeBusinessDays,
  requirePositiveDurationMinutes,
} from "./catalog-validation";

describe("catalog validation", () => {
  it("accepts lowercase URL-safe slugs", () => {
    expect(normalizeCatalogSlug("manager-coaching-101")).toBe("manager-coaching-101");
  });

  it("rejects unsafe slugs", () => {
    expect(() => normalizeCatalogSlug("Manager Coaching")).toThrow(
      "Slug must use lowercase letters, numbers, and hyphens",
    );
    expect(() => normalizeCatalogSlug("manager/coaching")).toThrow(
      "Slug must use lowercase letters, numbers, and hyphens",
    );
  });

  it("requires non-empty titles", () => {
    expect(requireCatalogTitle(" Workplace Safety ")).toBe("Workplace Safety");
    expect(() => requireCatalogTitle(" ")).toThrow("Course title is required");
  });

  it("requires positive expected duration", () => {
    expect(requirePositiveDurationMinutes(30)).toBe(30);
    expect(() => requirePositiveDurationMinutes(0)).toThrow("Expected duration minutes must be positive");
  });

  it("requires non-negative estimated business days", () => {
    expect(requireNonNegativeBusinessDays(0)).toBe(0);
    expect(() => requireNonNegativeBusinessDays(-1)).toThrow(
      "Estimated completion business days cannot be negative",
    );
  });
});
```

- [ ] **Step 2: Run validation tests to verify failure**

Run:

```powershell
npm run test -- src/modules/catalog/catalog-validation.test.ts
```

Expected: fail because `catalog-validation.ts` does not exist.

- [ ] **Step 3: Implement catalog validation helpers**

Create `src/modules/catalog/catalog-validation.ts`:

```ts
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function normalizeCatalogSlug(slug: string): string {
  const normalized = slug.trim();

  if (!slugPattern.test(normalized)) {
    throw new Error("Slug must use lowercase letters, numbers, and hyphens");
  }

  return normalized;
}

export function requireCatalogTitle(title: string): string {
  const normalized = title.trim();

  if (!normalized) {
    throw new Error("Course title is required");
  }

  return normalized;
}

export function requirePositiveDurationMinutes(durationMinutes: number): number {
  if (!Number.isInteger(durationMinutes) || durationMinutes <= 0) {
    throw new Error("Expected duration minutes must be positive");
  }

  return durationMinutes;
}

export function requireNonNegativeBusinessDays(days: number): number {
  if (!Number.isInteger(days) || days < 0) {
    throw new Error("Estimated completion business days cannot be negative");
  }

  return days;
}
```

- [ ] **Step 4: Write lifecycle tests**

Create `src/modules/catalog/course-lifecycle.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { assertCourseAssignable, assertCourseSelfEnrollable, courseVisibleToLearner } from "./course-lifecycle";

describe("course lifecycle gates", () => {
  it("allows assignment and self-enrollment only for published courses", () => {
    expect(() => assertCourseAssignable({ status: "PUBLISHED" })).not.toThrow();
    expect(() => assertCourseSelfEnrollable({ status: "PUBLISHED" })).not.toThrow();
  });

  it("blocks draft, deprecated, and retired courses for new assignment", () => {
    expect(() => assertCourseAssignable({ status: "DRAFT" })).toThrow("Only published courses can be assigned");
    expect(() => assertCourseAssignable({ status: "DEPRECATED" })).toThrow("Only published courses can be assigned");
    expect(() => assertCourseAssignable({ status: "RETIRED" })).toThrow("Only published courses can be assigned");
  });

  it("shows deprecated assigned courses to learners but hides draft and retired courses", () => {
    expect(courseVisibleToLearner({ status: "PUBLISHED", alreadyAssigned: false })).toBe(true);
    expect(courseVisibleToLearner({ status: "DEPRECATED", alreadyAssigned: true })).toBe(true);
    expect(courseVisibleToLearner({ status: "DEPRECATED", alreadyAssigned: false })).toBe(false);
    expect(courseVisibleToLearner({ status: "DRAFT", alreadyAssigned: true })).toBe(false);
    expect(courseVisibleToLearner({ status: "RETIRED", alreadyAssigned: true })).toBe(false);
  });
});
```

- [ ] **Step 5: Implement lifecycle helpers**

Create `src/modules/catalog/course-lifecycle.ts`:

```ts
import type { CourseStatus } from "@prisma/client";

export type CourseLifecycleState = {
  status: CourseStatus;
};

export function assertCourseAssignable(course: CourseLifecycleState): void {
  if (course.status !== "PUBLISHED") {
    throw new Error("Only published courses can be assigned");
  }
}

export function assertCourseSelfEnrollable(course: CourseLifecycleState): void {
  if (course.status !== "PUBLISHED") {
    throw new Error("Only published courses can be self-enrolled");
  }
}

export function courseVisibleToLearner(input: CourseLifecycleState & { alreadyAssigned: boolean }): boolean {
  if (input.status === "PUBLISHED") {
    return true;
  }

  return input.status === "DEPRECATED" && input.alreadyAssigned;
}
```

- [ ] **Step 6: Run tests and commit**

Run:

```powershell
npm run test -- src/modules/catalog/catalog-validation.test.ts src/modules/catalog/course-lifecycle.test.ts
git add src/modules/catalog/catalog-validation.ts src/modules/catalog/catalog-validation.test.ts src/modules/catalog/course-lifecycle.ts src/modules/catalog/course-lifecycle.test.ts
git commit -m "feat: add catalog validation and lifecycle rules"
```

Expected: tests pass and commit succeeds.

## Task 3: Add Catalog Permission Helpers

**Files:**
- Create: `src/modules/catalog/catalog-permissions.test.ts`
- Create: `src/modules/catalog/catalog-permissions.ts`
- Modify: `src/modules/auth/permissions.ts`
- Modify: `src/modules/auth/permissions.test.ts`

- [ ] **Step 1: Extend auth permissions with manager direct-report assignment helper**

In `src/modules/auth/permissions.ts`, add:

```ts
export function canManageCatalog(context: MembershipAuthContext, organizationId: string): boolean {
  return canManageOrganization(context, organizationId);
}

export function canAssignDirectReport(context: MembershipAuthContext, target: TargetMembership): boolean {
  if (context.isPlatformOwner || hasOrganizationRole(context, target.organizationId, "ADMIN")) {
    return true;
  }

  const membership = membershipForOrganization(context, target.organizationId);

  return Boolean(membership?.roles.includes("MANAGER") && target.managerMembershipId === membership.id);
}
```

Add tests in `src/modules/auth/permissions.test.ts` proving:

- Active admin can assign any learner in org.
- Active manager can assign only direct reports.
- Inactive manager cannot assign direct reports.

- [ ] **Step 2: Create catalog permission wrapper tests**

Create `src/modules/catalog/catalog-permissions.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { canEditCatalog } from "./catalog-permissions";
import type { MembershipAuthContext } from "@/modules/auth/permissions";

describe("catalog permissions", () => {
  it("allows platform owners and active organization admins to edit catalog", () => {
    const owner: MembershipAuthContext = { userId: "owner", isPlatformOwner: true, memberships: [] };
    const admin: MembershipAuthContext = {
      userId: "admin",
      isPlatformOwner: false,
      memberships: [
        { id: "admin-membership", organizationId: "org_1", roles: ["ADMIN"], status: "ACTIVE", managerMembershipId: null },
      ],
    };

    expect(canEditCatalog(owner, "org_any")).toBe(true);
    expect(canEditCatalog(admin, "org_1")).toBe(true);
    expect(canEditCatalog(admin, "org_2")).toBe(false);
  });
});
```

- [ ] **Step 3: Implement catalog permission wrapper**

Create `src/modules/catalog/catalog-permissions.ts`:

```ts
import { canManageCatalog, type MembershipAuthContext } from "@/modules/auth/permissions";

export function canEditCatalog(context: MembershipAuthContext, organizationId: string): boolean {
  return canManageCatalog(context, organizationId);
}
```

- [ ] **Step 4: Run tests and commit**

Run:

```powershell
npm run test -- src/modules/auth/permissions.test.ts src/modules/catalog/catalog-permissions.test.ts
git add src/modules/auth/permissions.ts src/modules/auth/permissions.test.ts src/modules/catalog/catalog-permissions.ts src/modules/catalog/catalog-permissions.test.ts
git commit -m "feat: add catalog and assignment permission helpers"
```

Expected: tests pass and commit succeeds.

## Task 4: Add Course Catalog Service

**Files:**
- Create: `src/modules/catalog/course-service.test.ts`
- Create: `src/modules/catalog/course-service.ts`

- [ ] **Step 1: Write course service tests**

Create tests proving:

- `createCourse` validates title, slug, duration, and estimated business days.
- `createCourse` rejects category ids that do not belong to the same organization.
- `createCourse` rejects tag ids that do not belong to the same organization.
- `createCourse` wraps writes in `repository.runInTransaction`.
- `updateCourseLifecycle` allows direct lifecycle update and records audit.

Use a fake repository with methods:

```ts
runInTransaction<T>(operation: () => Promise<T>): Promise<T>;
findCategoryById(input: { organizationId: string; categoryId: string }): Promise<{ id: string } | null>;
findTagsByIds(input: { organizationId: string; tagIds: string[] }): Promise<Array<{ id: string }>>;
createCourse(data: CreateCourseData): Promise<{ id: string; slug: string }>;
replaceCourseTags(data: { organizationId: string; courseId: string; tagIds: string[] }): Promise<void>;
updateCourseLifecycle(data: { organizationId: string; courseId: string; status: CourseStatus }): Promise<void>;
recordAuditLog(data: { organizationId: string; actorId: string; action: string; targetType: string; targetId: string }): Promise<void>;
```

- [ ] **Step 2: Implement course service**

Create `src/modules/catalog/course-service.ts` exporting:

```ts
import type { CourseStatus, CourseType } from "@prisma/client";

export type CreateCourseInput = {
  organizationId: string;
  actorId: string;
  title: string;
  slug: string;
  description?: string;
  type: CourseType;
  status?: CourseStatus;
  categoryId?: string | null;
  tagIds?: string[];
  estimatedCompletionBusinessDays: number;
  expectedDurationMinutes: number;
};

export type CreateCourseData = Omit<CreateCourseInput, "actorId" | "tagIds"> & {
  title: string;
  slug: string;
  description: string;
  status: CourseStatus;
  categoryId: string | null;
};
```

Implementation rules:

- `createCourse(input, repository)` validates all fields.
- Category and tag ids are checked inside the same organization.
- Course creation and tag replacement run in one repository transaction.
- Audit action for course creation is `course.created`.
- `updateCourseLifecycle(input, repository)` updates status and records audit action `course.lifecycle_updated`.

- [ ] **Step 3: Run tests and commit**

Run:

```powershell
npm run test -- src/modules/catalog/course-service.test.ts
git add src/modules/catalog/course-service.ts src/modules/catalog/course-service.test.ts
git commit -m "feat: add course catalog service"
```

Expected: tests pass and commit succeeds.

## Task 5: Add Assignment And Self-Enrollment Services

**Files:**
- Create: `src/modules/assignments/assignment-service.test.ts`
- Create: `src/modules/assignments/assignment-service.ts`

- [ ] **Step 1: Write assignment service tests**

Tests must prove:

- Admin can assign a published course to an active learner in the organization.
- Manager can assign a published course only to an active direct report.
- Assignment due date uses `addBusinessDays`.
- Draft, deprecated, and retired courses cannot be newly assigned.
- Duplicate assignments are rejected before write.
- Learner self-enrollment requires organization policy `ASSIGNMENT_AND_SELF_ENROLLMENT`.
- Learner self-enrollment is blocked for assignment-only organizations.
- All writes run inside `repository.runInTransaction`.

- [ ] **Step 2: Implement assignment service**

Create `src/modules/assignments/assignment-service.ts` exporting:

```ts
import type { AssignmentStatus, CourseStatus, OrganizationEnrollmentPolicy, OrganizationRole, UserStatus } from "@prisma/client";
import type { MembershipAuthContext, TargetMembership } from "@/modules/auth/permissions";

export type AssignmentCourse = {
  id: string;
  organizationId: string;
  status: CourseStatus;
  estimatedCompletionBusinessDays: number;
};

export type AssignmentMembership = TargetMembership & {
  status: UserStatus;
  roles: OrganizationRole[];
};

export type AssignCourseInput = {
  organizationId: string;
  courseId: string;
  learnerMembershipId: string;
  actor: MembershipAuthContext;
  startDate: Date;
};

export type SelfEnrollInput = {
  organizationId: string;
  courseId: string;
  learnerMembershipId: string;
  actor: MembershipAuthContext;
  startDate: Date;
};
```

Repository methods:

```ts
runInTransaction<T>(operation: () => Promise<T>): Promise<T>;
findCourse(input: { organizationId: string; courseId: string }): Promise<AssignmentCourse | null>;
findMembership(input: { organizationId: string; membershipId: string }): Promise<AssignmentMembership | null>;
findOrganization(input: { organizationId: string }): Promise<{ id: string; enrollmentPolicy: OrganizationEnrollmentPolicy } | null>;
assignmentExists(input: { organizationId: string; courseId: string; membershipId: string }): Promise<boolean>;
createAssignment(data: {
  organizationId: string;
  courseId: string;
  membershipId: string;
  assignedByMembershipId: string | null;
  startDate: Date;
  dueDate: Date;
  status: AssignmentStatus;
}): Promise<{ id: string }>;
recordAuditLog(data: { organizationId: string; actorId: string; action: string; targetType: string; targetId: string }): Promise<void>;
```

Implementation rules:

- Missing course throws `Course not found`.
- Missing learner membership throws `Learner membership not found`.
- Inactive learner membership throws `Learner membership must be active`.
- Non-learner membership throws `Course can only be assigned to learners`.
- Unauthorized actor throws `Not allowed to assign this course`.
- Duplicate assignment throws `Learner already has this course assigned`.
- Assignment audit action is `assignment.created`.
- Self-enrollment audit action is `assignment.self_enrolled`.

- [ ] **Step 3: Run tests and commit**

Run:

```powershell
npm run test -- src/modules/assignments/assignment-service.test.ts
git add src/modules/assignments/assignment-service.ts src/modules/assignments/assignment-service.test.ts
git commit -m "feat: add assignment and self enrollment service"
```

Expected: tests pass and commit succeeds.

## Task 6: Add Related Course Matching

**Files:**
- Create: `src/modules/catalog/related-courses.test.ts`
- Create: `src/modules/catalog/related-courses.ts`

- [ ] **Step 1: Write related-course tests**

Tests must prove:

- Source course is excluded.
- Only published courses are returned.
- Same category outranks tag-only overlap.
- More shared tags outrank fewer shared tags within the same category rank.
- Ties are stable by title.

- [ ] **Step 2: Implement related-course matcher**

Create `src/modules/catalog/related-courses.ts` exporting:

```ts
import type { CourseStatus } from "@prisma/client";

export type RelatedCourseCandidate = {
  id: string;
  title: string;
  status: CourseStatus;
  categoryId: string | null;
  tagIds: string[];
};

export function rankRelatedCourses(
  source: RelatedCourseCandidate,
  candidates: RelatedCourseCandidate[],
  limit = 5,
): RelatedCourseCandidate[] {
  return candidates
    .filter((candidate) => candidate.id !== source.id && candidate.status === "PUBLISHED")
    .map((candidate) => {
      const sameCategory = source.categoryId !== null && candidate.categoryId === source.categoryId;
      const sharedTagCount = candidate.tagIds.filter((tagId) => source.tagIds.includes(tagId)).length;

      return {
        candidate,
        sameCategory,
        sharedTagCount,
      };
    })
    .filter((entry) => entry.sameCategory || entry.sharedTagCount > 0)
    .sort((left, right) => {
      if (left.sameCategory !== right.sameCategory) {
        return left.sameCategory ? -1 : 1;
      }

      if (left.sharedTagCount !== right.sharedTagCount) {
        return right.sharedTagCount - left.sharedTagCount;
      }

      return left.candidate.title.localeCompare(right.candidate.title);
    })
    .slice(0, limit)
    .map((entry) => entry.candidate);
}
```

- [ ] **Step 3: Run tests and commit**

Run:

```powershell
npm run test -- src/modules/catalog/related-courses.test.ts
git add src/modules/catalog/related-courses.ts src/modules/catalog/related-courses.test.ts
git commit -m "feat: add related course matching"
```

Expected: tests pass and commit succeeds.

## Task 7: Add Catalog Read Models

**Files:**
- Create: `src/modules/catalog/catalog-read-models.test.ts`
- Create: `src/modules/catalog/catalog-read-models.ts`

- [ ] **Step 1: Write read-model tests**

Tests must prove:

- Admin catalog filters include `organizationId`.
- Learner catalog filters include `organizationId` and published status.
- Assigned learner filters include `organizationId` and `membershipId`.
- Manager direct-report assignment filters include `organizationId` and direct report membership ids.

- [ ] **Step 2: Implement read-model helpers**

Create `src/modules/catalog/catalog-read-models.ts` exporting:

```ts
import { scopeByOrganization } from "@/modules/tenants/tenant-scope";

export function adminCatalogFilter(organizationId: string): { organizationId: string } {
  return scopeByOrganization(organizationId, {});
}

export function learnerPublishedCatalogFilter(organizationId: string): {
  organizationId: string;
  status: "PUBLISHED";
} {
  return scopeByOrganization(organizationId, { status: "PUBLISHED" as const });
}

export function learnerAssignmentFilter(organizationId: string, membershipId: string): {
  organizationId: string;
  membershipId: string;
} {
  return scopeByOrganization(organizationId, { membershipId });
}

export function managerDirectReportAssignmentFilter(
  organizationId: string,
  directReportMembershipIds: string[],
): {
  organizationId: string;
  membershipId: { in: string[] };
} {
  return scopeByOrganization(organizationId, { membershipId: { in: directReportMembershipIds } });
}
```

- [ ] **Step 3: Run tests and commit**

Run:

```powershell
npm run test -- src/modules/catalog/catalog-read-models.test.ts
git add src/modules/catalog/catalog-read-models.ts src/modules/catalog/catalog-read-models.test.ts
git commit -m "feat: add catalog read model filters"
```

Expected: tests pass and commit succeeds.

## Task 8: Add Course Catalog And Assignment Pages

**Files:**
- Create: `src/app/org/[slug]/admin/catalog/page.tsx`
- Create: `src/app/org/[slug]/admin/courses/[courseSlug]/page.tsx`
- Create: `src/app/org/[slug]/admin/assignments/page.tsx`
- Create: `src/app/org/[slug]/learn/page.tsx`

- [ ] **Step 1: Add catalog management page shell**

Create `src/app/org/[slug]/admin/catalog/page.tsx` as a server component with:

- Heading containing the organization slug.
- Sections for categories, tags, and courses.
- Disabled buttons for create category, create tag, and create course.
- Course lifecycle labels for Draft, Published, Deprecated, Retired.

- [ ] **Step 2: Add course detail page shell**

Create `src/app/org/[slug]/admin/courses/[courseSlug]/page.tsx` as a server component with:

- Course slug and organization slug in the heading.
- Fields displayed for title, type, lifecycle, category, tags, duration, and estimated business days.
- Disabled lifecycle action buttons.

- [ ] **Step 3: Add assignment page shell**

Create `src/app/org/[slug]/admin/assignments/page.tsx` as a server component with:

- Course selector shell.
- Learner/direct-report selector shell.
- Start date field shell.
- Disabled assign button.
- Text indicating admins can assign within organization and managers only to direct reports.

- [ ] **Step 4: Add learner catalog page shell**

Create `src/app/org/[slug]/learn/page.tsx` as a server component with:

- Assigned courses section.
- Available courses section.
- Related courses section.
- Disabled self-enroll buttons until server actions are wired.

- [ ] **Step 5: Run build and commit**

Run:

```powershell
npm run build
git add src/app/org/[slug]/admin/catalog/page.tsx src/app/org/[slug]/admin/courses/[courseSlug]/page.tsx src/app/org/[slug]/admin/assignments/page.tsx src/app/org/[slug]/learn/page.tsx
git commit -m "feat: add catalog and assignment page shells"
```

Expected: build exits `0` and commit succeeds.

## Task 9: Final Verification

**Files:**
- Modify: none unless verification reveals a concrete failure.

- [ ] **Step 1: Run full tests**

Run:

```powershell
npm run test
```

Expected: all tests pass.

- [ ] **Step 2: Run lint**

Run:

```powershell
npm run lint
```

Expected: lint exits `0`.

- [ ] **Step 3: Validate Prisma schema**

Run:

```powershell
npx prisma validate
```

Expected: schema is valid.

- [ ] **Step 4: Run TypeScript**

Run:

```powershell
npx tsc --noEmit --incremental false
```

Expected: command exits `0`.

- [ ] **Step 5: Run production build**

Run:

```powershell
npm run build
```

Expected: build exits `0`.

- [ ] **Step 6: Confirm clean feature branch**

Run:

```powershell
git status --short --branch
git log --oneline -10
```

Expected: clean `feature/course-catalog-assignments` branch with task commits.

## Review Checklist

Before merging:

- Every organization-scoped filter includes `organizationId`.
- New assignment uniqueness exists in Prisma schema and migration SQL.
- Draft, deprecated, and retired courses cannot be newly assigned or self-enrolled.
- Managers can assign only direct reports.
- Learner self-enrollment respects organization enrollment policy.
- Duplicate assignments are blocked before write and by database uniqueness.
- Course and assignment write services expose transaction expectations.
- Pages are non-destructive shells and do not POST to missing handlers.
