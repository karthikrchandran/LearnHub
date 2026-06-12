# Runtime Endpoints Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add live native-video and SCORM launch/commit endpoints that consume course assignments and enforce learner ownership.

**Architecture:** Route handlers stay thin: resolve organization and auth context, load the target assignment, check runtime permissions, and call existing runtime services. Runtime services remain the only code that writes player state or normalized progress. Route handlers return JSON contracts that a browser player or SCORM bridge can consume.

**Tech Stack:** Next.js App Router route handlers, TypeScript, Prisma 7, Vitest, existing video/SCORM runtime services.

---

## Scope Boundary

This plan adds endpoint contracts and server-side authorization. It does not add a production browser video player, iframe host, zip extraction worker, signed media delivery, or upload UI.

## File Structure

- Create `src/modules/runtime/runtime-route-service.ts`: shared endpoint orchestration for assignment lookup and permission checks.
- Create `src/modules/runtime/runtime-route-service.test.ts`: ownership and cross-organization tests.
- Create `src/app/api/org/[slug]/assignments/[assignmentId]/video/launch/route.ts`: native-video launch endpoint.
- Create `src/app/api/org/[slug]/assignments/[assignmentId]/video/progress/route.ts`: native-video progress endpoint.
- Create `src/app/api/org/[slug]/assignments/[assignmentId]/scorm/launch/route.ts`: SCORM launch endpoint.
- Create `src/app/api/org/[slug]/assignments/[assignmentId]/scorm/commit/route.ts`: SCORM commit endpoint.
- Create `src/modules/runtime/route-handlers.test.ts`: route-handler tests using mocked dependencies.
- Modify `src/app/org/[slug]/learn/[courseSlug]/page.tsx`: expose assignment-aware endpoint paths for native video.
- Modify `src/app/org/[slug]/learn/[courseSlug]/scorm/page.tsx`: expose assignment-aware endpoint paths for SCORM.

## Task 1: Add Runtime Route Service

**Files:**
- Create: `src/modules/runtime/runtime-route-service.test.ts`
- Create: `src/modules/runtime/runtime-route-service.ts`

- [ ] **Step 1: Write tests**

Tests must prove:

- learner can launch own assignment.
- learner cannot launch another learner assignment.
- manager can view progress for a direct report but cannot launch as that learner.
- admin and platform owner can inspect but cannot use learner launch endpoints unless the endpoint is explicitly inspection-only.
- cross-organization assignment/learner mismatch is denied.

Run:

```powershell
npm run test -- src/modules/runtime/runtime-route-service.test.ts
```

Expected: fail because the service file does not exist.

- [ ] **Step 2: Implement route service**

Export:

```ts
export type RuntimeRouteAssignment = {
  id: string;
  organizationId: string;
  membershipId: string;
  learner: {
    id: string;
    userId: string;
    organizationId: string;
    managerMembershipId: string | null;
  };
  course: {
    id: string;
    slug: string;
    type: "NATIVE_VIDEO" | "SCORM_1_2";
  };
};

export type RuntimeRouteRepository = {
  findAssignment(input: { organizationId: string; assignmentId: string }): Promise<RuntimeRouteAssignment | null>;
};

export async function requireLearnerLaunchAssignment(input: {
  organizationId: string;
  assignmentId: string;
  expectedCourseType: "NATIVE_VIDEO" | "SCORM_1_2";
  actor: MembershipAuthContext;
  repository: RuntimeRouteRepository;
}): Promise<RuntimeRouteAssignment>;
```

Rules:

- missing assignment throws `Assignment was not found`.
- wrong course type throws `Assignment course type does not match this runtime`.
- unauthorized launch throws `Not allowed to launch this assignment`.

- [ ] **Step 3: Verify and commit**

Run:

```powershell
npm run test -- src/modules/runtime/runtime-route-service.test.ts
git add src/modules/runtime/runtime-route-service.ts src/modules/runtime/runtime-route-service.test.ts
git commit -m "feat: add runtime route authorization service"
```

Expected: tests pass and commit succeeds.

## Task 2: Add Prisma Runtime Route Repository

**Files:**
- Create: `src/modules/runtime/prisma-repository.test.ts`
- Create: `src/modules/runtime/prisma-repository.ts`

- [ ] **Step 1: Write query-shape tests**

Tests assert `findAssignment`:

- filters by `id` and `organizationId`.
- selects assignment `membershipId`.
- selects learner membership `id`, `userId`, `organizationId`, and `managerMembershipId`.
- selects course `id`, `slug`, and `type`.

- [ ] **Step 2: Implement repository**

Export:

```ts
export function createPrismaRuntimeRouteRepository(client: PrismaRuntimeRouteClient): RuntimeRouteRepository;
```

Use `courseAssignment.findFirst` with explicit `organizationId`.

