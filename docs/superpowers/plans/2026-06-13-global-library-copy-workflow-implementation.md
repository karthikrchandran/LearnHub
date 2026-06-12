# Global Library Copy Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add platform-owned global library courses and a tenant-admin copy workflow that creates tenant-owned catalog, taxonomy, video, and SCORM metadata.

**Architecture:** Keep `Course` as the shared course hierarchy and add global-library lineage fields to distinguish platform library records from tenant-owned copies. Business rules live in `src/modules/library`; App Router pages call server-action bridges that resolve auth context and delegate to repository-backed services. The copy workflow clones metadata into new tenant rows and records audit metadata with both the source global course id and created tenant course id.

**Tech Stack:** Next.js App Router server actions, TypeScript, Prisma 7, PostgreSQL, Vitest.

---

## Scope Boundary

This plan implements Task 2 only. It does not add the Task 3 knowledge-check schema, scoring, feedback, media storage operations, notification delivery, or SCORM file-copy jobs. The copy payload type intentionally contains an optional `knowledgeChecks` collection and the service treats missing data as an empty collection so Task 3 can extend the payload without changing the copy API.

## Review Hardening Notes

- Lifecycle updates must report whether exactly one hidden global-library course row changed. The service throws `Global library course was not found` and skips audit logging when the repository reports no exact match.
- Default duplicate blocking uses two checks: a pre-transaction check for fast feedback, then a transaction-time recheck immediately before tenant course creation. The Prisma repository runs copy transactions with `Serializable` isolation so concurrent `BLOCK` copy attempts detect the predicate conflict. There is no unique database constraint on `(organizationId, globalLibrarySourceCourseId)` because explicit duplicate copies are a supported admin action.
- Hidden global library visibility is scoped through the repository's centralized `learnhub-global-library` organization lookup. Repository reads and App Router listing/detail queries include both `organizationId` and `isGlobalLibraryCourse`.

## File Structure

- Create `docs/superpowers/plans/2026-06-13-global-library-copy-workflow-implementation.md`: this implementation plan.
- Modify `prisma/schema.prisma`: add `Course.isGlobalLibraryCourse`, `Course.globalLibrarySourceCourseId`, self-relation fields, and supporting indexes.
- Create `prisma/migrations/20260613020000_global_course_library/migration.sql`: add the schema fields and foreign key.
- Create `src/modules/library/global-library.ts`: service layer for platform create/lifecycle and tenant copy rules.
- Create `src/modules/library/global-library.test.ts`: service tests for create, lifecycle, access gating, duplicate handling, metadata cloning, audit metadata, and knowledge-check tolerance.
- Create `src/modules/library/prisma-repository.ts`: Prisma adapter for global library course reads and copy writes.
- Create `src/modules/library/prisma-repository.test.ts`: query-shape and transaction tests.
- Create `src/modules/library/server-actions.ts`: pure action factories for platform library forms and tenant copy forms.
- Create `src/modules/library/server-actions.test.ts`: form parsing and error-boundary tests.
- Create `src/app/platform/library/page.tsx`: platform owner library list and create-course form.
- Create `src/app/platform/library/actions.ts`: platform owner server-action bridge.
- Create `src/app/platform/library/[courseSlug]/page.tsx`: platform owner detail and lifecycle controls.
- Create `src/app/org/[slug]/admin/library/page.tsx`: tenant admin global library copy page.
- Create `src/app/org/[slug]/admin/library/actions.ts`: tenant admin copy server-action bridge.
- Modify `src/modules/catalog/related-courses.ts`: require same-organization candidates and exclude global-library records.
- Modify `src/modules/catalog/related-courses.test.ts`: add tenant-scope and global-library regression coverage.

### Task 1: Schema Lineage Fields

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260613020000_global_course_library/migration.sql`

- [ ] **Step 1: Add schema fields and migration**

Add the following fields to `model Course`:

```prisma
  isGlobalLibraryCourse          Boolean            @default(false)
  globalLibrarySourceCourseId    String?
  globalLibrarySourceCourse      Course?            @relation("GlobalLibraryCourseCopies", fields: [globalLibrarySourceCourseId], references: [id], onDelete: SetNull)
  globalLibraryCopies            Course[]           @relation("GlobalLibraryCourseCopies")
