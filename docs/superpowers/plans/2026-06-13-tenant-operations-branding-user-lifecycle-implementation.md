# Tenant Operations Branding And User Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the first post-Wave-3 LearnHub operations slice by making tenant settings editable, applying organization branding, replacing static dashboard shells with live metrics, and adding searchable user lifecycle management.

**Architecture:** Keep write rules in focused domain modules under `src/modules/organizations` and `src/modules/users`, with Prisma access isolated behind repository methods and route-local server actions. Extend the existing App Router pages instead of creating parallel admin shells, and record every settings or membership write with audit metadata containing previous and next values.

**Tech Stack:** Next.js App Router, TypeScript, Prisma 7 with PostgreSQL, NextAuth server guards, Vitest, React server actions, Tailwind CSS.

---

## Scope Boundary

This plan implements tenant operations, branding policy, live dashboard counts, admin user search, and user lifecycle writes. It does not add billing, custom domains, SSO, directory sync, file upload storage for logos, advanced reporting exports, email delivery providers beyond the existing invite/reset link services, or new course runtime behavior.

Current repo facts this plan builds on:

- `Organization` already has `name`, `slug`, `logoUrl`, `primaryColor`, `accentColor`, `allowedEmailDomains`, `enrollmentPolicy`, and `globalLibraryEnabled`.
- `OrganizationMembership` already has `roles`, `managerMembershipId`, `employeeId`, `department`, `title`, and `status`.
- `User.status` and `OrganizationMembership.status` already use `INVITED`, `ACTIVE`, and `INACTIVE`.
- `PasswordResetToken` already exists and must be extended for admin-issued resets that activate invited memberships.
- `AuditLog.metadata` is JSON and can store `{ previous, next, changedFields }` without a new audit table.
- Existing user import code is split into pure service, Prisma repository, module server actions, route actions, page, and client form; this plan follows that pattern.
- Runtime launch permission already rejects inactive memberships through `canLaunchRuntimeAssignment`; this plan closes remaining login and admin lifecycle gaps.

## File Structure

Create or modify these files:

- Modify: `prisma/schema.prisma` - add `adminBrandingEnabled` to `Organization` and nullable activation organization/membership fields to `PasswordResetToken`.
- Create: `prisma/migrations/20260613010000_tenant_operations_user_lifecycle/migration.sql` - add the organization branding policy column and admin reset activation columns.
- Modify: `prisma/seed.ts` - seed Acme with admin branding enabled for demo coverage and preserve existing demo admin identity.
- Modify: `src/modules/organizations/provisioning.ts` - accept and persist the new branding policy during organization creation.
- Modify: `src/modules/organizations/prisma-repository.ts` - extend provisioning repository fields and add repository factories for settings/dashboard reads and writes.
- Modify: `src/modules/organizations/server-actions.ts` - add settings action creators beside the existing provisioning action creator.
- Create: `src/modules/organizations/settings.ts` - pure organization settings service with platform-owner settings edits, policy-gated org-admin branding edits, validation, and audit metadata construction.
- Create: `src/modules/organizations/settings.test.ts` - unit tests for settings permissions, changed-field diffs, color/domain validation, and audit metadata.
- Create: `src/modules/organizations/dashboard.ts` - pure dashboard metric mappers for platform and organization dashboards.
- Create: `src/modules/organizations/dashboard.test.ts` - tests for live counts including overdue, progress, and certificate metrics.
- Modify: `src/modules/users/prisma-repository.ts` - add search, lifecycle update, resend invitation, and password-reset repository methods while preserving existing import behavior.
- Modify: `src/modules/users/server-actions.ts` - add user search/lifecycle action creators and reuse import action shapes where practical.
- Create: `src/modules/users/lifecycle.ts` - pure service for role/profile/status changes, deactivation semantics, invitation resend, password reset issue, and audit metadata.
- Create: `src/modules/users/lifecycle.test.ts` - tests for allowed fields, deactivation, reset/invite eligibility, and audit previous/next values.
- Create: `src/modules/users/user-search.ts` - pure search input normalization and result mapping for organization admin filters.
- Create: `src/modules/users/user-search.test.ts` - tests for search, role, status, manager, and department filter normalization.
- Modify: `src/modules/auth/password-resets.ts` - support membership-bound reset tokens that activate invited users safely.
- Modify: `src/modules/auth/password-resets.test.ts` - test active-user reset and invited-membership activation reset completion.
- Modify: `src/modules/auth/prisma-repositories.ts` - persist activation organization/membership ids and complete bound resets transactionally.
- Modify: `src/lib/auth/guards.ts` - add a settings-admin guard that allows platform owners or active organization admins.
- Modify: `src/modules/auth/permissions.ts` - add `canManageOrganizationSettings` and `canManageOrganizationBranding` helpers.
- Modify: `src/lib/auth/next-auth.ts` - reject inactive users at login even if they have a password hash.
- Modify: `src/app/platform/page.tsx` - replace static zero cards with live platform metrics and link each organization to its settings page.
- Create: `src/app/platform/organizations/[slug]/page.tsx` - platform-owner organization settings page for name, branding, policy, allowed domains, enrollment, and global library.
- Create: `src/app/platform/organizations/[slug]/actions.ts` - route-local server action wiring for platform organization settings.
- Create: `src/app/platform/organizations/[slug]/organization-settings-form.tsx` - client form for platform owner settings edits.
- Modify: `src/app/platform/organizations/new/new-organization-form.tsx` - include the admin branding policy checkbox on create.
- Modify: `src/app/platform/organizations/new/actions.ts` - pass the new policy to provisioning.
- Modify: `src/app/org/[slug]/page.tsx` - load organization branding and live organization metrics; apply name, logo, primary color, and accent color in the workspace shell.
- Create: `src/app/org/[slug]/admin/settings/page.tsx` - org-admin branding settings page that renders editable or read-only controls based on platform policy.
- Create: `src/app/org/[slug]/admin/settings/actions.ts` - route-local server action wiring for org-admin branding edits.
- Create: `src/app/org/[slug]/admin/settings/branding-settings-form.tsx` - client form for policy-gated org branding.
- Modify: `src/app/org/[slug]/admin/users/page.tsx` - add search/filter controls, result table, and lifecycle action forms while retaining CSV import.
- Modify: `src/app/org/[slug]/admin/users/actions.ts` - add search query handling and lifecycle form actions.
- Create: `src/app/org/[slug]/admin/users/user-lifecycle-table.tsx` - client/server-safe table component for search results and row actions.

## Implementation Notes

Use these names consistently across tasks:

- New organization policy field: `adminBrandingEnabled Boolean @default(false)`.
- Platform settings action name: `updatePlatformOrganizationSettingsAction`.
- Org branding action name: `updateOrganizationBrandingAction`.
- User lifecycle action names: `updateUserLifecycleFormAction`, `resendInvitationFormAction`, `issuePasswordResetFormAction`.
- Audit action strings:
  - `organization.settings.updated`
  - `organization.branding.updated`
  - `organization.user.updated`
  - `organization.user.invitation_resent`
  - `organization.user.password_reset_issued`
- Audit metadata shape for settings and user writes:

```ts
{
  changedFields: string[];
  previous: Record<string, unknown>;
  next: Record<string, unknown>;
}
```

Validation rules:

- Organization name must be non-empty after trim.
- Organization colors must match `^#[0-9a-fA-F]{6}$`.
- Allowed domains are lowercased, trimmed, leading `@` removed, and validated with the existing provisioning domain rules.
- Platform owners can change all organization settings in this slice.
- Organization admins can change only `logoUrl`, `primaryColor`, and `accentColor`, and only when `adminBrandingEnabled` is true.
- User lifecycle updates can change `roles`, `managerMembershipId`, `department`, `title`, `employeeId`, and `status`.
- `managerMembershipId` must be null or an active manager/admin membership in the same organization, and it cannot equal the edited membership id.
- Invitation resend is allowed only for `INVITED` membership/user combinations.
- Password reset issue is allowed for `ACTIVE` and `INVITED` users; it is blocked for `INACTIVE` users.
- Admin-issued password reset for an `INVITED` membership stores the target organization and membership on the reset token.
- Completing a membership-bound reset sets `passwordHash`, `User.status = ACTIVE`, `OrganizationMembership.status = ACTIVE`, and `usedAt` in the same transaction.
- Completing an unbound reset is the normal active-user password reset and updates only `passwordHash` and token `usedAt`.

