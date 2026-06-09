# Users, Auth, And Tenant Admin Design

Date: 2026-06-09

## Purpose

This slice turns the LearnHub foundation into a usable commercial LMS administration baseline. It adds invitation-only authentication, organization-scoped user administration, platform-owner tenant provisioning, CSV user import, and the first authorization rules needed before course catalog and assignment work.

The slice intentionally stops before full course authoring, video, SCORM, reporting, certificates, and notification scheduling. It builds the user and tenant control plane those features will depend on.

## Scope

In scope:

- Email/password authentication for already-created users.
- Invitation activation tokens for imported/invited users.
- Password reset tokens for existing users.
- Platform-owner organization provisioning.
- Organization branding fields: logo URL, primary color, accent color.
- Organization allowed email domains.
- Organization enrollment policy and global library access flag.
- CSV user import validation and commit service.
- Organization-scoped roles: admin, manager, learner.
- Manager-to-direct-report relationship through organization memberships.
- Permission helpers for platform owner, organization admin, manager, and learner visibility.
- Basic pages for login, password reset, invite activation, platform organization setup, and organization user import.

Out of scope:

- Public self-signup.
- Social login.
- SSO or directory sync.
- Email delivery scheduling beyond provider-backed invite/reset message creation.
- File upload transport for logos. This slice accepts a `logoUrl`; storage-backed uploads are a later provider integration.
- Course assignment, progress, reminders, escalations, reports, and catalog authoring.

## User Model

`User` remains the identity record and is globally unique by email. A user can belong to one or more organizations through `OrganizationMembership`.

`OrganizationMembership` remains the authorization boundary for tenant work:

- Roles are organization-scoped.
- Manager relationships point to another membership in the same organization.
- Managers can act only on direct reports.
- Organization admins can manage users in their own organization.
- Platform owners can create and manage organizations across the platform.

Invitation and reset tokens are separate records so auth flows can be audited, expire cleanly, and avoid storing raw token values.

## Tenant Rules

Every organization can define allowed email domains, for example `acme.test` or `acme.com`. CSV import and invitations reject users outside those domains.

Platform owners can create organizations with:

- Name.
- Slug.
- Allowed email domains.
- Logo URL.
- Primary color.
- Accent color.
- Enrollment policy.
- Global library enabled flag.

Tenant-specific catalogs remain the default. The global library flag only records whether the tenant can copy global courses later.

## Auth Flows

### Login

The login flow uses credentials only:

1. User enters email and password.
2. The auth service normalizes the email.
3. The user must exist and be `ACTIVE`.
4. The user must have a password hash.
5. The password hash must verify.

Invited users without activated passwords cannot log in.

### Invitation Activation

CSV import can create invited users and invitation tokens.

Activation flow:

1. User opens invite token.
2. Token must exist, be unused, and not expired.
3. User sets a password that satisfies the password helper rules.
4. User and membership status are set to `ACTIVE`.
5. Token is marked used.

### Password Reset

Password reset flow:

1. Existing user requests reset by email.
2. Service creates an expiring reset token.
3. User submits token and new password.
4. Token must exist, be unused, and not expired.
5. Password hash is updated and token is marked used.

The request endpoint should not reveal whether an email exists.

## CSV Import

MVP import columns:

```text
email, firstName, lastName, role, managerEmail, employeeId, department, title, status
```

Validation rules:

- Email is required and normalized to lowercase.
- Email domain must match the organization's allowed domains.
- First name and last name are required.
- Role must be `ADMIN`, `MANAGER`, or `LEARNER`.
- Status must be `INVITED`, `ACTIVE`, or `INACTIVE`; blank defaults to `INVITED`.
- Manager email is optional.
- If manager email is present, the manager must appear in the import batch or already exist in the organization.
- A row cannot assign itself as manager.
- Duplicate emails in the same CSV are rejected before commit.

Commit behavior:

- Create or update `User`.
- Create or update organization membership.
- Apply manager relationship after manager memberships are known.
- Create invitation tokens for invited users.
- Record a lightweight audit log.

## Authorization

Permission helpers provide reusable decisions for future pages and APIs:

- Platform owner can manage any organization.
- Organization admin can manage users in their own organization.
- Manager can view and assign only direct reports.
- Learner can view only self-scoped learning data.

This slice exposes these decisions as pure functions with unit tests first. Future route handlers and server actions must call these helpers rather than duplicate role checks.

## Pages

This slice adds thin, production-shaped pages:

- `/login`: credentials login shell.
- `/invite/[token]`: invitation activation shell.
- `/reset-password`: password reset request shell.
- `/reset-password/[token]`: password reset completion shell.
- `/platform/organizations/new`: platform-owner organization provisioning shell.
- `/org/[slug]/admin/users`: organization admin CSV import shell.

The pages are not full workflow-complete UI yet. They should be readable, build cleanly, and expose the fields required by the domain services so the next slice can wire server actions and richer validation UI.

## Testing

Unit tests cover:

- Email normalization and domain checks.
- Permission decisions.
- Invitation token hashing and expiration behavior.
- Password reset token behavior.
- Organization provisioning validation.
- CSV import parse/validate behavior.
- CSV import commit behavior using a mockable repository boundary where practical.

Verification commands:

```powershell
npm run test
npm run lint
npx prisma validate
npm run build
```

## Implementation Notes

This project uses Prisma 7 with the PostgreSQL adapter. Any new Prisma models must be represented in `prisma/schema.prisma` and in a migration SQL file under `prisma/migrations`.

The implementation should keep business rules in `src/modules/**` and keep app pages thin. This avoids spreading tenant authorization and CSV import logic across UI code.
