# Certificates, Credentials, And Operations Implementation Plan

## Scope
- Harden certificate issuance so certificates preserve the learner, course, issuer, verification, and branding data needed for stable public verification and download artifacts.
- Add learner wallet, public share/download helpers, admin certificate inspection, and admin credential retry operations.
- Add a Credly credential provider adapter and credential-operation service that retries failed issuance without creating duplicate certificates.

## Schema
- Add course-level credential mapping fields for provider and template id.
- Add certificate-level issuer branding fields and optional generated artifact metadata.
- Add credential issuance update metadata and a tenant-scoped uniqueness guarantee per certificate and provider.

## Implementation
1. Add migration and Prisma schema updates.
2. Extend certificate issuance repository selection and creation inputs.
3. Add certificate renderer and share-link helpers.
4. Add Credly provider adapter.
5. Add credential operations service and Prisma-backed admin pages/actions.
6. Scope learner certificate wallet to the current learner membership.
7. Update public certificate verification and add download route.

## Verification
Run the focused Task 6 tests first, then:

```powershell
npm run lint
npx prisma validate
npm run prisma:generate
npx tsc --noEmit --incremental false
npm run build
```
