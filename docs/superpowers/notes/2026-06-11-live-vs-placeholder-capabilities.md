# Live vs Placeholder Capabilities

Date: 2026-06-11

## Live Contracts

- Tenant model, organization routes, memberships, roles, invitations, reset tokens, and credentials auth.
- Course catalog, lifecycle gates, assignment creation, learner self-enrollment, and related-course matching services.
- Native video lesson, module, chapter, transcript, transcript search, runtime launch, and progress commit services.
- SCORM 1.2 package metadata, registration launch, CMI commit, progress calculation, and package/runtime repository contracts.
- Progress events, assignment progress, certificate issuance, and provider failure tolerance.
- Prisma schema, migrations, seed data, focused service tests, adapter query-shape tests, page-shell tests, lint, typecheck, and build gates.

## Placeholder UI Shells

- Learner video page shells do not yet contain a production browser video player.
- SCORM learner page shells do not yet contain the SCORM JavaScript API bridge or iframe launch host.
- Admin catalog/content/upload pages are present as shells and service-backed foundations, not full production workflows.
- Reporting dashboards and audit log browsers are not yet wired as live user-facing pages.

## Deferred Production Capabilities

- Video provider upload/transcoding workflow.
- SCORM zip extraction worker and content serving middleware.
- Signed URL or equivalent protected media delivery.
- Route handlers/server actions for live player commits and SCORM API calls.
- Admin upload UI, progress reporting UI, report exports, and audit-log filtering.
- Storage malware scanning, manifest validation hardening, and operational retention policies.

## References

- `docs/superpowers/audits/2026-06-11-completed-slices-standards-audit.md`
- `docs/superpowers/adrs/2026-06-11-progress-consistency-model.md`
- `docs/superpowers/adrs/2026-06-11-media-storage-runtime-boundary.md`
