# Users, Auth, And Tenant Admin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first usable LearnHub control-plane slice: invited-user auth, invitation/reset tokens, organization provisioning, CSV user import, tenant role checks, and thin admin/auth pages.

**Architecture:** Keep business rules in focused modules under `src/modules/users`, `src/modules/auth`, and `src/modules/organizations`. Keep app routes thin and reusable. Add Prisma models and migration SQL before service implementation, then use TDD for pure behavior and repository-backed services.

**Tech Stack:** Next.js App Router, TypeScript, Prisma 7 with PostgreSQL adapter, NextAuth credentials flow, bcryptjs, Vitest, Zod.

---

## Scope Boundary

This plan implements users/auth/tenant admin only. It does not implement course catalog authoring, assignment notifications, video, SCORM, reporting, certificates, billing, social auth, SSO, or public self-signup.

The existing foundation already contains:

- `prisma/schema.prisma`
- `src/lib/prisma.ts`
- `src/lib/auth/password.ts`
- `src/modules/tenants/tenant-scope.ts`
- provider interfaces
- audit helper
- platform/org route shells

## File Structure

Create or modify these files:

- `prisma/schema.prisma`: add `allowedEmailDomains`, invitation token, and reset token models.
- `prisma/migrations/20260609010000_users_auth_tenant_admin/migration.sql`: migration for schema changes.
- `prisma/seed.ts`: set Acme allowed domains and keep seed idempotent with new schema.
- `src/modules/auth/email.ts`: email normalization/domain validation helpers.
- `src/modules/auth/email.test.ts`: email helper tests.
- `src/modules/auth/tokens.ts`: token generation, hashing, expiration helpers.
- `src/modules/auth/tokens.test.ts`: token helper tests.
- `src/modules/auth/credentials.ts`: credential login validation.
- `src/modules/auth/credentials.test.ts`: credential validation tests with in-memory repository.
- `src/modules/auth/permissions.ts`: platform/admin/manager/learner authorization helpers.
- `src/modules/auth/permissions.test.ts`: permission tests.
- `src/modules/auth/invitations.ts`: invitation creation and activation service.
- `src/modules/auth/invitations.test.ts`: invitation service tests with fake repository.
- `src/modules/auth/password-resets.ts`: password reset request and completion service.
- `src/modules/auth/password-resets.test.ts`: password reset tests with fake repository.
- `src/modules/organizations/provisioning.ts`: organization provisioning validation and persistence boundary.
- `src/modules/organizations/provisioning.test.ts`: provisioning tests.
- `src/modules/users/csv-import.ts`: CSV parse, validation, and import planning.
- `src/modules/users/csv-import.test.ts`: CSV validation tests.
- `src/modules/users/user-import.ts`: repository-backed user import commit service.
- `src/modules/users/user-import.test.ts`: import commit tests with fake repository.
- `src/app/api/auth/[...nextauth]/route.ts`: NextAuth route.
- `src/lib/auth/next-auth.ts`: NextAuth options.
- `src/app/login/page.tsx`: login page shell.
- `src/app/invite/[token]/page.tsx`: invite activation page shell.
- `src/app/reset-password/page.tsx`: reset request page shell.
- `src/app/reset-password/[token]/page.tsx`: reset completion page shell.
- `src/app/platform/organizations/new/page.tsx`: organization provisioning page shell.
- `src/app/org/[slug]/admin/users/page.tsx`: user import page shell.

## Task 1: Add Auth And Tenant Admin Schema

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260609010000_users_auth_tenant_admin/migration.sql`
- Modify: `prisma/seed.ts`

- [ ] **Step 1: Write the schema change**

In `prisma/schema.prisma`, add `allowedEmailDomains String[] @default([])` to `Organization`, add token relations to `User`, and add these models:

```prisma
model UserInvitationToken {
  id             String                 @id @default(cuid())
  organizationId String
  membershipId   String
  userId         String
  tokenHash      String                 @unique
  expiresAt      DateTime
  usedAt         DateTime?
  organization   Organization           @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  membership     OrganizationMembership @relation(fields: [organizationId, membershipId], references: [organizationId, id], onDelete: Cascade)
  user           User                   @relation("UserInvitationTokens", fields: [userId], references: [id], onDelete: Cascade)
  createdAt      DateTime               @default(now())

  @@index([organizationId])
  @@index([userId])
  @@index([expiresAt])
}

