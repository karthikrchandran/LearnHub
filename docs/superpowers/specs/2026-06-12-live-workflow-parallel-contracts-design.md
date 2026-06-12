# Live Workflow Parallel Contracts Design

Date: 2026-06-12

## Purpose

This Wave 0 design freezes the shared contracts needed before LearnHub work is split across parallel implementation streams. The current product foundation is strong: tenant auth, catalog and assignment services, runtime services, normalized progress, certificates, native video, and SCORM contracts already exist. The next risk is coordination, not missing domain shape.

Wave 0 does not change runtime behavior. It defines the boundaries that Wave 1 and Wave 2 agents must respect so live catalog actions, learner runtime endpoints, and reporting can be built without competing over the same files or redefining the same concepts.

## Execution Waves

Wave 1 is sequential:

- Live catalog and assignment actions.
- This wave creates and updates `Course`, `CourseCategory`, `CourseTag`, and `CourseAssignment` records through server actions and Prisma repositories.
- It owns admin catalog pages, admin assignment pages, learner catalog self-enrollment, and the Prisma adapters for catalog and assignment services.

Wave 2 can run in parallel after Wave 1 lands:

- Runtime endpoints stream: live native-video and SCORM launch/commit route handlers.
- Reporting stream: admin, manager, and learner progress views plus CSV export foundations.
- These streams can run together because runtime writes through existing runtime/progress services while reporting reads normalized progress state.

Wave 3 can run after Wave 2 contracts are stable:

- Admin media/upload UI, richer player UI, storage/extraction workers, and presentation polish.

## Frozen Shared Concepts

`CourseAssignment` is the handoff object between control-plane workflows, runtime learning, and reporting.

- Catalog and assignment actions create assignments.
- Runtime launch and commit endpoints must require an assignment id, not infer permission from a course slug alone.
- Reporting must read assignments, `AssignmentProgress`, `LearningProgressEvent`, and `Certificate` records as its primary source.
- Native video `VideoLessonProgress` and SCORM `ScormRegistration` are runtime interaction records, not the reporting source of truth.

Every query and write remains scoped by `organizationId`. Any route using `/org/[slug]` must resolve the slug to one organization id and pass that id through the module/service boundary.

## Auth And Permission Contract

Existing guard and permission helpers remain the shared auth surface:

- `requirePlatformOwner()`
- `requireOrganizationMemberBySlug(slug)`
- `requireOrganizationUsersAdminBySlug(slug)`
- `canManageCatalog(context, organizationId)`
- `canAssignDirectReport(context, target)`
- `canLaunchRuntimeAssignment(context, assignment)`
- `canViewRuntimeProgress(context, assignment)`
- `canInspectRuntimeAssignment(context, assignment)`
- `canViewMembershipProgress(context, target)`

Rules:

- Platform owners and active organization admins can inspect organization assignments and progress.
- Active managers can assign and view only direct reports.
- Learners can launch or commit only their own active assignment.
- Cross-organization assignment, membership, and learner mismatches are denied even if ids exist.
- Public signup, social login, SSO, and custom domains remain outside these waves.

Wave agents may add helper tests around these functions, but they must not replace the permission model without a new ADR.

## Catalog And Assignment Contract

Wave 1 owns live control-plane mutations. It must call domain services instead of writing business rules in page components.

Accepted service boundaries:

- `createCourse(input, repository)` in `src/modules/catalog/course-service.ts`
- `updateCourseLifecycle(input, repository)` in `src/modules/catalog/course-service.ts`
- `assignCourse(input, repository)` in `src/modules/assignments/assignment-service.ts`
- `selfEnrollInCourse(input, repository)` in `src/modules/assignments/assignment-service.ts`

Wave 1 may add category and tag service functions because the page shell already exposes those controls. Those functions must follow the same pattern: validate inputs in the module, persist through an injected repository, record audit logs, and keep pages thin.

Assignment creation remains constrained by:

