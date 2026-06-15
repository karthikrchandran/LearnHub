# Notifications Jobs And Email Providers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add durable tenant-scoped notification jobs, reminder scheduling, bounded cron processing, admin/platform inspection pages, and production-capable SMTP and API email providers.

**Architecture:** Notifications are modeled as idempotent database jobs created by assignment and certificate workflows, then processed by a secret-protected cron route in bounded batches. Scheduling, templates, repository persistence, provider delivery, and UI read models stay in separate files so retries and provider changes do not leak into assignments, certificates, auth, or progress. Tenant safety is enforced by storing `organizationId` on every job and filtering all admin reads by organization unless the caller is a platform owner.

**Tech Stack:** Next.js App Router pages and route handlers, TypeScript, Prisma 7, PostgreSQL, Vitest, Zod env validation, Nodemailer for SMTP, native `fetch` for API transactional email.

---

## Scope Boundary

This plan implements notification job persistence, scheduling, delivery, retry state, provider wiring, and inspection pages. It does not add user-editable notification timing, notification preferences, a queue vendor integration, in-app notifications, SMS, template editors, or manual retry buttons.

The fixed MVP timing is:

- Assignment email: scheduled immediately when an assignment is created.
- Due-soon learner reminder: scheduled two calendar days before `CourseAssignment.dueDate`, never before the assignment `startDate`.
- Overdue learner reminder: scheduled one calendar day after `CourseAssignment.dueDate` when the assignment is not completed.
- Manager escalation: scheduled three calendar days after `CourseAssignment.dueDate` when the assignment is not completed and the learner has a manager.
- Completion and certificate email: scheduled immediately when `Certificate` is created.

## File Structure

- Modify `package.json`: add `nodemailer` and `@types/nodemailer` for SMTP delivery.
- Modify `prisma/schema.prisma`: add notification enums, `NotificationJob`, and relations from `Organization`, `CourseAssignment`, and `Certificate`.
- Create `prisma/migrations/20260613040000_notification_jobs/migration.sql`: add enums, table, indexes, unique idempotency key, and foreign keys.
- Modify `src/lib/env.ts`: validate cron secret, SMTP settings, and API provider settings.
- Modify `src/lib/env.test.ts`: cover production-safe provider config and cron secret validation.
- Create `src/modules/notifications/notification-jobs.ts`: core job types, idempotency key, retry policy, job processor, and read permissions.
- Create `src/modules/notifications/notification-jobs.test.ts`: unit tests for idempotency, status transitions, retry behavior, tenant filters, and bounded processing.
- Create `src/modules/notifications/scheduler.ts`: schedule assignment, reminder, escalation, and certificate jobs.
- Create `src/modules/notifications/scheduler.test.ts`: unit tests for due dates, manager escalation, completed-assignment suppression, and duplicate-safe scheduling.
- Create `src/modules/notifications/templates.ts`: notification template builders for assignment, due-soon, overdue, manager escalation, and certificate emails.
- Create `src/modules/notifications/templates.test.ts`: tests for subject/body content and token-bearing URL redaction behavior through provider logs.
- Create `src/modules/notifications/prisma-repository.ts`: Prisma repository for job upserts, leasing due jobs, recording success/failure, and admin read models.
- Create `src/modules/notifications/prisma-repository.test.ts`: query-shape and transaction tests with mocked Prisma delegates.
- Create `src/modules/providers/email/smtp-email-provider.ts`: SMTP provider backed by configured SMTP settings.
- Create `src/modules/providers/email/smtp-email-provider.test.ts`: tests for Nodemailer transport input, message id mapping, and failure propagation.
- Create `src/modules/providers/email/api-email-provider.ts`: API provider backed by configured transactional endpoint and bearer token.
- Create `src/modules/providers/email/api-email-provider.test.ts`: tests for `fetch` request shape, response parsing, provider message id, and non-2xx failures.
- Modify `src/modules/providers/email/email-provider.ts`: wire console, SMTP, and API provider factories; keep console local-only and redacted.
- Modify `src/modules/providers/email/email-provider.test.ts`: assert provider factory production rules and console redaction.
- Modify `src/modules/assignments/assignment-service.ts`: schedule assignment-created jobs after assignment creation inside the same transaction boundary.
- Modify `src/modules/assignments/assignment-service.test.ts`: assert assignment scheduling is called once and duplicate assignment does not schedule.
- Modify `src/modules/assignments/prisma-repository.ts`: expose notification scheduler dependency or composed repository method.
- Modify `src/modules/certificates/certificates.ts`: schedule new certificate notifications and ensure existing certificates have the idempotent certificate notification job without duplicating it.
- Modify `src/modules/certificates/certificates.test.ts`: assert existing certificates ensure the idempotent certificate email job exists without duplicate scheduling.
- Create `src/app/api/jobs/notifications/route.ts`: shared-secret cron route that processes due jobs in bounded batches.
- Create `src/app/org/[slug]/admin/notifications/page.tsx`: tenant admin inspection page for pending and failed jobs.
- Create `src/app/platform/notifications/page.tsx`: platform-owner cross-tenant failure inspection page.
- Create `src/modules/notifications/page-shells.test.ts`: page smoke tests for tenant and platform notification inspection.
- Create `src/modules/notifications/route.test.ts`: cron route tests for shared secret, batch bound, and response counts.

## Data Model

Add these Prisma enums:

```prisma
enum NotificationType {
  ASSIGNMENT_CREATED
  ASSIGNMENT_DUE_SOON
  ASSIGNMENT_OVERDUE
  MANAGER_ESCALATION
  CERTIFICATE_CREATED
}

enum NotificationJobStatus {
  PENDING
  PROCESSING
  SENT
  FAILED
  CANCELLED
}
```

Add this model:

```prisma
model NotificationJob {
  id                String                @id @default(cuid())
  organizationId    String
  assignmentId      String?
  certificateId     String?
  type              NotificationType
  status            NotificationJobStatus @default(PENDING)
  recipientEmail    String
  recipientName     String
  subject           String
  html              String
  text              String
  scheduledFor      DateTime
  idempotencyKey    String                @unique
  attempts          Int                   @default(0)
  providerMessageId String?
  lastError         String?
  nextRunAt         DateTime
  leasedAt          DateTime?
  leaseExpiresAt    DateTime?
  leaseToken        String?
  sentAt            DateTime?
  createdAt         DateTime              @default(now())
  updatedAt         DateTime              @updatedAt
  organization      Organization          @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  assignment        CourseAssignment?     @relation(fields: [organizationId, assignmentId], references: [organizationId, id], onDelete: Cascade)
  certificate       Certificate?          @relation(fields: [organizationId, certificateId], references: [organizationId, id], onDelete: Cascade)

  @@index([organizationId, status, nextRunAt])
  @@index([status, nextRunAt])
  @@index([status, leaseExpiresAt])
  @@index([organizationId, type, scheduledFor])
  @@index([assignmentId])
  @@index([certificateId])
}
```

Also extend the existing certificate model with the composite unique needed by the tenant-scoped notification FK:

```prisma
model Certificate {
  notificationJobs NotificationJob[]

  @@unique([organizationId, id])
}
```

The idempotency key format must be:

```text
${organizationId}:${assignmentId}:${notificationType}:${YYYY-MM-DD}
```

For certificate jobs, use the assignment id from the certificate:

```text
${organizationId}:${certificate.assignmentId}:CERTIFICATE_CREATED:${YYYY-MM-DD}
```

`YYYY-MM-DD` is derived from `scheduledFor` in UTC with `scheduledFor.toISOString().slice(0, 10)`.

## Acceptance Criteria

- Course assignment creation schedules `ASSIGNMENT_CREATED`, `ASSIGNMENT_DUE_SOON`, `ASSIGNMENT_OVERDUE`, and `MANAGER_ESCALATION` jobs when inputs support them.
- Certificate creation schedules exactly one `CERTIFICATE_CREATED` job for newly created certificates.
- Job creation is idempotent per organization, assignment, notification type, and scheduled UTC date.
- Jobs store `status`, `attempts`, `providerMessageId`, `lastError`, `nextRunAt`, `scheduledFor`, and `sentAt`.
- Jobs store `leasedAt`, `leaseExpiresAt`, and `leaseToken`; stale `PROCESSING` jobs are reclaimable after `leaseExpiresAt`.
- Cron route rejects missing or wrong shared secrets with `401`.
- Cron route processes at most the requested bounded batch size and caps the batch at `50`.
- Sent jobs transition to `SENT` by `id + leaseToken`, store provider message id, clear lease fields, and set `sentAt`.
- Failed sends increment attempts by `id + leaseToken`, store sanitized error text, clear lease fields, and either retry with exponential backoff or move to `FAILED` after three attempts.
- Pending, failed, and stale processing tenant jobs are visible only to organization admins or platform owners in `/org/[slug]/admin/notifications`.
- Platform owners can inspect failed and stale processing jobs across all tenants in `/platform/notifications`.
- SMTP provider is production-allowed when SMTP host, port, and from address are configured.
- API provider is production-allowed when endpoint, token, and from address are configured.
- Console provider remains blocked in production and logs no raw token-bearing invite, reset, certificate, or verification URLs.
- Every query that returns organization-scoped jobs includes `organizationId` unless the caller passed platform-owner authorization.

## Task 1: Add Notification Job Schema

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260613040000_notification_jobs/migration.sql`

- [ ] **Step 1: Write the Prisma schema change**

Add the two enums and `NotificationJob` model from the Data Model section. Also add these relation fields:

```prisma
model Organization {
  notificationJobs NotificationJob[]
}

model CourseAssignment {
  notificationJobs NotificationJob[]
}

model Certificate {
  notificationJobs NotificationJob[]

  @@unique([organizationId, id])
}
```

Keep the existing fields in those models unchanged.

- [ ] **Step 2: Create the SQL migration**

Create `prisma/migrations/20260613040000_notification_jobs/migration.sql` with:

```sql
CREATE TYPE "NotificationType" AS ENUM (
  'ASSIGNMENT_CREATED',
  'ASSIGNMENT_DUE_SOON',
  'ASSIGNMENT_OVERDUE',
  'MANAGER_ESCALATION',
  'CERTIFICATE_CREATED'
);

CREATE TYPE "NotificationJobStatus" AS ENUM (
  'PENDING',
  'PROCESSING',
  'SENT',
  'FAILED',
  'CANCELLED'
);

CREATE TABLE "NotificationJob" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "assignmentId" TEXT,
  "certificateId" TEXT,
  "type" "NotificationType" NOT NULL,
  "status" "NotificationJobStatus" NOT NULL DEFAULT 'PENDING',
  "recipientEmail" TEXT NOT NULL,
  "recipientName" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "html" TEXT NOT NULL,
  "text" TEXT NOT NULL,
  "scheduledFor" TIMESTAMP(3) NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "providerMessageId" TEXT,
  "lastError" TEXT,
  "nextRunAt" TIMESTAMP(3) NOT NULL,
  "leasedAt" TIMESTAMP(3),
  "leaseExpiresAt" TIMESTAMP(3),
  "leaseToken" TEXT,
  "sentAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "NotificationJob_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "NotificationJob_idempotencyKey_key" ON "NotificationJob"("idempotencyKey");
CREATE INDEX "NotificationJob_organizationId_status_nextRunAt_idx" ON "NotificationJob"("organizationId", "status", "nextRunAt");
CREATE INDEX "NotificationJob_status_nextRunAt_idx" ON "NotificationJob"("status", "nextRunAt");
CREATE INDEX "NotificationJob_status_leaseExpiresAt_idx" ON "NotificationJob"("status", "leaseExpiresAt");
CREATE INDEX "NotificationJob_organizationId_type_scheduledFor_idx" ON "NotificationJob"("organizationId", "type", "scheduledFor");
CREATE INDEX "NotificationJob_assignmentId_idx" ON "NotificationJob"("assignmentId");
CREATE INDEX "NotificationJob_certificateId_idx" ON "NotificationJob"("certificateId");