- [ ] **Step 3: Verify and commit**

Run:

```powershell
npm run test -- src/modules/runtime/prisma-repository.test.ts
git add src/modules/runtime/prisma-repository.ts src/modules/runtime/prisma-repository.test.ts
git commit -m "feat: add runtime route prisma repository"
```

Expected: tests pass and commit succeeds.

## Task 3: Add Video Runtime Endpoints

**Files:**
- Create: `src/app/api/org/[slug]/assignments/[assignmentId]/video/launch/route.ts`
- Create: `src/app/api/org/[slug]/assignments/[assignmentId]/video/progress/route.ts`
- Create: `src/modules/runtime/video-route-handlers.test.ts`

- [ ] **Step 1: Write route tests**

Tests must prove:

- launch returns assignment id, course title, lessons, current lesson, and progress percent.
- progress rejects missing `lessonId`.
- progress rejects negative position or watched seconds through service validation.
- unauthorized launch returns `403`.
- missing assignment returns `404`.

- [ ] **Step 2: Implement route handlers**

Both handlers must:

- call `requireOrganizationMemberBySlug`.
- resolve organization id from the guard.
- use `requireLearnerLaunchAssignment` with `expectedCourseType: "NATIVE_VIDEO"`.
- call `launchVideoRuntime` or `recordVideoProgress` with `createPrismaVideoRepository(prisma)`.
- return JSON with status `200`, `400`, `403`, or `404`.

- [ ] **Step 3: Verify and commit**

Run:

```powershell
npm run test -- src/modules/runtime/video-route-handlers.test.ts
git add src/app/api/org/[slug]/assignments/[assignmentId]/video/launch/route.ts src/app/api/org/[slug]/assignments/[assignmentId]/video/progress/route.ts src/modules/runtime/video-route-handlers.test.ts
git commit -m "feat: add native video runtime endpoints"
```

Expected: tests pass and commit succeeds.

## Task 4: Add SCORM Runtime Endpoints

**Files:**
- Create: `src/app/api/org/[slug]/assignments/[assignmentId]/scorm/launch/route.ts`
- Create: `src/app/api/org/[slug]/assignments/[assignmentId]/scorm/commit/route.ts`
- Create: `src/modules/runtime/scorm-route-handlers.test.ts`

- [ ] **Step 1: Write route tests**

Tests must prove:

- launch returns launch URL, package id, CMI data, and launch count.
- commit accepts a JSON object of CMI string values.
- commit ignores `cmi.core.total_time` by service behavior.
- malformed JSON returns `400`.
- unauthorized launch or commit returns `403`.

- [ ] **Step 2: Implement route handlers**

Both handlers must:

- call `requireOrganizationMemberBySlug`.
- use `requireLearnerLaunchAssignment` with `expectedCourseType: "SCORM_1_2"`.
- call `launchScormRegistration` or `commitScormRuntime` with `createPrismaScormRepository(prisma)`.
- return controlled JSON errors.

- [ ] **Step 3: Verify and commit**

Run:

```powershell
npm run test -- src/modules/runtime/scorm-route-handlers.test.ts
git add src/app/api/org/[slug]/assignments/[assignmentId]/scorm/launch/route.ts src/app/api/org/[slug]/assignments/[assignmentId]/scorm/commit/route.ts src/modules/runtime/scorm-route-handlers.test.ts
git commit -m "feat: add scorm runtime endpoints"
```

Expected: tests pass and commit succeeds.

## Task 5: Surface Endpoint Paths On Learner Runtime Pages

**Files:**
- Modify: `src/app/org/[slug]/learn/[courseSlug]/page.tsx`
- Modify: `src/app/org/[slug]/learn/[courseSlug]/scorm/page.tsx`
- Modify: `src/modules/video/page-shells.test.ts`
- Modify: `src/modules/scorm/page-shells.test.ts`

- [ ] **Step 1: Add page tests**

Tests must assert learner pages include assignment-aware endpoint paths in `data-*` attributes:

- native video launch path.
- native video progress path.
- SCORM launch path.
- SCORM commit path.

- [ ] **Step 2: Implement page updates**

Pages must resolve the current learner assignment for `courseSlug`. If no assignment exists, render an assigned-course required message and no endpoint path.

- [ ] **Step 3: Verify and commit**

Run:

```powershell
npm run test -- src/modules/video/page-shells.test.ts src/modules/scorm/page-shells.test.ts
npm run build
git add src/app/org/[slug]/learn/[courseSlug]/page.tsx src/app/org/[slug]/learn/[courseSlug]/scorm/page.tsx src/modules/video/page-shells.test.ts src/modules/scorm/page-shells.test.ts
git commit -m "feat: expose learner runtime endpoint paths"
```

Expected: tests and build pass.

## Task 6: Final Verification

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