```

Add these indexes:

```prisma
  @@index([isGlobalLibraryCourse, status])
  @@index([organizationId, globalLibrarySourceCourseId])
```

Create migration SQL:

```sql
ALTER TABLE "Course"
ADD COLUMN "isGlobalLibraryCourse" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "globalLibrarySourceCourseId" TEXT;

CREATE INDEX "Course_isGlobalLibraryCourse_status_idx" ON "Course"("isGlobalLibraryCourse", "status");
CREATE INDEX "Course_organizationId_globalLibrarySourceCourseId_idx" ON "Course"("organizationId", "globalLibrarySourceCourseId");

ALTER TABLE "Course"
ADD CONSTRAINT "Course_globalLibrarySourceCourseId_fkey"
FOREIGN KEY ("globalLibrarySourceCourseId") REFERENCES "Course"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Course"
ADD CONSTRAINT "Course_global_library_source_check"
CHECK (NOT "isGlobalLibraryCourse" OR "globalLibrarySourceCourseId" IS NULL);
```

- [ ] **Step 2: Validate schema**

Run:

```powershell
npx prisma validate
```

Expected: pass after the schema and migration agree.

### Task 2: Library Service TDD

**Files:**
- Create: `src/modules/library/global-library.test.ts`
- Create: `src/modules/library/global-library.ts`

- [ ] **Step 1: Write failing service tests**

Tests must cover:
- `createGlobalLibraryCourse` normalizes title and slug, creates a global-library `Course`, and audits `global_library.course_created`.
- `updateGlobalLibraryCourseLifecycle` writes allowed statuses and audits `global_library.course_lifecycle_updated`.
- `copyGlobalCourseToTenant` rejects disabled organizations through `Organization.globalLibraryEnabled`.
- `copyGlobalCourseToTenant` rejects non-published or missing global courses.
- `copyGlobalCourseToTenant` blocks a second copy of the same source when `duplicateAction` is `BLOCK`.
- `copyGlobalCourseToTenant` allows a second copy when `duplicateAction` is `CREATE_DUPLICATE` and the admin supplies a distinct target slug.
- `copyGlobalCourseToTenant` creates tenant-owned course, category, tags, tag links, modules, video lessons, video chapters, transcript cues, SCORM package metadata, and audit metadata.
- `copyGlobalCourseToTenant` treats absent `knowledgeChecks` as an empty copy set.

Run:

```powershell
npm run test -- src/modules/library/global-library.test.ts
```

Expected: fail because `src/modules/library/global-library.ts` does not exist.

- [ ] **Step 2: Implement service functions**

Export:

```ts
export type DuplicateCopyAction = "BLOCK" | "CREATE_DUPLICATE";
export async function createGlobalLibraryCourse(input: CreateGlobalLibraryCourseInput, repository: GlobalLibraryRepository): Promise<{ id: string; slug: string }>;
export async function updateGlobalLibraryCourseLifecycle(input: UpdateGlobalLibraryCourseLifecycleInput, repository: GlobalLibraryRepository): Promise<void>;
export async function copyGlobalCourseToTenant(input: CopyGlobalCourseToTenantInput, repository: GlobalLibraryRepository): Promise<{ id: string; slug: string }>;
```

Rules:
- Platform-created global courses are created as `isGlobalLibraryCourse: true` and `globalLibrarySourceCourseId: null`.
- Tenant copies are created as `isGlobalLibraryCourse: false`, `globalLibrarySourceCourseId: source.id`, and `status: "DRAFT"`.
- Copy lookup uses only source courses with `isGlobalLibraryCourse: true` and `status: "PUBLISHED"`.
- Category and tag slugs are reused or created inside the target organization; links are new tenant links.
- Source module and lesson ids are mapped to newly-created tenant module and lesson ids before writing children.
- Audit metadata includes `sourceGlobalCourseId`, `createdTenantCourseId`, `duplicateAction`, and copied item counts.

- [ ] **Step 3: Verify service tests**

Run:

```powershell
npm run test -- src/modules/library/global-library.test.ts
```

Expected: pass.

### Task 3: Prisma Repository TDD

**Files:**
- Create: `src/modules/library/prisma-repository.test.ts`
- Create: `src/modules/library/prisma-repository.ts`

- [ ] **Step 1: Write failing repository tests**

Tests must assert:
- `createGlobalLibraryCourse` upserts the hidden `learnhub-global-library` organization and creates a `Course` marked global.
- global course reads filter `isGlobalLibraryCourse: true`.
- tenant duplicate lookup filters by target `organizationId` and `globalLibrarySourceCourseId`.
- category and tag upserts are scoped to the target organization.
- module, lesson, chapter, transcript, SCORM, tag-link, and audit writes use the active transaction client.

Run:

```powershell
npm run test -- src/modules/library/prisma-repository.test.ts
```

Expected: fail because `src/modules/library/prisma-repository.ts` does not exist.

- [ ] **Step 2: Implement repository**

Create:

```ts
export function createPrismaGlobalLibraryRepository(client: PrismaGlobalLibraryClient): GlobalLibraryRepository;
```

Use the existing transaction-client pattern from catalog, video, and SCORM repositories. Read source course snapshots with category, tags, modules, video lessons, chapters, transcript cues, active SCORM package metadata, and `knowledgeChecks: []`.

- [ ] **Step 3: Verify repository tests**

Run:

```powershell
npm run test -- src/modules/library/prisma-repository.test.ts
```

Expected: pass.

### Task 4: Server Actions TDD

**Files:**
- Create: `src/modules/library/server-actions.test.ts`
- Create: `src/modules/library/server-actions.ts`

- [ ] **Step 1: Write failing action tests**

Tests must assert:
- platform create action parses title, slug, description, type, lifecycle, duration, and business days.
- platform lifecycle action parses course id and status.
- tenant copy action parses global course id, duplicate action, target title, and target slug.
- domain errors return `{ status: "error", message }` without throwing through the action boundary.

Run:

```powershell
npm run test -- src/modules/library/server-actions.test.ts
```

Expected: fail because `src/modules/library/server-actions.ts` does not exist.

- [ ] **Step 2: Implement action factories**

Export:

```ts
export function createPlatformLibraryActions(dependencies: PlatformLibraryActionDependencies): {
  createCourse(formData: FormData): Promise<LibraryActionResult>;
  updateLifecycle(formData: FormData): Promise<LibraryActionResult>;
};

