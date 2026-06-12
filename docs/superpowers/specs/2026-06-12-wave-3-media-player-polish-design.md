# Wave 3 Media Player Polish Design

## Summary

Wave 3 is the final wave in the current live-workflow contract. It turns the remaining media/player placeholders into live, service-backed browser workflows while keeping production cloud provider integrations as explicit post-wave hardening.

Wave 3 is not the final LearnHub product scope. It completes the current live contract around admin media authoring, learner player surfaces, local SCORM hosting foundations, and documentation cleanup.

## Goals

- Replace disabled native video admin controls with server-action-backed forms for lesson metadata, chapters, and transcript text.
- Replace disabled SCORM admin controls with a metadata upload form that creates or replaces the active SCORM package record.
- Replace learner video placeholder controls with a browser client that launches runtime data, shows the current lesson, renders chapters/transcript cues, and posts progress.
- Replace the SCORM learner placeholder with a browser client that launches a package in an iframe and exposes a minimal SCORM 1.2 JavaScript API bridge that commits allowed CMI values.
- Add local SCORM content serving foundations that constrain served files to the package content root.
- Update the live-vs-placeholder note so it reflects Wave 2 and Wave 3 accurately.

## Non-Goals

- Mux upload creation, processing webhooks, transcoding callbacks, or provider-backed playback readiness.
- Cloudflare R2 signed upload/read URLs.
- Malware scanning, retention policy jobs, or enterprise storage lifecycle automation.
- Full SCORM ZIP extraction, imsmanifest parsing, multi-SCO sequencing, or SCORM 2004.
- PDF report exports, scheduled email reports, charting dashboards, or analytics warehouse work.
- Notification jobs and audit-log browsing beyond records already created by existing services.

## Current State

Wave 2 made runtime endpoint and reporting contracts live:

- Video launch and progress endpoints exist under `/api/org/[slug]/assignments/[assignmentId]/video`.
- SCORM launch and commit endpoints exist under `/api/org/[slug]/assignments/[assignmentId]/scorm`.
- Runtime authorization, atomic progress writes, and progress reports are already merged to `main`.

Remaining Wave 3 surfaces are shells:

- `src/app/org/[slug]/admin/courses/[courseSlug]/content/page.tsx` renders disabled native video authoring controls.
- `src/app/org/[slug]/admin/courses/[courseSlug]/scorm/page.tsx` renders disabled SCORM package controls.
- `src/app/org/[slug]/learn/[courseSlug]/page.tsx` exposes video endpoint paths but renders disabled player controls.
- `src/app/org/[slug]/learn/[courseSlug]/scorm/page.tsx` exposes SCORM endpoint paths but renders a placeholder player.

## Architecture

Wave 3 follows the existing modular monolith pattern:

- Server pages stay thin. They authorize the actor, load route-scoped IDs, and render forms or client components.
- Domain behavior stays in `src/modules/video`, `src/modules/scorm`, and `src/modules/runtime`.
- Prisma repositories remain transaction-aware and are reused instead of adding page-local writes.
- Browser clients call the Wave 2 endpoint contracts; they do not write progress or SCORM state directly.
- Local SCORM file serving stays under package `contentRootKey` and rejects traversal paths.

## Admin Media Authoring

Native video admin content uses existing service contracts:

- A lesson form creates lessons with title, slug, duration, sort order, required flag, playback URL, optional provider asset ID, and transcript language.
- A chapter form replaces chapters for a selected lesson using the existing `replaceVideoChapters` service.
- A transcript form replaces transcript cues for a selected lesson using existing transcript parsing.
- Forms return concise success or error messages and keep the page server-rendered.

SCORM admin package authoring uses existing package semantics:

- The form accepts original file name, content type, byte size, launch path, and optional manifest title.
- `storageKey` remains the uploaded zip object key.
- `contentRootKey` remains the extracted content root used for runtime launch URLs.
- The page displays the active package metadata after upload.

## Learner Video Player

The video player client:

- Fetches launch data from the existing video launch endpoint.
- Selects the current lesson from the server response.
- Renders the video element when `playbackUrl` exists.
- Shows a clear unavailable-media state when only metadata exists.
- Renders lessons, chapters, transcript cues, current progress, and completion state.
- Posts progress to the existing video progress endpoint on manual progress events and video time updates.

The client must tolerate courses with no lessons or missing playback URLs without crashing.

## SCORM Player And API Bridge

The SCORM player client:

- Fetches launch data from the existing SCORM launch endpoint.
- Loads `launchUrl` into an iframe.
- Exposes `window.API` with the minimal SCORM 1.2 methods needed by MVP packages:
  - `LMSInitialize`
  - `LMSFinish`
  - `LMSGetValue`
  - `LMSSetValue`
  - `LMSCommit`
  - `LMSGetLastError`
  - `LMSGetErrorString`
  - `LMSGetDiagnostic`
- Stores CMI values in memory during the launch session.
- Commits allowed CMI values to the existing SCORM commit endpoint.
- Displays lesson status, score, launch count, and commit result.

The bridge intentionally supports only the server-allowed CMI keys. Unsupported writes should fail with a SCORM error code but must not break the page.

## Local SCORM Content Serving

Wave 3 adds a constrained local serving foundation:

- Runtime launch URLs remain `/scorm/{contentRootKey}/{launchPath}`.
- A route handler serves files under the project-local `.learnhub/scorm` content directory for development.
- The route rejects absolute paths, `..`, missing content roots, and directory paths.
- The local route returns `404` when content is not present rather than pretending extraction succeeded.

This creates the routing boundary that a future ZIP extraction worker and object storage adapter can target without changing learner launch contracts.

## Error Handling

- Admin forms return user-readable error messages from existing domain validation.
- Player launch failures show a retryable error state.
- Video progress post failures leave the player usable and show a small failure message.
- SCORM commit failures preserve the in-memory session data and show a commit error.
- Content-serving traversal attempts return `400`; missing files return `404`.

## Testing

Tests cover:

- Admin video actions call the existing services with parsed form values.
- Admin SCORM actions create package metadata with separate `storageKey` and `contentRootKey`.
- Video learner page includes the client component and live endpoint wiring without disabled placeholder controls.
- Video player client renders launch data and posts progress using endpoint contracts.
- SCORM learner page includes the client component and live endpoint wiring without disabled placeholder controls.
- SCORM API bridge stores allowed CMI values, rejects unsupported writes, and commits to the endpoint.
- Local SCORM serving rejects traversal and serves only files under the project-local `.learnhub/scorm` content root.
- Live-vs-placeholder documentation no longer claims Wave 2 endpoints or Wave 3 player surfaces are missing after implementation.

## Completion Criteria

- Wave 3 implementation is committed on a feature branch.
- `npm run test`, `npm run lint`, `npx prisma validate`, `npm run prisma:generate`, `npx tsc --noEmit --incremental false`, and `npm run build` pass sequentially.
- The feature branch is merged back to `main` locally after verification.
- Remaining work is clearly limited to post-wave production hardening such as Mux, R2, malware scanning, extraction workers, notification jobs, and deeper reporting exports.
