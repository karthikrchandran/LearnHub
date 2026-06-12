# Live vs Placeholder Capabilities

Date: 2026-06-12

## Live Contracts

- Tenant model, organization routes, memberships, roles, invitations, reset tokens, and credentials auth.
- Course catalog, lifecycle gates, assignment creation, learner self-enrollment, and related-course matching services.
- Native video lesson, module, chapter, transcript, transcript search, runtime launch, and progress commit services.
- SCORM 1.2 package metadata, registration launch, CMI commit, progress calculation, and package/runtime repository contracts.
- Progress events, assignment progress, certificate issuance, and provider failure tolerance.
- Browser runtime endpoints for native video launch/progress and SCORM launch/commit.
- Admin native video content forms for lesson metadata, chapter replacement, and transcript replacement.
- Admin SCORM package metadata form with separate zip `storageKey` and runtime `contentRootKey`.
- Learner native video browser player client with lesson, chapter, transcript, and progress-save wiring.
- Learner SCORM iframe host with a minimal SCORM 1.2 JavaScript API bridge.
- Local development SCORM content route constrained to the project-local `.learnhub/scorm` content root.
- Progress reporting pages and CSV export foundations.
- Prisma schema, migrations, seed data, focused service tests, adapter query-shape tests, page-shell tests, lint, typecheck, and build gates.

## Remaining UI Gaps

- Audit log browsing is still a lightweight future UI, although audit records are written by services.
- Report dashboards are intentionally simple; charting, PDF export, and scheduled delivery remain outside the current wave.
- The admin media UI records metadata and local runtime contracts; it is not a production Mux/R2 upload console.

## Deferred Production Capabilities

- Video provider upload/transcoding workflow.
- SCORM zip extraction worker, manifest parsing, and storage-object publication.
- Signed URL or equivalent protected media delivery.
- Cloud storage adapters for production SCORM content and media files.
- Rich report exports, scheduled report emails, and audit-log filtering.
- Notification jobs for assignments, reminders, escalations, and certificates.
- Storage malware scanning, manifest validation hardening, and operational retention policies.

## References

- `docs/superpowers/audits/2026-06-11-completed-slices-standards-audit.md`
- `docs/superpowers/adrs/2026-06-11-progress-consistency-model.md`
- `docs/superpowers/adrs/2026-06-11-media-storage-runtime-boundary.md`
