# Live Catalog Assignment Actions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn catalog, assignment, and learner catalog shells into live server-action workflows backed by existing domain services.

**Architecture:** Keep business rules inside `src/modules/catalog` and `src/modules/assignments`. Pages call server actions; server actions resolve auth and organization context, then call repository-backed services. Prisma repositories must keep multi-write operations inside explicit transactions.

**Tech Stack:** Next.js App Router server actions, React server/client components, TypeScript, Prisma 7, PostgreSQL, Vitest.

---

## Scope Boundary

This plan wires live catalog and assignment control-plane workflows. It does not add video playback, SCORM API bridge, progress reports, storage upload transport, or notification jobs.

## File Structure

- Create `src/modules/catalog/category-tag-service.ts`: category and tag create/update service functions with validation and audit logging.
- Create `src/modules/catalog/category-tag-service.test.ts`: focused service tests.
- Create `src/modules/catalog/prisma-repository.ts`: Prisma adapter for course, category, and tag services.
- Create `src/modules/catalog/prisma-repository.test.ts`: query-shape and transaction tests.
- Create `src/modules/assignments/prisma-repository.ts`: Prisma adapter for assignment service.
- Create `src/modules/assignments/prisma-repository.test.ts`: query-shape and transaction tests.
- Create `src/modules/catalog/server-actions.ts`: pure action factories for catalog forms.
- Create `src/modules/catalog/server-actions.test.ts`: action tests with fake dependencies.
- Create `src/modules/assignments/server-actions.ts`: pure action factories for assignment and self-enrollment forms.
- Create `src/modules/assignments/server-actions.test.ts`: action tests with fake dependencies.
- Modify `src/app/org/[slug]/admin/catalog/page.tsx`: load real catalog data and render live forms.
- Create `src/app/org/[slug]/admin/catalog/actions.ts`: admin catalog server actions.
- Modify `src/app/org/[slug]/admin/assignments/page.tsx`: load published courses and eligible learners/direct reports.
- Create `src/app/org/[slug]/admin/assignments/actions.ts`: assignment server action.
- Modify `src/app/org/[slug]/learn/page.tsx`: load assigned and available courses and wire self-enrollment.
- Create `src/app/org/[slug]/learn/actions.ts`: learner self-enrollment action.

## Task 1: Add Category And Tag Services

**Files:**
- Create: `src/modules/catalog/category-tag-service.test.ts`
- Create: `src/modules/catalog/category-tag-service.ts`

- [ ] **Step 1: Write service tests**

Create tests proving:

- `createCategory` requires title and URL-safe slug.
- `createTag` requires title and URL-safe slug.
- both functions run create and audit writes in `repository.runInTransaction`.
- duplicate Prisma errors are translated to `Catalog slug already exists`.

Use this repository shape:

```ts
type CatalogTaxonomyRepository = {
  runInTransaction<T>(operation: () => Promise<T>): Promise<T>;
  createCategory(data: { organizationId: string; name: string; slug: string }): Promise<{ id: string; slug: string }>;
  createTag(data: { organizationId: string; name: string; slug: string }): Promise<{ id: string; slug: string }>;
  recordAuditLog(data: {
    organizationId: string;
    actorId: string;
    action: "catalog.category_created" | "catalog.tag_created";
    targetType: "course_category" | "course_tag";
    targetId: string;
  }): Promise<void>;
};
```

Run:

```powershell
npm run test -- src/modules/catalog/category-tag-service.test.ts
```

Expected: fail because the service file does not exist.

- [ ] **Step 2: Implement service functions**

Create `createCategory(input, repository)` and `createTag(input, repository)` with input:

```ts
type CreateCatalogTaxonomyInput = {
  organizationId: string;
  actorId: string;
  name: string;
  slug: string;
};
```

Rules:

- `name` uses `requireCatalogTitle`.
- `slug` uses `normalizeCatalogSlug`.
- blank `organizationId` throws `Organization id is required`.
- blank `actorId` throws `Actor id is required`.
- audit target id is the created category or tag id.

- [ ] **Step 3: Verify and commit**

Run:

```powershell
npm run test -- src/modules/catalog/category-tag-service.test.ts
git add src/modules/catalog/category-tag-service.ts src/modules/catalog/category-tag-service.test.ts
git commit -m "feat: add live catalog taxonomy service"
```