model PasswordResetToken {
  id        String    @id @default(cuid())
  userId    String
  tokenHash String    @unique
  expiresAt DateTime
  usedAt    DateTime?
  user      User      @relation("UserPasswordResetTokens", fields: [userId], references: [id], onDelete: Cascade)
  createdAt DateTime  @default(now())

  @@index([userId])
  @@index([expiresAt])
}
```

Add these relation fields to `User`:

```prisma
invitationTokens  UserInvitationToken[] @relation("UserInvitationTokens")
passwordResetTokens PasswordResetToken[] @relation("UserPasswordResetTokens")
```

Add these relation fields to `Organization` and `OrganizationMembership`:

```prisma
invitationTokens UserInvitationToken[]
```

- [ ] **Step 2: Add migration SQL**

Create `prisma/migrations/20260609010000_users_auth_tenant_admin/migration.sql`:

```sql
ALTER TABLE "Organization"
ADD COLUMN "allowedEmailDomains" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

CREATE TABLE "UserInvitationToken" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "membershipId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UserInvitationToken_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PasswordResetToken" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UserInvitationToken_tokenHash_key" ON "UserInvitationToken"("tokenHash");
CREATE INDEX "UserInvitationToken_organizationId_idx" ON "UserInvitationToken"("organizationId");
CREATE INDEX "UserInvitationToken_userId_idx" ON "UserInvitationToken"("userId");
CREATE INDEX "UserInvitationToken_expiresAt_idx" ON "UserInvitationToken"("expiresAt");

CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");
CREATE INDEX "PasswordResetToken_userId_idx" ON "PasswordResetToken"("userId");
CREATE INDEX "PasswordResetToken_expiresAt_idx" ON "PasswordResetToken"("expiresAt");

ALTER TABLE "UserInvitationToken"
ADD CONSTRAINT "UserInvitationToken_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserInvitationToken"
ADD CONSTRAINT "UserInvitationToken_organizationId_membershipId_fkey"
FOREIGN KEY ("organizationId", "membershipId") REFERENCES "OrganizationMembership"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserInvitationToken"
ADD CONSTRAINT "UserInvitationToken_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PasswordResetToken"
ADD CONSTRAINT "PasswordResetToken_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

- [ ] **Step 3: Update seed organization**

In `prisma/seed.ts`, ensure Acme has:

```ts
allowedEmailDomains: ["acme.test"],
```

in both create and update data where organization seed data is maintained.

- [ ] **Step 4: Validate schema and generate client**

Run:

```powershell
npx prisma validate
npm run prisma:generate
```

Expected: both commands exit `0`.

- [ ] **Step 5: Commit schema changes**

Run:

```powershell
git add prisma/schema.prisma prisma/migrations/20260609010000_users_auth_tenant_admin/migration.sql prisma/seed.ts
git commit -m "feat: add auth token schema"
```

## Task 2: Add Auth Helper Modules

**Files:**
- Create: `src/modules/auth/email.test.ts`
- Create: `src/modules/auth/email.ts`
- Create: `src/modules/auth/tokens.test.ts`
- Create: `src/modules/auth/tokens.ts`

- [ ] **Step 1: Write email helper tests**

Create `src/modules/auth/email.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { emailDomainAllowed, normalizeEmail, requireAllowedOrganizationEmail } from "./email";

describe("email auth helpers", () => {
  it("normalizes emails for identity lookups", () => {
    expect(normalizeEmail("  Admin@Acme.TEST ")).toBe("admin@acme.test");
  });

  it("allows email domains configured for the organization", () => {
    expect(emailDomainAllowed("learner@acme.test", ["acme.test"])).toBe(true);
    expect(emailDomainAllowed("learner@other.test", ["acme.test"])).toBe(false);
  });

  it("rejects non-organization emails with a clear error", () => {
    expect(() => requireAllowedOrganizationEmail("person@gmail.com", ["acme.test"])).toThrow(
      "Email domain is not allowed for this organization",
    );
  });
});
```

