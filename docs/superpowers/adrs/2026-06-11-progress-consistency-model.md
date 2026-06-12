# ADR: Progress Consistency Model

Date: 2026-06-11
Status: Accepted

## Context

LearnHub records learner runtime state in content-specific tables and also records normalized learning progress events for reports, certificates, and manager views.

Runtime tables include:

- `VideoLessonProgress`
- `ScormRegistration`

Normalized progress tables include:

- `LearningProgressEvent`
- `AssignmentProgress`
- `CourseAssignment.status`

The standards audit found that native video and SCORM commits could update runtime state before normalized progress. If the second write failed, reports and certificates could drift from the player state.

## Decision

Runtime commit operations use content-specific runtime state as the interaction record and normalized progress as the reporting record. A commit is valid only when both records are persisted in one unit of work.

For native video:

- `VideoLessonProgress`, `LearningProgressEvent`, `AssignmentProgress`, and `CourseAssignment.status` are written in one repository transaction.
- Lesson progress keeps the highest watched second and latest position for the assignment and lesson.
- Required lesson completion determines native course progress.

For SCORM 1.2:

- `ScormRegistration`, `LearningProgressEvent`, `AssignmentProgress`, and `CourseAssignment.status` are written in one repository transaction.
- `cmi.core.session_time` is treated as the current launch session value.
- `cmi.core.total_time` is LMS-derived and not accepted from content commits.
- Repeated session-time commits in the same launch replace the current session contribution instead of being repeatedly added.

## Consequences

- Progress reports cannot observe a committed runtime state without a matching normalized progress event.
- Runtime commit services depend on repositories that support both runtime persistence and progress persistence through the same active transaction client.
- Future live route handlers must use the runtime service/repository path rather than writing player state or progress state directly.

## Validation

Run these checks after changes touching runtime commits:

```powershell
npx vitest run src/modules/video/video-runtime.test.ts src/modules/scorm/scorm-runtime.test.ts src/modules/video/prisma-repository.test.ts src/modules/scorm/prisma-repository.test.ts
npm run test
npx prisma validate
npx tsc --noEmit --incremental false
```