CREATE UNIQUE INDEX "Certificate_organizationId_id_key" ON "Certificate"("organizationId", "id");

ALTER TABLE "NotificationJob"
  ADD CONSTRAINT "NotificationJob_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "NotificationJob"
  ADD CONSTRAINT "NotificationJob_organizationId_assignmentId_fkey"
  FOREIGN KEY ("organizationId", "assignmentId") REFERENCES "CourseAssignment"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "NotificationJob"
  ADD CONSTRAINT "NotificationJob_organizationId_certificateId_fkey"
  FOREIGN KEY ("organizationId", "certificateId") REFERENCES "Certificate"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
```

- [ ] **Step 3: Verify schema**

Run:

```powershell
npx prisma validate
npm run prisma:generate
```

Expected: both commands exit `0` and Prisma Client includes `notificationJob`, `NotificationType`, and `NotificationJobStatus`.

- [ ] **Step 4: Commit**

```powershell
git add prisma/schema.prisma prisma/migrations/20260613040000_notification_jobs/migration.sql
git commit -m "feat: add notification job schema"
```

Expected: commit succeeds.

## Task 2: Add Environment Contract And Dependencies

**Files:**
- Modify: `package.json`
- Modify: `src/lib/env.ts`
- Modify: `src/lib/env.test.ts`

- [ ] **Step 1: Add failing env tests**

Add tests that assert:

```ts
it("requires notification cron secret in production", () => {
  expect(() =>
    getEnv({
      NODE_ENV: "production",
      DATABASE_URL: localDatabaseUrl,
      NEXTAUTH_SECRET: "production-secret",
      NEXTAUTH_URL: "https://learnhub.example.com",
      APP_BASE_URL: "https://learnhub.example.com",
      EMAIL_PROVIDER: "smtp",
      SMTP_HOST: "smtp.example.com",
      SMTP_FROM_EMAIL: "no-reply@learnhub.example.com",
    }),
  ).toThrow(/NOTIFICATION_CRON_SECRET/);
});

it("requires API provider endpoint, token, and sender", () => {
  expect(() =>
    getEnv({
      NODE_ENV: "test",
      EMAIL_PROVIDER: "api-provider",
      EMAIL_API_ENDPOINT: "https://email.example.com/send",
    }),
  ).toThrow(/EMAIL_API_TOKEN/);
});

it("accepts configured SMTP and API providers in production", () => {
  const smtpEnv = getEnv({
      NODE_ENV: "production",
      DATABASE_URL: localDatabaseUrl,
      NEXTAUTH_SECRET: "production-secret",
      NEXTAUTH_URL: "https://learnhub.example.com",
      APP_BASE_URL: "https://learnhub.example.com",
      EMAIL_PROVIDER: "smtp",
      SMTP_HOST: "smtp.example.com",
      SMTP_PORT: "465",
      SMTP_SECURE: "true",
      SMTP_USER: "smtp-user",
      SMTP_PASSWORD: "smtp-password",
      SMTP_FROM_EMAIL: "LearnHub <no-reply@learnhub.example.com>",
      NOTIFICATION_CRON_SECRET: "cron-secret",
    });

  expect(smtpEnv).toMatchObject({
    EMAIL_PROVIDER: "smtp",
    SMTP_HOST: "smtp.example.com",
    SMTP_PORT: 465,
    SMTP_SECURE: true,
    SMTP_USER: "smtp-user",
    SMTP_PASSWORD: "smtp-password",
    SMTP_FROM_EMAIL: "LearnHub <no-reply@learnhub.example.com>",
    NOTIFICATION_CRON_SECRET: "cron-secret",
  });

  const apiEnv = getEnv({
      NODE_ENV: "production",
      DATABASE_URL: localDatabaseUrl,
      NEXTAUTH_SECRET: "production-secret",
      NEXTAUTH_URL: "https://learnhub.example.com",
      APP_BASE_URL: "https://learnhub.example.com",
      EMAIL_PROVIDER: "api-provider",
      EMAIL_API_ENDPOINT: "https://email.example.com/send",
      EMAIL_API_TOKEN: "token",
      EMAIL_FROM_EMAIL: "no-reply@learnhub.example.com",
      NOTIFICATION_CRON_SECRET: "cron-secret",
    });

  expect(apiEnv).toMatchObject({
    EMAIL_PROVIDER: "api-provider",
    EMAIL_API_ENDPOINT: "https://email.example.com/send",
    EMAIL_API_TOKEN: "token",
    EMAIL_FROM_EMAIL: "no-reply@learnhub.example.com",
    NOTIFICATION_CRON_SECRET: "cron-secret",
  });
});
```

Run:

```powershell
npm run test -- src/lib/env.test.ts
```

Expected: fail because the new env keys are not in the schema.

- [ ] **Step 2: Add dependency entries**

Update `package.json`:

```json
"dependencies": {
  "nodemailer": "^7.0.10"
},
"devDependencies": {
  "@types/nodemailer": "^7.0.4"
}
```

Keep existing dependencies and sort only if the file already uses sorted keys.

- [ ] **Step 3: Extend env schema**

Add:

```ts
NOTIFICATION_CRON_SECRET: z.string().optional(),
SMTP_FROM_EMAIL: z.string().optional(),
SMTP_SECURE: z.coerce.boolean().default(false),
EMAIL_API_ENDPOINT: z.string().url().optional(),
EMAIL_API_TOKEN: z.string().optional(),
EMAIL_FROM_EMAIL: z.string().optional(),
```

Add `superRefine` checks:

```ts
if (value.EMAIL_PROVIDER === "smtp" && !value.SMTP_FROM_EMAIL?.trim()) {
  context.addIssue({
    code: "custom",
    path: ["SMTP_FROM_EMAIL"],
    message: "SMTP_FROM_EMAIL is required when EMAIL_PROVIDER is smtp.",
  });
}

if (value.EMAIL_PROVIDER === "api-provider") {
  for (const [path, message] of [
    ["EMAIL_API_ENDPOINT", "EMAIL_API_ENDPOINT is required when EMAIL_PROVIDER is api-provider."],
    ["EMAIL_API_TOKEN", "EMAIL_API_TOKEN is required when EMAIL_PROVIDER is api-provider."],
    ["EMAIL_FROM_EMAIL", "EMAIL_FROM_EMAIL is required when EMAIL_PROVIDER is api-provider."],
  ] as const) {
    if (!value[path]?.trim()) {
      context.addIssue({ code: "custom", path: [path], message });
    }
  }
}
```

After parsing, add:

```ts
if (source.NODE_ENV === "production" && !parsedEnv.NOTIFICATION_CRON_SECRET?.trim()) {
  throw new Error("NOTIFICATION_CRON_SECRET is required in production.");
}
```

Update `buildEnvSource` so every new variable is mapped from `process.env` before parsing:

```ts
const buildEnvSource = (source: NodeJS.ProcessEnv) => {
  const isProduction = source.NODE_ENV === "production";

  return {
    DATABASE_URL: valueOrUndefined(source.DATABASE_URL) ?? (!isProduction ? localDatabaseUrl : undefined),
    NEXTAUTH_SECRET: valueOrUndefined(source.NEXTAUTH_SECRET) ?? (!isProduction ? localNextAuthSecret : undefined),
    NEXTAUTH_URL: valueOrUndefined(source.NEXTAUTH_URL) ?? (!isProduction ? localBaseUrl : undefined),
    APP_BASE_URL: valueOrUndefined(source.APP_BASE_URL) ?? (!isProduction ? localBaseUrl : undefined),
    EMAIL_PROVIDER: valueOrUndefined(source.EMAIL_PROVIDER) ?? (!isProduction ? "console" : undefined),
    SMTP_HOST: source.SMTP_HOST,
    SMTP_PORT: valueOrUndefined(source.SMTP_PORT) ?? (!isProduction ? "587" : undefined),
    SMTP_SECURE: valueOrUndefined(source.SMTP_SECURE) ?? "false",
    SMTP_USER: source.SMTP_USER,
    SMTP_PASSWORD: source.SMTP_PASSWORD,
    SMTP_FROM_EMAIL: source.SMTP_FROM_EMAIL,
    EMAIL_API_ENDPOINT: source.EMAIL_API_ENDPOINT,
    EMAIL_API_TOKEN: source.EMAIL_API_TOKEN,
    EMAIL_FROM_EMAIL: source.EMAIL_FROM_EMAIL,
    NOTIFICATION_CRON_SECRET: source.NOTIFICATION_CRON_SECRET,
    MUX_TOKEN_ID: source.MUX_TOKEN_ID,
    MUX_TOKEN_SECRET: source.MUX_TOKEN_SECRET,
    R2_ACCOUNT_ID: source.R2_ACCOUNT_ID,
    R2_ACCESS_KEY_ID: source.R2_ACCESS_KEY_ID,
    R2_SECRET_ACCESS_KEY: source.R2_SECRET_ACCESS_KEY,
    R2_BUCKET_NAME: source.R2_BUCKET_NAME,
    CREDLY_ORGANIZATION_ID: source.CREDLY_ORGANIZATION_ID,
    CREDLY_API_TOKEN: source.CREDLY_API_TOKEN,
  };
};
```

- [ ] **Step 4: Verify and commit**

Run:

```powershell
npm install
npm run test -- src/lib/env.test.ts
```

Expected: dependencies install and env tests pass.

Commit:

```powershell
git add package.json package-lock.json src/lib/env.ts src/lib/env.test.ts
git commit -m "feat: configure notification email environment"
```

Expected: commit succeeds.

## Task 3: Add Email Providers

**Files:**
- Create: `src/modules/providers/email/smtp-email-provider.ts`
- Create: `src/modules/providers/email/smtp-email-provider.test.ts`
- Create: `src/modules/providers/email/api-email-provider.ts`
- Create: `src/modules/providers/email/api-email-provider.test.ts`
- Modify: `src/modules/providers/email/email-provider.ts`
- Modify: `src/modules/providers/email/email-provider.test.ts`

- [ ] **Step 1: Write SMTP provider tests**

Use a mocked transport factory:

```ts
import { describe, expect, it, vi } from "vitest";
import { createSmtpEmailProvider } from "./smtp-email-provider";

it("sends through configured SMTP transport", async () => {
  const sendMail = vi.fn().mockResolvedValue({ messageId: "smtp-123" });
  const createTransport = vi.fn().mockReturnValue({ sendMail });
  const provider = createSmtpEmailProvider({
    host: "smtp.example.com",
    port: 587,
    secure: false,
    user: "user",
    password: "pass",
    from: "LearnHub <no-reply@example.com>",
    createTransport,
  });

  const result = await provider.send({
    to: "learner@example.com",
    subject: "Assigned course",
    html: "<p>Start</p>",
    text: "Start",
  });

  expect(createTransport).toHaveBeenCalledWith({
    host: "smtp.example.com",
    port: 587,
    secure: false,
    auth: { user: "user", pass: "pass" },
  });
  expect(sendMail).toHaveBeenCalledWith({
    from: "LearnHub <no-reply@example.com>",
    to: "learner@example.com",
    subject: "Assigned course",
    html: "<p>Start</p>",
    text: "Start",
  });
  expect(result).toEqual({ providerMessageId: "smtp-123" });
});
```

Run:

```powershell
npm run test -- src/modules/providers/email/smtp-email-provider.test.ts
```

Expected: fail because the SMTP provider file does not exist.

- [ ] **Step 2: Implement SMTP provider**

```ts
import nodemailer from "nodemailer";