Status transition matrix:

| Starting state | Operation | Final state |
| --- | --- | --- |
| `User INVITED` + `Membership INVITED` | Invitation activation | `User ACTIVE` + `Membership ACTIVE` |
| `User INVITED` + `Membership INVITED` | Membership-bound password reset completion | `User ACTIVE` + `Membership ACTIVE` |
| `User ACTIVE` + `Membership ACTIVE` | Deactivate membership with no other active memberships | `User INACTIVE` + `Membership INACTIVE` |
| `User ACTIVE` + `Membership ACTIVE` | Deactivate membership with at least one other active membership | `User ACTIVE` + `Membership INACTIVE` |
| `User INACTIVE` + `Membership INACTIVE` + existing `passwordHash` | Reactivate membership | `User ACTIVE` + `Membership ACTIVE` |
| `User INACTIVE` + `Membership INACTIVE` + no `passwordHash` | Reactivate membership | `User INVITED` + `Membership INVITED`, then create or resend an invitation |

The lifecycle service must never create `Membership ACTIVE` with `User INVITED`.

## Task 1: Add Branding Policy And Admin Reset Schema

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260613010000_tenant_operations_user_lifecycle/migration.sql`
- Modify: `prisma/seed.ts`

- [ ] **Step 1: Add the organization policy and reset activation fields**

In `prisma/schema.prisma`, add this field to `model Organization` near the existing branding fields:

```prisma
adminBrandingEnabled Boolean                      @default(false)
```

In `model PasswordResetToken`, add these nullable fields and relations:

```prisma
activationOrganizationId String?
activationMembershipId   String?
activationOrganization   Organization?           @relation("PasswordResetActivationOrganization", fields: [activationOrganizationId], references: [id], onDelete: Cascade)
activationMembership     OrganizationMembership? @relation("PasswordResetActivationMembership", fields: [activationOrganizationId, activationMembershipId, userId], references: [organizationId, id, userId], onDelete: Cascade)
```

Add these opposite relation fields:

```prisma
// On Organization
passwordResetActivationTokens PasswordResetToken[] @relation("PasswordResetActivationOrganization")

// On OrganizationMembership
passwordResetActivationTokens PasswordResetToken[] @relation("PasswordResetActivationMembership")
```

Keep every new activation field nullable so existing active-user reset tokens remain valid.

- [ ] **Step 2: Create the migration SQL**

Create `prisma/migrations/20260613010000_tenant_operations_user_lifecycle/migration.sql`:

```sql
ALTER TABLE "Organization"
ADD COLUMN "adminBrandingEnabled" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "PasswordResetToken"
ADD COLUMN "activationOrganizationId" TEXT,
ADD COLUMN "activationMembershipId" TEXT;

CREATE INDEX "PasswordResetToken_activationOrganizationId_idx"
ON "PasswordResetToken"("activationOrganizationId");

CREATE INDEX "PasswordResetToken_activationOrganizationId_activationMembershipId_idx"
ON "PasswordResetToken"("activationOrganizationId", "activationMembershipId");