- [ ] **Step 2: Verify email tests fail**

Run:

```powershell
npm run test -- src/modules/auth/email.test.ts
```

Expected: fail because `email.ts` does not exist.

- [ ] **Step 3: Implement email helpers**

Create `src/modules/auth/email.ts`:

```ts
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function getEmailDomain(email: string): string {
  const normalized = normalizeEmail(email);
  const [, domain] = normalized.split("@");

  if (!domain) {
    throw new Error("Valid email is required");
  }

  return domain;
}

export function emailDomainAllowed(email: string, allowedDomains: string[]): boolean {
  if (allowedDomains.length === 0) {
    return false;
  }

  const domain = getEmailDomain(email);
  const normalizedDomains = allowedDomains.map((allowedDomain) => allowedDomain.trim().toLowerCase());

  return normalizedDomains.includes(domain);
}

export function requireAllowedOrganizationEmail(email: string, allowedDomains: string[]): string {
  const normalized = normalizeEmail(email);

  if (!emailDomainAllowed(normalized, allowedDomains)) {
    throw new Error("Email domain is not allowed for this organization");
  }

  return normalized;
}
```

- [ ] **Step 4: Write token helper tests**

Create `src/modules/auth/tokens.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { createExpiringToken, hashToken, tokenIsUsable } from "./tokens";

describe("auth token helpers", () => {
  it("creates a raw token, hash, and expiry", () => {
    const now = new Date("2026-06-09T12:00:00.000Z");
    const token = createExpiringToken(now, 60);

    expect(token.rawToken.length).toBeGreaterThanOrEqual(32);
    expect(token.tokenHash).toHaveLength(64);
    expect(token.expiresAt.toISOString()).toBe("2026-06-09T13:00:00.000Z");
  });

  it("hashes the same token consistently", () => {
    expect(hashToken("abc123")).toBe(hashToken("abc123"));
  });

  it("treats used or expired tokens as unusable", () => {
    const now = new Date("2026-06-09T12:00:00.000Z");

    expect(tokenIsUsable({ expiresAt: new Date("2026-06-09T12:01:00.000Z"), usedAt: null }, now)).toBe(true);
    expect(tokenIsUsable({ expiresAt: new Date("2026-06-09T11:59:00.000Z"), usedAt: null }, now)).toBe(false);
    expect(tokenIsUsable({ expiresAt: new Date("2026-06-09T12:01:00.000Z"), usedAt: now }, now)).toBe(false);
  });
});
```

- [ ] **Step 5: Verify token tests fail**

Run:

```powershell
npm run test -- src/modules/auth/tokens.test.ts
```

Expected: fail because `tokens.ts` does not exist.

- [ ] **Step 6: Implement token helpers**

Create `src/modules/auth/tokens.ts`:

```ts
import crypto from "node:crypto";

export type ExpiringToken = {
  rawToken: string;
  tokenHash: string;
  expiresAt: Date;
};

export type PersistedTokenState = {
  expiresAt: Date;
  usedAt: Date | null;
};

export function hashToken(rawToken: string): string {
  return crypto.createHash("sha256").update(rawToken).digest("hex");
}

export function createExpiringToken(now: Date, expiresInMinutes: number): ExpiringToken {
  if (expiresInMinutes <= 0) {
    throw new Error("Token expiry must be positive");
  }

  const rawToken = crypto.randomBytes(32).toString("base64url");
  const expiresAt = new Date(now);
  expiresAt.setUTCMinutes(expiresAt.getUTCMinutes() + expiresInMinutes);

  return {
    rawToken,
    tokenHash: hashToken(rawToken),
    expiresAt,
  };
}

export function tokenIsUsable(token: PersistedTokenState, now: Date): boolean {
  return token.usedAt === null && token.expiresAt.getTime() > now.getTime();
}
```

- [ ] **Step 7: Run helper tests and commit**

Run:

```powershell
npm run test -- src/modules/auth/email.test.ts src/modules/auth/tokens.test.ts
git add src/modules/auth/email.ts src/modules/auth/email.test.ts src/modules/auth/tokens.ts src/modules/auth/tokens.test.ts
git commit -m "feat: add auth email and token helpers"
```

Expected: tests pass and commit succeeds.

## Task 3: Add Credentials And Permission Rules

**Files:**
- Create: `src/modules/auth/credentials.test.ts`
- Create: `src/modules/auth/credentials.ts`
- Create: `src/modules/auth/permissions.test.ts`
- Create: `src/modules/auth/permissions.ts`

- [ ] **Step 1: Write credentials tests**

Create `src/modules/auth/credentials.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { hashPassword } from "@/lib/auth/password";
import { authenticateWithPassword } from "./credentials";

describe("authenticateWithPassword", () => {
  it("authenticates active users with a valid password", async () => {
    const passwordHash = await hashPassword("CorrectPassword123!");
    const user = await authenticateWithPassword(
      { email: "Admin@Acme.TEST", password: "CorrectPassword123!" },
      {
        findUserByEmail: async () => ({
          id: "user_1",
          email: "admin@acme.test",
          firstName: "Asha",
          lastName: "Admin",
          passwordHash,
          status: "ACTIVE",
          isPlatformOwner: false,
        }),
      },
    );

    expect(user?.id).toBe("user_1");
  });

  it("rejects invited users and invalid passwords", async () => {
    const passwordHash = await hashPassword("CorrectPassword123!");

    await expect(
      authenticateWithPassword(
        { email: "learner@acme.test", password: "CorrectPassword123!" },
        {
          findUserByEmail: async () => ({
            id: "user_2",
            email: "learner@acme.test",
            firstName: "Leela",
            lastName: "Learner",
            passwordHash,
            status: "INVITED",
            isPlatformOwner: false,
          }),
        },
      ),
    ).resolves.toBeNull();

    await expect(
      authenticateWithPassword(
        { email: "learner@acme.test", password: "WrongPassword123!" },
        {
          findUserByEmail: async () => ({
            id: "user_2",
            email: "learner@acme.test",
            firstName: "Leela",
            lastName: "Learner",
            passwordHash,
            status: "ACTIVE",
            isPlatformOwner: false,
          }),
        },
      ),
    ).resolves.toBeNull();
  });
});
```

- [ ] **Step 2: Implement credentials helper**

Create `src/modules/auth/credentials.ts`:

```ts
import type { UserStatus } from "@prisma/client";

import { verifyPassword } from "@/lib/auth/password";
import { normalizeEmail } from "./email";

export type CredentialLoginInput = {
  email: string;
  password: string;
};

export type AuthenticatedUser = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  passwordHash: string | null;
  status: UserStatus;
  isPlatformOwner: boolean;
};

export type CredentialRepository = {
  findUserByEmail(email: string): Promise<AuthenticatedUser | null>;
};

export async function authenticateWithPassword(
  input: CredentialLoginInput,
  repository: CredentialRepository,
): Promise<AuthenticatedUser | null> {
  const user = await repository.findUserByEmail(normalizeEmail(input.email));

  if (!user || user.status !== "ACTIVE" || !user.passwordHash) {
    return null;
  }

  const validPassword = await verifyPassword(input.password, user.passwordHash);

  return validPassword ? user : null;
}
```

- [ ] **Step 3: Write permission tests**