import type { EmailMessage, EmailProvider, EmailSendResult } from "./email-provider";

export type SmtpEmailProviderConfig = {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  password?: string;
  from: string;
  createTransport?: typeof nodemailer.createTransport;
};

export function createSmtpEmailProvider(config: SmtpEmailProviderConfig): EmailProvider {
  const createTransport = config.createTransport ?? nodemailer.createTransport;
  const transport = createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: config.user && config.password ? { user: config.user, pass: config.password } : undefined,
  });

  return {
    async send(message: EmailMessage): Promise<EmailSendResult> {
      const result = await transport.sendMail({
        from: config.from,
        to: message.to,
        subject: message.subject,
        html: message.html,
        text: message.text,
      });

      return { providerMessageId: result.messageId };
    },
  };
}
```

- [ ] **Step 3: Write API provider tests**

```ts
import { describe, expect, it, vi } from "vitest";
import { createApiEmailProvider } from "./api-email-provider";

it("posts transactional email payload and returns provider message id", async () => {
  const fetch = vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ id: "api-123" }), {
      status: 202,
      headers: { "content-type": "application/json" },
    }),
  );
  const provider = createApiEmailProvider({
    endpoint: "https://email.example.com/send",
    token: "secret",
    from: "no-reply@example.com",
    timeoutMs: 5000,
    fetch,
  });

  const result = await provider.send({
    to: "learner@example.com",
    subject: "Certificate",
    html: "<p>Done</p>",
    text: "Done",
  });

  expect(fetch).toHaveBeenCalledWith("https://email.example.com/send", {
    method: "POST",
    headers: {
      Authorization: "Bearer secret",
      "Content-Type": "application/json",
    },
    signal: expect.any(AbortSignal),
    body: JSON.stringify({
      from: "no-reply@example.com",
      to: "learner@example.com",
      subject: "Certificate",
      html: "<p>Done</p>",
      text: "Done",
    }),
  });
  expect(result).toEqual({ providerMessageId: "api-123" });
});

it("aborts API provider requests after the configured timeout", async () => {
  vi.useFakeTimers();
  const fetch = vi.fn((_url: string, init?: RequestInit) => {
    return new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
    });
  });
  const provider = createApiEmailProvider({
    endpoint: "https://email.example.com/send",
    token: "secret",
    from: "no-reply@example.com",
    timeoutMs: 25,
    fetch,
  });

  const promise = provider.send({
    to: "learner@example.com",
    subject: "Certificate",
    html: "<p>Done</p>",
    text: "Done",
  });

  await vi.advanceTimersByTimeAsync(25);
  await expect(promise).rejects.toThrow("API email provider timed out");
  vi.useRealTimers();
});
```

Run:

```powershell
npm run test -- src/modules/providers/email/api-email-provider.test.ts
```

Expected: fail because the API provider file does not exist.

- [ ] **Step 4: Implement API provider**

```ts
import type { EmailMessage, EmailProvider, EmailSendResult } from "./email-provider";

export type ApiEmailProviderConfig = {
  endpoint: string;
  token: string;
  from: string;
  timeoutMs?: number;
  fetch?: typeof globalThis.fetch;
};