ALTER TABLE "PasswordResetToken"
ADD CONSTRAINT "PasswordResetToken_activationOrganizationId_fkey"
FOREIGN KEY ("activationOrganizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PasswordResetToken"
ADD CONSTRAINT "PasswordResetToken_activationOrganizationId_activationMembershipId_userId_fkey"
FOREIGN KEY ("activationOrganizationId", "activationMembershipId", "userId")
REFERENCES "OrganizationMembership"("organizationId", "id", "userId") ON DELETE CASCADE ON UPDATE CASCADE;
```

- [ ] **Step 3: Update demo seed policy**

In `prisma/seed.ts`, set Acme's organization `update` and `create` data to include:

```ts
adminBrandingEnabled: true,
```

Do not change `demoAdminEmail = "admin@example.com"` or the existing legacy admin cleanup.

- [ ] **Step 4: Validate schema**

Run:

```powershell
npx prisma validate
npm run prisma:generate
```

Expected: both commands exit `0`.

- [ ] **Step 5: Commit schema work**

Run:

```powershell
git add prisma/schema.prisma prisma/migrations/20260613010000_tenant_operations_user_lifecycle/migration.sql prisma/seed.ts
git commit -m "feat: add tenant branding and reset activation schema"
```

Expected: commit succeeds.

## Task 2: Extend Organization Provisioning

**Files:**
- Modify: `src/modules/organizations/provisioning.ts`
- Modify: `src/modules/organizations/provisioning.test.ts`
- Modify: `src/modules/organizations/prisma-repository.ts`
- Modify: `src/modules/organizations/server-actions.ts`
- Modify: `src/app/platform/organizations/new/new-organization-form.tsx`
- Modify: `src/app/platform/organizations/new/actions.ts`

- [ ] **Step 1: Add provisioning test coverage**

In `src/modules/organizations/provisioning.test.ts`, add a test that provisions an organization with `adminBrandingEnabled: true` and asserts the repository receives:

```ts
{
  adminBrandingEnabled: true,
}
```

Also assert the default form/action path sends `false` when the checkbox is absent.

- [ ] **Step 2: Update provisioning types and service**

In `src/modules/organizations/provisioning.ts`, add `adminBrandingEnabled: boolean` to `ProvisionOrganizationInput` and to the repository `createOrganization` data. Pass the value through unchanged after existing validation.

- [ ] **Step 3: Update Prisma repository**

In `src/modules/organizations/prisma-repository.ts`, ensure `createPrismaProvisionOrganizationRepository().createOrganization(data)` accepts and forwards `adminBrandingEnabled` in the `organization.create` call.

- [ ] **Step 4: Update provisioning server action**

In `src/modules/organizations/server-actions.ts`, read the checkbox from `FormData`:

```ts
adminBrandingEnabled: readFormString(formData, "adminBrandingEnabled") === "true",
```

- [ ] **Step 5: Update new organization form**

In `src/app/platform/organizations/new/new-organization-form.tsx`, add a checkbox named `adminBrandingEnabled` with value `true` near the existing global library checkbox. Label it `Allow organization admins to edit branding`.

- [ ] **Step 6: Run focused tests**

Run:

```powershell
npm run test -- src/modules/organizations/provisioning.test.ts
```

Expected: tests pass.

- [ ] **Step 7: Commit provisioning work**

Run:

```powershell
git add src/modules/organizations/provisioning.ts src/modules/organizations/provisioning.test.ts src/modules/organizations/prisma-repository.ts src/modules/organizations/server-actions.ts src/app/platform/organizations/new
git commit -m "feat: include branding policy in provisioning"
```

Expected: commit succeeds.

## Task 3: Add Organization Settings Service

**Files:**
- Create: `src/modules/organizations/settings.ts`
- Create: `src/modules/organizations/settings.test.ts`

- [ ] **Step 1: Write settings service tests**

Create tests covering these exact behaviors:

- Platform owner can change `name`, `allowedEmailDomains`, `logoUrl`, `primaryColor`, `accentColor`, `enrollmentPolicy`, `globalLibraryEnabled`, and `adminBrandingEnabled`.
- Organization admin can change `logoUrl`, `primaryColor`, and `accentColor` when `adminBrandingEnabled` is true.
- Organization admin receives `Organization admins cannot edit branding for this tenant` when the policy is false.
- Organization admin receives `Organization admins can only edit branding fields` when submitting non-branding fields.
- Invalid colors throw `Theme color must be a 6-digit hex color`.
- Audit metadata includes only changed fields and contains previous and next values.

- [ ] **Step 2: Implement service types**

Create `src/modules/organizations/settings.ts` exporting these core types:

```ts
export type OrganizationSettingsActor = {
  userId: string;
  isPlatformOwner: boolean;
  memberships: { id: string; organizationId: string; roles: ("ADMIN" | "MANAGER" | "LEARNER")[]; status: "INVITED" | "ACTIVE" | "INACTIVE" }[];
};

export type OrganizationSettingsSnapshot = {
  id: string;
  name: string;
  slug: string;
  allowedEmailDomains: string[];
  logoUrl: string | null;
  primaryColor: string;
  accentColor: string;
  enrollmentPolicy: "ASSIGNMENT_ONLY" | "ASSIGNMENT_AND_SELF_ENROLLMENT";
  globalLibraryEnabled: boolean;
  adminBrandingEnabled: boolean;
};

export type UpdateOrganizationSettingsInput = {
  actor: OrganizationSettingsActor;
  organizationId: string;
  changes: Partial<Omit<OrganizationSettingsSnapshot, "id" | "slug">>;
};
```

Repository methods:

```ts
findOrganizationSettings(organizationId: string): Promise<OrganizationSettingsSnapshot | null>;
updateOrganizationSettings(organizationId: string, data: Partial<Omit<OrganizationSettingsSnapshot, "id" | "slug">>): Promise<void>;
recordAuditLog(data: {
  organizationId: string;
  actorId: string;
  action: "organization.settings.updated" | "organization.branding.updated";
  targetId: string;
  metadata: { changedFields: string[]; previous: Record<string, unknown>; next: Record<string, unknown> };
}): Promise<void>;
```

- [ ] **Step 3: Implement update behavior**

Implement `updateOrganizationSettings(input, repository)` so it:

- Loads the current organization or throws `Organization was not found`.
- Validates the actor as platform owner or active org admin.
- Normalizes domains and colors.
- Rejects empty `name`.
- Builds a diff by comparing current values to normalized next values.
- Returns `{ updated: false, changedFields: [] }` without calling update or audit when nothing changed.
- Calls `updateOrganizationSettings` and `recordAuditLog` when at least one field changed.
- Uses `organization.settings.updated` for platform-owner writes and `organization.branding.updated` for org-admin branding writes.

- [ ] **Step 4: Run settings tests**

Run:

```powershell
npm run test -- src/modules/organizations/settings.test.ts
```

Expected: tests pass.

- [ ] **Step 5: Commit settings service**

Run:

```powershell
git add src/modules/organizations/settings.ts src/modules/organizations/settings.test.ts
git commit -m "feat: add organization settings rules"
```

Expected: commit succeeds.

## Task 4: Add Organization Dashboard Services

**Files:**
- Create: `src/modules/organizations/dashboard.ts`
- Create: `src/modules/organizations/dashboard.test.ts`
- Modify: `src/modules/organizations/prisma-repository.ts`

- [ ] **Step 1: Write dashboard tests**

Create `src/modules/organizations/dashboard.test.ts` with these test names and representative structure:

```ts
import { describe, expect, it, vi } from "vitest";

import {
  getOrganizationDashboardMetrics,
  getPlatformDashboardMetrics,
  type OrganizationDashboardRepository,
  type PlatformDashboardRepository,
} from "./dashboard";

describe("getPlatformDashboardMetrics", () => {
  it("returns live platform counts from repository aggregates", async () => {
    const repository: PlatformDashboardRepository = {
      countOrganizations: vi.fn(async () => 3),
      countMembershipsByStatus: vi.fn(async (status) => (status === "ACTIVE" ? 10 : 4)),
      countActiveAssignments: vi.fn(async () => 12),
      countCompletedAssignments: vi.fn(async () => 7),
      countCertificates: vi.fn(async () => 5),
    };

    await expect(getPlatformDashboardMetrics(repository)).resolves.toEqual({
      organizations: 3,
      activeUsers: 10,
      invitedUsers: 4,
      activeAssignments: 12,
      completedAssignments: 7,
      certificatesIssued: 5,
    });
  });
});

describe("getOrganizationDashboardMetrics", () => {
  it("returns organization assignment, progress, overdue, and certificate counts", async () => {
    const now = new Date("2026-06-13T12:00:00.000Z");
    const repository: OrganizationDashboardRepository = {
      countAssignmentsByStatus: vi.fn(async (_organizationId, status) => {
        if (status === "ASSIGNED") return 6;
        if (status === "IN_PROGRESS") return 3;
        if (status === "COMPLETED") return 2;
        return 0;
      }),
      countOverdueAssignments: vi.fn(async () => 4),
      averageProgressPercent: vi.fn(async () => 58),
      countCertificates: vi.fn(async () => 2),
    };

    await expect(getOrganizationDashboardMetrics({ organizationId: "org_1", now }, repository)).resolves.toEqual({
      assigned: 6,
      inProgress: 3,
      overdue: 4,
      completed: 2,
      averageProgressPercent: 58,
      certificatesIssued: 2,
    });

    expect(repository.countOverdueAssignments).toHaveBeenCalledWith("org_1", now);
  });
});
```

Add a Prisma repository test or mock assertion for the overdue query that requires all of these filters:

```ts
{
  organizationId: "org_1",
  dueDate: { lt: now },
  status: { not: "COMPLETED" },
  OR: [
    { progress: null },
    { progress: { progressPercent: { lt: 100 } } },
  ],
}
```

- [ ] **Step 2: Implement pure metric mapping**

In `src/modules/organizations/dashboard.ts`, export:

```ts
export type PlatformDashboardMetrics = {
  organizations: number;
  activeUsers: number;
  invitedUsers: number;
  activeAssignments: number;
  completedAssignments: number;
  certificatesIssued: number;
};

export type OrganizationDashboardMetrics = {
  assigned: number;
  inProgress: number;
  overdue: number;
  completed: number;
  averageProgressPercent: number;
  certificatesIssued: number;
};
```

Add these repository contracts and functions:

```ts
export type PlatformDashboardRepository = {
  countOrganizations(): Promise<number>;
  countMembershipsByStatus(status: "ACTIVE" | "INVITED"): Promise<number>;
  countActiveAssignments(): Promise<number>;
  countCompletedAssignments(): Promise<number>;
  countCertificates(): Promise<number>;
};

export type OrganizationDashboardRepository = {
  countAssignmentsByStatus(
    organizationId: string,
    status: "ASSIGNED" | "IN_PROGRESS" | "COMPLETED",
  ): Promise<number>;
  countOverdueAssignments(organizationId: string, now: Date): Promise<number>;
  averageProgressPercent(organizationId: string): Promise<number>;
  countCertificates(organizationId: string): Promise<number>;
};

export async function getPlatformDashboardMetrics(
  repository: PlatformDashboardRepository,
): Promise<PlatformDashboardMetrics>;

export async function getOrganizationDashboardMetrics(
  input: { organizationId: string; now: Date },
  repository: OrganizationDashboardRepository,
): Promise<OrganizationDashboardMetrics>;
```

`averageProgressPercent` must return a rounded whole number. When the repository aggregate has no rows, return `0`.

- [ ] **Step 3: Add Prisma dashboard repository methods**

In `src/modules/organizations/prisma-repository.ts`, add a `createPrismaOrganizationDashboardRepository(client)` factory with these exact behaviors:

```ts
countOrganizations() {
  return client.organization.count();
}

countMembershipsByStatus(status) {
  return client.organizationMembership.count({ where: { status } });
}

countActiveAssignments() {
  return client.courseAssignment.count({ where: { status: { in: ["ASSIGNED", "IN_PROGRESS", "OVERDUE"] } } });
}

countCompletedAssignments() {
  return client.courseAssignment.count({ where: { status: "COMPLETED" } });
}

countCertificates() {
  return client.certificate.count();
}
```

For organization-scoped methods:

- `countAssignmentsByStatus(organizationId, status)` calls `client.courseAssignment.count({ where: { organizationId, status } })`.
- `countActiveAssignments()` counts platform assignments with `status: { in: ["ASSIGNED", "IN_PROGRESS", "OVERDUE"] }`; it does not include `COMPLETED`.
- `countCompletedAssignments()` counts platform assignments with `status: "COMPLETED"`.
- `countOverdueAssignments(organizationId, now)` calls `client.courseAssignment.count` with `organizationId`, `dueDate: { lt: now }`, `status: { not: "COMPLETED" }`, and the progress filter shown in Step 1.
- `averageProgressPercent(organizationId)` calls `client.assignmentProgress.aggregate({ where: { organizationId }, _avg: { progressPercent: true } })` and returns `Math.round(result._avg.progressPercent ?? 0)`.
- `countCertificates(organizationId)` calls `client.certificate.count({ where: { organizationId } })`.

Use existing models only; do not add denormalized counters.

- [ ] **Step 4: Run dashboard tests**

Run:

```powershell
npm run test -- src/modules/organizations/dashboard.test.ts
```

Expected: tests pass.

- [ ] **Step 5: Commit dashboard service**

Run:

```powershell
git add src/modules/organizations/dashboard.ts src/modules/organizations/dashboard.test.ts src/modules/organizations/prisma-repository.ts
git commit -m "feat: add live organization dashboard metrics"
```

Expected: commit succeeds.

## Task 5: Add User Search Service

**Files:**
- Create: `src/modules/users/user-search.ts`
- Create: `src/modules/users/user-search.test.ts`
- Modify: `src/modules/users/prisma-repository.ts`

- [ ] **Step 1: Write search normalization tests**

Create tests for:

- Blank filters normalize to an empty query object.
- Search text is trimmed and lowercased.
- Role filter accepts `ADMIN`, `MANAGER`, and `LEARNER`.
- Status filter accepts `INVITED`, `ACTIVE`, and `INACTIVE`.
- Manager filter accepts `none` as null-manager filtering and membership ids for specific manager filtering.
- Department filter trims whitespace and preserves display casing for exact matching.

- [ ] **Step 2: Implement search types and normalization**

Create `src/modules/users/user-search.ts` exporting:

```ts
export type UserSearchFilters = {
  search?: string;
  role?: "ADMIN" | "MANAGER" | "LEARNER";
  status?: "INVITED" | "ACTIVE" | "INACTIVE";
  managerMembershipId?: string | null;
  department?: string;
};

export type UserSearchResult = {
  membershipId: string;
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  roles: ("ADMIN" | "MANAGER" | "LEARNER")[];
  status: "INVITED" | "ACTIVE" | "INACTIVE";
  managerMembershipId: string | null;
  managerName: string | null;
  department: string | null;
  title: string | null;
  employeeId: string | null;
};

export type UserSearchFormValues = Record<string, string | string[] | undefined>;
```

Export:

```ts
export function normalizeUserSearchFilters(formValues: UserSearchFormValues): UserSearchFilters;

export async function getOrganizationUsers(
  input: { organizationId: string; filters: UserSearchFilters },
  repository: UserSearchRepository,
): Promise<UserSearchResult[]>;
```

- [ ] **Step 3: Add Prisma search repository**

In `src/modules/users/prisma-repository.ts`, add `searchOrganizationUsers(input)` that applies:

- `organizationId` on every query.
- `roles: { has: role }` for role filter.
- `status` for status filter.
- `managerMembershipId` equality for a selected manager and `managerMembershipId: null` for the `none` option.
- `department` exact match for department filter.
- `OR` search across user email, first name, last name, employee id, title, and department using case-insensitive contains where Prisma supports it.

Return manager display name from `managerMembership.user.firstName` and `managerMembership.user.lastName`.

- [ ] **Step 4: Run search tests**

Run:

```powershell
npm run test -- src/modules/users/user-search.test.ts
```

Expected: tests pass.

- [ ] **Step 5: Commit user search**

Run:

```powershell
git add src/modules/users/user-search.ts src/modules/users/user-search.test.ts src/modules/users/prisma-repository.ts
git commit -m "feat: add organization user search"
```

Expected: commit succeeds.

## Task 6: Add User Lifecycle Service

**Files:**
- Create: `src/modules/users/lifecycle.ts`
- Create: `src/modules/users/lifecycle.test.ts`
- Modify: `src/modules/users/prisma-repository.ts`

- [ ] **Step 1: Write lifecycle tests**

Create `src/modules/users/lifecycle.test.ts` with these test names and skeletons:

```ts
import { describe, expect, it, vi } from "vitest";

import {
  issueUserPasswordReset,
  resendUserInvitation,
  updateUserLifecycle,
  type UserLifecycleRepository,
} from "./lifecycle";

function createRepository(overrides: Partial<UserLifecycleRepository> = {}): UserLifecycleRepository {
  return {
    runInTransaction: vi.fn(async (operation) => operation()),
    findMembershipForLifecycle: vi.fn(async () => activeMembership),
    findManagerCandidate: vi.fn(async () => ({ id: "manager_membership_1" })),
    countOtherActiveMemberships: vi.fn(async () => 0),
    updateMembershipLifecycle: vi.fn(async () => undefined),
    updateUserStatus: vi.fn(async () => undefined),
    createInvitation: vi.fn(async () => undefined),
    createPasswordReset: vi.fn(async () => undefined),
    recordAuditLog: vi.fn(async () => undefined),
    ...overrides,
  };
}

describe("updateUserLifecycle", () => {
  it("updates roles, manager, department, title, employee id, and status with audit metadata", async () => {
    const repository = createRepository();

    await updateUserLifecycle({
      organizationId: "org_1",
      actorId: "admin_user",
      membershipId: "membership_1",
      roles: ["MANAGER"],
      managerMembershipId: "manager_membership_1",
      department: "Operations",
      title: "Team Lead",
      employeeId: "EMP-100",
      status: "ACTIVE",
      now,
    }, repository);

    expect(repository.updateMembershipLifecycle).toHaveBeenCalledWith({
      organizationId: "org_1",
      membershipId: "membership_1",
      roles: ["MANAGER"],
      managerMembershipId: "manager_membership_1",
      department: "Operations",
      title: "Team Lead",
      employeeId: "EMP-100",
      status: "ACTIVE",
    });
    expect(repository.recordAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      action: "organization.user.updated",
      metadata: expect.objectContaining({
        changedFields: expect.arrayContaining(["roles", "managerMembershipId", "department", "title", "employeeId", "status"]),
        previous: expect.any(Object),
        next: expect.any(Object),
      }),
    }));
  });

  it("rejects a manager from another organization or the edited membership itself", async () => {
    await expect(updateUserLifecycle(validInputWithSelfManager, createRepository())).rejects.toThrow(
      "A user cannot be their own manager",
    );
    await expect(updateUserLifecycle(validInputWithMissingManager, createRepository({
      findManagerCandidate: vi.fn(async () => null),
    }))).rejects.toThrow("Manager must be an active manager or admin in this organization");
  });

  it("deactivates membership and user without deleting historical records", async () => {
    const repository = createRepository();

    await updateUserLifecycle({ ...validInput, status: "INACTIVE" }, repository);

    expect(repository.updateMembershipLifecycle).toHaveBeenCalled();
    expect(repository.updateUserStatus).toHaveBeenCalledWith("user_1", "INACTIVE");
    expect("deleteAssignment" in repository).toBe(false);
    expect("deleteCertificate" in repository).toBe(false);
  });

  it("keeps user active when deactivating one membership but other active memberships exist", async () => {
    const repository = createRepository({ countOtherActiveMemberships: vi.fn(async () => 1) });

    await updateUserLifecycle({ ...validInput, status: "INACTIVE" }, repository);

    expect(repository.updateUserStatus).not.toHaveBeenCalled();
  });

  it("reactivates membership and user as ACTIVE when a password exists", async () => {
    const repository = createRepository({
      findMembershipForLifecycle: vi.fn(async () => ({ ...inactiveMembership, user: { ...inactiveMembership.user, passwordHash: "hash" } })),
    });

    await updateUserLifecycle({ ...validInput, status: "ACTIVE" }, repository);

    expect(repository.updateMembershipLifecycle).toHaveBeenCalledWith(expect.objectContaining({ status: "ACTIVE" }));
    expect(repository.updateUserStatus).toHaveBeenCalledWith("user_1", "ACTIVE");
    expect(repository.createInvitation).not.toHaveBeenCalled();
  });

  it("reactivates membership and user as INVITED and sends an invitation when no password exists", async () => {
    const repository = createRepository({
      findMembershipForLifecycle: vi.fn(async () => ({ ...inactiveMembership, user: { ...inactiveMembership.user, passwordHash: null } })),
    });

    await updateUserLifecycle({ ...validInput, status: "ACTIVE" }, repository);

    expect(repository.updateMembershipLifecycle).toHaveBeenCalledWith(expect.objectContaining({ status: "INVITED" }));
    expect(repository.updateUserStatus).toHaveBeenCalledWith("user_1", "INVITED");
    expect(repository.createInvitation).toHaveBeenCalledWith({
      organizationId: "org_1",
      membershipId: "membership_1",
      userId: "user_1",
      now,
    });
  });
});