Create `src/modules/auth/permissions.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
  canManageOrganization,
  canManageOrganizationUsers,
  canViewMembershipProgress,
  type MembershipAuthContext,
} from "./permissions";

const admin: MembershipAuthContext = {
  userId: "admin-user",
  isPlatformOwner: false,
  memberships: [{ id: "admin-membership", organizationId: "org_1", roles: ["ADMIN"], managerMembershipId: null }],
};

const manager: MembershipAuthContext = {
  userId: "manager-user",
  isPlatformOwner: false,
  memberships: [{ id: "manager-membership", organizationId: "org_1", roles: ["MANAGER"], managerMembershipId: null }],
};

describe("authorization permissions", () => {
  it("lets platform owners manage any organization", () => {
    expect(canManageOrganization({ userId: "owner", isPlatformOwner: true, memberships: [] }, "org_any")).toBe(true);
  });

  it("lets organization admins manage their own users only", () => {
    expect(canManageOrganizationUsers(admin, "org_1")).toBe(true);
    expect(canManageOrganizationUsers(admin, "org_2")).toBe(false);
  });

  it("lets managers view only direct report progress", () => {
    expect(
      canViewMembershipProgress(manager, {
        id: "learner-membership",
        userId: "learner-user",
        organizationId: "org_1",
        managerMembershipId: "manager-membership",
      }),
    ).toBe(true);

    expect(
      canViewMembershipProgress(manager, {
        id: "other-learner",
        userId: "other-user",
        organizationId: "org_1",
        managerMembershipId: null,
      }),
    ).toBe(false);
  });
});
```

- [ ] **Step 4: Implement permission helpers**

Create `src/modules/auth/permissions.ts`:

```ts
import type { OrganizationRole } from "@prisma/client";

export type AuthMembership = {
  id: string;
  organizationId: string;
  roles: OrganizationRole[];
  managerMembershipId: string | null;
};

export type MembershipAuthContext = {
  userId: string;
  isPlatformOwner: boolean;
  memberships: AuthMembership[];
};

export type TargetMembership = {
  id: string;
  userId: string;
  organizationId: string;
  managerMembershipId: string | null;
};

function membershipForOrganization(context: MembershipAuthContext, organizationId: string): AuthMembership | undefined {
  return context.memberships.find((membership) => membership.organizationId === organizationId);
}

export function hasOrganizationRole(
  context: MembershipAuthContext,
  organizationId: string,
  role: OrganizationRole,
): boolean {
  return membershipForOrganization(context, organizationId)?.roles.includes(role) ?? false;
}

export function canManageOrganization(context: MembershipAuthContext, organizationId: string): boolean {
  return context.isPlatformOwner || hasOrganizationRole(context, organizationId, "ADMIN");
}

export function canManageOrganizationUsers(context: MembershipAuthContext, organizationId: string): boolean {
  return canManageOrganization(context, organizationId);
}

export function canViewMembershipProgress(context: MembershipAuthContext, target: TargetMembership): boolean {
  if (context.isPlatformOwner || hasOrganizationRole(context, target.organizationId, "ADMIN")) {
    return true;
  }

  if (target.userId === context.userId) {
    return true;
  }

  const managerMembership = membershipForOrganization(context, target.organizationId);

  return managerMembership?.roles.includes("MANAGER") === true && target.managerMembershipId === managerMembership.id;
}
```

- [ ] **Step 5: Run tests and commit**

Run:

```powershell
npm run test -- src/modules/auth/credentials.test.ts src/modules/auth/permissions.test.ts
git add src/modules/auth/credentials.ts src/modules/auth/credentials.test.ts src/modules/auth/permissions.ts src/modules/auth/permissions.test.ts
git commit -m "feat: add credential and permission rules"
```

Expected: tests pass and commit succeeds.

## Task 4: Add Invitation And Password Reset Services

**Files:**
- Create: `src/modules/auth/invitations.test.ts`
- Create: `src/modules/auth/invitations.ts`
- Create: `src/modules/auth/password-resets.test.ts`
- Create: `src/modules/auth/password-resets.ts`

- [ ] **Step 1: Implement invitation service with tests first**

The tests must verify:

- `createInvitation` creates an expiring token for an invited membership.
- `activateInvitation` rejects used or expired tokens.
- `activateInvitation` sets user and membership status to `ACTIVE` and stores a password hash.

Use an injected repository interface so tests can use an in-memory fake and production code can later call Prisma.

Core exported types and functions in `src/modules/auth/invitations.ts`:

```ts
export const INVITATION_EXPIRES_IN_MINUTES = 60 * 24 * 7;

export type CreateInvitationInput = {
  organizationId: string;
  membershipId: string;
  userId: string;
  now: Date;
};

export type ActivateInvitationInput = {
  rawToken: string;
  password: string;
  now: Date;
};

export async function createInvitation(
  input: CreateInvitationInput,
  repository: InvitationRepository,
): Promise<{ rawToken: string; expiresAt: Date }>;

export async function activateInvitation(
  input: ActivateInvitationInput,
  repository: InvitationRepository,
): Promise<void>;
```

