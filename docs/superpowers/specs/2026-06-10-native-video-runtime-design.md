# Native Video Runtime Design

Date: 2026-06-10

## Purpose

This slice turns `NATIVE_VIDEO` course shells into usable learning content. It adds video lessons, optional module grouping, uploaded transcripts, admin-defined chapters, learner resume state, transcript search, and native progress events that feed the existing assignment progress and certificate foundation.

The slice intentionally does not implement real file upload/transcoding yet. It stores a provider asset id or video URL so Cloudflare R2 and Mux can be wired in the provider slice without changing the learning domain model.

## Scope

In scope:

- Organization-scoped modules for native video courses.
- Organization-scoped video lessons under a course, optionally attached to a module.
- Lesson ordering for both single-video courses and multi-module courses.
- Lesson video metadata: title, slug, duration seconds, provider asset id, playback URL, transcript text, transcript language.
- Admin-defined chapter/segment rows with start and end seconds.
- Transcript cue parsing from uploaded plain text in a simple timestamp format.
- Learner resume state per assignment and lesson.
- Watched-second tracking per assignment and lesson.
- Native course progress percentage from required lesson completion.
- Transcript search returning matching snippets and jump timestamps.
- Thin learner player page and admin content page shells.

Out of scope:

- Browser video player JavaScript controls.
- Real upload UI, multipart handling, R2 object writes, Mux asset creation, or transcoding callbacks.
- Auto-generated transcripts.
- Knowledge-check authoring inside video.
- SCORM upload or runtime.
- Reports, recommendations, notification jobs, and certificate UI changes.

## Domain Model

New models:

- `CourseModule`: optional grouping inside a course.
- `VideoLesson`: a playable native video lesson.
- `VideoChapter`: admin-defined segments inside a video lesson.
- `VideoTranscriptCue`: timestamped transcript cues for search and click-to-jump.
- `VideoLessonProgress`: learner state for one assignment and lesson.

Course support:

- A course may have no modules and one or more ordered lessons.
- A course may have modules, each with ordered lessons.
- Lessons can be marked required. MVP treats all lessons as required by default.

Tenant safety:

- Every model includes `organizationId`.
- Every query must include `organizationId`.
- Child rows use composite references where practical so a lesson, chapter, transcript cue, and progress row cannot cross tenant boundaries.

## Video Lesson Rules

Lesson creation requires:

- Organization id.
- Course id.
- Title.
- Slug unique per organization and course.
- Duration seconds greater than zero.
- Playback URL or provider asset id.
- Sort order greater than or equal to zero.

Lesson validation:

- Only `NATIVE_VIDEO` courses can receive video lessons.
- Course must belong to the same organization.
- Module, if provided, must belong to the same course and organization.
- Chapter ranges must stay within lesson duration.
- Transcript cue ranges must stay within lesson duration.

## Transcript Format

For MVP, uploaded transcript text is parsed into cues using this plain-text format:

```text
[00:00] Welcome to the course.
[00:20] This section covers coaching goals.
[01:15 - 01:45] Here is a longer segment.
```

Rules:

- Timestamps support `MM:SS` and `HH:MM:SS`.
- End timestamps are optional.
- Cue text must be non-empty.
- Cues are stored with `startSecond`, nullable `endSecond`, and `text`.
- Bad lines return validation errors; they are not silently ignored.

## Learner Runtime

Learner launch requires:

- Active assignment in the same organization.
- Course type `NATIVE_VIDEO`.
- Course status not `RETIRED`.
- Lesson belongs to the assignment course.

Runtime read model returns:

- Course and assignment summary.
- Module list.
- Lesson list.
- Current lesson metadata.
- Chapters.
- Transcript cues.
- Existing progress for the current lesson.

Progress recording:

- Each event records `lastPositionSecond`, `maxWatchedSecond`, and `completed`.
- Position and watched seconds are clamped to the lesson duration.
- A lesson is complete when `maxWatchedSecond >= durationSeconds`.
- Course progress percentage is calculated from required lesson completions.
- When course progress reaches 100 percent, the existing progress service receives a native `COMPLETED` event.
- Otherwise the existing progress service receives a native `PROGRESS` event with the calculated percentage.

## Search

Transcript search is deterministic and local:

- Search is scoped to one organization and course.
- Query text is normalized to lowercase words.
- Results match cues whose text contains all query words.
- Results include lesson id, lesson title, cue start second, cue end second, and a short snippet.
- Results are sorted by lesson sort order, then cue start second.

## Pages

This slice adds thin pages:

- `/org/[slug]/admin/courses/[courseSlug]/content`: native video content authoring shell.
- `/org/[slug]/learn/[courseSlug]`: learner course player shell.

The pages are non-destructive shells. They expose the expected UI regions and route shape but do not implement upload or player client controls yet.

## Testing

Unit tests cover:

- Transcript parsing.
- Lesson/chapter validation.
- Course progress calculation.
- Runtime launch read model.
- Transcript search.
- Prisma repository query shapes where useful.
- Page shell smoke checks.

Verification commands:

```powershell
npm run test
npm run lint
npx prisma validate
npx tsc --noEmit --incremental false
npm run build
```

## Implementation Notes

Keep business logic in `src/modules/video`. Use repository contracts with fake repositories in tests, matching existing catalog, assignment, progress, and certificate modules.

The runtime service should call the existing `recordLearningEvent` boundary rather than duplicating assignment progress writes. This keeps completion and certificate behavior centralized for future video and SCORM slices.