describe("resendUserInvitation", () => {
  it("creates a new invitation for invited users only", async () => {
    const repository = createRepository({ findMembershipForLifecycle: vi.fn(async () => invitedMembership) });

    await resendUserInvitation({ organizationId: "org_1", actorId: "admin_user", membershipId: "membership_1", now }, repository);

    expect(repository.createInvitation).toHaveBeenCalledWith({
      organizationId: "org_1",
      membershipId: "membership_1",
      userId: "user_1",
      now,
    });
    expect(repository.recordAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      action: "organization.user.invitation_resent",
      targetId: "membership_1",
      metadata: {
        changedFields: ["invitationResentAt"],
        previous: { invitationResentAt: null },
        next: { invitationResentAt: now.toISOString() },
      },
    }));
  });
});

describe("issueUserPasswordReset", () => {
  it("creates a password reset for active and invited users", async () => {
    for (const status of ["ACTIVE", "INVITED"] as const) {
      const repository = createRepository({
        findMembershipForLifecycle: vi.fn(async () => ({ ...activeMembership, status, user: { ...activeMembership.user, status } })),
      });

      await issueUserPasswordReset({ organizationId: "org_1", actorId: "admin_user", membershipId: "membership_1", now }, repository);

      expect(repository.createPasswordReset).toHaveBeenCalledWith({
        userId: "user_1",
        now,
        activationOrganizationId: status === "INVITED" ? "org_1" : null,
        activationMembershipId: status === "INVITED" ? "membership_1" : null,
      });
      expect(repository.recordAuditLog).toHaveBeenCalledWith(expect.objectContaining({
        action: "organization.user.password_reset_issued",
        targetId: "membership_1",
        metadata: {
          changedFields: ["passwordResetIssuedAt"],
          previous: { passwordResetIssuedAt: null },
          next: { passwordResetIssuedAt: now.toISOString() },
        },
      }));
    }
  });

  it("blocks password reset for inactive users", async () => {
    await expect(issueUserPasswordReset(
      { organizationId: "org_1", actorId: "admin_user", membershipId: "membership_1", now },
      createRepository({ findMembershipForLifecycle: vi.fn(async () => inactiveMembership) }),
    )).rejects.toThrow("Password reset is available only for active or invited users");
  });
});
```

Define `activeMembership`, `invitedMembership`, `inactiveMembership`, `validInput`, `validInputWithSelfManager`, `validInputWithMissingManager`, and `now` as local fixtures in the test file. The fixtures must include assignment, progress, and certificate id arrays to prove the service never mutates historical records.

- [ ] **Step 2: Implement lifecycle types**

Create `src/modules/users/lifecycle.ts` exporting:

```ts
export type UpdateUserLifecycleInput = {
  organizationId: string;
  actorId: string;
  membershipId: string;
  roles: ("ADMIN" | "MANAGER" | "LEARNER")[];
  managerMembershipId: string | null;
  department: string | null;
  title: string | null;
  employeeId: string | null;
  status: "INVITED" | "ACTIVE" | "INACTIVE";
  now: Date;
};
```

Also export `updateUserLifecycle`, `resendUserInvitation`, and `issueUserPasswordReset`.

- [ ] **Step 3: Implement lifecycle repository contract**

Create these exported service signatures:

```ts
export type UserLifecycleCommandInput = {
  organizationId: string;
  actorId: string;
  membershipId: string;
  now: Date;
};