Expected: tests pass and commit succeeds.

## Task 2: Add Prisma Repositories

**Files:**
- Create: `src/modules/catalog/prisma-repository.test.ts`
- Create: `src/modules/catalog/prisma-repository.ts`
- Create: `src/modules/assignments/prisma-repository.test.ts`
- Create: `src/modules/assignments/prisma-repository.ts`

- [ ] **Step 1: Write repository query-shape tests**

Catalog repository tests must assert:

- category and tag creates include `organizationId`.
- course create writes only the service-provided `CreateCourseData`.
- `replaceCourseTags` deletes existing links by `organizationId` and `courseId` before inserting new links.
- `runInTransaction` uses the transaction client for nested repository writes.

Assignment repository tests must assert:

- `findCourse`, `findMembership`, and `findOrganization` scope by `organizationId`.
- `assignmentExists` checks `[organizationId, courseId, membershipId]`.
- `createAssignment` writes `assignedByMembershipId`, `startDate`, `dueDate`, and `status`.
- audit logs use action from the service.
- `runInTransaction` uses the transaction client for nested writes.

Run:

```powershell
npm run test -- src/modules/catalog/prisma-repository.test.ts src/modules/assignments/prisma-repository.test.ts
```

Expected: fail because repository files do not exist.

- [ ] **Step 2: Implement repositories**

Create these factories:

```ts
export function createPrismaCatalogRepository(client: PrismaCatalogClient): CourseCatalogRepository & CatalogTaxonomyRepository;
export function createPrismaAssignmentRepository(client: PrismaAssignmentClient): AssignmentRepository;
```

Both repositories use the existing transaction-client pattern from `src/modules/users/prisma-repository.ts`.

- [ ] **Step 3: Verify and commit**

Run:

```powershell
npm run test -- src/modules/catalog/prisma-repository.test.ts src/modules/assignments/prisma-repository.test.ts
git add src/modules/catalog/prisma-repository.ts src/modules/catalog/prisma-repository.test.ts src/modules/assignments/prisma-repository.ts src/modules/assignments/prisma-repository.test.ts
git commit -m "feat: add catalog and assignment prisma repositories"
```

Expected: tests pass and commit succeeds.

## Task 3: Add Server Action Factories

**Files:**
- Create: `src/modules/catalog/server-actions.test.ts`
- Create: `src/modules/catalog/server-actions.ts`
- Create: `src/modules/assignments/server-actions.test.ts`
- Create: `src/modules/assignments/server-actions.ts`

- [ ] **Step 1: Write action tests**

Catalog action tests must prove:

- create category, create tag, create course, and lifecycle actions parse form fields.
- dependency `getActorAndOrganization(slug)` is called before writes.
- domain errors return `{ status: "error", message }`.
- success returns `{ status: "success", message }`.

Assignment action tests must prove:

- admin/manager assignment action parses `courseId`, `learnerMembershipId`, and `startDate`.
- learner self-enrollment action parses `courseId`, `learnerMembershipId`, and `startDate`.
- failures return clear messages without throwing through the action boundary.

Run:

```powershell
npm run test -- src/modules/catalog/server-actions.test.ts src/modules/assignments/server-actions.test.ts
```

Expected: fail because action files do not exist.

- [ ] **Step 2: Implement action factories**

Export factories:

```ts
export type CatalogActionResult = { status: "success" | "error"; message: string };
export function createCatalogActions(dependencies: CatalogActionDependencies): {
  createCategory(slug: string, formData: FormData): Promise<CatalogActionResult>;
  createTag(slug: string, formData: FormData): Promise<CatalogActionResult>;
  createCourse(slug: string, formData: FormData): Promise<CatalogActionResult>;
  updateLifecycle(slug: string, formData: FormData): Promise<CatalogActionResult>;
};

export type AssignmentActionResult = { status: "success" | "error"; message: string };
export function createAssignCourseAction(dependencies: AssignCourseActionDependencies): (slug: string, formData: FormData) => Promise<AssignmentActionResult>;
export function createSelfEnrollAction(dependencies: SelfEnrollActionDependencies): (slug: string, formData: FormData) => Promise<AssignmentActionResult>;
```

Use `new Date(formValue)` for `startDate`; invalid dates return `Start date is required`.