export function createApiEmailProvider(config: ApiEmailProviderConfig): EmailProvider {
  const fetchImpl = config.fetch ?? globalThis.fetch;
  const timeoutMs = config.timeoutMs ?? 10000;

  return {
    async send(message: EmailMessage): Promise<EmailSendResult> {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);

      let response: Response;
      try {
        response = await fetchImpl(config.endpoint, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${config.token}`,
            "Content-Type": "application/json",
          },
          signal: controller.signal,
          body: JSON.stringify({
            from: config.from,
            to: message.to,
            subject: message.subject,
            html: message.html,
            text: message.text,
          }),
        });
      } catch (error) {
        if (controller.signal.aborted) {
          throw new Error("API email provider timed out");
        }
        throw error;
      } finally {
        clearTimeout(timeout);
      }

      if (!response.ok) {
        throw new Error(`API email provider failed with status ${response.status}`);
      }

      const body = (await response.json()) as { id?: string; messageId?: string };
      return { providerMessageId: body.id ?? body.messageId ?? `api-${Date.now()}` };
    },
  };
}
```

- [ ] **Step 5: Wire provider factory**

First add these `src/modules/providers/email/email-provider.test.ts` cases so console behavior remains local-only and redacted while SMTP and API providers are added:

```ts
import { describe, expect, it, vi } from "vitest";

import { ConsoleEmailProvider, createEmailProvider } from "./email-provider";

describe("email providers", () => {
  it("does not allow console email in production", () => {
    expect(() => createEmailProvider({ emailProvider: "console", nodeEnv: "production" })).toThrow(
      "Console email provider cannot be used in production",
    );
  });

  it("redacts token-bearing URLs and message bodies when logging console email", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const provider = new ConsoleEmailProvider();

    try {
      await provider.send({
        to: "learner@example.com",
        subject: "Reset your password",
        html: '<a href="https://learnhub.example.com/reset-password/raw-secret-token?token=abc">Reset</a>',
        text: "Reset: https://learnhub.example.com/reset-password/raw-secret-token?token=abc",
      });

      const serializedLog = JSON.stringify(info.mock.calls);
      expect(serializedLog).toContain("learner@example.com");
      expect(serializedLog).toContain("Reset your password");
      expect(serializedLog).toContain("[redacted]");
      expect(serializedLog).not.toContain("raw-secret-token");
      expect(serializedLog).not.toContain("token=abc");
      expect(serializedLog).not.toContain("/reset-password/");
    } finally {
      info.mockRestore();
    }
  });
});
```

Preserve body redaction in `ConsoleEmailProvider`; do not log `message.html` or `message.text`:

```ts
export class ConsoleEmailProvider implements EmailProvider {
  async send(message: EmailMessage): Promise<EmailSendResult> {
    console.info("Console email provider message", {
      to: message.to,
      subject: message.subject,
      html: "[redacted]",
      text: "[redacted]",
    });

    return {
      providerMessageId: `console-${Date.now()}`,
    };
  }
}
```

Change the factory signature:

```ts
export type CreateEmailProviderInput = {
  emailProvider: EmailProviderName;
  nodeEnv?: string;
  smtp?: {
    host?: string;
    port: number;
    secure: boolean;
    user?: string;
    password?: string;
    from?: string;
  };
  api?: {
    endpoint?: string;
    token?: string;
    from?: string;
  };
};
```

Implement:

```ts
if (input.emailProvider === "smtp") {
  if (!input.smtp?.host || !input.smtp.from) {
    return new UnconfiguredEmailProvider("SMTP email provider requires SMTP_HOST and SMTP_FROM_EMAIL");
  }

  return createSmtpEmailProvider({
    host: input.smtp.host,
    port: input.smtp.port,
    secure: input.smtp.secure,
    user: input.smtp.user,
    password: input.smtp.password,
    from: input.smtp.from,
  });
}

if (!input.api?.endpoint || !input.api.token || !input.api.from) {
  return new UnconfiguredEmailProvider(
    "API email provider requires EMAIL_API_ENDPOINT, EMAIL_API_TOKEN, and EMAIL_FROM_EMAIL",
  );
}

return createApiEmailProvider({
  endpoint: input.api.endpoint,
  token: input.api.token,
  from: input.api.from,
});
```

Keep console provider blocked in production.

- [ ] **Step 6: Verify and commit**

Run:

```powershell
npm run test -- src/modules/providers/email/email-provider.test.ts src/modules/providers/email/smtp-email-provider.test.ts src/modules/providers/email/api-email-provider.test.ts
npm run lint
```

Expected: provider tests and lint pass.

Commit:

```powershell
git add src/modules/providers/email package.json package-lock.json
git commit -m "feat: add production email providers"
```

Expected: commit succeeds.

## Task 4: Add Notification Templates

**Files:**
- Create: `src/modules/notifications/templates.ts`
- Create: `src/modules/notifications/templates.test.ts`

- [ ] **Step 1: Write template tests**

```ts
import { describe, expect, it } from "vitest";
import {
  buildAssignmentCreatedEmail,
  buildCertificateCreatedEmail,
  buildDueSoonEmail,
  buildManagerEscalationEmail,
  buildOverdueEmail,
} from "./templates";

const base = {
  learnerName: "Ava Learner",
  learnerEmail: "ava@example.com",
  courseTitle: "Security Basics",
  dueDate: new Date("2026-06-20T12:00:00.000Z"),
  organizationName: "Acme",
  appBaseUrl: "https://learnhub.example.com",
  orgSlug: "acme",
  assignmentId: "assignment-1",
};

it("builds assignment email with learner course link", () => {
  const email = buildAssignmentCreatedEmail(base);

  expect(email.to).toBe("ava@example.com");
  expect(email.subject).toBe("Security Basics has been assigned to you");
  expect(email.text).toContain("Due Jun 20, 2026");
  expect(email.html).toContain("/org/acme/learn/assignment-1");
});

it("builds certificate email with verification URL", () => {
  const email = buildCertificateCreatedEmail({
    ...base,
    verificationUrl: "https://learnhub.example.com/certificates/CERT123",
  });

  expect(email.subject).toBe("Your Security Basics certificate is ready");
  expect(email.text).toContain("CERT123");
});

it("builds manager escalation for manager recipient", () => {
  const email = buildManagerEscalationEmail({
    ...base,
    managerName: "Mina Manager",
    managerEmail: "mina@example.com",
  });

  expect(email.to).toBe("mina@example.com");
  expect(email.subject).toBe("Ava Learner is overdue for Security Basics");
});
```

Run:

```powershell
npm run test -- src/modules/notifications/templates.test.ts
```

Expected: fail because templates do not exist.

- [ ] **Step 2: Implement template builders**

Export:

```ts
export type NotificationTemplateInput = {
  organizationName: string;
  orgSlug: string;
  learnerName: string;
  learnerEmail: string;
  courseTitle: string;
  assignmentId: string;
  dueDate: Date;
  appBaseUrl: string;
};

export function buildAssignmentCreatedEmail(input: NotificationTemplateInput): EmailMessage;
export function buildDueSoonEmail(input: NotificationTemplateInput): EmailMessage;
export function buildOverdueEmail(input: NotificationTemplateInput): EmailMessage;
export function buildManagerEscalationEmail(
  input: NotificationTemplateInput & { managerName: string; managerEmail: string },
): EmailMessage;
export function buildCertificateCreatedEmail(
  input: NotificationTemplateInput & { verificationUrl: string },
): EmailMessage;
```

Use helpers:

```ts
function assignmentUrl(input: NotificationTemplateInput): string {
  return `${input.appBaseUrl.replace(/\/+$/, "")}/org/${input.orgSlug}/learn/${input.assignmentId}`;
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(
    date,
  );
}

function paragraph(lines: string[]): string {
  return lines.map((line) => `<p>${escapeHtml(line)}</p>`).join("");
}
```

Do not include raw secrets or reset/invitation tokens in notification templates. The certificate verification URL is public by design and may be included.

- [ ] **Step 3: Verify and commit**

Run:

```powershell
npm run test -- src/modules/notifications/templates.test.ts
```

Expected: templates tests pass.

Commit:

```powershell
git add src/modules/notifications/templates.ts src/modules/notifications/templates.test.ts
git commit -m "feat: add notification email templates"
```

Expected: commit succeeds.

## Task 5: Add Notification Job Core Service

**Files:**
- Create: `src/modules/notifications/notification-jobs.ts`
- Create: `src/modules/notifications/notification-jobs.test.ts`

- [ ] **Step 1: Write core service tests**

Tests must cover idempotency key, retry policy, cancellation for completed assignments, and bounded batch processing:

```ts
import { describe, expect, it, vi } from "vitest";
import {
  buildNotificationIdempotencyKey,
  processDueNotificationJobs,
  resolveNextFailureState,
  sanitizeProviderError,
} from "./notification-jobs";

it("builds idempotency key by assignment, type, and scheduled UTC date", () => {
  expect(
    buildNotificationIdempotencyKey({
      organizationId: "org-1",
      assignmentId: "assignment-1",
      type: "ASSIGNMENT_DUE_SOON",
      scheduledFor: new Date("2026-06-20T23:59:59.000Z"),
    }),
  ).toBe("org-1:assignment-1:ASSIGNMENT_DUE_SOON:2026-06-20");
});

it("retries twice and fails on third failed attempt", () => {
  expect(resolveNextFailureState({ attempts: 0, now: new Date("2026-06-13T12:00:00.000Z") })).toMatchObject({
    status: "PENDING",
    attempts: 1,
  });
  expect(resolveNextFailureState({ attempts: 2, now: new Date("2026-06-13T12:00:00.000Z") })).toMatchObject({
    status: "FAILED",
    attempts: 3,
  });
});

it("processes only the requested batch size", async () => {
  const repository = {
    leaseDueJobs: vi.fn().mockResolvedValue([
      {
        id: "job-1",
        organizationId: "org-1",
        assignmentId: "assignment-1",
        leaseToken: "lease-1",
        type: "ASSIGNMENT_CREATED",
        attempts: 0,
        to: "a@example.com",
        subject: "A",
        html: "A",
        text: "A",
      },
    ]),
    markSent: vi.fn().mockResolvedValue(undefined),
    markFailed: vi.fn().mockResolvedValue(undefined),
    cancelIfNoLongerSendable: vi.fn().mockResolvedValue(false),
  };
  const provider = { send: vi.fn().mockResolvedValue({ providerMessageId: "msg-1" }) };

  const result = await processDueNotificationJobs({
    repository,
    provider,
    now: new Date("2026-06-13T12:00:00.000Z"),
    batchSize: 1,
  });

  expect(repository.leaseDueJobs).toHaveBeenCalledWith({ now: new Date("2026-06-13T12:00:00.000Z"), limit: 1 });
  expect(repository.markSent).toHaveBeenCalledWith({
    id: "job-1",
    leaseToken: "lease-1",
    providerMessageId: "msg-1",
    sentAt: new Date("2026-06-13T12:00:00.000Z"),
  });
  expect(result).toEqual({ leased: 1, sent: 1, failed: 0, cancelled: 0 });
});

it("stores sanitized provider errors on failure", async () => {
  const repository = {
    leaseDueJobs: vi.fn().mockResolvedValue([
      {
        id: "job-1",
        organizationId: "org-1",
        assignmentId: "assignment-1",
        leaseToken: "lease-1",
        type: "ASSIGNMENT_CREATED",
        attempts: 0,
        to: "a@example.com",
        subject: "A",
        html: "A",
        text: "A",
      },
    ]),
    markSent: vi.fn(),
    markFailed: vi.fn().mockResolvedValue(undefined),
    cancelIfNoLongerSendable: vi.fn().mockResolvedValue(false),
  };
  const provider = {
    send: vi.fn().mockRejectedValue(
      new Error("Bearer secret-token failed https://api.example.com/send?token=abc smtp://user:pass@mail body={\"token\":\"abc\"}"),
    ),
  };

  await processDueNotificationJobs({
    repository,
    provider,
    now: new Date("2026-06-13T12:00:00.000Z"),
    batchSize: 1,
  });

  expect(repository.markFailed).toHaveBeenCalledWith(expect.objectContaining({
    id: "job-1",
    leaseToken: "lease-1",
    lastError: "Bearer [redacted] failed https://api.example.com/send?[redacted] smtp://[redacted] body=[redacted]",
  }));
});

it("redacts and truncates provider errors", () => {
  const error = sanitizeProviderError(
    'Authorization Bearer token-123 https://email.example.com/send?api_key=secret smtp://user:pass@smtp.example.com response={"token":"secret"} '.repeat(20),
  );

  expect(error.length).toBeLessThanOrEqual(500);
  expect(error).not.toContain("token-123");
  expect(error).not.toContain("api_key=secret");
  expect(error).not.toContain("user:pass");
  expect(error).not.toContain('"token":"secret"');
});
```

Run:

```powershell
npm run test -- src/modules/notifications/notification-jobs.test.ts
```

Expected: fail because core service does not exist.

- [ ] **Step 2: Implement core service**

Export these types and functions:

```ts
import type { NotificationJobStatus, NotificationType } from "@prisma/client";
import type { EmailMessage, EmailProvider } from "../providers/email/email-provider";

export type CreateNotificationJobInput = EmailMessage & {
  organizationId: string;
  assignmentId: string;
  certificateId?: string;
  recipientName: string;
  type: NotificationType;
  scheduledFor: Date;
};

export type LeasedNotificationJob = EmailMessage & {
  id: string;
  organizationId: string;
  assignmentId: string | null;
  leaseToken: string;
  type: NotificationType;
  attempts: number;
};

export type NotificationJobRepository = {
  upsertJob(input: CreateNotificationJobInput & { idempotencyKey: string; nextRunAt: Date }): Promise<{ id: string }>;
  leaseDueJobs(input: { now: Date; limit: number }): Promise<LeasedNotificationJob[]>;
  cancelIfNoLongerSendable(input: { job: LeasedNotificationJob; now: Date }): Promise<boolean>;
  markSent(input: { id: string; leaseToken: string; providerMessageId: string; sentAt: Date }): Promise<void>;
  markFailed(input: {
    id: string;
    leaseToken: string;
    status: NotificationJobStatus;
    attempts: number;
    lastError: string;
    nextRunAt: Date;
  }): Promise<void>;
};

export function buildNotificationIdempotencyKey(input: {
  organizationId: string;
  assignmentId: string;
  type: NotificationType;
  scheduledFor: Date;
}): string;

export function resolveNextFailureState(input: { attempts: number; now: Date }): {
  status: Extract<NotificationJobStatus, "PENDING" | "FAILED">;
  attempts: number;
  nextRunAt: Date;
};

export function sanitizeProviderError(error: unknown): string;

export async function scheduleNotificationJob(
  input: CreateNotificationJobInput,
  repository: NotificationJobRepository,
): Promise<{ id: string }>;

export async function processDueNotificationJobs(input: {
  repository: NotificationJobRepository;
  provider: EmailProvider;
  now: Date;
  batchSize: number;
}): Promise<{ leased: number; sent: number; failed: number; cancelled: number }>;
```

Retry backoff:

```ts
const RETRY_DELAYS_MINUTES = [5, 30];
const MAX_ATTEMPTS = 3;
const MAX_LAST_ERROR_LENGTH = 500;
const LEASE_MINUTES = 5;
```

`processDueNotificationJobs` must clamp `batchSize`:

```ts
const limit = Math.max(1, Math.min(input.batchSize, 50));
```

Implement `sanitizeProviderError` before storing `lastError`:

```ts
export function sanitizeProviderError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
    .replace(/https?:\/\/[^\s?]+\/[^\s?]+\?[^\s]+/gi, (value) => `${value.split("?")[0]}?[redacted]`)
    .replace(/smtp:\/\/[^@\s]+@[^\s]+/gi, "smtp://[redacted]")
    .replace(/response=\{.*\}$/i, "response=[redacted]")
    .slice(0, MAX_LAST_ERROR_LENGTH);
}
```

`processDueNotificationJobs` must pass `job.leaseToken` to `markSent` and `markFailed`. On provider failure, call `sanitizeProviderError(error)` and store only the sanitized value:

```ts
try {
  const result = await input.provider.send(job);
  await input.repository.markSent({
    id: job.id,
    leaseToken: job.leaseToken,
    providerMessageId: result.providerMessageId,
    sentAt: input.now,
  });
} catch (error) {
  const failure = resolveNextFailureState({ attempts: job.attempts, now: input.now });
  await input.repository.markFailed({
    id: job.id,
    leaseToken: job.leaseToken,
    status: failure.status,
    attempts: failure.attempts,
    nextRunAt: failure.nextRunAt,
    lastError: sanitizeProviderError(error),
  });
}
```

- [ ] **Step 3: Verify and commit**

Run:

```powershell
npm run test -- src/modules/notifications/notification-jobs.test.ts
```

Expected: core service tests pass.

Commit:

```powershell
git add src/modules/notifications/notification-jobs.ts src/modules/notifications/notification-jobs.test.ts
git commit -m "feat: add notification job service"
```

Expected: commit succeeds.

## Task 6: Add Notification Scheduler

**Files:**
- Create: `src/modules/notifications/scheduler.ts`
- Create: `src/modules/notifications/scheduler.test.ts`

- [ ] **Step 1: Write scheduler tests**

```ts
import { describe, expect, it, vi } from "vitest";
import { scheduleAssignmentNotifications, scheduleCertificateNotification } from "./scheduler";

const assignment = {
  organizationId: "org-1",
  organizationName: "Acme",
  orgSlug: "acme",
  assignmentId: "assignment-1",
  courseTitle: "Security Basics",
  learnerName: "Ava Learner",
  learnerEmail: "ava@example.com",
  startDate: new Date("2026-06-13T12:00:00.000Z"),
  dueDate: new Date("2026-06-20T12:00:00.000Z"),
  status: "ASSIGNED" as const,
  managerName: "Mina Manager",
  managerEmail: "mina@example.com",
};

it("schedules assignment, due soon, overdue, and manager escalation jobs", async () => {
  const repository = { upsertJob: vi.fn().mockResolvedValue({ id: "job" }) };
  await scheduleAssignmentNotifications({
    assignment,
    appBaseUrl: "https://learnhub.example.com",
    now: new Date("2026-06-13T12:00:00.000Z"),
    repository,
  });

  expect(repository.upsertJob).toHaveBeenCalledTimes(4);
  expect(repository.upsertJob.mock.calls.map(([job]) => job.type)).toEqual([
    "ASSIGNMENT_CREATED",
    "ASSIGNMENT_DUE_SOON",
    "ASSIGNMENT_OVERDUE",
    "MANAGER_ESCALATION",
  ]);
});

it("does not schedule reminders for completed assignment", async () => {
  const repository = { upsertJob: vi.fn().mockResolvedValue({ id: "job" }) };
  await scheduleAssignmentNotifications({
    assignment: { ...assignment, status: "COMPLETED" },
    appBaseUrl: "https://learnhub.example.com",
    now: new Date("2026-06-13T12:00:00.000Z"),
    repository,
  });

  expect(repository.upsertJob).toHaveBeenCalledTimes(1);
  expect(repository.upsertJob.mock.calls[0][0].type).toBe("ASSIGNMENT_CREATED");
});

it("schedules certificate email immediately", async () => {
  const repository = { upsertJob: vi.fn().mockResolvedValue({ id: "job" }) };
  await scheduleCertificateNotification({
    certificate: {
      ...assignment,
      certificateId: "certificate-1",
      verificationUrl: "https://learnhub.example.com/certificates/CERT123",
    },
    appBaseUrl: "https://learnhub.example.com",
    now: new Date("2026-06-13T12:00:00.000Z"),
    repository,
  });

  expect(repository.upsertJob.mock.calls[0][0]).toMatchObject({
    type: "CERTIFICATE_CREATED",
    certificateId: "certificate-1",
    scheduledFor: new Date("2026-06-13T12:00:00.000Z"),
  });
});
```

Run:

```powershell
npm run test -- src/modules/notifications/scheduler.test.ts
```

Expected: fail because scheduler does not exist.

- [ ] **Step 2: Implement scheduler**

Export:

```ts
export type AssignmentNotificationSnapshot = {
  organizationId: string;
  organizationName: string;
  orgSlug: string;
  assignmentId: string;
  courseTitle: string;
  learnerName: string;
  learnerEmail: string;
  startDate: Date;
  dueDate: Date;
  status: "ASSIGNED" | "IN_PROGRESS" | "COMPLETED" | "OVERDUE";
  managerName?: string | null;
  managerEmail?: string | null;
};

export async function scheduleAssignmentNotifications(input: {
  assignment: AssignmentNotificationSnapshot;
  appBaseUrl: string;
  now: Date;
  repository: NotificationJobRepository;
}): Promise<void>;

export async function scheduleCertificateNotification(input: {
  certificate: AssignmentNotificationSnapshot & {
    certificateId: string;
    verificationUrl: string;
  };
  appBaseUrl: string;
  now: Date;
  repository: NotificationJobRepository;
}): Promise<void>;
```

Use helpers:

```ts
function daysFrom(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function maxDate(a: Date, b: Date): Date {
  return a.getTime() >= b.getTime() ? a : b;
}
```

Schedule:

```ts
const dueSoonAt = maxDate(assignment.startDate, daysFrom(assignment.dueDate, -2));
const overdueAt = daysFrom(assignment.dueDate, 1);
const escalationAt = daysFrom(assignment.dueDate, 3);
```

Skip due-soon, overdue, and escalation when `assignment.status === "COMPLETED"`. Skip manager escalation when either manager name or manager email is missing.

- [ ] **Step 3: Verify and commit**

Run:

```powershell
npm run test -- src/modules/notifications/scheduler.test.ts
```

Expected: scheduler tests pass.

Commit:

```powershell
git add src/modules/notifications/scheduler.ts src/modules/notifications/scheduler.test.ts
git commit -m "feat: add notification scheduler"
```

Expected: commit succeeds.

## Task 7: Add Prisma Notification Repository

**Files:**
- Create: `src/modules/notifications/prisma-repository.ts`
- Create: `src/modules/notifications/prisma-repository.test.ts`

- [ ] **Step 1: Write repository tests**

Tests must assert:

```ts
it("upserts by idempotency key without duplicating jobs", async () => {
  const notificationJob = {
    upsert: vi.fn().mockResolvedValue({ id: "job-1" }),
  };
  const repository = createPrismaNotificationJobRepository({ notificationJob } as never);

  await repository.upsertJob({
    organizationId: "org-1",
    assignmentId: "assignment-1",
    type: "ASSIGNMENT_CREATED",
    to: "learner@example.com",
    recipientName: "Ava Learner",
    subject: "Assigned",
    html: "<p>Assigned</p>",
    text: "Assigned",
    scheduledFor: new Date("2026-06-13T12:00:00.000Z"),
    nextRunAt: new Date("2026-06-13T12:00:00.000Z"),
    idempotencyKey: "org-1:assignment-1:ASSIGNMENT_CREATED:2026-06-13",
  });

  expect(notificationJob.upsert).toHaveBeenCalledWith(expect.objectContaining({
    where: { idempotencyKey: "org-1:assignment-1:ASSIGNMENT_CREATED:2026-06-13" },
    update: {},
  }));
});

it("leases only pending due jobs and marks them processing", async () => {
  const randomUUID = vi.fn().mockReturnValue("fresh-lease-token");
  const notificationJob = {
    findMany: vi.fn().mockResolvedValue([{ id: "job-1", organizationId: "org-1" }]),
    updateMany: vi.fn().mockResolvedValue({ count: 1 }),
  };
  const repository = createPrismaNotificationJobRepository({ notificationJob } as never, { randomUUID });

  const jobs = await repository.leaseDueJobs({ now: new Date("2026-06-13T12:00:00.000Z"), limit: 10 });

  expect(notificationJob.findMany).toHaveBeenCalledWith(expect.objectContaining({
    where: {
      OR: [
        { status: "PENDING", nextRunAt: { lte: new Date("2026-06-13T12:00:00.000Z") } },
        { status: "PROCESSING", leaseExpiresAt: { lt: new Date("2026-06-13T12:00:00.000Z") } },
      ],
    },
    take: 10,
    select: expect.objectContaining({
      id: true,
      organizationId: true,
      assignmentId: true,
      leaseToken: true,
    }),
  }));
  expect(notificationJob.updateMany).toHaveBeenCalledWith(expect.objectContaining({
    where: {
      id: "job-1",
      OR: [
        { status: "PENDING" },
        { status: "PROCESSING", leaseExpiresAt: { lt: new Date("2026-06-13T12:00:00.000Z") } },
      ],
    },
    data: expect.objectContaining({
      status: "PROCESSING",
      leasedAt: new Date("2026-06-13T12:00:00.000Z"),
      leaseExpiresAt: new Date("2026-06-13T12:05:00.000Z"),
      leaseToken: "fresh-lease-token",
    }),
  }));
  expect(jobs[0].leaseToken).toBe("fresh-lease-token");
});

it("leases stale processing jobs so they are not stuck forever", async () => {
  const staleJob = {
    id: "job-stale",
    organizationId: "org-1",
    assignmentId: "assignment-1",
    type: "ASSIGNMENT_DUE_SOON",
    attempts: 1,
    recipientEmail: "learner@example.com",
    subject: "Due soon",
    html: "<p>Due soon</p>",
    text: "Due soon",
    leaseToken: "old-token",
  };
  const notificationJob = {
    findMany: vi.fn().mockResolvedValue([staleJob]),
    updateMany: vi.fn().mockResolvedValue({ count: 1 }),
  };
  const repository = createPrismaNotificationJobRepository({ notificationJob } as never);

  const jobs = await repository.leaseDueJobs({ now: new Date("2026-06-13T12:00:00.000Z"), limit: 10 });

  expect(jobs).toHaveLength(1);
  expect(notificationJob.findMany).toHaveBeenCalledWith(expect.objectContaining({
    where: expect.objectContaining({
      OR: expect.arrayContaining([
        { status: "PROCESSING", leaseExpiresAt: { lt: new Date("2026-06-13T12:00:00.000Z") } },
      ]),
    }),
  }));
});

it("marks sent jobs by id and lease token", async () => {
  const notificationJob = {
    updateMany: vi.fn().mockResolvedValue({ count: 1 }),
  };
  const repository = createPrismaNotificationJobRepository({ notificationJob } as never);

  await repository.markSent({
    id: "job-1",
    leaseToken: "lease-1",
    providerMessageId: "msg-1",
    sentAt: new Date("2026-06-13T12:00:00.000Z"),
  });

  expect(notificationJob.updateMany).toHaveBeenCalledWith({
    where: { id: "job-1", leaseToken: "lease-1", status: "PROCESSING" },
    data: {
      status: "SENT",
      providerMessageId: "msg-1",
      sentAt: new Date("2026-06-13T12:00:00.000Z"),
      leasedAt: null,
      leaseExpiresAt: null,
      leaseToken: null,
      lastError: null,
    },
  });
});

it("marks failed jobs by id and lease token with sanitized error already supplied", async () => {
  const notificationJob = {
    updateMany: vi.fn().mockResolvedValue({ count: 1 }),
  };
  const repository = createPrismaNotificationJobRepository({ notificationJob } as never);

  await repository.markFailed({
    id: "job-1",
    leaseToken: "lease-1",
    status: "PENDING",
    attempts: 1,
    lastError: "Bearer [redacted] failed https://api.example.com/send?[redacted]",
    nextRunAt: new Date("2026-06-13T12:05:00.000Z"),
  });

  expect(notificationJob.updateMany).toHaveBeenCalledWith({
    where: { id: "job-1", leaseToken: "lease-1", status: "PROCESSING" },
    data: {
      status: "PENDING",
      attempts: 1,
      lastError: "Bearer [redacted] failed https://api.example.com/send?[redacted]",
      nextRunAt: new Date("2026-06-13T12:05:00.000Z"),
      leasedAt: null,
      leaseExpiresAt: null,
      leaseToken: null,
    },
  });
});

it("cancels reminder jobs with tenant-scoped completed assignment lookup", async () => {
  const courseAssignment = {
    findFirst: vi.fn().mockResolvedValue({ id: "assignment-1" }),
  };
  const notificationJob = {
    updateMany: vi.fn().mockResolvedValue({ count: 1 }),
  };
  const repository = createPrismaNotificationJobRepository({ courseAssignment, notificationJob } as never);

  const cancelled = await repository.cancelIfNoLongerSendable({
    job: {
      id: "job-1",
      organizationId: "org-1",
      assignmentId: "assignment-1",
      leaseToken: "lease-1",
      type: "ASSIGNMENT_OVERDUE",
      attempts: 0,
      to: "learner@example.com",
      subject: "Overdue",
      html: "<p>Overdue</p>",
      text: "Overdue",
    },
    now: new Date("2026-06-13T12:00:00.000Z"),
  });

  expect(courseAssignment.findFirst).toHaveBeenCalledWith({
    where: {
      organizationId: "org-1",
      id: "assignment-1",
      status: "COMPLETED",
    },
    select: { id: true },
  });
  expect(notificationJob.updateMany).toHaveBeenCalledWith({
    where: { id: "job-1", leaseToken: "lease-1", status: "PROCESSING" },
    data: {
      status: "CANCELLED",
      leasedAt: null,
      leaseExpiresAt: null,
      leaseToken: null,
      lastError: null,
    },
  });
  expect(cancelled).toBe(true);
});

it("does not cancel when the processing lease is no longer owned", async () => {
  const courseAssignment = {
    findFirst: vi.fn().mockResolvedValue({ id: "assignment-1" }),
  };
  const notificationJob = {
    updateMany: vi.fn().mockResolvedValue({ count: 0 }),
  };
  const repository = createPrismaNotificationJobRepository({ courseAssignment, notificationJob } as never);

  const cancelled = await repository.cancelIfNoLongerSendable({
    job: {
      id: "job-1",
      organizationId: "org-1",
      assignmentId: "assignment-1",
      leaseToken: "lost-lease",
      type: "ASSIGNMENT_OVERDUE",
      attempts: 0,
      to: "learner@example.com",
      subject: "Overdue",
      html: "<p>Overdue</p>",
      text: "Overdue",
    },
    now: new Date("2026-06-13T12:00:00.000Z"),
  });

  expect(notificationJob.updateMany).toHaveBeenCalledWith(expect.objectContaining({
    where: { id: "job-1", leaseToken: "lost-lease", status: "PROCESSING" },
  }));
  expect(cancelled).toBe(false);
});

it("tenant job list includes organization id filter", async () => {
  const notificationJob = { findMany: vi.fn().mockResolvedValue([]) };
  const repository = createPrismaNotificationJobRepository({ notificationJob } as never);

  await repository.listTenantJobs({
    organizationId: "org-1",
    statuses: ["PENDING", "FAILED"],
    includeStaleProcessingBefore: new Date("2026-06-13T12:00:00.000Z"),
  });

  expect(notificationJob.findMany).toHaveBeenCalledWith(expect.objectContaining({
    where: {
      organizationId: "org-1",
      OR: [
        { status: { in: ["PENDING", "FAILED"] } },
        { status: "PROCESSING", leaseExpiresAt: { lt: new Date("2026-06-13T12:00:00.000Z") } },
      ],
    },
  }));
});

it("platform failure list reads failed jobs with organization names", async () => {
  const notificationJob = { findMany: vi.fn().mockResolvedValue([]) };
  const repository = createPrismaNotificationJobRepository({ notificationJob } as never);

  await repository.listPlatformFailures({ staleProcessingBefore: new Date("2026-06-13T12:00:00.000Z") });

  expect(notificationJob.findMany).toHaveBeenCalledWith({
    where: {
      OR: [
        { status: "FAILED" },
        { status: "PROCESSING", leaseExpiresAt: { lt: expect.any(Date) } },
      ],
    },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    take: 100,
    select: expect.objectContaining({
      id: true,
      organization: { select: { name: true } },
      type: true,
      status: true,
      recipientEmail: true,
      subject: true,
      attempts: true,
      lastError: true,
      nextRunAt: true,
      sentAt: true,
    }),
  });
});
```

Run:

```powershell
npm run test -- src/modules/notifications/prisma-repository.test.ts
```

Expected: fail because repository does not exist.

- [ ] **Step 2: Implement repository**

Export:

```ts
type PrismaNotificationJobClient = Pick<PrismaClient, "notificationJob" | "courseAssignment">;

export function createPrismaNotificationJobRepository(
  client: PrismaNotificationJobClient,
  ids: { randomUUID(): string } = crypto,
): NotificationJobRepository & {
  listTenantJobs(input: {
    organizationId: string;
    statuses: NotificationJobStatus[];
    includeStaleProcessingBefore: Date;
  }): Promise<NotificationJobListItem[]>;
  listPlatformFailures(input: { staleProcessingBefore: Date }): Promise<NotificationJobListItem[]>;
};
```

`leaseDueJobs` must:

1. `findMany` jobs matching `OR: [{ status: "PENDING", nextRunAt: { lte: now } }, { status: "PROCESSING", leaseExpiresAt: { lt: now } }]`, ordered by `nextRunAt` ascending, limited by `limit`.
2. For each job, create a fresh `leaseToken` with `ids.randomUUID()`.
3. Call `updateMany` with `where: { id, OR: [{ status: "PENDING" }, { status: "PROCESSING", leaseExpiresAt: { lt: now } }] }`.
4. Set `status: "PROCESSING"`, `leasedAt: now`, `leaseExpiresAt: addMinutes(now, 5)`, and the fresh `leaseToken`.
5. Return only jobs whose update count is `1`.
6. Return the selected job data with `leaseToken` overwritten to the fresh generated token used in the successful `updateMany` call. Do not return the stale `leaseToken` value from the pre-update `findMany` result.

```ts
const leaseToken = ids.randomUUID();
const updated = await client.notificationJob.updateMany({
  where: {
    id: job.id,
    OR: [{ status: "PENDING" }, { status: "PROCESSING", leaseExpiresAt: { lt: input.now } }],
  },
  data: {
    status: "PROCESSING",
    leasedAt: input.now,
    leaseExpiresAt: addMinutes(input.now, LEASE_MINUTES),
    leaseToken,
  },
});

if (updated.count !== 1) {
  return null;
}

return {
  id: job.id,
  organizationId: job.organizationId,
  assignmentId: job.assignmentId,
  leaseToken,
  type: job.type,
  attempts: job.attempts,
  to: job.recipientEmail,
  subject: job.subject,
  html: job.html,
  text: job.text,
};
```

`markSent` and `markFailed` must use `updateMany` and include `id`, `leaseToken`, and `status: "PROCESSING"` in the `where` clause. If `updateMany.count` is `0`, throw `Notification job lease was lost` so a concurrent worker cannot mark a job it no longer owns.

`cancelIfNoLongerSendable` must:

```ts
if (job.type === "ASSIGNMENT_OVERDUE" || job.type === "MANAGER_ESCALATION" || job.type === "ASSIGNMENT_DUE_SOON") {
  const assignment = await client.courseAssignment.findFirst({
    where: {
      organizationId: job.organizationId,
      id: job.assignmentId ?? "",
      status: "COMPLETED",
    },
    select: { id: true },
  });
  if (assignment) {
    const updated = await client.notificationJob.updateMany({
      where: { id: job.id, leaseToken: job.leaseToken, status: "PROCESSING" },
      data: {
        status: "CANCELLED",
        leasedAt: null,
        leaseExpiresAt: null,
        leaseToken: null,
        lastError: null,
      },
    });
    return updated.count === 1;
  }
}
return false;
```

Cancellation must respect lease ownership. If `updateMany.count` is `0`, return `false` so `processDueNotificationJobs` does not count a cancellation it did not own.

`listTenantJobs` must include pending, failed, and stale processing rows. `listPlatformFailures` must be used only by `src/app/platform/notifications/page.tsx` after `requirePlatformOwner()`. It must query failed jobs plus stale processing jobs, order by newest `updatedAt` then `createdAt`, cap results at `100`, and select `organization: { select: { name: true } }` for cross-tenant display. Pages must display `lastError` exactly as stored; raw provider errors never reach the repository.

- [ ] **Step 3: Add real persistence smoke**

Create an integration-style test in `src/modules/notifications/prisma-repository.test.ts` guarded by `process.env.DATABASE_URL`:

```ts
const describeDb = process.env.DATABASE_URL ? describe : describe.skip;

describeDb("notification repository persistence", () => {
  it("validates schema, idempotent upsert, and concurrent leasing", async () => {
    const { prisma } = await import("@/lib/prisma");
    const repository = createPrismaNotificationJobRepository(prisma);
    const now = new Date("2026-06-13T12:00:00.000Z");

    await prisma.organization.upsert({
      where: { id: "org-test" },
      update: {},
      create: { id: "org-test", name: "Test Org", slug: "test-org", allowedEmailDomains: ["example.com"] },
    });
    await prisma.user.upsert({
      where: { email: "learner@example.com" },
      update: {},
      create: {
        id: "user-test",
        email: "learner@example.com",
        firstName: "Ava",
        lastName: "Learner",
        status: "ACTIVE",
      },
    });
    await prisma.organizationMembership.upsert({
      where: { organizationId_userId: { organizationId: "org-test", userId: "user-test" } },
      update: {},
      create: {
        id: "membership-test",
        organizationId: "org-test",
        userId: "user-test",
        roles: ["LEARNER"],
        status: "ACTIVE",
      },
    });
    await prisma.course.upsert({
      where: { organizationId_slug: { organizationId: "org-test", slug: "security-basics" } },
      update: {},
      create: {
        id: "course-test",
        organizationId: "org-test",
        title: "Security Basics",
        slug: "security-basics",
        status: "PUBLISHED",
        type: "NATIVE_VIDEO",
      },
    });
    await prisma.courseAssignment.upsert({
      where: {
        organizationId_courseId_membershipId: {
          organizationId: "org-test",
          courseId: "course-test",
          membershipId: "membership-test",
        },
      },
      update: {},
      create: {
        id: "assignment-test",
        organizationId: "org-test",
        courseId: "course-test",
        membershipId: "membership-test",
        startDate: now,
        dueDate: new Date("2026-06-20T12:00:00.000Z"),
        status: "ASSIGNED",
      },
    });

    await repository.upsertJob({
      organizationId: "org-test",
      assignmentId: "assignment-test",
      type: "ASSIGNMENT_CREATED",
      to: "learner@example.com",
      recipientName: "Ava Learner",
      subject: "Assigned",
      html: "<p>Assigned</p>",
      text: "Assigned",
      scheduledFor: now,
      nextRunAt: now,
      idempotencyKey: "org-test:assignment-test:ASSIGNMENT_CREATED:2026-06-13",
    });
    await repository.upsertJob({
      organizationId: "org-test",
      assignmentId: "assignment-test",
      type: "ASSIGNMENT_CREATED",
      to: "learner@example.com",
      recipientName: "Ava Learner",
      subject: "Assigned",
      html: "<p>Assigned</p>",
      text: "Assigned",
      scheduledFor: now,
      nextRunAt: now,
      idempotencyKey: "org-test:assignment-test:ASSIGNMENT_CREATED:2026-06-13",
    });

    const [firstLease, secondLease] = await Promise.all([
      repository.leaseDueJobs({ now, limit: 1 }),
      repository.leaseDueJobs({ now, limit: 1 }),
    ]);

    expect(firstLease.length + secondLease.length).toBe(1);
  });
});
```

Run with a real test database:

```powershell
$env:DATABASE_URL="postgresql://learnhub:learnhub@localhost:5432/learnhub_test?schema=public"
npx prisma migrate deploy
npm run test -- src/modules/notifications/prisma-repository.test.ts
```

Expected with `DATABASE_URL`: schema validation, idempotent upsert, and concurrent lease assertions pass. Expected without `DATABASE_URL`: the integration block is skipped and unit repository tests still run.

- [ ] **Step 4: Verify and commit**

Run:

```powershell
npm run test -- src/modules/notifications/prisma-repository.test.ts
```

Expected: repository tests pass.

Commit:

```powershell
git add src/modules/notifications/prisma-repository.ts src/modules/notifications/prisma-repository.test.ts
git commit -m "feat: add notification prisma repository"
```

Expected: commit succeeds.

## Task 8: Integrate Assignment Scheduling

**Files:**
- Modify: `src/modules/assignments/assignment-service.ts`
- Modify: `src/modules/assignments/assignment-service.test.ts`
- Modify: `src/modules/assignments/prisma-repository.ts`

- [ ] **Step 1: Write assignment scheduling tests**

Add tests:

```ts
it("schedules assignment notifications after creating assignment", async () => {
  const scheduler = vi.fn().mockResolvedValue(undefined);
  const transactionNotificationRepository = { upsertJob: vi.fn().mockResolvedValue({ id: "job-1" }) };
  const repository = createInMemoryAssignmentRepository({
    course: { id: "course-1", title: "Security Basics", estimatedCompletionBusinessDays: 5 },
    learner: { id: "membership-1", user: { firstName: "Ava", lastName: "Learner", email: "ava@example.com" } },
    organization: { id: "org-1", name: "Acme", slug: "acme" },
    transactionClientId: "tx-1",
  });
  const notificationRepositoryForTransaction = vi.fn().mockReturnValue(transactionNotificationRepository);

  await assignCourse(
    {
      organizationId: "org-1",
      courseId: "course-1",
      learnerMembershipId: "membership-1",
      actor,
      startDate: new Date("2026-06-13T12:00:00.000Z"),
    },
    repository,
    {
      scheduleAssignmentNotifications: scheduler,
      notificationRepositoryForTransaction,
      appBaseUrl: "https://learnhub.example.com",
      now: new Date("2026-06-13T12:00:00.000Z"),
    },
  );

  expect(notificationRepositoryForTransaction).toHaveBeenCalledWith(repository.activeTransactionClient);
  expect(scheduler).toHaveBeenCalledWith(expect.objectContaining({
    repository: transactionNotificationRepository,
    assignment: expect.objectContaining({
      organizationId: "org-1",
      orgSlug: "acme",
      courseTitle: "Security Basics",
      learnerEmail: "ava@example.com",
    }),
  }));
});
```

Run:

```powershell
npm run test -- src/modules/assignments/assignment-service.test.ts
```

Expected: fail because `assignCourse` does not accept scheduler dependencies.

- [ ] **Step 2: Extend assignment repository snapshot data**

Add repository methods:

```ts
findAssignmentNotificationSnapshot(input: {
  organizationId: string;
  assignmentId: string;
}): Promise<AssignmentNotificationSnapshot | null>;
```

In Prisma, select:

```ts
{
  id: true,
  organizationId: true,
  startDate: true,
  dueDate: true,
  status: true,
  organization: { select: { name: true, slug: true } },
  course: { select: { title: true } },
  membership: {
    select: {
      user: { select: { firstName: true, lastName: true, email: true } },
      managerMembership: {
        select: {
          user: { select: { firstName: true, lastName: true, email: true } },
        },
      },
    },
  },
}
```

- [ ] **Step 3: Call scheduler after assignment creation**

Add optional dependencies:

```ts
export type AssignmentNotificationDependencies = {
  scheduleAssignmentNotifications(input: {
    assignment: AssignmentNotificationSnapshot;
    appBaseUrl: string;
    now: Date;
    repository: NotificationJobRepository;
  }): Promise<void>;
  notificationRepositoryForTransaction(transactionClient: PrismaAssignmentClient): NotificationJobRepository;
  appBaseUrl: string;
  now: Date;
};
```

Update `AssignmentRepository.runInTransaction` so the operation receives the active transaction client. Build the notification repository from that transaction client; do not use the root Prisma client for job upserts created by assignment scheduling.

```ts
export type AssignmentRepository = {
  runInTransaction<T>(operation: (transactionClient: PrismaAssignmentClient) => Promise<T>): Promise<T>;
  findAssignmentNotificationSnapshot(input: {
    organizationId: string;
    assignmentId: string;
  }): Promise<AssignmentNotificationSnapshot | null>;
};
```

Inside the existing `createAssignmentWithAudit` helper, rename the wrapper argument so the assignment input is not referenced as `input.input`. The skeleton should match the current `assignCourse(input, repository)` and `selfEnrollInCourse(input, repository)` service shape, and notification job upserts must use the same transaction client as assignment creation:

```ts
async function createAssignmentWithAudit(args: {
  assignmentInput: AssignCourseInput | SelfEnrollInput;
  repository: AssignmentRepository;
  assignedByMembershipId: string | null;
  auditAction: string;
  notificationDependencies?: AssignmentNotificationDependencies;
}): Promise<{ id: string }> {
  const { assignmentInput, repository, notificationDependencies } = args;

  return repository.runInTransaction(async (transactionClient) => {
    const existingAssignment = await repository.assignmentExists({
      organizationId: assignmentInput.organizationId,
      courseId: assignmentInput.courseId,
      membershipId: assignmentInput.learnerMembershipId,
    });

    if (existingAssignment) {
      throw new Error("Learner already has this course assigned");
    }

    const course = await repository.findCourse({
      organizationId: assignmentInput.organizationId,
      courseId: assignmentInput.courseId,
    });

    if (!course) {
      throw new Error("Course not found");
    }

    const assignment = await repository.createAssignment({
      organizationId: assignmentInput.organizationId,
      courseId: assignmentInput.courseId,
      membershipId: assignmentInput.learnerMembershipId,
      assignedByMembershipId: args.assignedByMembershipId,
      startDate: assignmentInput.startDate,
      dueDate: addBusinessDays(assignmentInput.startDate, course.estimatedCompletionBusinessDays),
      status: "ASSIGNED",
    });

    await repository.recordAuditLog({
      organizationId: assignmentInput.organizationId,
      actorId: assignmentInput.actor.userId,
      action: args.auditAction,
      targetType: "course_assignment",
      targetId: assignment.id,
    });

    if (notificationDependencies) {
      const snapshot = await repository.findAssignmentNotificationSnapshot({
        organizationId: assignmentInput.organizationId,
        assignmentId: assignment.id,
      });
      if (snapshot) {
        const notificationRepository =
          notificationDependencies.notificationRepositoryForTransaction(transactionClient);
        await notificationDependencies.scheduleAssignmentNotifications({
          assignment: snapshot,
          appBaseUrl: notificationDependencies.appBaseUrl,
          now: notificationDependencies.now,
          repository: notificationRepository,
        });
      }
    }

    return assignment;
  });
}
```

Do not schedule when duplicate assignment validation throws. Tests must assert that `courseAssignment.create`, `auditLog.create`, and notification job `upsert` all use the same transaction client object.

- [ ] **Step 4: Verify and commit**

Run:

```powershell
npm run test -- src/modules/assignments/assignment-service.test.ts src/modules/assignments/prisma-repository.test.ts
```

Expected: assignment tests pass.

Commit:

```powershell
git add src/modules/assignments/assignment-service.ts src/modules/assignments/assignment-service.test.ts src/modules/assignments/prisma-repository.ts src/modules/assignments/prisma-repository.test.ts
git commit -m "feat: schedule assignment notifications"
```

Expected: commit succeeds.

## Task 9: Integrate Certificate Scheduling

**Files:**
- Modify: `src/modules/certificates/certificates.ts`
- Modify: `src/modules/certificates/certificates.test.ts`
- Modify: `src/modules/certificates/prisma-repository.ts`

- [ ] **Step 1: Write certificate scheduling tests**

```ts
it("schedules certificate email when a certificate is newly created", async () => {
  const scheduler = vi.fn().mockResolvedValue(undefined);
  const transactionNotificationRepository = { upsertJob: vi.fn().mockResolvedValue({ id: "job-1" }) };
  const repository = createCertificateRepository({
    existingCertificate: null,
    assignment: completedAssignment,
    transactionClientId: "tx-cert-1",
  });
  const notificationRepositoryForTransaction = vi.fn().mockReturnValue(transactionNotificationRepository);

  await issueCertificateForCompletedAssignment(
    {
      organizationId: "org-1",
      assignmentId: "assignment-1",
      appBaseUrl: "https://learnhub.example.com",
      now: new Date("2026-06-13T12:00:00.000Z"),
    },
    repository,
    {
      scheduleCertificateNotification: scheduler,
      notificationRepositoryForTransaction,
    },
  );

  expect(notificationRepositoryForTransaction).toHaveBeenCalledWith(repository.activeTransactionClient);
  expect(scheduler).toHaveBeenCalledTimes(1);
  expect(scheduler).toHaveBeenCalledWith(expect.objectContaining({
    repository: transactionNotificationRepository,
  }));
});

it("ensures certificate email job exists for existing certificate", async () => {
  const scheduler = vi.fn().mockResolvedValue(undefined);
  const transactionNotificationRepository = { upsertJob: vi.fn().mockResolvedValue({ id: "job-existing" }) };
  const repository = createCertificateRepository({
    existingCertificate,
    assignment: completedAssignment,
    transactionClientId: "tx-cert-2",
  });
  const notificationRepositoryForTransaction = vi.fn().mockReturnValue(transactionNotificationRepository);

  await issueCertificateForCompletedAssignment(
    {
      organizationId: "org-1",
      assignmentId: "assignment-1",
      appBaseUrl: "https://learnhub.example.com",
      now: new Date("2026-06-13T12:00:00.000Z"),
    },
    repository,
    {
      scheduleCertificateNotification: scheduler,
      notificationRepositoryForTransaction,
    },
  );

  expect(notificationRepositoryForTransaction).toHaveBeenCalledWith(repository.activeTransactionClient);
  expect(scheduler).toHaveBeenCalledTimes(1);
  expect(scheduler).toHaveBeenCalledWith(expect.objectContaining({
    repository: transactionNotificationRepository,
    certificate: expect.objectContaining({
      certificateId: existingCertificate.id,
      verificationUrl: existingCertificate.verificationUrl,
    }),
  }));
});
```

Run:

```powershell
npm run test -- src/modules/certificates/certificates.test.ts
```

Expected: fail because the function does not accept notification dependencies.

- [ ] **Step 2: Extend certificate repository snapshot**

Add:

```ts
runInTransaction<T>(operation: (transactionClient: PrismaCertificateClient) => Promise<T>): Promise<T>;
findCertificateNotificationSnapshot(input: {
  organizationId: string;
  certificateId: string;
}): Promise<(AssignmentNotificationSnapshot & {
  certificateId: string;
  verificationUrl: string;
}) | null>;
```

In Prisma repository, select certificate, assignment, organization, course, membership user, and manager user in one tenant-scoped query.

- [ ] **Step 3: Ensure certificate notification job exists**

Add optional third parameter:

```ts
export type CertificateNotificationDependencies = {
  scheduleCertificateNotification: typeof scheduleCertificateNotification;
  notificationRepositoryForTransaction(transactionClient: PrismaCertificateClient): NotificationJobRepository;
};
```

Wrap certificate creation and notification scheduling in `repository.runInTransaction`. For a newly created certificate, call the scheduler using a notification repository built from the active transaction client:

```ts
const certificate = await repository.runInTransaction(async (transactionClient) => {
  const created = await repository.createCertificate(certificateInput);
  const snapshot = await repository.findCertificateNotificationSnapshot({
    organizationId: input.organizationId,
    certificateId: created.id,
  });

  if (snapshot && notificationDependencies) {
    await notificationDependencies.scheduleCertificateNotification({
      certificate: snapshot,
      appBaseUrl: input.appBaseUrl,
      now: input.now,
      repository: notificationDependencies.notificationRepositoryForTransaction(transactionClient),
    });
  }

  return created;
});
```

For an existing certificate, do not return before notification scheduling. Load its snapshot and call the same idempotent scheduler so a previously missed certificate email job is recovered:

```ts
if (existingCertificate) {
  const snapshot = await repository.findCertificateNotificationSnapshot({
    organizationId: input.organizationId,
    certificateId: existingCertificate.id,
  });

  if (snapshot && notificationDependencies) {
    await repository.runInTransaction(async (transactionClient) => {
      await notificationDependencies.scheduleCertificateNotification({
        certificate: snapshot,
        appBaseUrl: input.appBaseUrl,
        now: input.now,
        repository: notificationDependencies.notificationRepositoryForTransaction(transactionClient),
      });
    });
  }

  return existingCertificate;
}
```

Because `scheduleCertificateNotification` uses the certificate idempotency key, the recovery path creates a missing job and does not duplicate an existing job.

- [ ] **Step 4: Verify and commit**

Run:

```powershell
npm run test -- src/modules/certificates/certificates.test.ts src/modules/certificates/prisma-repository.test.ts
```

Expected: certificate tests pass.

Commit:

```powershell
git add src/modules/certificates/certificates.ts src/modules/certificates/certificates.test.ts src/modules/certificates/prisma-repository.ts src/modules/certificates/prisma-repository.test.ts
git commit -m "feat: schedule certificate notifications"
```

Expected: commit succeeds.

## Task 10: Add Cron Route

**Files:**
- Create: `src/app/api/jobs/notifications/route.ts`
- Create: `src/modules/notifications/route.test.ts`

- [ ] **Step 1: Write cron route tests**

```ts
import { describe, expect, it, vi } from "vitest";
import { POST, constantTimeEquals } from "@/app/api/jobs/notifications/route";

it("rejects requests without shared secret", async () => {
  const response = await POST(new Request("https://learnhub.example.com/api/jobs/notifications"));
  expect(response.status).toBe(401);
});

it("processes bounded batch when shared secret matches", async () => {
  vi.stubEnv("NOTIFICATION_CRON_SECRET", "secret");
  vi.stubEnv("EMAIL_PROVIDER", "console");

  const response = await POST(
    new Request("https://learnhub.example.com/api/jobs/notifications?limit=500", {
      method: "POST",
      headers: { Authorization: "Bearer secret" },
    }),
  );

  expect(response.status).toBe(200);
  await expect(response.json()).resolves.toMatchObject({
    limit: 50,
  });
});

it("compares cron secrets without early length return", () => {
  expect(constantTimeEquals("Bearer secret", "Bearer secret")).toBe(true);
  expect(constantTimeEquals("Bearer wrong", "Bearer secret")).toBe(false);
  expect(constantTimeEquals("Bearer secret-extra", "Bearer secret")).toBe(false);
  expect(constantTimeEquals("", "")).toBe(false);
});
```

Run:

```powershell
npm run test -- src/modules/notifications/route.test.ts
```

Expected: fail because route does not exist.

- [ ] **Step 2: Implement cron route**

```ts
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { processDueNotificationJobs } from "@/modules/notifications/notification-jobs";
import { createPrismaNotificationJobRepository } from "@/modules/notifications/prisma-repository";
import { createEmailProvider } from "@/modules/providers/email/email-provider";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  if (!authorized(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limit = readLimit(request);
  const provider = createEmailProvider({
    emailProvider: env.EMAIL_PROVIDER,
    nodeEnv: process.env.NODE_ENV,
    smtp: {
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      user: env.SMTP_USER,
      password: env.SMTP_PASSWORD,
      from: env.SMTP_FROM_EMAIL,
    },
    api: {
      endpoint: env.EMAIL_API_ENDPOINT,
      token: env.EMAIL_API_TOKEN,
      from: env.EMAIL_FROM_EMAIL,
    },
  });

  const result = await processDueNotificationJobs({
    repository: createPrismaNotificationJobRepository(prisma),
    provider,
    now: new Date(),
    batchSize: limit,
  });

  return Response.json({ limit: Math.max(1, Math.min(limit, 50)), ...result });
}

function authorized(request: Request): boolean {
  const header = request.headers.get("authorization");
  const secret = env.NOTIFICATION_CRON_SECRET;
  return Boolean(secret && constantTimeEquals(header ?? "", `Bearer ${secret}`));
}

export function constantTimeEquals(actual: string, expected: string): boolean {
  const actualBytes = new TextEncoder().encode(actual);
  const expectedBytes = new TextEncoder().encode(expected);
  const length = Math.max(actualBytes.length, expectedBytes.length);
  let diff = actualBytes.length ^ expectedBytes.length;

  for (let index = 0; index < length; index += 1) {
    diff |= (actualBytes[index] ?? 0) ^ (expectedBytes[index] ?? 0);
  }

  return expected.length > 0 && diff === 0;
}

function readLimit(request: Request): number {
  const value = new URL(request.url).searchParams.get("limit");
  const parsed = value ? Number.parseInt(value, 10) : 10;
  return Number.isFinite(parsed) ? Math.max(1, Math.min(parsed, 50)) : 10;
}
```

- [ ] **Step 3: Verify and commit**

Run:

```powershell
npm run test -- src/modules/notifications/route.test.ts src/modules/notifications/notification-jobs.test.ts
```

Expected: route and processor tests pass.

Commit:

```powershell
git add src/app/api/jobs/notifications/route.ts src/modules/notifications/route.test.ts
git commit -m "feat: add notification cron route"
```

Expected: commit succeeds.

## Task 11: Add Admin And Platform Inspection Pages

**Files:**
- Create: `src/app/org/[slug]/admin/notifications/page.tsx`
- Create: `src/app/platform/notifications/page.tsx`
- Create: `src/modules/notifications/page-shells.test.ts`
- Modify: `src/modules/notifications/prisma-repository.ts`
- Modify: `src/modules/notifications/prisma-repository.test.ts`

- [ ] **Step 1: Write page shell tests**

```ts
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { NotificationsTable } from "./page-shells";

it("renders pending and failed job rows without exposing html body", () => {
  const html = renderToStaticMarkup(
    <NotificationsTable
      jobs={[
        {
          id: "job-1",
          organizationName: "Acme",
          type: "ASSIGNMENT_OVERDUE",
          status: "FAILED",
          recipientEmail: "learner@example.com",
          subject: "Overdue",
          attempts: 3,
          lastError: "SMTP rejected message",
          nextRunAt: new Date("2026-06-13T12:00:00.000Z"),
          sentAt: null,
        },
      ]}
    />,
  );

  expect(html).toContain("ASSIGNMENT_OVERDUE");
  expect(html).toContain("SMTP rejected message");
  expect(html).not.toContain("<p>");
});
```

Run:

```powershell
npm run test -- src/modules/notifications/page-shells.test.ts
```

Expected: fail because page shell does not exist.

- [ ] **Step 2: Add shared page shell**

Create `src/modules/notifications/page-shells.tsx` even though it is not in the minimum list, because both pages need the same table:

```tsx
export type NotificationJobListItem = {
  id: string;
  organizationName: string;
  type: string;
  status: string;
  recipientEmail: string;
  subject: string;
  attempts: number;
  lastError: string | null;
  nextRunAt: Date;
  sentAt: Date | null;
};

export function NotificationsTable({ jobs }: { jobs: NotificationJobListItem[] }) {
  return (
    <table className="w-full border-collapse text-left text-sm">
      <thead className="bg-slate-50 text-slate-600">
        <tr>
          <th className="px-4 py-3 font-medium">Tenant</th>
          <th className="px-4 py-3 font-medium">Type</th>
          <th className="px-4 py-3 font-medium">Status</th>
          <th className="px-4 py-3 font-medium">Recipient</th>
          <th className="px-4 py-3 font-medium">Attempts</th>
          <th className="px-4 py-3 font-medium">Next run</th>
          <th className="px-4 py-3 font-medium">Last error</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-200">
        {jobs.length === 0 ? (
          <tr><td className="px-4 py-6 text-slate-500" colSpan={7}>No pending, failed, or stale processing notification jobs.</td></tr>
        ) : (
          jobs.map((job) => (
            <tr key={job.id}>
              <td className="px-4 py-3 text-slate-700">{job.organizationName}</td>
              <td className="px-4 py-3 font-medium text-slate-950">{job.type}</td>
              <td className="px-4 py-3 text-slate-700">{job.status}</td>
              <td className="px-4 py-3 text-slate-700">{job.recipientEmail}</td>
              <td className="px-4 py-3 text-slate-700">{job.attempts}</td>
              <td className="px-4 py-3 text-slate-700">{job.nextRunAt.toLocaleString()}</td>
              <td className="px-4 py-3 text-slate-700">{job.lastError ?? "None"}</td>
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
}
```

- [ ] **Step 3: Implement tenant admin page**

`src/app/org/[slug]/admin/notifications/page.tsx`:

```tsx
import { requireOrganizationMemberBySlug } from "@/lib/auth/guards";
import { canManageOrganization } from "@/modules/auth/permissions";
import { createPrismaNotificationJobRepository } from "@/modules/notifications/prisma-repository";
import { NotificationsTable } from "@/modules/notifications/page-shells";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function TenantNotificationsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { context, organizationId } = await requireOrganizationMemberBySlug(slug);

  if (!canManageOrganization(context, organizationId)) {
    redirect(`/org/${slug}`);
  }

  const { prisma } = await import("@/lib/prisma");
  const jobs = await createPrismaNotificationJobRepository(prisma).listTenantJobs({
    organizationId,
    statuses: ["PENDING", "FAILED"],
    includeStaleProcessingBefore: new Date(),
  });

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-6 px-6 py-10">
      <header>
        <p className="text-sm font-medium uppercase tracking-wide text-slate-500">Notifications</p>
        <h1 className="text-3xl font-semibold text-slate-950">{slug} notification jobs</h1>
      </header>
      <section className="overflow-hidden rounded-md border border-slate-200">
        <NotificationsTable jobs={jobs} />
      </section>
    </main>
  );
}
```

- [ ] **Step 4: Implement platform page**

`src/app/platform/notifications/page.tsx`:

```tsx
import { requirePlatformOwner } from "@/lib/auth/guards";
import { createPrismaNotificationJobRepository } from "@/modules/notifications/prisma-repository";
import { NotificationsTable } from "@/modules/notifications/page-shells";

export const dynamic = "force-dynamic";

export default async function PlatformNotificationsPage() {
  await requirePlatformOwner();
  const { prisma } = await import("@/lib/prisma");
  const jobs = await createPrismaNotificationJobRepository(prisma).listPlatformFailures({
    staleProcessingBefore: new Date(),
  });

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-6 px-6 py-10">
      <header>
        <p className="text-sm font-medium uppercase tracking-wide text-slate-500">Platform notifications</p>
        <h1 className="text-3xl font-semibold text-slate-950">Cross-tenant notification failures</h1>
      </header>
      <section className="overflow-hidden rounded-md border border-slate-200">
        <NotificationsTable jobs={jobs} />
      </section>
    </main>
  );
}
```

- [ ] **Step 5: Verify and commit**

Run:

```powershell
npm run test -- src/modules/notifications/page-shells.test.ts src/modules/notifications/prisma-repository.test.ts
npm run build
```

Expected: page tests and build pass.

Commit:

```powershell
git add src/app/org/[slug]/admin/notifications/page.tsx src/app/platform/notifications/page.tsx src/modules/notifications/page-shells.tsx src/modules/notifications/page-shells.test.ts src/modules/notifications/prisma-repository.ts src/modules/notifications/prisma-repository.test.ts
git commit -m "feat: add notification job inspection pages"
```

Expected: commit succeeds.

## Task 12: Final Verification

**Files:**
- All files changed by Tasks 1-11.

- [ ] **Step 1: Run focused tests**

```powershell
npm run test -- src/modules/notifications/templates.test.ts
npm run test -- src/modules/notifications/scheduler.test.ts
npm run test -- src/modules/notifications/notification-jobs.test.ts
npm run test -- src/modules/notifications/prisma-repository.test.ts
npm run test -- src/modules/providers/email/email-provider.test.ts src/modules/providers/email/smtp-email-provider.test.ts src/modules/providers/email/api-email-provider.test.ts
npm run test -- src/modules/assignments/assignment-service.test.ts
npm run test -- src/modules/certificates/certificates.test.ts
npm run test -- src/modules/notifications/route.test.ts src/modules/notifications/page-shells.test.ts
```

Expected: every focused test command exits `0`.

- [ ] **Step 2: Run repository gates**

```powershell
npm run test
npm run lint
npx prisma validate
npm run prisma:generate
npx tsc --noEmit --incremental false
npm run build
```

Expected: all commands exit `0`.

- [ ] **Step 3: Manual review checklist**

Confirm:

- `NotificationJob` has `organizationId` and all admin reads filter by tenant unless the route requires platform owner.
- `idempotencyKey` includes organization id, assignment id, notification type, and scheduled UTC date.
- Cron route has no `GET` export and requires `Authorization: Bearer ${NOTIFICATION_CRON_SECRET}`.
- Cron route compares secrets with `constantTimeEquals`.
- `processDueNotificationJobs` caps the batch at `50`.
- Lease acquisition handles due `PENDING` jobs and expired `PROCESSING` jobs.
- `markSent` and `markFailed` update by `id + leaseToken`.
- Provider errors are sanitized before being stored in `lastError`.
- Assignment creation and assignment notification job upserts use the same Prisma transaction client.
- Reminder and escalation jobs are cancelled when the assignment is completed before send time.
- `buildEnvSource` maps all new cron, SMTP, API, and sender variables.
- SMTP and API providers are allowed in production only when required configuration is present.
- API provider requests use `AbortSignal` timeout handling.
- Console provider still throws in production and redacts message bodies in logs.
- Certificate notification scheduling runs for new certificates and existing certificates so a missed idempotent email job is recovered.
- Assignment scheduler is not called when duplicate assignment validation throws.
- Repository persistence smoke validates schema, idempotent upsert, and concurrent leasing when `DATABASE_URL` is configured.

## Self-Review

- Spec coverage: assignment, certificate, due-soon, overdue, manager escalation, idempotent jobs, lease reclaim, sanitized errors, transaction-scoped scheduling, certificate notification recovery, admin tenant inspection, platform failure inspection, SMTP/API production providers, console local-only redaction, timeout handling, and shared-secret bounded cron processing are each covered by Tasks 1-12.
- Forbidden term scan: the plan contains no deferred work markers, no vague catch-all implementation steps, and no references that require copying from another task without concrete code.
- Type consistency: `NotificationType`, `NotificationJobStatus`, `NotificationJobRepository`, `AssignmentNotificationSnapshot`, and provider factory input names are consistent across schema, services, repository, route, and tests.