export async function updateUserLifecycle(
  input: UpdateUserLifecycleInput,
  repository: UserLifecycleRepository,
): Promise<{ updated: boolean; changedFields: string[] }>;

export async function resendUserInvitation(
  input: UserLifecycleCommandInput,
  repository: UserLifecycleRepository,
): Promise<void>;

export async function issueUserPasswordReset(
  input: UserLifecycleCommandInput,
  repository: UserLifecycleRepository,
): Promise<void>;
```

Implement the repository contract below. `findMembershipForLifecycle` must return the current membership, its user status/password hash, current manager id, role/profile fields, and historical ids for assignments, progress, and certificates.

Required repository method names:

```ts
export type LifecycleMembership = {
  id: string;
  organizationId: string;
  userId: string;
  roles: ("ADMIN" | "MANAGER" | "LEARNER")[];
  managerMembershipId: string | null;
  department: string | null;
  title: string | null;
  employeeId: string | null;
  status: "INVITED" | "ACTIVE" | "INACTIVE";
  assignmentIds: string[];
  progressIds: string[];
  certificateIds: string[];
  user: {
    id: string;
    status: "INVITED" | "ACTIVE" | "INACTIVE";
    passwordHash: string | null;
  };
};

export type UpdateMembershipLifecycleData = {
  organizationId: string;
  membershipId: string;
  roles: ("ADMIN" | "MANAGER" | "LEARNER")[];
  managerMembershipId: string | null;
  department: string | null;
  title: string | null;
  employeeId: string | null;
  status: "INVITED" | "ACTIVE" | "INACTIVE";
};

export type LifecycleAuditInput = {
  organizationId: string;
  actorId: string;
  action: "organization.user.updated" | "organization.user.invitation_resent" | "organization.user.password_reset_issued";
  targetId: string;
  metadata: {
    changedFields: string[];
    previous: Record<string, unknown>;
    next: Record<string, unknown>;
  };
};

