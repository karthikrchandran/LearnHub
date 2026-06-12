# Tenant Operations, Branding, And User Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete tenant operations, organization branding, live dashboard counts, user search, and user lifecycle controls for the commercial LearnHub MVP.

**Architecture:** Keep the existing modular monolith and server-action pattern. Add small domain modules for organization settings, dashboard read models, user search, and user lifecycle writes; pages and actions should call those modules rather than embedding business rules in React. Persist organization active/inactive state and an explicit platform policy flag that controls whether tenant admins can edit branding.

**Tech Stack:** Next.js App Router, TypeScript, Prisma 7, PostgreSQL, NextAuth, Vitest, Tailwind CSS.

---

### Task 1: Schema And Settings Domain Tests

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260613010000_tenant_operations_user_lifecycle/migration.sql`
- Create: `src/modules/organizations/settings.test.ts`
- Create: `src/modules/organizations/settings.ts`

- [ ] **Step 1: Write failing settings tests**

Create `src/modules/organizations/settings.test.ts` with tests for:
- platform owner updates organization settings and audit metadata contains changed `previous` and `next` values
- non-platform actor cannot update platform-owned organization settings
- organization admin can update branding when `allowAdminBranding` is true
- organization admin cannot update branding when `allowAdminBranding` is false
- invalid colors, slugs, and allowed domains are rejected

Run: `npm run test -- src/modules/organizations/settings.test.ts`
Expected: FAIL because `src/modules/organizations/settings.ts` does not exist.

- [ ] **Step 2: Add schema fields**

In `prisma/schema.prisma`, add:
- `OrganizationStatus` enum with `ACTIVE` and `INACTIVE`
- `Organization.status OrganizationStatus @default(ACTIVE)`
- `Organization.allowAdminBranding Boolean @default(false)`
- indexes on `Organization.status`

Create `prisma/migrations/20260613010000_tenant_operations_user_lifecycle/migration.sql` adding the enum, columns, and index.

- [ ] **Step 3: Implement organization settings service**

Create `src/modules/organizations/settings.ts` exporting:
- `OrganizationSettingsActor`
- `OrganizationSettingsRecord`
- `OrganizationSettingsRepository`
- `updateOrganizationSettings`
- `updateOrganizationBranding`
- shared normalization for name, slug, domains, logo URL, colors, and enrollment policy

Rules:
- only platform owners can update full organization settings
- tenant admins can update branding only for their active org membership and only when `allowAdminBranding` is true
- audit metadata is `{ previous: {...}, next: {...}, changed: ["field"] }`
- unchanged writes return the existing organization and do not write audit

Run: `npm run test -- src/modules/organizations/settings.test.ts`
Expected: PASS.

### Task 2: Organization Settings Repository And Actions

**Files:**
- Modify: `src/modules/organizations/prisma-repository.ts`
- Modify: `src/modules/organizations/server-actions.ts`
- Modify: `src/modules/organizations/server-actions.test.ts`
- Create: `src/app/platform/organizations/[slug]/page.tsx`
- Create: `src/app/platform/organizations/[slug]/actions.ts`
- Create: `src/app/org/[slug]/admin/settings/page.tsx`
- Create: `src/app/org/[slug]/admin/settings/actions.ts`

- [ ] **Step 1: Write failing action tests**

Extend `src/modules/organizations/server-actions.test.ts` for platform settings and org branding actions:
- form parsing maps domains from comma-separated text
- successful platform update returns the updated slug
- validation errors return `{ status: "error" }`
- org branding action passes only logo and colors

Run: `npm run test -- src/modules/organizations/server-actions.test.ts`
Expected: FAIL because new action factories do not exist.

- [ ] **Step 2: Implement repository methods**

Add `createPrismaOrganizationSettingsRepository(client)` in `src/modules/organizations/prisma-repository.ts` with:
- `findOrganizationSettings`
- `saveOrganizationSettings`
- `recordAuditLog`

Keep provisioning repository exports intact.

- [ ] **Step 3: Implement server actions and pages**

Add action factories in `src/modules/organizations/server-actions.ts`:
- `createUpdateOrganizationSettingsAction`
- `createUpdateOrganizationBrandingAction`

Add platform organization edit route `/platform/organizations/[slug]` and tenant settings route `/org/[slug]/admin/settings`.

Run: `npm run test -- src/modules/organizations/server-actions.test.ts src/modules/organizations/settings.test.ts`
Expected: PASS.

### Task 3: Live Dashboard Read Models

**Files:**
- Create: `src/modules/organizations/dashboard.test.ts`
- Create: `src/modules/organizations/dashboard.ts`
- Modify: `src/app/platform/page.tsx`
- Modify: `src/app/org/[slug]/page.tsx`

- [ ] **Step 1: Write failing dashboard tests**

Create tests for:
- platform summary counts organizations, active users, completed assignments, overdue assignments, provider failures, and recent audit logs
- organization summary counts assigned, in-progress, overdue, certificates, and average progress
- organization dashboard model carries name, logo URL, primary color, and accent color

Run: `npm run test -- src/modules/organizations/dashboard.test.ts`
Expected: FAIL because dashboard module does not exist.

- [ ] **Step 2: Implement dashboard service**

Create repository-driven read models:
- `getPlatformDashboardSummary(repository)`
- `getOrganizationDashboardSummary({ organizationId }, repository)`

Use repository methods instead of Prisma in the service so tests stay deterministic.

- [ ] **Step 3: Wire pages to live Prisma counts**

Update `/platform` and `/org/[slug]` pages to call Prisma-backed dashboard repositories and render live cards. Apply organization branding through inline CSS custom properties derived from stored colors and logo URL.

Run: `npm run test -- src/modules/organizations/dashboard.test.ts`
Expected: PASS.

### Task 4: User Search And Filters

**Files:**
- Create: `src/modules/users/user-search.test.ts`
- Create: `src/modules/users/user-search.ts`
- Modify: `src/modules/users/prisma-repository.ts`
- Modify: `src/app/org/[slug]/admin/users/page.tsx`

- [ ] **Step 1: Write failing user-search tests**

Create tests for:
- free-text search matches name, email, employee id, title, and department
- role filter requires membership role
- status filter requires membership status
- manager filter matches `managerMembershipId`
- department filter is exact after trimming

Run: `npm run test -- src/modules/users/user-search.test.ts`
Expected: FAIL because user-search module does not exist.

- [ ] **Step 2: Implement user-search service**

Create:
- `parseUserSearchFilters`
- `membershipMatchesUserSearch`
- `createPrismaUserSearchWhere`
- `listOrganizationUsers`

The Prisma query must stay scoped to `organizationId`.

- [ ] **Step 3: Render filters and results**

Update `/org/[slug]/admin/users` to show search inputs, select filters, manager and department options, and a user table. Keep CSV import on the same page below the live list.

Run: `npm run test -- src/modules/users/user-search.test.ts`
Expected: PASS.

### Task 5: User Lifecycle Writes

**Files:**
- Create: `src/modules/users/lifecycle.test.ts`
- Create: `src/modules/users/lifecycle.ts`
- Modify: `src/modules/users/prisma-repository.ts`
- Modify: `src/modules/users/server-actions.ts`
- Modify: `src/modules/users/server-actions.test.ts`
- Modify: `src/app/org/[slug]/admin/users/actions.ts`
- Modify: `src/app/org/[slug]/admin/users/page.tsx`

- [ ] **Step 1: Write failing lifecycle tests**

Create tests for:
- admin updates roles, manager, department, title, employee id, and status
- manager cannot be assigned outside the same organization
- deactivation preserves assignment progress and certificates because it only changes user and membership status
- resend invitation is allowed for invited memberships and records audit metadata
- password reset can be issued for active or invited users and records audit metadata
- lifecycle updates include `previous` and `next` values in audit metadata

Run: `npm run test -- src/modules/users/lifecycle.test.ts`
Expected: FAIL because lifecycle module does not exist.

- [ ] **Step 2: Implement lifecycle service**

Create `updateOrganizationUserLifecycle`, `resendOrganizationUserInvitation`, and `issueOrganizationUserPasswordReset`.

Rules:
- actor must be platform owner or active organization admin
- membership updates are scoped by organization id and membership id
- roles cannot be empty
- manager membership must be active, same organization, and include `MANAGER`
- invitation resend only creates a token for an invited membership
- password reset only creates a token for active or invited users
- audit metadata captures previous and next values

- [ ] **Step 3: Implement Prisma repository and actions**

Add lifecycle repository methods to `src/modules/users/prisma-repository.ts`, action factories in `src/modules/users/server-actions.ts`, and server actions in `src/app/org/[slug]/admin/users/actions.ts`.

Update the admin user table to include compact forms for lifecycle edit, resend invitation, and issue reset.

Run: `npm run test -- src/modules/users/lifecycle.test.ts src/modules/users/server-actions.test.ts`
Expected: PASS.

### Task 6: Access Enforcement Regression Tests

**Files:**
- Modify: `src/modules/runtime/runtime-route-service.test.ts`
- Modify: `src/lib/auth/guards.test.ts`
- Modify: `src/modules/auth/credentials.test.ts`

- [ ] **Step 1: Add deactivation regression tests**

Add tests proving:
- inactive global users cannot authenticate with password
- inactive org memberships cannot enter org workspace
- inactive learner memberships cannot launch runtime assignments

Run: `npm run test -- src/modules/auth/credentials.test.ts src/lib/auth/guards.test.ts src/modules/runtime/runtime-route-service.test.ts`
Expected: PASS after the assertions confirm existing guard behavior.

### Task 7: Final Verification And Commit

**Files:**
- All files above

- [ ] **Step 1: Run focused Task 1 tests**

Run:
`npm run test -- src/modules/organizations/settings.test.ts src/modules/organizations/dashboard.test.ts src/modules/users/lifecycle.test.ts src/modules/users/user-search.test.ts src/modules/organizations/server-actions.test.ts src/modules/users/server-actions.test.ts src/modules/auth/credentials.test.ts src/lib/auth/guards.test.ts src/modules/runtime/runtime-route-service.test.ts`

Expected: PASS.

- [ ] **Step 2: Run full gates sequentially**

Run:
`npm run test`
`npm run lint`
`npx prisma validate`
`npm run prisma:generate`
`npx tsc --noEmit --incremental false`
`npm run build`

Expected: every command exits 0.

- [ ] **Step 3: Commit and merge locally**

Commit on `feature/tenant-operations-user-lifecycle` with:
`git commit -m "feat: add tenant operations and user lifecycle"`

Merge back to `main` locally after full verification.

## Self-Review

Spec coverage:
- Organization settings, branding policy, live platform and organization dashboards, user filters, lifecycle writes, invitation resend, password reset issue, deactivation behavior, and audit metadata are covered by tasks above.

Placeholder scan:
- No task uses placeholder implementation language; each task names exact files, commands, and expected outcomes.

Type consistency:
- Domain type names match existing module naming and Prisma enums: `OrganizationRole`, `UserStatus`, `OrganizationEnrollmentPolicy`, and `AssignmentStatus`.
