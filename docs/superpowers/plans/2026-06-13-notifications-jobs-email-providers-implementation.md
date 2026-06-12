# Notifications, Jobs, And Email Providers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add tenant-scoped notification jobs, bounded cron processing, and production-shaped SMTP/API email providers for assignment, reminder, escalation, and certificate emails.

**Architecture:** Store outbound messages as `NotificationJob` rows with an idempotent identity of organization, assignment, notification type, and scheduled UTC date. Keep scheduling, rendering, provider delivery, and Prisma persistence in separate modules so assignment/certificate services only call narrow hooks. Admin pages and the cron route reuse existing organization/platform guards.

**Tech Stack:** Next.js App Router, TypeScript, Prisma 7, PostgreSQL, Vitest, existing auth guards, standard Node `net`/`tls` for SMTP, and standard `fetch` for API email.

---

## Context Notes

- Existing email support is `console` only; `smtp` and `api-provider` currently throw through an unconfigured provider.
- `src/lib/env.ts` already owns provider selection and local defaults, so SMTP/API fields and the notification cron secret belong there.
- Assignment and certificate services already expose repository seams; this lane adds optional notification scheduling hooks there without broad workflow rewrites.
- Existing tenant admin guard: `requireOrganizationUsersAdminBySlug`. Existing platform owner guard: `requirePlatformOwner`.

## Task Breakdown

