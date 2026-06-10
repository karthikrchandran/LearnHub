# SCORM 1.2 Runtime Design

## Scope

Build LearnHub's MVP SCORM 1.2 foundation for commercial LMS use:

- Admins can register a SCORM 1.2 package against a `SCORM_1_2` course.
- Learners can launch the package for an assigned course.
- LearnHub stores SCORM 1.2 runtime state by assignment.
- LearnHub calculates and displays approximate course progress from SCORM runtime data.
- Completion is driven by SCORM 1.2 `cmi.core.lesson_status` values.

This slice does not implement full ZIP extraction, CDN upload, a browser SCORM API adapter, or multi-SCO sequencing. It creates the durable server-side contracts these later pieces will call.

## Domain Model

`ScormPackage`

- Tenant-scoped package metadata for one course.
- Stores original file name, content type, byte size, storage key, launch path, manifest title, and upload actor.
- One active package per course for MVP.

`ScormRegistration`

- Tenant-scoped runtime state for one learner assignment.
- Stores SCORM 1.2 CMI JSON, launch count, lesson status, score, session time, total time, and last launched/committed timestamps.
- Unique by `(organizationId, assignmentId)`.

## Progress Rules

Completion:

- `completed` and `passed` produce final completion events.
- `failed`, `incomplete`, `browsed`, and `not attempted` do not complete.

Approximate percent:

- `passed` or `completed`: 100.
- `failed`: use score if present, capped at 95.
- `incomplete` with score: use score, capped at 95.
- `incomplete` without score but launch/commit activity: 50.
- `browsed`: 25.
- `not attempted`: 0.

The existing progress module already caps SCORM `PROGRESS` events at 95 until `COMPLETED` or `PASSED`, so this design feeds that boundary instead of duplicating assignment-status logic.

## Upload Boundary

For MVP, the package service validates upload metadata and produces a storage key/launch path. The actual binary storage provider can later write to Cloudflare R2, local disk, or another object store behind the same contract.

Validation:

- File name must end in `.zip`.
- Content type must be `application/zip`, `application/x-zip-compressed`, or `application/octet-stream`.
- Size must be positive.
- Size limit is 512 MB for MVP.
- Launch path must be relative and cannot contain `..`.
- Course must be `SCORM_1_2`.

## Runtime Boundary

The runtime service exposes:

- `launchScormRegistration`: validates assignment and package, increments launch count, returns launch URL/state.
- `commitScormRuntime`: accepts SCORM 1.2 CMI values, merges state, calculates progress, stores registration state, and records a `SCORM` learning event.

## Security And Tenancy

- Every query includes `organizationId`.
- Package upload requires org admin guard.
- Runtime launch requires org member guard plus assignment ownership when route-level data access is wired.
- Launch paths must remain relative to the package root.
- Runtime commits accept only known CMI keys for MVP and store the raw merged CMI payload for reporting/debugging.

## Future Extensions

- Real ZIP extraction and imsmanifest.xml parsing.
- Multiple SCO support.
- Browser SCORM API JavaScript bridge.
- xAPI support.
- Package version history.
- Virus scanning and content security policy tightening for hosted SCORM frames.