- Only `PUBLISHED` courses can be newly assigned or self-enrolled.
- Learner membership must be active and must include the `LEARNER` role.
- Admins can assign within their organization.
- Managers can assign direct reports only.
- Self-enrollment requires `ASSIGNMENT_AND_SELF_ENROLLMENT`.
- Duplicate assignment prevention happens in the service and is enforced by the database unique key on `[organizationId, courseId, membershipId]`.

## Runtime Contract

Wave 2 runtime endpoints must consume assignments produced by Wave 1.

Native video:

- Launch uses `launchVideoRuntime(input, repository)`.
- Progress commits use `recordVideoProgress(input, repository)`.
- Commits must keep runtime state and normalized progress writes in one repository transaction.
- Browser endpoints must validate assignment ownership with `canLaunchRuntimeAssignment` before returning player data or accepting progress.

SCORM:

- Launch uses `launchScormRegistration(input, repository)`.
- Commit uses `commitScormRuntime(input, repository)`.
- Launch URLs are built from `ScormPackage.contentRootKey + launchPath`.
- `storageKey` remains the uploaded zip object key.
- `cmi.core.total_time` remains LMS-derived/read-only; incoming values are ignored by the runtime service.
- `cmi.core.session_time` represents the latest value for the current launch session.

Runtime endpoints must not write `AssignmentProgress`, `LearningProgressEvent`, `VideoLessonProgress`, or `ScormRegistration` directly from route handlers.

## Reporting Contract

Wave 2 reporting is read-oriented and must not depend on player-specific tables for summary progress.

Accepted reporting read source:

- `CourseAssignment`
- `AssignmentProgress`
- `LearningProgressEvent`
- `Course`
- `OrganizationMembership`
- `User`
- `Certificate`
- `CredentialIssuance`

Rules:

- Learners see their own assignments, progress, and certificates.
- Managers see direct reports only.
- Admins and platform owners see organization progress.
- CSV exports use the same filters as the on-screen report.
- Reports may link to runtime detail pages but must not create runtime commits.

## File Ownership Boundaries

Wave 1 may edit:

- `src/modules/catalog/*`
- `src/modules/assignments/*`
- `src/app/org/[slug]/admin/catalog/*`
- `src/app/org/[slug]/admin/assignments/*`
- `src/app/org/[slug]/admin/courses/[courseSlug]/page.tsx`
- `src/app/org/[slug]/learn/page.tsx`
- Prisma repository files created for catalog and assignment actions.

Wave 2 runtime may edit:

- `src/modules/video/*runtime*`
- `src/modules/scorm/*runtime*`
- runtime route-handler or server-action files under `src/app/api/org/[slug]/assignments/[assignmentId]/*`
- learner runtime pages under `src/app/org/[slug]/learn/[courseSlug]/*`

Wave 2 reporting may edit:

- `src/modules/reports/*`
- `src/app/org/[slug]/reports/*`
- `src/app/org/[slug]/admin/reports/*`
- export route handlers under `src/app/api/org/[slug]/reports/*`

Shared files are locked unless the plan explicitly says otherwise:

- `prisma/schema.prisma`
- `prisma/seed.ts`
- `src/modules/auth/permissions.ts`
- `src/lib/auth/guards.ts`
- `src/modules/progress/progress.ts`
- `src/modules/catalog/course-service.ts`
- `src/modules/assignments/assignment-service.ts`

If a later wave needs a shared file change, it must be a small contract extension with focused tests and a note in the implementing commit.

## Verification Contract

Each wave must run focused tests for the changed module and then the standard gates:

```powershell
npm run test
npm run lint
npx prisma validate
npm run prisma:generate
npx tsc --noEmit --incremental false
npm run build
```

On Windows, Prisma generation and TypeScript must run sequentially to avoid stale generated-client or file-lock noise.

## Parallel Readiness Checklist

Wave 2 is ready for parallel dispatch only when Wave 1 has:

- Live assignment creation through `assignCourse`.
- Live self-enrollment through `selfEnrollInCourse`.
- A Prisma assignment repository with transaction-aware writes.
- Page or route tests proving learners, managers, admins, and cross-organization access are separated.
- A clean `main` branch after full verification.

At that point, runtime and reporting can proceed independently because runtime owns player writes and reporting owns normalized progress reads.