export function createTenantLibraryActions(dependencies: TenantLibraryActionDependencies): {
  copyCourse(slug: string, formData: FormData): Promise<LibraryActionResult>;
};
```

Use the same result shape as existing catalog actions: `{ status: "success" | "error"; message: string }`, with optional `courseSlug` on success for redirect/revalidation callers.

- [ ] **Step 3: Verify action tests**

Run:

```powershell
npm run test -- src/modules/library/server-actions.test.ts
```

Expected: pass.

### Task 5: Pages And Action Bridges

**Files:**
- Create: `src/app/platform/library/page.tsx`
- Create: `src/app/platform/library/actions.ts`
- Create: `src/app/platform/library/[courseSlug]/page.tsx`
- Create: `src/app/org/[slug]/admin/library/page.tsx`
- Create: `src/app/org/[slug]/admin/library/actions.ts`

- [ ] **Step 1: Implement platform action bridge**

`src/app/platform/library/actions.ts` must:
- use `"use server"`
- call `requirePlatformOwner`
- lazy-import Prisma
- create `createPrismaGlobalLibraryRepository(prisma)`
- revalidate `/platform/library` and `/platform/library/[courseSlug]` after successful writes

- [ ] **Step 2: Implement platform library pages**

`/platform/library` must:
- require platform owner access
- list global courses ordered by title
- render a create form with title, slug, description, type, lifecycle, expected duration, and estimated business days

`/platform/library/[courseSlug]` must:
- require platform owner access
- show course status, taxonomy, video lesson count, and SCORM package state
- render lifecycle buttons for `DRAFT`, `PUBLISHED`, `DEPRECATED`, and `RETIRED`

- [ ] **Step 3: Implement tenant action bridge and page**

`src/app/org/[slug]/admin/library/actions.ts` must:
- use `"use server"`
- call `requireOrganizationUsersAdminBySlug`
- lazy-import Prisma
- create `createPrismaGlobalLibraryRepository(prisma)`
- revalidate `/org/[slug]/admin/library` and `/org/[slug]/admin/catalog` after successful copy

`/org/[slug]/admin/library` must:
- require organization admin access
- show an access-disabled state when `globalLibraryEnabled` is false
- list only published global library courses when enabled
- show existing copy status per source course
- include a default copy form and an explicit duplicate-copy form with a target slug field

- [ ] **Step 4: Build-check pages**

Run:

```powershell
npx tsc --noEmit --incremental false
```

Expected: pass after pages and action bridges compile.

### Task 6: Related-Course Tenant Scope

**Files:**
- Modify: `src/modules/catalog/related-courses.test.ts`
- Modify: `src/modules/catalog/related-courses.ts`

- [ ] **Step 1: Write failing related-course tests**

Add tests proving:
- candidates from a different `organizationId` are excluded even when category and tags match.
- candidates with `isGlobalLibraryCourse: true` are excluded from learner recommendations.

Run:

```powershell
npm run test -- src/modules/catalog/related-courses.test.ts
```

Expected: fail until the helper enforces tenant scope and global-library exclusion.

- [ ] **Step 2: Implement helper changes**

Add `organizationId: string` and `isGlobalLibraryCourse?: boolean` to `RelatedCourseCandidate`. Filter candidates to:

```ts
candidate.organizationId === source.organizationId &&
candidate.isGlobalLibraryCourse !== true
```

Keep the existing ranking order unchanged after filtering.

- [ ] **Step 3: Verify related-course tests**

Run:

```powershell
npm run test -- src/modules/catalog/related-courses.test.ts
```

Expected: pass.

### Task 7: Final Verification And Commit

**Files:**
- All files above.

- [ ] **Step 1: Run focused tests**

Run:

```powershell
npm run test -- src/modules/library/global-library.test.ts src/modules/library/prisma-repository.test.ts src/modules/library/server-actions.test.ts src/modules/catalog/related-courses.test.ts
```

Expected: all focused tests pass.

- [ ] **Step 2: Run full gates**

Run:

```powershell
npm run lint
npx prisma validate
npm run prisma:generate
npx tsc --noEmit --incremental false
npm run build
git diff --check
```

Expected: all commands exit `0`.

- [ ] **Step 3: Commit lane**

Run:

```powershell
git status --short
git add docs/superpowers/plans/2026-06-13-global-library-copy-workflow-implementation.md prisma/schema.prisma prisma/migrations/20260613020000_global_course_library/migration.sql src/modules/library/global-library.ts src/modules/library/global-library.test.ts src/modules/library/prisma-repository.ts src/modules/library/prisma-repository.test.ts src/modules/library/server-actions.ts src/modules/library/server-actions.test.ts src/app/platform/library/page.tsx src/app/platform/library/actions.ts src/app/platform/library/[courseSlug]/page.tsx src/app/org/[slug]/admin/library/page.tsx src/app/org/[slug]/admin/library/actions.ts src/modules/catalog/related-courses.ts src/modules/catalog/related-courses.test.ts
git commit -m "feat: add global library copy workflow"
```

Expected: commit succeeds on `feature/global-library-copy-workflow` and no push is performed.

## Self-Review

Spec coverage:
- Platform lifecycle, organization access gating, tenant copy, taxonomy/media/SCORM cloning, tenant customization through independent rows, duplicate blocking with explicit override, tenant-scoped related ranking, and audit metadata are covered by tasks above.

Placeholder scan:
- No task uses TBD, TODO, or unspecified "appropriate" behavior; each task names exact files, commands, and expected outcomes.

Type consistency:
- The service, repository, and action types consistently use `isGlobalLibraryCourse`, `globalLibrarySourceCourseId`, `DuplicateCopyAction`, and existing Prisma enum names: `CourseStatus` and `CourseType`.