Expected repository methods:

```ts
createInvitationToken(data: {
  organizationId: string;
  membershipId: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
}): Promise<void>;
findInvitationByTokenHash(tokenHash: string): Promise<{
  id: string;
  userId: string;
  membershipId: string;
  expiresAt: Date;
  usedAt: Date | null;
} | null>;
activateInvitation(data: {
  invitationId: string;
  userId: string;
  membershipId: string;
  passwordHash: string;
  usedAt: Date;
}): Promise<void>;
```

- [ ] **Step 2: Implement password reset service with tests first**

The tests must verify:

- Requesting a reset for an unknown email returns `null`.
- Requesting a reset for an existing user returns a raw token and stores only the hash.
- Completing reset rejects used or expired tokens.
- Completing reset updates the password hash and marks the token used.

Core exported types and functions in `src/modules/auth/password-resets.ts`:

```ts
export const PASSWORD_RESET_EXPIRES_IN_MINUTES = 60;

export async function requestPasswordReset(
  input: { email: string; now: Date },
  repository: PasswordResetRepository,
): Promise<{ rawToken: string; expiresAt: Date } | null>;

export async function completePasswordReset(
  input: { rawToken: string; password: string; now: Date },
  repository: PasswordResetRepository,
): Promise<void>;
```

Expected repository methods:

```ts
findUserByEmail(email: string): Promise<{ id: string } | null>;
createPasswordResetToken(data: { userId: string; tokenHash: string; expiresAt: Date }): Promise<void>;
findPasswordResetByTokenHash(tokenHash: string): Promise<{
  id: string;
  userId: string;
  expiresAt: Date;
  usedAt: Date | null;
} | null>;
completePasswordReset(data: {
  resetTokenId: string;
  userId: string;
  passwordHash: string;
  usedAt: Date;
}): Promise<void>;
```

- [ ] **Step 3: Run auth flow service tests and commit**

Run:

```powershell
npm run test -- src/modules/auth/invitations.test.ts src/modules/auth/password-resets.test.ts
git add src/modules/auth/invitations.ts src/modules/auth/invitations.test.ts src/modules/auth/password-resets.ts src/modules/auth/password-resets.test.ts
git commit -m "feat: add invitation and password reset services"
```

Expected: tests pass and commit succeeds.

## Task 5: Add Organization Provisioning

**Files:**
- Create: `src/modules/organizations/provisioning.test.ts`
- Create: `src/modules/organizations/provisioning.ts`

- [ ] **Step 1: Write provisioning tests**

Create tests that verify:

- Organization names and slugs are required.
- Hex theme colors are validated.
- Allowed email domains are normalized.
- Platform owner is required for provisioning.
- Repository `createOrganization` receives name, slug, domains, colors, policy, logo URL, and global library flag.

- [ ] **Step 2: Implement provisioning service**

`src/modules/organizations/provisioning.ts` must export:

```ts
export type ProvisionOrganizationInput = {
  actor: { userId: string; isPlatformOwner: boolean };
  name: string;
  slug: string;
  allowedEmailDomains: string[];
  logoUrl?: string;
  primaryColor: string;
  accentColor: string;
  enrollmentPolicy: "ASSIGNMENT_ONLY" | "ASSIGNMENT_AND_SELF_ENROLLMENT";
  globalLibraryEnabled: boolean;
};

export type ProvisionOrganizationRepository = {
  createOrganization(data: {
    name: string;
    slug: string;
    allowedEmailDomains: string[];
    logoUrl: string | null;
    primaryColor: string;
    accentColor: string;
    enrollmentPolicy: "ASSIGNMENT_ONLY" | "ASSIGNMENT_AND_SELF_ENROLLMENT";
    globalLibraryEnabled: boolean;
  }): Promise<{ id: string; slug: string }>;
};

export async function provisionOrganization(
  input: ProvisionOrganizationInput,
  repository: ProvisionOrganizationRepository,
): Promise<{ id: string; slug: string }>;
```