export type UserLifecycleRepository = {
  runInTransaction<T>(operation: () => Promise<T>): Promise<T>;
  findMembershipForLifecycle(organizationId: string, membershipId: string): Promise<LifecycleMembership | null>;
  findManagerCandidate(organizationId: string, membershipId: string): Promise<{ id: string } | null>;
  countOtherActiveMemberships(userId: string, excludedMembershipId: string): Promise<number>;
  updateMembershipLifecycle(data: UpdateMembershipLifecycleData): Promise<void>;
  updateUserStatus(userId: string, status: "INVITED" | "ACTIVE" | "INACTIVE"): Promise<void>;
  createInvitation(data: { organizationId: string; membershipId: string; userId: string; now: Date }): Promise<void>;
  createPasswordReset(data: {
    userId: string;
    now: Date;
    activationOrganizationId: string | null;
    activationMembershipId: string | null;
  }): Promise<void>;
  recordAuditLog(data: LifecycleAuditInput): Promise<void>;
};
```

Repository behavior required by the service:

- `updateUserLifecycle`, `resendUserInvitation`, and `issueUserPasswordReset` each wrap the full read, validation, write, token creation, and audit operation in `repository.runInTransaction`.
- Repository methods called inside `repository.runInTransaction` must operate on the active transaction client, following the existing `createPrismaUserImportRepository` transaction-client pattern.
- `findMembershipForLifecycle` returns `null` only when the membership is absent or outside the organization; the service then throws `User membership was not found`.
- `findManagerCandidate` returns a membership only when it is in the same organization, `status` is `ACTIVE`, and `roles` has `MANAGER` or `ADMIN`.
- `updateMembershipLifecycle` updates only `roles`, `managerMembershipId`, `department`, `title`, `employeeId`, and `status`.
- `updateUserStatus` updates only `User.status`.
- `createInvitation` must call the existing invitation-token helper so a raw invite link is logged or sent through the same path as CSV import.
- `createPasswordReset` must call the existing password-reset-token helper for both active and invited users; for invited users it passes `activationOrganizationId = input.organizationId` and `activationMembershipId = input.membershipId`, while active-user resets pass both activation fields as `null`.
- `recordAuditLog` writes `targetType: "organizationMembership"` and `targetId: membershipId`.
- Invitation resend audit metadata must be `{ changedFields: ["invitationResentAt"], previous: { invitationResentAt: null }, next: { invitationResentAt: input.now.toISOString() } }`.
- Password reset audit metadata must be `{ changedFields: ["passwordResetIssuedAt"], previous: { passwordResetIssuedAt: null }, next: { passwordResetIssuedAt: input.now.toISOString() } }`.

- [ ] **Step 4: Implement Prisma lifecycle repository methods**

In `src/modules/users/prisma-repository.ts`, add `createPrismaUserLifecycleRepository(client)`. Use `$transaction` for lifecycle updates so membership update, user status update, token creation, and audit write commit together.

Prisma query requirements:

- `findMembershipForLifecycle` uses `organizationMembership.findFirst({ where: { organizationId, id: membershipId }, include: { user: true, learningAssignments: { select: { id: true, progress: { select: { id: true } }, certificate: { select: { id: true } } } } } })`.
- `findManagerCandidate` uses `organizationMembership.findFirst({ where: { organizationId, id: membershipId, status: "ACTIVE", OR: [{ roles: { has: "MANAGER" } }, { roles: { has: "ADMIN" } }] }, select: { id: true } })`.
- `countOtherActiveMemberships` uses `organizationMembership.count({ where: { userId, status: "ACTIVE", id: { not: excludedMembershipId } } })`.
- `updateMembershipLifecycle` uses `organizationMembership.update({ where: { organizationId_id: { organizationId, id: membershipId } }, data: { roles, managerMembershipId, department, title, employeeId, status } })`. If the generated Prisma client does not expose `organizationId_id`, use `organizationMembership.updateMany({ where: { organizationId, id: membershipId }, data: { roles, managerMembershipId, department, title, employeeId, status } })` and throw `User membership was not found` unless `count === 1`.
- `updateUserStatus` uses `user.update({ where: { id: userId }, data: { status } })`.
- `createPasswordReset` does not require `passwordHash` to be non-null and stores nullable activation organization/membership ids for invited membership resets.

- [ ] **Step 5: Run lifecycle tests**

Run:

```powershell
npm run test -- src/modules/users/lifecycle.test.ts
```

Expected: tests pass.

- [ ] **Step 6: Commit lifecycle service**

Run:

```powershell
git add src/modules/users/lifecycle.ts src/modules/users/lifecycle.test.ts src/modules/users/prisma-repository.ts
git commit -m "feat: add user lifecycle management"
```

Expected: commit succeeds.

## Task 7: Extend Password Reset Activation Semantics

**Files:**
- Modify: `src/modules/auth/password-resets.ts`
- Modify: `src/modules/auth/password-resets.test.ts`
- Modify: `src/modules/auth/prisma-repositories.ts`

- [ ] **Step 1: Write password reset activation tests**

In `src/modules/auth/password-resets.test.ts`, add these tests:

```ts
describe("membership-bound password reset completion", () => {
  it("stores activation membership ids when an admin issues a reset for an invited membership", async () => {
    const repository = createRepository();

    await requestPasswordResetForMembership({
      userId: "user_1",
      organizationId: "org_1",
      membershipId: "membership_1",
      now,
    }, repository);

    expect(repository.createPasswordResetToken).toHaveBeenCalledWith(expect.objectContaining({
      userId: "user_1",
      activationOrganizationId: "org_1",
      activationMembershipId: "membership_1",
    }));
  });

  it("completes a membership-bound reset by activating the user and membership in one transaction", async () => {
    const repository = createRepository({
      findPasswordResetByTokenHash: vi.fn(async () => ({
        id: "reset_1",
        userId: "user_1",
        expiresAt: new Date("2026-06-13T13:00:00.000Z"),
        usedAt: null,
        activationOrganizationId: "org_1",
        activationMembershipId: "membership_1",
      })),
    });

    await completePasswordReset({
      rawToken: "reset-token",
      password: "LearnHubReset123!",
      now,
    }, repository);

    expect(repository.completePasswordReset).toHaveBeenCalledWith(expect.objectContaining({
      resetTokenId: "reset_1",
      userId: "user_1",
      activationOrganizationId: "org_1",
      activationMembershipId: "membership_1",
      userStatus: "ACTIVE",
      membershipStatus: "ACTIVE",
    }));
  });

  it("completes an unbound reset without changing membership status", async () => {
    const repository = createRepository({
      findPasswordResetByTokenHash: vi.fn(async () => ({
        id: "reset_2",
        userId: "user_2",
        expiresAt: new Date("2026-06-13T13:00:00.000Z"),
        usedAt: null,
        activationOrganizationId: null,
        activationMembershipId: null,
      })),
    });

    await completePasswordReset({ rawToken: "reset-token", password: "LearnHubReset123!", now }, repository);

    expect(repository.completePasswordReset).toHaveBeenCalledWith(expect.objectContaining({
      resetTokenId: "reset_2",
      userId: "user_2",
      activationOrganizationId: null,
      activationMembershipId: null,
    }));
  });
});
```

- [ ] **Step 2: Extend password reset service signatures**

In `src/modules/auth/password-resets.ts`, add:

```ts
export async function requestPasswordResetForMembership(
  input: { userId: string; organizationId: string; membershipId: string; now: Date },
  repository: PasswordResetRepository,
): Promise<{ rawToken: string; expiresAt: Date }>;
```

Extend token persistence types:

```ts
createPasswordResetToken(data: {
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  activationOrganizationId: string | null;
  activationMembershipId: string | null;
}): Promise<void>;