- [ ] **Step 3: Verify and commit**

Run:

```powershell
npm run test -- src/modules/catalog/server-actions.test.ts src/modules/assignments/server-actions.test.ts
git add src/modules/catalog/server-actions.ts src/modules/catalog/server-actions.test.ts src/modules/assignments/server-actions.ts src/modules/assignments/server-actions.test.ts
git commit -m "feat: add catalog and assignment server actions"
```

Expected: tests pass and commit succeeds.

## Task 4: Wire Admin Catalog Page

**Files:**
- Create: `src/app/org/[slug]/admin/catalog/actions.ts`
- Modify: `src/app/org/[slug]/admin/catalog/page.tsx`
- Modify: `src/modules/catalog/page-shells.test.ts`

- [ ] **Step 1: Add page tests**

Extend the page-shell test to assert the admin catalog page renders:

- existing categories and tags.
- a create-category form with `name` and `slug`.
- a create-tag form with `name` and `slug`.
- a create-course form with title, slug, type, category, tags, duration, and estimated business days.
- lifecycle buttons with form action wiring.

- [ ] **Step 2: Implement action bridge and page**

`actions.ts` must call `requireOrganizationUsersAdminBySlug`, lazy-import Prisma, create `createPrismaCatalogRepository(prisma)`, and call the pure action factories.

The page must query organization catalog data by slug and render forms without client-side state.

- [ ] **Step 3: Verify and commit**

Run:

```powershell
npm run test -- src/modules/catalog/page-shells.test.ts
npm run build
git add src/app/org/[slug]/admin/catalog/actions.ts src/app/org/[slug]/admin/catalog/page.tsx src/modules/catalog/page-shells.test.ts
git commit -m "feat: wire live admin catalog actions"
```

Expected: tests and build pass.

## Task 5: Wire Assignment And Learner Catalog Pages

**Files:**
- Create: `src/app/org/[slug]/admin/assignments/actions.ts`
- Modify: `src/app/org/[slug]/admin/assignments/page.tsx`
- Create: `src/app/org/[slug]/learn/actions.ts`
- Modify: `src/app/org/[slug]/learn/page.tsx`
- Modify: `src/modules/catalog/page-shells.test.ts`

- [ ] **Step 1: Add page tests**

Extend tests to assert:

- assignment page renders published courses and eligible learners/direct reports.
- assignment page posts to the live assignment action.
- learner catalog renders assigned courses and published available courses.
- learner catalog self-enroll forms include `courseId`, `learnerMembershipId`, and a start date.

- [ ] **Step 2: Implement assignment bridge and page**

Assignment `actions.ts` must use `requireOrganizationMemberBySlug`, lazy-import Prisma, create `createPrismaAssignmentRepository(prisma)`, and call the assignment action factory.

The page must:

- show all active learners for admins.
- show only direct reports for managers.
- show no assign form for learners without admin or manager role.

- [ ] **Step 3: Implement learner bridge and page**

Learner `actions.ts` must use `requireOrganizationMemberBySlug`, infer the actor's learner membership in that organization, and call `selfEnrollInCourse`.

The page must:

- show assigned courses from `CourseAssignment`.
- show available `PUBLISHED` courses not already assigned.
- keep all queries scoped by `organizationId`.

- [ ] **Step 4: Verify and commit**

Run:

```powershell
npm run test -- src/modules/catalog/page-shells.test.ts src/modules/assignments/server-actions.test.ts
npm run build
git add src/app/org/[slug]/admin/assignments/actions.ts src/app/org/[slug]/admin/assignments/page.tsx src/app/org/[slug]/learn/actions.ts src/app/org/[slug]/learn/page.tsx src/modules/catalog/page-shells.test.ts
git commit -m "feat: wire live assignment and self enrollment actions"
```

Expected: tests and build pass.

## Task 6: Final Verification

**Files:**
- Modify: none unless verification exposes a concrete failure.

- [ ] **Step 1: Run full gates**

Run:

```powershell
npm run test
npm run lint
npx prisma validate
npm run prisma:generate
npx tsc --noEmit --incremental false
npm run build
```

Expected: all commands exit `0`.

- [ ] **Step 2: Confirm branch state**

Run:

```powershell
git status --short --branch
git log --oneline -8
```

Expected: clean feature branch with the task commits above.