Rules:

- Throw `Only platform owners can provision organizations` unless actor is platform owner.
- Throw `Organization name is required` for blank name.
- Throw `Organization slug is required` for blank slug.
- Throw `At least one allowed email domain is required` for no domains.
- Throw `Theme color must be a 6-digit hex color` for invalid colors.
- Normalize domains to lowercase without leading `@`.

- [ ] **Step 3: Run tests and commit**

Run:

```powershell
npm run test -- src/modules/organizations/provisioning.test.ts
git add src/modules/organizations/provisioning.ts src/modules/organizations/provisioning.test.ts
git commit -m "feat: add organization provisioning service"
```

Expected: tests pass and commit succeeds.

## Task 6: Add CSV User Import Planning

**Files:**
- Create: `src/modules/users/csv-import.test.ts`
- Create: `src/modules/users/csv-import.ts`

- [ ] **Step 1: Write CSV import tests**

Tests must verify:

- Valid CSV returns normalized rows with roles and default `INVITED` status.
- Duplicate emails in a file produce row-level errors.
- Emails outside the allowed organization domains produce row-level errors.
- Missing names produce row-level errors.
- Manager email can point to another row in the same import.
- A user cannot be their own manager.

Use this valid fixture:

```text
email,firstName,lastName,role,managerEmail,employeeId,department,title,status
manager@acme.test,Mohan,Manager,MANAGER,,MGR-1,Operations,Manager,ACTIVE
learner@acme.test,Leela,Learner,LEARNER,manager@acme.test,EMP-1,Operations,Specialist,
```

- [ ] **Step 2: Implement CSV import planning**

`src/modules/users/csv-import.ts` must export:

```ts
export type UserImportRole = "ADMIN" | "MANAGER" | "LEARNER";
export type UserImportStatus = "INVITED" | "ACTIVE" | "INACTIVE";

export type ValidatedUserImportRow = {
  rowNumber: number;
  email: string;
  firstName: string;
  lastName: string;
  role: UserImportRole;
  managerEmail: string | null;
  employeeId: string | null;
  department: string | null;
  title: string | null;
  status: UserImportStatus;
};

export type UserImportValidationError = {
  rowNumber: number;
  field: string;
  message: string;
};

export type UserImportPlan = {
  rows: ValidatedUserImportRow[];
  errors: UserImportValidationError[];
};

export function parseAndValidateUserImportCsv(input: {
  csv: string;
  allowedEmailDomains: string[];
  existingManagerEmails?: string[];
}): UserImportPlan;
```

Implementation can use a small local CSV line parser that supports comma-separated values and quoted cells. It must not commit any database writes.

- [ ] **Step 3: Run tests and commit**

Run:

```powershell
npm run test -- src/modules/users/csv-import.test.ts
git add src/modules/users/csv-import.ts src/modules/users/csv-import.test.ts
git commit -m "feat: add csv user import validation"
```

Expected: tests pass and commit succeeds.

## Task 7: Add User Import Commit Service

**Files:**
- Create: `src/modules/users/user-import.test.ts`
- Create: `src/modules/users/user-import.ts`

- [ ] **Step 1: Write import commit tests**

Tests must verify:

- Import fails if the plan contains validation errors.
- Users are upserted by email.
- Memberships are upserted by organization and user.
- Manager relationships are connected after manager memberships exist.
- Invitations are created for `INVITED` rows only.

- [ ] **Step 2: Implement import commit service**

`src/modules/users/user-import.ts` must export:

```ts
export type CommitUserImportInput = {
  organizationId: string;
  actorId: string;
  plan: UserImportPlan;
  now: Date;
};

export type CommitUserImportRepository = {
  upsertUser(data: {
    email: string;
    firstName: string;
    lastName: string;
    status: "INVITED" | "ACTIVE" | "INACTIVE";
  }): Promise<{ id: string; email: string }>;
  upsertMembership(data: {
    organizationId: string;
    userId: string;
    roles: ("ADMIN" | "MANAGER" | "LEARNER")[];
    employeeId: string | null;
    department: string | null;
    title: string | null;
    status: "INVITED" | "ACTIVE" | "INACTIVE";
  }): Promise<{ id: string; userId: string; email: string }>;
  setMembershipManager(data: {
    organizationId: string;
    membershipId: string;
    managerMembershipId: string | null;
  }): Promise<void>;
  createInvitation(data: {
    organizationId: string;
    membershipId: string;
    userId: string;
    now: Date;
  }): Promise<void>;
  recordAuditLog(data: {
    organizationId: string;
    actorId: string;
    importedCount: number;
  }): Promise<void>;
};

export async function commitUserImport(
  input: CommitUserImportInput,
  repository: CommitUserImportRepository,
): Promise<{ importedCount: number }>;
```

- [ ] **Step 3: Run tests and commit**

Run:

```powershell
npm run test -- src/modules/users/user-import.test.ts
git add src/modules/users/user-import.ts src/modules/users/user-import.test.ts
git commit -m "feat: add user import commit service"
```

Expected: tests pass and commit succeeds.

## Task 8: Wire NextAuth And Admin/Auth Pages

**Files:**
- Create: `src/lib/auth/next-auth.ts`
- Create: `src/app/api/auth/[...nextauth]/route.ts`
- Create: `src/app/login/page.tsx`
- Create: `src/app/invite/[token]/page.tsx`
- Create: `src/app/reset-password/page.tsx`
- Create: `src/app/reset-password/[token]/page.tsx`
- Create: `src/app/platform/organizations/new/page.tsx`
- Create: `src/app/org/[slug]/admin/users/page.tsx`

- [ ] **Step 1: Add NextAuth options**

Create `src/lib/auth/next-auth.ts` using `CredentialsProvider`, `authenticateWithPassword`, and `prisma.user.findUnique`. JWT and session callbacks must add `user.id` and `isPlatformOwner`.

- [ ] **Step 2: Add auth route**

Create `src/app/api/auth/[...nextauth]/route.ts`:

```ts
import NextAuth from "next-auth";

import { authOptions } from "@/lib/auth/next-auth";

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
```

- [ ] **Step 3: Add thin pages**

Each page should be a server component with accessible form fields and no database writes yet:

- `/login`: email/password form posting to `/api/auth/callback/credentials`.
- `/invite/[token]`: password activation form with hidden token display.
- `/reset-password`: email field for reset request.
- `/reset-password/[token]`: new password form.
- `/platform/organizations/new`: organization name, slug, allowed domains, logo URL, colors, enrollment policy, global library flag.
- `/org/[slug]/admin/users`: CSV textarea, expected columns, a validate button, and an import button that is visibly disabled until server actions are wired in a later slice.

Do not add public signup links.

- [ ] **Step 4: Run build and commit**

Run:

```powershell
npm run build
git add src/lib/auth/next-auth.ts src/app/api/auth src/app/login src/app/invite src/app/reset-password src/app/platform/organizations src/app/org
git commit -m "feat: add auth and tenant admin pages"
```

Expected: build exits `0` and commit succeeds.

## Task 9: Final Verification

**Files:**
- Modify: none unless verification reveals a concrete failure.

- [ ] **Step 1: Run full tests**

Run:

```powershell
npm run test
```

Expected: all tests pass.

- [ ] **Step 2: Run lint**

Run:

```powershell
npm run lint
```

Expected: lint exits `0`.

- [ ] **Step 3: Validate Prisma schema**

Run:

```powershell
npx prisma validate
```

Expected: schema is valid.

- [ ] **Step 4: Run production build**

Run:

```powershell
npm run build
```

Expected: build exits `0`.

- [ ] **Step 5: Confirm clean feature branch**

Run:

```powershell
git status --short --branch
git log --oneline -10
```

Expected: clean `feature/users-auth-tenant-admin` branch with task commits.

## Review Checklist

Before merging:

- No public signup entry points were added.
- Social login was not added.
- Tenant email domains are enforced in import/invite validation.
- Managers can see only direct reports in permission helpers.
- Auth and tenant admin business rules live in modules, not page components.
- Prisma migration exists for every schema change.
- Full verification commands pass from the feature worktree.