completePasswordReset(data: {
  resetTokenId: string;
  userId: string;
  passwordHash: string;
  usedAt: Date;
  activationOrganizationId: string | null;
  activationMembershipId: string | null;
  userStatus?: "ACTIVE";
  membershipStatus?: "ACTIVE";
}): Promise<void>;
```

- [ ] **Step 3: Implement completion branching**

In `completePasswordReset`, after token usability validation:

- If `activationOrganizationId` and `activationMembershipId` are both non-null, call repository `completePasswordReset` with `userStatus: "ACTIVE"` and `membershipStatus: "ACTIVE"`.
- If both activation fields are null, call repository `completePasswordReset` without membership status changes.
- If exactly one activation field is null, throw `Password reset activation target is incomplete`.

- [ ] **Step 4: Implement Prisma repository transaction**

In `src/modules/auth/prisma-repositories.ts`, update password reset persistence:

- `createPasswordResetToken` stores `activationOrganizationId` and `activationMembershipId`.
- Normal email-requested password resets call `createPasswordResetToken` with `activationOrganizationId: null` and `activationMembershipId: null`.
- Bound `completePasswordReset` runs in one Prisma transaction that updates `PasswordResetToken.usedAt`, `User.passwordHash`, `User.status = ACTIVE`, and `OrganizationMembership.status = ACTIVE`.
- Unbound `completePasswordReset` runs in one Prisma transaction that updates only `PasswordResetToken.usedAt` and `User.passwordHash`.
- Membership activation uses `organizationMembership.update({ where: { organizationId_id: { organizationId: activationOrganizationId, id: activationMembershipId } }, data: { status: "ACTIVE" } })`, or `updateMany` with `{ organizationId: activationOrganizationId, id: activationMembershipId, userId }` plus `count === 1` assertion when the generated compound selector is unavailable.

- [ ] **Step 5: Run password reset tests**

Run:

```powershell
npm run test -- src/modules/auth/password-resets.test.ts
```

Expected: tests pass.

- [ ] **Step 6: Commit password reset activation semantics**

Run:

```powershell
git add src/modules/auth/password-resets.ts src/modules/auth/password-resets.test.ts src/modules/auth/prisma-repositories.ts
git commit -m "feat: support membership-bound password resets"
```

Expected: commit succeeds.

## Task 8: Harden Auth And Permission Guards

**Files:**
- Modify: `src/modules/auth/permissions.ts`
- Modify: `src/modules/auth/permissions.test.ts`
- Modify: `src/lib/auth/guards.ts`
- Modify: `src/lib/auth/next-auth.ts`

- [ ] **Step 1: Add permission tests**

Add tests asserting:

- `canManageOrganizationSettings` returns true for platform owners and active org admins.
- `canManageOrganizationBranding` returns true for platform owners and for active org admins only when `adminBrandingEnabled` is true.
- Inactive org admins cannot manage settings or branding.

- [ ] **Step 2: Implement permission helpers**

In `src/modules/auth/permissions.ts`, add:

```ts
export function canManageOrganizationSettings(context: MembershipAuthContext, organizationId: string): boolean;
export function canManageOrganizationBranding(
  context: MembershipAuthContext,
  organizationId: string,
  adminBrandingEnabled: boolean,
): boolean;
```

Use existing active membership filtering.

- [ ] **Step 3: Add settings guard**

In `src/lib/auth/guards.ts`, add `requireOrganizationSettingsAdminBySlug(slug)` that resolves the organization id by slug and enforces `canManageOrganizationSettings`.

- [ ] **Step 4: Reject inactive users at login**

In `src/lib/auth/next-auth.ts`, confirm the credentials authorize callback returns `null` unless the loaded user has `status === "ACTIVE"`. Keep invitation activation unchanged and preserve existing unbound password reset behavior.

- [ ] **Step 5: Run auth tests**

Run:

```powershell
npm run test -- src/modules/auth/permissions.test.ts src/modules/auth/credentials.test.ts
```

Expected: tests pass.

- [ ] **Step 6: Commit guard changes**

Run:

```powershell
git add src/modules/auth/permissions.ts src/modules/auth/permissions.test.ts src/lib/auth/guards.ts src/lib/auth/next-auth.ts
git commit -m "feat: enforce tenant operations permissions"
```

Expected: commit succeeds.

## Task 9: Wire Platform Dashboard And Settings Page

**Files:**
- Modify: `src/app/platform/page.tsx`
- Create: `src/app/platform/organizations/[slug]/page.tsx`
- Create: `src/app/platform/organizations/[slug]/actions.ts`
- Create: `src/app/platform/organizations/[slug]/organization-settings-form.tsx`
- Modify: `src/modules/organizations/server-actions.ts`
- Modify: `src/modules/organizations/prisma-repository.ts`

- [ ] **Step 1: Add settings action creator tests**

In `src/modules/organizations/settings.test.ts` or a new action-focused test block, verify the form action maps form fields into `updateOrganizationSettings` changes and returns success/error messages.

- [ ] **Step 2: Add module server action creator**

In `src/modules/organizations/server-actions.ts`, add `createUpdateOrganizationSettingsAction(dependencies)` that:

- Loads actor context.
- Loads organization id by slug.
- Reads all platform fields from `FormData`.
- Calls `updateOrganizationSettings`.
- Returns `{ status: "success", message: "Organization settings updated." }` or the service error message.

- [ ] **Step 3: Add platform dashboard live metrics**

In `src/app/platform/page.tsx`, after `requirePlatformOwner()`, load `getPlatformDashboardMetrics` using the Prisma dashboard repository. Replace static `0` values with the live metric values and add an organization list with links to `/platform/organizations/${organization.slug}`.

- [ ] **Step 4: Add platform settings route action**

Create `src/app/platform/organizations/[slug]/actions.ts` with `"use server"`, `requirePlatformOwner`, Prisma repository creation, and `updatePlatformOrganizationSettingsAction(slug, previousState, formData)`.

- [ ] **Step 5: Add settings form**

Create `src/app/platform/organizations/[slug]/organization-settings-form.tsx` as a client component using `useActionState`. Include inputs for name, allowed domains, logo URL, primary color, accent color, enrollment policy, global library enabled, and admin branding enabled. The form must post all current values so unchanged fields are preserved.

- [ ] **Step 6: Add platform settings page**

Create `src/app/platform/organizations/[slug]/page.tsx` that:

- Calls `requirePlatformOwner()`.
- Loads the organization settings snapshot by slug.
- Redirects to `/platform` if missing.
- Renders `OrganizationSettingsForm`.
- Shows current slug as read-only text.

- [ ] **Step 7: Run platform verification**

Run:

```powershell
npm run test -- src/modules/organizations/settings.test.ts src/modules/organizations/dashboard.test.ts
npm run build
```

Expected: tests pass and build exits `0`.

- [ ] **Step 8: Commit platform settings UI**

Run:

```powershell
git add src/app/platform/page.tsx src/app/platform/organizations src/modules/organizations/server-actions.ts src/modules/organizations/prisma-repository.ts
git commit -m "feat: add platform tenant operations settings"
```

Expected: commit succeeds.

## Task 10: Wire Organization Branding And Dashboard

**Files:**
- Modify: `src/app/org/[slug]/page.tsx`
- Create: `src/app/org/[slug]/admin/settings/page.tsx`
- Create: `src/app/org/[slug]/admin/settings/actions.ts`
- Create: `src/app/org/[slug]/admin/settings/branding-settings-form.tsx`
- Modify: `src/modules/organizations/server-actions.ts`
- Modify: `src/modules/organizations/prisma-repository.ts`

- [ ] **Step 1: Add org branding action creator**

In `src/modules/organizations/server-actions.ts`, add `createUpdateOrganizationBrandingAction(dependencies)` that reads `logoUrl`, `primaryColor`, and `accentColor` only, then calls `updateOrganizationSettings` with those fields. It must not read or pass organization name, allowed domains, enrollment policy, global library, or admin branding policy.

- [ ] **Step 2: Apply branding to workspace page**

In `src/app/org/[slug]/page.tsx`, load the organization snapshot and metrics after `requireOrganizationMemberBySlug(slug)`. Render:

- Organization logo when `logoUrl` is present.
- Organization `name` as the main heading.
- A top border or accent bar using `primaryColor`.
- Metric labels and values using `accentColor` for secondary emphasis.
- Live cards for assigned, in progress, overdue, completed, average progress, and certificates.

- [ ] **Step 3: Add org branding route action**

Create `src/app/org/[slug]/admin/settings/actions.ts` with `"use server"`, `requireOrganizationSettingsAdminBySlug`, Prisma repository creation, and `updateOrganizationBrandingAction(slug, previousState, formData)`.

- [ ] **Step 4: Add org branding form**

Create `src/app/org/[slug]/admin/settings/branding-settings-form.tsx` as a client component. It receives `adminBrandingEnabled` and disables all inputs plus submit button when false. It must still display current logo URL, primary color, and accent color.

- [ ] **Step 5: Add org settings page**

Create `src/app/org/[slug]/admin/settings/page.tsx` that:

- Calls `requireOrganizationSettingsAdminBySlug(slug)`.
- Loads organization settings by slug.
- Renders the branding form.
- Displays a plain policy message `Platform policy does not allow organization admins to edit branding.` when `adminBrandingEnabled` is false.

- [ ] **Step 6: Run organization UI verification**

Run:

```powershell
npm run test -- src/modules/organizations/settings.test.ts src/modules/organizations/dashboard.test.ts
npm run build
```

Expected: tests pass and build exits `0`.

- [ ] **Step 7: Commit org branding UI**

Run:

```powershell
git add src/app/org/[slug]/page.tsx src/app/org/[slug]/admin/settings src/modules/organizations/server-actions.ts src/modules/organizations/prisma-repository.ts
git commit -m "feat: apply tenant branding and dashboard metrics"
```

Expected: commit succeeds.

## Task 11: Wire Admin User Search And Lifecycle Page

**Files:**
- Modify: `src/app/org/[slug]/admin/users/page.tsx`
- Modify: `src/app/org/[slug]/admin/users/actions.ts`
- Create: `src/app/org/[slug]/admin/users/user-lifecycle-table.tsx`
- Modify: `src/modules/users/server-actions.ts`
- Modify: `src/modules/users/prisma-repository.ts`

- [ ] **Step 1: Add lifecycle action creator tests**

In `src/modules/users/lifecycle.test.ts` or `src/modules/users/server-actions.test.ts`, add tests that form actions:

- Parse roles from multi-value form fields.
- Parse blank manager as `null`.
- Return service error messages unchanged.
- Return success messages for update, invitation resend, and password reset issue.

- [ ] **Step 2: Add user module action creators**

In `src/modules/users/server-actions.ts`, add:

- `createSearchOrganizationUsersAction(dependencies)`
- `createUpdateUserLifecycleAction(dependencies)`
- `createResendInvitationAction(dependencies)`
- `createIssuePasswordResetAction(dependencies)`

Each action receives organization context by slug and actor by guard. Each write action must pass `now()` from dependencies.

- [ ] **Step 3: Extend route actions**

In `src/app/org/[slug]/admin/users/actions.ts`, wire the new module action creators to Prisma repositories and `requireOrganizationUsersAdminBySlug(slug)`.

- [ ] **Step 4: Update users page search params**

In `src/app/org/[slug]/admin/users/page.tsx`, accept `searchParams` as a promise, normalize filters with `normalizeUserSearchFilters`, load users, managers, and departments, then render:

- Search text input.
- Role select.
- Status select.
- Manager select with `Any manager`, `No manager`, and active manager options.
- Department select with `Any department` and current department values.
- Existing CSV import form below the lifecycle table.

- [ ] **Step 5: Add lifecycle table component**

Create `src/app/org/[slug]/admin/users/user-lifecycle-table.tsx` that renders each user with editable controls for roles, manager, department, title, employee id, and status. Add row buttons for:

- Save changes.
- Resend invitation, enabled only when status is `INVITED`.
- Issue password reset, enabled for `ACTIVE` and for `INVITED` rows.

Disable self-manager options by excluding the current membership id from that row's manager select.

- [ ] **Step 6: Run user module verification**

Run:

```powershell
npm run test -- src/modules/users/user-search.test.ts src/modules/users/lifecycle.test.ts src/modules/users/server-actions.test.ts
npm run build
```

Expected: tests pass and build exits `0`.

- [ ] **Step 7: Commit user lifecycle UI**

Run:

```powershell
git add src/app/org/[slug]/admin/users src/modules/users/server-actions.ts src/modules/users/prisma-repository.ts
git commit -m "feat: add admin user lifecycle controls"
```

Expected: commit succeeds.

## Task 12: Deactivation And Historical Access Verification

**Files:**
- Modify: `src/modules/auth/credentials.test.ts`
- Modify: `src/modules/auth/permissions.test.ts`
- Modify: `src/modules/runtime/runtime-route-service.ts` only if tests expose a launch gap
- Modify: `src/modules/reports/progress-report.test.ts` only if current report expectations conflict with historical visibility

- [ ] **Step 1: Add explicit deactivation tests**

Add or confirm tests for:

- Inactive user login returns `null`.
- Inactive learner cannot launch runtime assignments.
- Historical certificates remain queryable after membership deactivation.
- Organization admin reports can still include inactive learner historical rows when certificates or completed assignments exist.

- [ ] **Step 2: Run deactivation-focused tests**

Run:

```powershell
npm run test -- src/modules/auth/credentials.test.ts src/modules/auth/permissions.test.ts src/modules/reports/progress-report.test.ts
```

Expected: tests pass.

- [ ] **Step 3: Patch only confirmed gaps**

If a test exposes a real gap, patch the smallest affected module. Do not delete assignments, progress, certificates, SCORM registrations, video progress, or learning events in any deactivation path.

- [ ] **Step 4: Commit deactivation verification**

Run:

```powershell
git add src/modules/auth src/modules/runtime src/modules/reports
git commit -m "test: verify inactive user access rules"
```

Expected: commit succeeds when files changed. If no files changed, record the passing command output in the final implementation summary and skip this commit.

## Task 13: Final Verification

**Files:**
- Modify: none unless verification reveals a concrete failure.

- [ ] **Step 1: Run full unit tests**

Run:

```powershell
npm run test
```

Expected: all Vitest suites pass.

- [ ] **Step 2: Run lint**

Run:

```powershell
npm run lint
```

Expected: ESLint exits `0`.

- [ ] **Step 3: Validate Prisma schema**

Run:

```powershell
npx prisma validate
```

Expected: Prisma schema is valid.

- [ ] **Step 4: Run production build**

Run:

```powershell
npm run build
```

Expected: Next.js build exits `0`.

- [ ] **Step 5: Run migration SQL check when a database is available**

Run:

```powershell
npx prisma migrate dev --name tenant_operations_user_lifecycle
npm run prisma:seed
```

Expected: migration applies, seed exits `0`, Acme keeps `admin@example.com` as the demo admin, and Acme has `adminBrandingEnabled = true`.

- [ ] **Step 6: Optional local smoke**

Run:

```powershell
npm run dev
```

Then verify in browser:

- `/platform` shows non-zero live counts after seed.
- `/platform/organizations/acme` saves organization settings as platform owner.
- `/org/acme` shows `Acme Learning`, seeded colors, and live assignment/certificate cards.
- `/org/acme/admin/settings` allows branding edits for Acme because seed enables the policy.
- `/org/acme/admin/users` filters by search, role, status, manager, and department.
- `/reset-password/[token]` completes a normal active-user reset and a membership-bound invited-user reset without server errors when exercised with seeded or test-generated tokens.
- Deactivating a learner removes their ability to log in or launch learning while reports and certificates still show historical records.

Expected: each route loads without a server error and each write shows a success message.

## Acceptance Criteria

- Platform owner can edit organization settings after creation from `/platform/organizations/[slug]`.
- Platform owner can control whether organization admins may edit branding through `adminBrandingEnabled`.
- Organization admin can edit logo URL, primary color, and accent color only when the platform policy allows it.
- Organization workspace uses organization name, primary color, accent color, and logo URL when present.
- Platform dashboard cards use live counts from Prisma queries, not static zeroes.
- Organization dashboard cards use live assignment, progress, overdue, and certificate counts.
- Admin user page supports search, role filter, status filter, manager filter, and department filter.
- Admin can change roles, manager, department, title, employee id, and status.
- Admin can resend invitation for invited users.
- Admin can issue password reset for active or invited users.
- Deactivation blocks login and runtime launch.
- Deactivation does not delete assignments, progress, SCORM registrations, video progress, certificates, credentials, or audit logs.
- Every settings and lifecycle write records audit metadata containing `changedFields`, `previous`, and `next`.
- All new business rules have focused Vitest coverage.
- `npm run test`, `npm run lint`, `npx prisma validate`, and `npm run build` pass before merge.

## Review Checklist

Before marking the implementation complete:

- Confirm no new public signup path was introduced.
- Confirm all organization-scoped queries include `organizationId`.
- Confirm org-admin branding actions cannot write `name`, `allowedEmailDomains`, `enrollmentPolicy`, `globalLibraryEnabled`, or `adminBrandingEnabled`.
- Confirm platform settings actions can write all tenant settings named in this plan.
- Confirm user lifecycle actions never call delete methods for progress or certificate history.
- Confirm audit logs for changed settings and users include previous and next values.
- Confirm the admin users page keeps the existing CSV import flow working.
- Confirm the plan's migration name matches the actual migration folder: `20260613010000_tenant_operations_user_lifecycle`.
