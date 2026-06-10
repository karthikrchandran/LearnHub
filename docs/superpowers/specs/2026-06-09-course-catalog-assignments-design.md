# Course Catalog And Assignments Design

Date: 2026-06-09

## Purpose

This slice turns the LearnHub control plane into the first learning workflow. It adds tenant-owned course catalog management, category and tag taxonomy, course lifecycle rules, related-course matching, assignment creation, manager assignment limits, and learner self-enrollment when the organization allows it.

The slice intentionally stops before native video lessons, SCORM launch/runtime, progress tracking, certificates, reminder/escalation jobs, and reporting dashboards. Those features depend on stable course and assignment primitives.

## Scope

In scope:

- Organization-scoped category and tag creation/update.
- Organization-scoped course creation/update for `NATIVE_VIDEO` and `SCORM_1_2` course shell records.
- Course lifecycle rules for `DRAFT`, `PUBLISHED`, `DEPRECATED`, and `RETIRED`.
- Assignment creation for admins and managers.
- Learner self-enrollment when the organization policy allows it.
- Business-day due-date calculation from course `estimatedCompletionBusinessDays`.
- Duplicate assignment prevention for the same learner and course.
- Related-course matching by same category first, then shared tags.
- Thin UI shells for catalog, course detail, assignment, and learner course views.
- Unit tests for lifecycle, assignment, self-enrollment, related-course, and query-scope behavior.

Out of scope:

- Lesson/module authoring.
- Video upload, transcript, chapters, and player behavior.
- SCORM package upload, launch, and runtime data.
- Knowledge checks.
- Completion and progress updates.
- Notification job scheduling.
- Reports and CSV export.
- Global library copy flow. This slice leaves room for it but does not implement copying.

## Domain Model

The existing Prisma models already cover the base shape:

- `CourseCategory`
- `CourseTag`
- `Course`
- `CourseTagLink`
- `CourseAssignment`

This slice adds only the schema constraints needed for safe assignment behavior:

- A learner can have at most one assignment per course in an organization.

Course records remain content-shell records. A published `NATIVE_VIDEO` or `SCORM_1_2` course can be listed, assigned, or enrolled in, but the actual learning content is wired in later slices.

## Catalog Rules

All catalog records are tenant-owned. Every category, tag, course, tag link, and assignment query must include `organizationId`.

Category and tag slugs:

- Required.
- Lowercase.
- URL-safe: lowercase letters, numbers, and hyphens.
- Unique per organization.

Course slugs follow the same shape and are unique per organization.

Course creation requires:

- Organization id.
- Title.
- Slug.
- Type: `NATIVE_VIDEO` or `SCORM_1_2`.
- Status, defaulting to `DRAFT`.
- Expected duration minutes.
- Estimated completion business days.
- Optional category.
- Optional tags.

Validation rules:

- Title is required.
- Slug is required and URL-safe.
- Expected duration must be positive.
- Estimated completion business days must be zero or positive.
- Category and tags must belong to the same organization as the course.

## Lifecycle Rules

The lifecycle remains:

```text
Draft -> Published -> Deprecated -> Retired
```

Allowed behavior:

- `DRAFT`: editable, hidden from learners, not assignable, not enrollable.
- `PUBLISHED`: editable, visible, assignable, and enrollable when organization policy permits.
- `DEPRECATED`: editable and visible to already-assigned learners, but blocked for new assignments and self-enrollment.
- `RETIRED`: not assignable, not enrollable, not launchable in later slices. Historical assignments remain.

This slice allows direct course edits. It does not add version history.

## Assignment Rules

Admins can assign a published course to any active learner in their organization.

Managers can assign a published course only to active direct reports in the same organization.

Learners can self-enroll only when:

- Organization `enrollmentPolicy` is `ASSIGNMENT_AND_SELF_ENROLLMENT`.
- Course status is `PUBLISHED`.
- Course organization matches learner membership organization.
- Learner membership is active.
- The learner does not already have the course assigned.

Assignment due date:

```text
dueDate = startDate + course.estimatedCompletionBusinessDays
```

The existing business-day helper skips weekends. Holidays remain future scope.

Assignment creation should be idempotency-safe:

- If the same learner already has the same course assigned in the organization, return a clear duplicate-assignment error before writing.
- The database should also enforce this uniqueness.

## Authorization

This slice reuses the existing `MembershipAuthContext` and active-membership rules.

New permission helpers:

- `canManageCatalog(context, organizationId)`: platform owner or active organization admin.
- `canAssignCourse(context, learnerMembership)`: platform owner, active organization admin, or active manager for that learner.
- `canSelfEnroll(context, learnerMembership)`: learner can self-enroll only for their own active membership.

These helpers must stay pure and unit-tested. Repository-backed services should call these helpers rather than duplicating role logic.

## Related Courses

Related courses are calculated inside one organization.

Rules:

- Only `PUBLISHED` courses are returned.
- The source course is excluded.
- Already completed-course exclusion is future scope because progress/completion is not implemented yet.
- Same category ranks higher than tag overlap.
- More shared tags rank higher within the same category rank.
- Results are stable by title after score.

This keeps the MVP recommendation rule simple and deterministic.

## Pages

This slice adds thin pages with non-destructive forms and tables:

- `/org/[slug]/admin/catalog`: category/tag/course management shell.
- `/org/[slug]/admin/courses/[courseSlug]`: course metadata/lifecycle shell.
- `/org/[slug]/admin/assignments`: assignment shell for admins/managers.
- `/org/[slug]/learn`: learner course catalog and assigned courses shell.

The pages should be build-clean and expose the expected controls. They do not need server actions yet unless the implementation plan explicitly wires a repository-backed action for a narrow service.

## Testing

Unit tests cover:

- Slug and catalog input validation.
- Course lifecycle assign/enroll gates.
- Assignment due-date calculation.
- Admin, manager, and learner permission decisions.
- Duplicate assignment prevention contract.
- Related-course ranking.
- Tenant scoping for catalog query helpers.

Verification commands:

```powershell
npm run test
npm run lint
npx prisma validate
npx tsc --noEmit --incremental false
npm run build
```

## Implementation Notes

Prefer small domain modules under:

- `src/modules/catalog`
- `src/modules/assignments`

Keep pages thin under `src/app/org/[slug]`. Business rules belong in modules, not page components.

If a service performs multiple writes, its repository contract must make transaction scope explicit, following the user-import service pattern.