### Task 1: Schema And Migration

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260613040000_notification_jobs/migration.sql`

- [ ] Add `NotificationJobType` values `ASSIGNMENT_ASSIGNED`, `ASSIGNMENT_DUE_SOON`, `ASSIGNMENT_OVERDUE`, `MANAGER_ESCALATION`, and `CERTIFICATE_ISSUED`.
- [ ] Add `NotificationJobStatus` values `PENDING`, `PROCESSING`, `SENT`, and `FAILED`.
- [ ] Add `NotificationJob` with tenant relation, assignment relation, optional certificate relation, status, attempts, provider message id, last error, `nextRunAt`, `scheduledForDate`, and `sentAt`.
- [ ] Add unique index `[organizationId, assignmentId, type, scheduledForDate]`.
- [ ] Run `npx prisma validate`; expected exit 0.

### Task 2: Templates

**Files:**
- Create: `src/modules/notifications/templates.test.ts`
- Create: `src/modules/notifications/templates.ts`

- [ ] Write tests for assignment, due-soon, overdue, manager escalation, certificate, and HTML escaping.
- [ ] Run `npm run test -- src/modules/notifications/templates.test.ts`; expected red because implementation is absent.
- [ ] Implement renderers returning `{ to, subject, html, text }`.
- [ ] Run the same command; expected green.

### Task 3: Notification Scheduling

**Files:**
- Create: `src/modules/notifications/notification-jobs.test.ts`
- Create: `src/modules/notifications/notification-jobs.ts`
- Modify: `src/modules/assignments/assignment-service.test.ts`
- Modify: `src/modules/assignments/assignment-service.ts`
- Modify: `src/modules/assignments/prisma-repository.ts`
- Modify: `src/modules/certificates/certificates.test.ts`
- Modify: `src/modules/certificates/certificates.ts`

- [ ] Test `scheduleAssignmentNotifications` creates assignment, due-soon, overdue, and manager escalation jobs with UTC-day identity.
- [ ] Test manager escalation is skipped when the assignment has no manager email.
- [ ] Test `scheduleCertificateNotification` creates a certificate-issued job and uses the certificate URL in content.
- [ ] Run `npm run test -- src/modules/notifications/notification-jobs.test.ts`; expected red.
- [ ] Implement scheduling helpers, date math, and repository interfaces.
- [ ] Add assignment and certificate service tests proving optional hooks are called only after successful creation and not for existing certificates.
- [ ] Implement narrow service/repository additions for learner/course/manager context.

### Task 4: Scheduler

**Files:**
- Create: `src/modules/notifications/scheduler.test.ts`
- Create: `src/modules/notifications/scheduler.ts`

- [ ] Test bounded due-job processing sends through an `EmailProvider`.
- [ ] Test success records provider message id and sent time.
- [ ] Test failure increments attempts, records last error, and schedules retry.
- [ ] Test max-attempt jobs are not claimed by repository criteria.
- [ ] Run `npm run test -- src/modules/notifications/scheduler.test.ts`; expected red.
- [ ] Implement `processNotificationJobs` with max batch 50 and retry backoff of `5 * attempts` minutes capped at 60.

### Task 5: Prisma Repository

**Files:**
- Create: `src/modules/notifications/prisma-repository.test.ts`
- Create: `src/modules/notifications/prisma-repository.ts`

- [ ] Test `upsertNotificationJob` uses `organizationId_assignmentId_type_scheduledForDate`.
- [ ] Test tenant list filters pending and failed jobs by organization.
- [ ] Test platform list filters failed jobs across tenants.
- [ ] Test due claim filters by status, `nextRunAt <= now`, attempts, ordering, and take.
- [ ] Run `npm run test -- src/modules/notifications/prisma-repository.test.ts`; expected red.
- [ ] Implement Prisma repository mappings for scheduler and admin pages.

### Task 6: SMTP/API Providers

**Files:**
- Modify: `src/lib/env.ts`
- Modify: `src/lib/env.test.ts`
- Modify: `src/modules/providers/email/email-provider.ts`
- Modify: `src/modules/providers/email/email-provider.test.ts`
- Create: `src/modules/providers/email/smtp-email-provider.ts`
- Create: `src/modules/providers/email/smtp-email-provider.test.ts`
- Create: `src/modules/providers/email/api-email-provider.ts`
- Create: `src/modules/providers/email/api-email-provider.test.ts`
- Modify: `src/app/reset-password/actions.ts`
- Modify: `src/app/org/[slug]/admin/users/actions.ts`

- [ ] Test SMTP maps configured host, port, auth, from, recipient, subject, html, and text to an injected SMTP client.
- [ ] Test API provider posts JSON with bearer token and parses provider message id.
- [ ] Test factory allows SMTP/API in production when configured and rejects console in production.
- [ ] Test env production requirements for SMTP/API settings.
- [ ] Implement providers using injected clients for tests and Node/fetch defaults for production.
- [ ] Add `createEmailProviderFromEnv` and use it from existing auth email actions.

### Task 7: Cron Route And Inspection Pages

**Files:**
- Create: `src/app/api/jobs/notifications/route.ts`
- Create: `src/app/org/[slug]/admin/notifications/page.tsx`
- Modify: `src/app/org/[slug]/page.tsx`
- Modify: `src/app/platform/page.tsx`

- [ ] Implement `POST` cron route requiring `Authorization: Bearer <NOTIFICATION_JOBS_SECRET>` or `x-notification-jobs-secret`.
- [ ] Clamp batch size to 50 and return `{ processed, sent, failed }`.
- [ ] Add tenant admin page listing pending and failed notification jobs.
- [ ] Add platform owner section listing cross-tenant failed notification jobs.
- [ ] Keep page styling consistent with existing dense admin tables.

### Task 8: Final Gates And Commit

- [ ] Run focused tests:

```powershell
npm run test -- src/modules/notifications/notification-jobs.test.ts src/modules/notifications/scheduler.test.ts src/modules/notifications/templates.test.ts src/modules/notifications/prisma-repository.test.ts src/modules/providers/email/email-provider.test.ts src/modules/providers/email/smtp-email-provider.test.ts src/modules/providers/email/api-email-provider.test.ts
```

- [ ] Run `npm run lint`.
- [ ] Run `npx prisma validate`.
- [ ] Run `npm run prisma:generate`.
- [ ] Run `npx tsc --noEmit --incremental false`.
- [ ] Run `npm run build`.
- [ ] Run `git diff --check`.
- [ ] Commit with `feat: add notification jobs and email providers`.

## Self-Review

- Spec coverage: assignment, certificate, due-soon, overdue, escalation, idempotency, job state, admin/platform inspection, production providers, console safety, and cron secret requirements are represented.
- Placeholder scan: no implementation placeholder remains in this plan.
- Type consistency: job types and statuses match schema, scheduling, repository, and scheduler tasks.
