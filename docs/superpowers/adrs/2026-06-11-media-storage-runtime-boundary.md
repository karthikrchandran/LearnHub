# ADR: Media Storage Runtime Boundary

Date: 2026-06-11
Status: Accepted

## Context

LearnHub supports native video and SCORM 1.2 course contracts before full production storage and player integrations are wired.

Native video will eventually depend on provider-backed media storage, playback URLs, transcripts, and chapter metadata. SCORM upload stores a package zip, but live launch needs a servable extracted content root.

## Decision

Keep upload storage and runtime serving fields distinct.

For native video:

- `VideoLesson.playbackUrl` is the runtime playback URL used by the learner player.
- `VideoLesson.providerAssetId` stores provider identity when a video provider is wired.
- Chapters and uploaded transcript cues are stored in LearnHub tables and are not inferred from provider metadata in the MVP.

For SCORM 1.2:

- `ScormPackage.storageKey` is the uploaded zip object key.
- `ScormPackage.contentRootKey` is the extracted content root used for launch URLs.
- `ScormPackage.launchPath` is a relative path within `contentRootKey`.
- Launch URLs are built from `/scorm/{contentRootKey}/{launchPath}`.

## Security Notes

- SCORM extracted content must be served from a constrained content root, never by appending paths to the uploaded zip object.
- SCORM launch paths must remain relative and reject parent-directory traversal.
- Future extraction workers must validate manifests and write only under the package content root.
- Future signed URL support should keep admin upload access separate from learner runtime access.

## Validation

Run these checks after changes touching media or SCORM storage:

```powershell
npx vitest run src/modules/scorm/scorm-package-service.test.ts src/modules/scorm/scorm-runtime.test.ts src/modules/scorm/prisma-repository.test.ts
npx prisma validate
npm run build
```
