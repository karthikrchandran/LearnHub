# Audit Operations Observability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build organization and platform audit browsing, CSV audit exports, and operations failure inspection for LearnHub's commercial multi-tenant LMS.

**Architecture:** Audit browsing uses read-model helpers for parsing filters, building tenant-safe query shapes, rendering JSON metadata, and formatting CSV. Operations observability normalizes provider failures from notification jobs, credential issuance, SCORM extraction, Mux processing, and storage failure audit events into one redacted row shape. Server-rendered admin pages enforce tenant and platform guard boundaries before querying Prisma.

**Tech Stack:** Next.js App Router, TypeScript, Prisma 7, PostgreSQL, Vitest, existing Auth.js guard helpers, existing Tailwind utility styling.

---

## Scope

This plan assumes LearnHub remains a commercial multi-tenant LMS with `/org/{slug}` tenant routing. Organization admins can inspect only their own tenant. Platform owners can inspect all tenants and optionally filter by organization. This slice does not add retry buttons, queue processing, schema migrations, or new provider integrations; it exposes operational state already persisted by the notification, credential, SCORM, Mux, storage, and audit slices.

The operations read model depends on these predecessor plans being applied before Task 3 in this plan is implemented:

- Task 4 notifications: `NotificationJob` with `status`, `attempts`, `lastError`, `nextRunAt`, `leaseExpiresAt`, and `organizationId`.
- Task 6 credentials: `CredentialIssuance` with `status`, `errorMessage`, `provider`, `certificateId`, `providerCredentialId`, and `organizationId`.
- Task 5 media/SCORM: `ScormPackage` with `processingStatus`, `malwareScanStatus`, `validationError`, `extractionError`, `storageKey`, and `contentRootKey`.
- Task 5 media/Mux: `VideoLesson` with `providerProcessingStatus`, `providerError`, `providerUploadId`, and `providerAssetId`.
- Task 5 storage: storage failures recorded as `AuditLog` rows with actions `storage.upload_failed`, `storage.read_failed`, `storage.delete_failed`, or `storage.signed_url_failed`, target type `stored_object`, and redacted metadata from storage routes.

## File Map

- Create `src/modules/audit/audit-read-models.ts`: filter parsing, tenant/platform query builders, audit row mapping, stable JSON metadata rendering, CSV escaping, and export query string helpers.
- Create `src/modules/audit/audit-read-models.test.ts`: unit tests for org scoping, platform filtering, metadata field ordering, CSV escaping, and export query reuse.
- Create `src/modules/audit/prisma-repository.ts`: Prisma-backed audit read repository for organization and platform pages/routes.
- Create `src/modules/audit/prisma-repository.test.ts`: repository tests proving tenant scoping, platform cross-tenant reads, select shape, ordering, and row mapping.
- Create `src/modules/operations/provider-failures.ts`: provider failure row type, failure filters, secret redaction, retry eligibility, and Prisma-backed failure listing.
- Create `src/modules/operations/provider-failures.test.ts`: unit tests for all failure sources, retry eligibility, tenant/platform query scopes, and redaction.
- Create `src/app/org/[slug]/admin/audit/page.tsx`: organization admin audit page with tenant-scoped filters and CSV link.
- Create `src/app/platform/audit/page.tsx`: platform owner audit page with cross-tenant filters and CSV link.
- Create `src/app/org/[slug]/admin/operations/page.tsx`: organization admin operations page with tenant-scoped provider failures.
- Create `src/app/platform/operations/page.tsx`: platform owner operations page with cross-tenant provider failures.
- Create `src/app/api/org/[slug]/audit.csv/route.ts`: organization CSV export route using the same filters as the org audit page.
- Create `src/app/api/platform/audit.csv/route.ts`: platform CSV export route using the same filters as the platform audit page.

## Contracts

Audit filter query parameters:

| Parameter | Meaning | Tenant behavior |
| --- | --- | --- |
| `actor` | Actor id, email, first name, or last name text | Always scoped by authenticated tenant on org routes |
| `action` | Audit action exact text such as `course.created` | Same filter on org and platform routes |
| `targetType` | Target type exact text such as `course` | Same filter on org and platform routes |
| `targetId` | Target id exact text | Same filter on org and platform routes |
| `from` | Inclusive UTC date start from `YYYY-MM-DD` or ISO datetime | Same filter on org and platform routes |
| `to` | Inclusive UTC date end from `YYYY-MM-DD` or ISO datetime | Same filter on org and platform routes |
| `organization` | Organization id, slug, or name text | Ignored on org routes; applied only after `requirePlatformOwner()` |

Audit read-model row shape:

```ts
export type AuditMetadataField = {
  key: string;
  label: string;
  value: string;
  known: boolean;
};

export type AuditLogRow = {
  id: string;
  organizationId: string | null;
  organizationName: string;
  organizationSlug: string | null;
  actorId: string | null;
  actorName: string;
  actorEmail: string;
  action: string;
  targetType: string;
  targetId: string;
  occurredAt: Date;
  metadataFields: AuditMetadataField[];
};
```

Operations failure row shape:

```ts
export type ProviderFailureSource =
  | "NOTIFICATION_JOB"
  | "CREDENTIAL_ISSUANCE"
  | "SCORM_EXTRACTION"
  | "MUX_ASSET"
  | "STORAGE";

export type ProviderFailureRow = {
  id: string;
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  source: ProviderFailureSource;
  provider: string;
  operation: string;
  targetType: string;
  targetId: string;
  status: string;
  lastError: string;
  retryEligible: boolean;
  retryReason: string;
  occurredAt: Date;
};
```

Retry eligibility rules:

| Source | Eligible when | Not eligible when |
| --- | --- | --- |
| `NOTIFICATION_JOB` | `status === "PENDING"` with `lastError` and `attempts < 3`, or stale `PROCESSING` with expired lease | Failed jobs with `lastError` are loaded as exhausted failures but are not retry-eligible; sent/cancelled jobs, rows without provider errors, and active processing leases are not retry-eligible |
| `CREDENTIAL_ISSUANCE` | `status === "FAILED"` and a certificate id exists | Provider already returned an id or there is no certificate to retry against |
| `SCORM_EXTRACTION` | `processingStatus === "FAILED"`, `extractionError` exists, zip storage key exists, and malware scan is not failed | Malware scan failed or original zip key is missing |
| `MUX_ASSET` | `providerProcessingStatus === "ERRORED"` and either upload id or asset id exists | Provider identifiers are missing |
| `STORAGE` | Audit metadata has `retryable: true` and a stored object target id exists | Operation needs manual remediation or metadata marks `retryable: false` |

## Task 1: Audit Read Models, Filters, Metadata, And CSV

**Files:**
- Create: `src/modules/audit/audit-read-models.test.ts`
- Create: `src/modules/audit/audit-read-models.ts`

- [ ] **Step 1: Write failing audit read-model tests**

Create `src/modules/audit/audit-read-models.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
  auditWhereForOrganization,
  auditWhereForPlatform,
  buildAuditExportQuery,
  formatAuditCsv,
  mapAuditLogRecord,
  parseAuditFilters,
  renderAuditMetadata,
} from "./audit-read-models";

describe("audit read models", () => {
  it("forces organization scope for organization admins and ignores organization filter input", () => {
    const filters = parseAuditFilters(
      new URLSearchParams(
        "actor=ada@example.com&action=course.created&targetType=course&targetId=course_1&from=2026-06-01&to=2026-06-12&organization=org_2",
      ),
    );

    expect(auditWhereForOrganization("org_1", filters)).toEqual({
      organizationId: "org_1",
      action: "course.created",
      targetType: "course",
      targetId: "course_1",
      createdAt: {
        gte: new Date("2026-06-01T00:00:00.000Z"),
        lte: new Date("2026-06-12T23:59:59.999Z"),
      },
      AND: [
        {
          OR: [
            { actorId: "ada@example.com" },
            { actor: { email: { contains: "ada@example.com", mode: "insensitive" } } },
            { actor: { firstName: { contains: "ada@example.com", mode: "insensitive" } } },
            { actor: { lastName: { contains: "ada@example.com", mode: "insensitive" } } },
          ],
        },
      ],
    });
  });

  it("lets platform owners filter across organizations by id, slug, or name text", () => {
    const filters = parseAuditFilters(new URLSearchParams("organization=acme&action=user.invited"));

    expect(auditWhereForPlatform(filters)).toEqual({
      action: "user.invited",
      AND: [
        {
          OR: [
            { organizationId: "acme" },
            { organization: { slug: { contains: "acme", mode: "insensitive" } } },
            { organization: { name: { contains: "acme", mode: "insensitive" } } },
          ],
        },
      ],
    });
  });

  it("combines platform actor and organization filters without overwriting either search group", () => {
    const filters = parseAuditFilters(new URLSearchParams("organization=acme&actor=ada@example.com&action=user.invited"));

    expect(auditWhereForPlatform(filters)).toEqual({
      action: "user.invited",
      AND: [
        {
          OR: [
            { actorId: "ada@example.com" },
            { actor: { email: { contains: "ada@example.com", mode: "insensitive" } } },
            { actor: { firstName: { contains: "ada@example.com", mode: "insensitive" } } },
            { actor: { lastName: { contains: "ada@example.com", mode: "insensitive" } } },
          ],
        },
        {
          OR: [
            { organizationId: "acme" },
            { organization: { slug: { contains: "acme", mode: "insensitive" } } },
            { organization: { name: { contains: "acme", mode: "insensitive" } } },
          ],
        },
      ],
    });
  });

  it("renders known JSON metadata fields first and unknown fields in stable key order", () => {
    expect(
      renderAuditMetadata({
        zeta: "last",
        assignmentId: "assignment_1",
        courseTitle: "Workplace Safety",
        alpha: "first",
        nested: { count: 2 },
      }),
    ).toEqual([
      { key: "courseTitle", label: "Course title", value: "Workplace Safety", known: true },
      { key: "assignmentId", label: "Assignment id", value: "assignment_1", known: true },
      { key: "alpha", label: "Alpha", value: "first", known: false },
      { key: "nested", label: "Nested", value: "{\"count\":2}", known: false },
      { key: "zeta", label: "Zeta", value: "last", known: false },
    ]);
  });

  it("redacts sensitive audit metadata values before rendering or exporting", () => {
    const fields = renderAuditMetadata({
      token: "raw-reset-token",
      apiKey: "live-api-key",
      courseTitle: "Compliance",
    });

    expect(fields).toEqual([
      { key: "courseTitle", label: "Course title", value: "Compliance", known: true },
      { key: "apiKey", label: "Api key", value: "[REDACTED]", known: false },
      { key: "token", label: "Token", value: "[REDACTED]", known: false },
    ]);
  });

  it("maps audit records to presentation rows with actor and organization fallbacks", () => {
    const row = mapAuditLogRecord({
      id: "audit_1",
      organizationId: "org_1",
      actorId: "user_1",
      action: "course.created",
      targetType: "course",
      targetId: "course_1",
      createdAt: new Date("2026-06-12T15:00:00.000Z"),
      metadata: { courseTitle: "Safety" },
      actor: { email: "ada@example.com", firstName: "Ada", lastName: "Lovelace" },
      organization: { name: "Acme", slug: "acme" },
    });

    expect(row).toMatchObject({
      id: "audit_1",
      organizationId: "org_1",
      organizationName: "Acme",
      organizationSlug: "acme",
      actorName: "Ada Lovelace",
      actorEmail: "ada@example.com",
      action: "course.created",
      targetType: "course",
      targetId: "course_1",
    });
  });

  it("exports CSV with the same filter query fields and RFC 4180 escaping", () => {
    const filters = parseAuditFilters(
      new URLSearchParams("actor=ada&action=course.created&targetType=course&targetId=course_1&from=2026-06-01&to=2026-06-12&organization=acme"),
    );
    const row = mapAuditLogRecord({
      id: "audit_1",
      organizationId: "org_1",
      actorId: "user_1",
      action: "course.created",
      targetType: "course",
      targetId: "course_1",
      createdAt: new Date("2026-06-12T15:00:00.000Z"),
      metadata: { courseTitle: "Safety, \"Advanced\"" },
      actor: { email: "ada@example.com", firstName: "Ada", lastName: "Lovelace" },
      organization: { name: "Acme", slug: "acme" },
    });

    expect(buildAuditExportQuery(filters, { includeOrganization: true })).toBe(
      "actor=ada&action=course.created&targetType=course&targetId=course_1&from=2026-06-01&to=2026-06-12&organization=acme",
    );
    expect(formatAuditCsv([row])).toBe(
      'Occurred At,Organization,Actor,Actor Email,Action,Target Type,Target ID,Metadata\r\n2026-06-12T15:00:00.000Z,Acme,Ada Lovelace,ada@example.com,course.created,course,course_1,"Course title=Safety, ""Advanced"""',
    );
  });
});
```

- [ ] **Step 2: Run the failing read-model tests**

Run:

```powershell
npm run test -- src/modules/audit/audit-read-models.test.ts
```

Expected: fails because `src/modules/audit/audit-read-models.ts` does not exist.

- [ ] **Step 3: Implement audit read models**

Create `src/modules/audit/audit-read-models.ts`:

```ts
export type AuditFilters = {
  actor?: string;
  action?: string;
  targetType?: string;
  targetId?: string;
  from?: Date;
  to?: Date;
  fromInput?: string;
  toInput?: string;
  organization?: string;
};

export type AuditMetadataField = {
  key: string;
  label: string;
  value: string;
  known: boolean;
};

export type AuditLogRow = {
  id: string;
  organizationId: string | null;
  organizationName: string;
  organizationSlug: string | null;
  actorId: string | null;
  actorName: string;
  actorEmail: string;
  action: string;
  targetType: string;
  targetId: string;
  occurredAt: Date;
  metadataFields: AuditMetadataField[];
};

export type AuditLogRecord = {
  id: string;
  organizationId: string | null;
  actorId: string | null;
  action: string;
  targetType: string;
  targetId: string;
  metadata: unknown;
  createdAt: Date;
  actor: { email: string; firstName: string; lastName: string } | null;
  organization: { name: string; slug: string } | null;
};

type AuditWhere = Record<string, unknown>;

const knownMetadataLabels: Array<[string, string]> = [
  ["courseTitle", "Course title"],
  ["assignmentId", "Assignment id"],
  ["courseId", "Course id"],
  ["membershipId", "Membership id"],
  ["userEmail", "User email"],
  ["learnerEmail", "Learner email"],
  ["provider", "Provider"],
  ["status", "Status"],
  ["previousStatus", "Previous status"],
  ["nextStatus", "Next status"],
  ["reason", "Reason"],
  ["ipAddress", "Ip address"],
];

const sensitiveKeyPattern = /(password|secret|token|api.?key|authorization|credential|signature)/i;

export function parseAuditFilters(searchParams: URLSearchParams): AuditFilters {
  const fromInput = single(searchParams, "from");
  const toInput = single(searchParams, "to");

  return compactFilters({
    actor: single(searchParams, "actor"),
    action: single(searchParams, "action"),
    targetType: single(searchParams, "targetType"),
    targetId: single(searchParams, "targetId"),
    from: fromInput ? startOfUtcDay(fromInput) : undefined,
    to: toInput ? endOfUtcDay(toInput) : undefined,
    fromInput,
    toInput,
    organization: single(searchParams, "organization"),
  });
}

export function auditWhereForOrganization(organizationId: string, filters: AuditFilters): AuditWhere {
  return {
    organizationId,
    ...commonAuditWhere(filters),
  };
}

export function auditWhereForPlatform(filters: AuditFilters): AuditWhere {
  return composeWhere(commonAuditWhere(filters), organizationSearchWhere(filters.organization));
}

export function mapAuditLogRecord(record: AuditLogRecord): AuditLogRow {
  const actorName = record.actor ? `${record.actor.firstName} ${record.actor.lastName}`.trim() : "";

  return {
    id: record.id,
    organizationId: record.organizationId,
    organizationName: record.organization?.name ?? "Platform",
    organizationSlug: record.organization?.slug ?? null,
    actorId: record.actorId,
    actorName: actorName || record.actor?.email || "System",
    actorEmail: record.actor?.email ?? "",
    action: record.action,
    targetType: record.targetType,
    targetId: record.targetId,
    occurredAt: record.createdAt,
    metadataFields: renderAuditMetadata(record.metadata),
  };
}

export function renderAuditMetadata(metadata: unknown): AuditMetadataField[] {
  const source = isPlainObject(metadata) ? metadata : {};
  const known = knownMetadataLabels
    .filter(([key]) => Object.prototype.hasOwnProperty.call(source, key))
    .map(([key, label]) => ({
      key,
      label,
      value: stringifyMetadataValue(key, source[key]),
      known: true,
    }));
  const knownKeys = new Set(knownMetadataLabels.map(([key]) => key));
  const unknown = Object.keys(source)
    .filter((key) => !knownKeys.has(key))
    .sort((left, right) => left.localeCompare(right))
    .map((key) => ({
      key,
      label: labelize(key),
      value: stringifyMetadataValue(key, source[key]),
      known: false,
    }));

  return [...known, ...unknown];
}

export function formatAuditCsv(rows: AuditLogRow[]): string {
  const header = ["Occurred At", "Organization", "Actor", "Actor Email", "Action", "Target Type", "Target ID", "Metadata"];
  const body = rows.map((row) => [
    row.occurredAt.toISOString(),
    row.organizationName,
    row.actorName,
    row.actorEmail,
    row.action,
    row.targetType,
    row.targetId,
    row.metadataFields.map((field) => `${field.label}=${field.value}`).join("; "),
  ]);

  return [header, ...body].map((values) => values.map(formatCsvValue).join(",")).join("\r\n");
}

export function buildAuditExportQuery(filters: AuditFilters, input: { includeOrganization: boolean }): string {
  const params = new URLSearchParams();
  append(params, "actor", filters.actor);
  append(params, "action", filters.action);
  append(params, "targetType", filters.targetType);
  append(params, "targetId", filters.targetId);
  append(params, "from", filters.fromInput);
  append(params, "to", filters.toInput);
  if (input.includeOrganization) {
    append(params, "organization", filters.organization);
  }

  return params.toString();
}

function commonAuditWhere(filters: AuditFilters): AuditWhere {
  return composeWhere({
    ...exact("action", filters.action),
    ...exact("targetType", filters.targetType),
    ...exact("targetId", filters.targetId),
    ...dateRangeWhere(filters),
  }, actorSearchWhere(filters.actor));
}

function composeWhere(...parts: AuditWhere[]): AuditWhere {
  const scalars = Object.assign({}, ...parts.map(({ OR: _or, AND: _and, ...rest }) => rest));
  const groups = parts.flatMap((part) => {
    const result: AuditWhere[] = [];
    if (part.AND) {
      result.push(...part.AND);
    }
    if (part.OR) {
      result.push({ OR: part.OR });
    }
    return result;
  });

  return groups.length > 0 ? { ...scalars, AND: groups } : scalars;
}

function actorSearchWhere(actor: string | undefined): AuditWhere {
  if (!actor) {
    return {};
  }

  return {
    OR: [
      { actorId: actor },
      { actor: { email: { contains: actor, mode: "insensitive" } } },
      { actor: { firstName: { contains: actor, mode: "insensitive" } } },
      { actor: { lastName: { contains: actor, mode: "insensitive" } } },
    ],
  };
}

function organizationSearchWhere(organization: string | undefined): AuditWhere {
  if (!organization) {
    return {};
  }

  return {
    OR: [
      { organizationId: organization },
      { organization: { slug: { contains: organization, mode: "insensitive" } } },
      { organization: { name: { contains: organization, mode: "insensitive" } } },
    ],
  };
}

function dateRangeWhere(filters: AuditFilters): AuditWhere {
  if (!filters.from && !filters.to) {
    return {};
  }

  return {
    createdAt: {
      ...(filters.from ? { gte: filters.from } : {}),
      ...(filters.to ? { lte: filters.to } : {}),
    },
  };
}

function exact(key: string, value: string | undefined): AuditWhere {
  return value ? { [key]: value } : {};
}

function compactFilters(filters: AuditFilters): AuditFilters {
  return Object.fromEntries(Object.entries(filters).filter(([, value]) => value !== undefined && value !== "")) as AuditFilters;
}

function single(searchParams: URLSearchParams, key: string): string | undefined {
  const value = searchParams.get(key)?.trim();
  return value ? value : undefined;
}

function startOfUtcDay(input: string): Date {
  return /^\d{4}-\d{2}-\d{2}$/.test(input) ? new Date(`${input}T00:00:00.000Z`) : new Date(input);
}

function endOfUtcDay(input: string): Date {
  return /^\d{4}-\d{2}-\d{2}$/.test(input) ? new Date(`${input}T23:59:59.999Z`) : new Date(input);
}

function formatCsvValue(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }

  return value;
}

function stringifyMetadataValue(key: string, value: unknown): string {
  if (sensitiveKeyPattern.test(key)) {
    return "[REDACTED]";
  }

  if (value === null || value === undefined) {
    return "";
  }

  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return JSON.stringify(value);
}

function labelize(key: string): string {
  const spaced = key.replace(/([A-Z])/g, " $1").replace(/[_-]+/g, " ").trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function append(params: URLSearchParams, key: string, value: string | undefined): void {
  if (value) {
    params.set(key, value);
  }
}
```

- [ ] **Step 4: Run the read-model tests**

Run:

```powershell
npm run test -- src/modules/audit/audit-read-models.test.ts
```

Expected: all tests in `audit-read-models.test.ts` pass.

- [ ] **Step 5: Commit checkpoint**

Run:

```powershell
git add src/modules/audit/audit-read-models.ts src/modules/audit/audit-read-models.test.ts
git commit -m "feat: add audit read models"
```

## Task 2: Audit Prisma Repository

**Files:**
- Create: `src/modules/audit/prisma-repository.test.ts`
- Create: `src/modules/audit/prisma-repository.ts`

- [ ] **Step 1: Write failing repository tests**

Create `src/modules/audit/prisma-repository.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

import { createPrismaAuditLogRepository } from "./prisma-repository";

function createAuditClient() {
  return {
    auditLog: {
      findMany: vi.fn(async () => [
        {
          id: "audit_1",
          organizationId: "org_1",
          actorId: "user_1",
          action: "course.created",
          targetType: "course",
          targetId: "course_1",
          metadata: { courseTitle: "Safety" },
          createdAt: new Date("2026-06-12T15:00:00.000Z"),
          actor: { email: "ada@example.com", firstName: "Ada", lastName: "Lovelace" },
          organization: { name: "Acme", slug: "acme" },
        },
      ]),
    },
  };
}

describe("createPrismaAuditLogRepository", () => {
  it("lists organization audit logs with forced organization scope", async () => {
    const client = createAuditClient();
    const repository = createPrismaAuditLogRepository(client as unknown as Parameters<typeof createPrismaAuditLogRepository>[0]);

    const rows = await repository.listOrganizationAuditLogs({
      organizationId: "org_1",
      filters: { organization: "org_2", action: "course.created" },
    });

    expect(client.auditLog.findMany).toHaveBeenCalledWith({
      where: { organizationId: "org_1", action: "course.created" },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 100,
      select: {
        id: true,
        organizationId: true,
        actorId: true,
        action: true,
        targetType: true,
        targetId: true,
        metadata: true,
        createdAt: true,
        actor: { select: { email: true, firstName: true, lastName: true } },
        organization: { select: { name: true, slug: true } },
      },
    });
    expect(rows[0]).toMatchObject({
      organizationId: "org_1",
      organizationName: "Acme",
      actorEmail: "ada@example.com",
    });
  });

  it("lets platform reads span tenants and apply organization search", async () => {
    const client = createAuditClient();
    const repository = createPrismaAuditLogRepository(client as unknown as Parameters<typeof createPrismaAuditLogRepository>[0]);

    await repository.listPlatformAuditLogs({
      filters: { organization: "acme", targetType: "course" },
    });

    expect(client.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          targetType: "course",
          AND: [
            {
              OR: [
                { organizationId: "acme" },
                { organization: { slug: { contains: "acme", mode: "insensitive" } } },
                { organization: { name: { contains: "acme", mode: "insensitive" } } },
              ],
            },
          ],
        },
      }),
    );
  });
});
```

- [ ] **Step 2: Run the failing repository tests**

Run:

```powershell
npm run test -- src/modules/audit/prisma-repository.test.ts
```

Expected: fails because `src/modules/audit/prisma-repository.ts` does not exist.

- [ ] **Step 3: Implement the Prisma repository**

Create `src/modules/audit/prisma-repository.ts`:

```ts
import type { Prisma, PrismaClient } from "@prisma/client";

import {
  auditWhereForOrganization,
  auditWhereForPlatform,
  mapAuditLogRecord,
  type AuditFilters,
  type AuditLogRecord,
  type AuditLogRow,
} from "./audit-read-models";

type PrismaAuditLogClient = Pick<PrismaClient, "auditLog">;

export type AuditLogRepository = {
  listOrganizationAuditLogs(input: {
    organizationId: string;
    filters: AuditFilters;
  }): Promise<AuditLogRow[]>;
  listPlatformAuditLogs(input: {
    filters: AuditFilters;
  }): Promise<AuditLogRow[]>;
};

const auditLogSelect = {
  id: true,
  organizationId: true,
  actorId: true,
  action: true,
  targetType: true,
  targetId: true,
  metadata: true,
  createdAt: true,
  actor: { select: { email: true, firstName: true, lastName: true } },
  organization: { select: { name: true, slug: true } },
} satisfies Prisma.AuditLogSelect;

export function createPrismaAuditLogRepository(client: PrismaAuditLogClient): AuditLogRepository {
  return {
    async listOrganizationAuditLogs(input) {
      const records = await client.auditLog.findMany({
        where: auditWhereForOrganization(input.organizationId, input.filters) as Prisma.AuditLogWhereInput,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 100,
        select: auditLogSelect,
      });

      return records.map((record) => mapAuditLogRecord(record as AuditLogRecord));
    },
    async listPlatformAuditLogs(input) {
      const records = await client.auditLog.findMany({
        where: auditWhereForPlatform(input.filters) as Prisma.AuditLogWhereInput,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 100,
        select: auditLogSelect,
      });

      return records.map((record) => mapAuditLogRecord(record as AuditLogRecord));
    },
  };
}
```

- [ ] **Step 4: Run audit repository and read-model tests**

Run:

```powershell
npm run test -- src/modules/audit/audit-read-models.test.ts src/modules/audit/prisma-repository.test.ts
```

Expected: both audit test files pass.

- [ ] **Step 5: Commit checkpoint**

Run:

```powershell
git add src/modules/audit/prisma-repository.ts src/modules/audit/prisma-repository.test.ts
git commit -m "feat: add audit prisma repository"
```

## Task 3: Operations Provider Failure Read Model

**Files:**
- Create: `src/modules/operations/provider-failures.test.ts`
- Create: `src/modules/operations/provider-failures.ts`

- [ ] **Step 1: Run dependency preflight**

Run before writing provider failure code:

```powershell
npx prisma validate
@(
  'model NotificationJob',
  'organizationId',
  'status',
  'attempts',
  'providerMessageId',
  'lastError',
  'nextRunAt',
  'leaseToken',
  'leaseExpiresAt',
  'model CredentialIssuance',
  'organizationId',
  'certificateId',
  'provider',
  'status',
  'providerCredentialId',
  'providerUrl',
  'errorMessage',
  'attemptCount',
  'attemptedAt',
  'lastFailedAt',
  'model ScormPackage',
  'organizationId',
  'storageKey',
  'contentRootKey',
  'processingStatus',
  'malwareScanStatus',
  'validationError',
  'extractionError',
  'model VideoLesson',
  'organizationId',
  'providerProcessingStatus',
  'providerUploadId',
  'providerAssetId',
  'providerError',
  'providerUpdatedAt'
) | ForEach-Object {
  if (-not (Select-String -Path prisma/schema.prisma -Pattern $_ -Quiet)) {
    throw "Missing schema dependency: $_"
  }
}
$sourceFiles = Get-ChildItem -Path src/modules,src/app -Recurse -Include *.ts,*.tsx
@(
  'storage.upload_failed',
  'storage.read_failed',
  'storage.delete_failed',
  'storage.signed_url_failed'
) | ForEach-Object {
  if (-not ($sourceFiles | Select-String -Pattern $_ -Quiet)) {
    throw "Missing storage audit failure action dependency: $_"
  }
}
```

Expected: Prisma validates, table-backed provider failure schema dependencies are present in `prisma/schema.prisma`, and storage failure audit action strings are present in source files. If this fails, finish Tasks 4, 5, and 6 first; do not implement operations observability against partial provider schemas.

- [ ] **Step 2: Write failing provider failure tests**

Create `src/modules/operations/provider-failures.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

import {
  listProviderFailureRows,
  mapCredentialIssuanceFailure,
  mapMuxAssetFailure,
  mapNotificationJobFailure,
  mapScormExtractionFailure,
  mapStorageAuditFailure,
  redactProviderError,
} from "./provider-failures";

const now = new Date("2026-06-12T16:00:00.000Z");
const organization = { name: "Acme", slug: "acme" };

describe("provider failure read models", () => {
  it("redacts bearer tokens, signed URL values, and credential words from errors", () => {
    const text =
      "POST https://r2.example.test/file?X-Amz-Signature=abc123&token=reset-token failed Authorization: Bearer live-token secret=raw-secret apiKey=raw-key";

    expect(redactProviderError(text)).toBe(
      "POST https://r2.example.test/file?X-Amz-Signature=[REDACTED]&token=[REDACTED] failed Authorization: Bearer [REDACTED] secret=[REDACTED] apiKey=[REDACTED]",
    );
  });

  it("maps pending notification retries with stored delivery errors as retry eligible", () => {
    expect(
      mapNotificationJobFailure(
        {
          id: "job_1",
          organizationId: "org_1",
          type: "ASSIGNMENT_DUE_SOON",
          status: "PENDING",
          attempts: 2,
          lastError: "SMTP 500",
          nextRunAt: new Date("2026-06-12T17:00:00.000Z"),
          leaseExpiresAt: null,
          updatedAt: new Date("2026-06-12T15:00:00.000Z"),
          organization,
        },
        now,
      ),
    ).toMatchObject({
      id: "notification:job_1",
      source: "NOTIFICATION_JOB",
      provider: "Email",
      operation: "ASSIGNMENT_DUE_SOON",
      targetType: "notification_job",
      targetId: "job_1",
      status: "PENDING",
      lastError: "SMTP 500",
      retryEligible: true,
      retryReason: "Next retry can be scheduled because attempts are below 3.",
    });
  });

  it("maps failed notification jobs with stored errors as exhausted and non-retryable", () => {
    expect(
      mapNotificationJobFailure(
        {
          id: "job_3",
          organizationId: "org_1",
          type: "ASSIGNMENT_OVERDUE",
          status: "FAILED",
          attempts: 3,
          lastError: "SMTP 550",
          nextRunAt: null,
          leaseExpiresAt: null,
          updatedAt: new Date("2026-06-12T16:00:00.000Z"),
          organization,
        },
        now,
      ),
    ).toMatchObject({
      id: "notification:job_3",
      status: "FAILED",
      lastError: "SMTP 550",
      retryEligible: false,
      retryReason: "Notification attempts are exhausted.",
    });
  });

  it("maps stale processing notification jobs as retry eligible", () => {
    expect(
      mapNotificationJobFailure(
        {
          id: "job_2",
          organizationId: "org_1",
          type: "CERTIFICATE_CREATED",
          status: "PROCESSING",
          attempts: 1,
          lastError: "Worker stopped",
          nextRunAt: new Date("2026-06-12T15:30:00.000Z"),
          leaseExpiresAt: new Date("2026-06-12T15:45:00.000Z"),
          updatedAt: new Date("2026-06-12T15:00:00.000Z"),
          organization,
        },
        now,
      ),
    ).toMatchObject({
      retryEligible: true,
      retryReason: "Processing lease expired and the job can be reclaimed.",
    });
  });

  it("maps failed credential issuance without leaking provider error secrets", () => {
    expect(
      mapCredentialIssuanceFailure({
        id: "credential_1",
        organizationId: "org_1",
        certificateId: "certificate_1",
        provider: "CREDLY",
        status: "FAILED",
        providerCredentialId: null,
        errorMessage: "Credential API rejected token=raw",
        attemptedAt: new Date("2026-06-12T14:00:00.000Z"),
        organization,
      }),
    ).toMatchObject({
      id: "credential:credential_1",
      source: "CREDENTIAL_ISSUANCE",
      provider: "CREDLY",
      targetType: "certificate",
      targetId: "certificate_1",
      lastError: "Credential API rejected token=[REDACTED]",
      retryEligible: true,
    });
  });

  it("maps SCORM extraction failures and blocks retry when malware failed", () => {
    expect(
      mapScormExtractionFailure({
        id: "package_1",
        organizationId: "org_1",
        courseId: "course_1",
        processingStatus: "FAILED",
        malwareScanStatus: "FAILED",
        extractionError: "Zip traversal rejected",
        validationError: null,
        storageKey: "org/org_1/course.zip",
        contentRootKey: "org/org_1/courses/course_1/scorm/package_1/content",
        updatedAt: new Date("2026-06-12T13:00:00.000Z"),
        organization,
      }),
    ).toMatchObject({
      id: "scorm:package_1",
      source: "SCORM_EXTRACTION",
      provider: "R2",
      operation: "SCORM extraction",
      retryEligible: false,
      retryReason: "Malware scan failed; upload a clean package before retrying.",
    });
  });

  it("maps Mux asset failures from errored video lessons", () => {
    expect(
      mapMuxAssetFailure({
        id: "lesson_1",
        organizationId: "org_1",
        courseId: "course_1",
        title: "Intro",
        providerUploadId: "upload_1",
        providerAssetId: null,
        providerProcessingStatus: "ERRORED",
        providerError: "Mux error password=raw",
        providerUpdatedAt: new Date("2026-06-12T12:00:00.000Z"),
        updatedAt: new Date("2026-06-12T12:05:00.000Z"),
        organization,
      }),
    ).toMatchObject({
      id: "mux:lesson_1",
      source: "MUX_ASSET",
      provider: "Mux",
      operation: "Video processing",
      targetType: "video_lesson",
      targetId: "lesson_1",
      lastError: "Mux error password=[REDACTED]",
      retryEligible: true,
    });
  });

  it("maps storage failure audit rows using retryable metadata only", () => {
    expect(
      mapStorageAuditFailure({
        id: "audit_1",
        organizationId: "org_1",
        action: "storage.upload_failed",
        targetType: "stored_object",
        targetId: "object_1",
        metadata: { provider: "R2", operation: "SCORM_ZIP upload", lastError: "403 secret=raw", retryable: true },
        createdAt: new Date("2026-06-12T11:00:00.000Z"),
        organization,
      }),
    ).toMatchObject({
      id: "storage:audit_1",
      source: "STORAGE",
      provider: "R2",
      operation: "SCORM_ZIP upload",
      lastError: "403 secret=[REDACTED]",
      retryEligible: true,
    });
  });

  it("queries every failure source with organization scope for tenant operations pages", async () => {
    const client = createProviderFailureClient();

    await listProviderFailureRows(client as unknown as Parameters<typeof listProviderFailureRows>[0], {
      scope: { kind: "organization", organizationId: "org_1" },
      now,
      filters: {},
    });

    expect(client.notificationJob.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ organizationId: "org_1" }) }));
    expect(client.credentialIssuance.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ organizationId: "org_1" }) }));
    expect(client.scormPackage.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ organizationId: "org_1" }) }));
    expect(client.videoLesson.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ organizationId: "org_1" }) }));
    expect(client.auditLog.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ organizationId: "org_1" }) }));
  });
});

function createProviderFailureClient() {
  return {
    notificationJob: { findMany: vi.fn(async () => []) },
    credentialIssuance: { findMany: vi.fn(async () => []) },
    scormPackage: { findMany: vi.fn(async () => []) },
    videoLesson: { findMany: vi.fn(async () => []) },
    auditLog: { findMany: vi.fn(async () => []) },
  };
}
```

- [ ] **Step 2: Run the failing provider failure tests**

Run:

```powershell
npm run test -- src/modules/operations/provider-failures.test.ts
```

Expected: fails because `src/modules/operations/provider-failures.ts` does not exist.

- [ ] **Step 3: Implement provider failure mapping and queries**

Create `src/modules/operations/provider-failures.ts` with these exported functions and types:

```ts
import type { Prisma, PrismaClient } from "@prisma/client";

export type ProviderFailureSource =
  | "NOTIFICATION_JOB"
  | "CREDENTIAL_ISSUANCE"
  | "SCORM_EXTRACTION"
  | "MUX_ASSET"
  | "STORAGE";

export type ProviderFailureFilters = {
  source?: ProviderFailureSource;
  organization?: string;
  retryEligible?: boolean;
};

export type ProviderFailureScope =
  | { kind: "organization"; organizationId: string }
  | { kind: "platform" };

export type ProviderFailureRow = {
  id: string;
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  source: ProviderFailureSource;
  provider: string;
  operation: string;
  targetType: string;
  targetId: string;
  status: string;
  lastError: string;
  retryEligible: boolean;
  retryReason: string;
  occurredAt: Date;
};

type ProviderFailureClient = Pick<
  PrismaClient,
  "notificationJob" | "credentialIssuance" | "scormPackage" | "videoLesson" | "auditLog"
>;

type OrganizationRecord = { name: string; slug: string };

type NotificationFailureRecord = {
  id: string;
  organizationId: string;
  type: string;
  status: string;
  attempts: number;
  lastError: string | null;
  nextRunAt: Date;
  leaseExpiresAt: Date | null;
  updatedAt: Date;
  organization: OrganizationRecord;
};

type CredentialFailureRecord = {
  id: string;
  organizationId: string;
  certificateId: string;
  provider: string;
  status: string;
  providerCredentialId: string | null;
  errorMessage: string | null;
  attemptedAt: Date;
  organization: OrganizationRecord;
};

type ScormFailureRecord = {
  id: string;
  organizationId: string;
  courseId: string;
  processingStatus: string;
  malwareScanStatus: string;
  extractionError: string | null;
  validationError: string | null;
  storageKey: string | null;
  contentRootKey: string | null;
  updatedAt: Date;
  organization: OrganizationRecord;
};

type MuxFailureRecord = {
  id: string;
  organizationId: string;
  courseId: string;
  title: string;
  providerUploadId: string | null;
  providerAssetId: string | null;
  providerProcessingStatus: string;
  providerError: string | null;
  providerUpdatedAt: Date | null;
  updatedAt: Date;
  organization: OrganizationRecord;
};

type StorageFailureRecord = {
  id: string;
  organizationId: string;
  action: string;
  targetType: string;
  targetId: string;
  metadata: unknown;
  createdAt: Date;
  organization: OrganizationRecord;
};

const maxNotificationAttempts = 3;
const storageFailureActions = ["storage.upload_failed", "storage.read_failed", "storage.delete_failed", "storage.signed_url_failed"];

export async function listProviderFailureRows(
  client: ProviderFailureClient,
  input: { scope: ProviderFailureScope; filters: ProviderFailureFilters; now: Date },
): Promise<ProviderFailureRow[]> {
  const [notifications, credentials, scormPackages, muxLessons, storageAuditLogs] = await Promise.all([
    shouldLoad(input.filters, "NOTIFICATION_JOB") ? loadNotificationFailures(client, input) : Promise.resolve([]),
    shouldLoad(input.filters, "CREDENTIAL_ISSUANCE") ? loadCredentialFailures(client, input) : Promise.resolve([]),
    shouldLoad(input.filters, "SCORM_EXTRACTION") ? loadScormFailures(client, input) : Promise.resolve([]),
    shouldLoad(input.filters, "MUX_ASSET") ? loadMuxFailures(client, input) : Promise.resolve([]),
    shouldLoad(input.filters, "STORAGE") ? loadStorageFailures(client, input) : Promise.resolve([]),
  ]);

  return [...notifications, ...credentials, ...scormPackages, ...muxLessons, ...storageAuditLogs]
    .filter((row) => input.filters.retryEligible === undefined || row.retryEligible === input.filters.retryEligible)
    .sort((left, right) => right.occurredAt.getTime() - left.occurredAt.getTime())
    .slice(0, 100);
}

export function mapNotificationJobFailure(record: NotificationFailureRecord, now: Date): ProviderFailureRow {
  const staleProcessing = record.status === "PROCESSING" && record.leaseExpiresAt !== null && record.leaseExpiresAt < now;
  const attemptsRemain = record.status === "PENDING" && Boolean(record.lastError) && record.attempts < maxNotificationAttempts;
  const failedWithError = record.status === "FAILED" && Boolean(record.lastError);
  const retryEligible = staleProcessing || attemptsRemain;

  return baseRow(record, {
    id: `notification:${record.id}`,
    source: "NOTIFICATION_JOB",
    provider: "Email",
    operation: record.type,
    targetType: "notification_job",
    targetId: record.id,
    status: record.status,
    lastError: record.lastError ?? "Notification delivery failed",
    retryEligible,
    retryReason: staleProcessing
      ? "Processing lease expired and the job can be reclaimed."
      : attemptsRemain
        ? "Next retry can be scheduled because attempts are below 3."
        : failedWithError
          ? "Notification attempts are exhausted."
          : "Notification job has no stored provider failure.",
    occurredAt: record.updatedAt,
  });
}

export function mapCredentialIssuanceFailure(record: CredentialFailureRecord): ProviderFailureRow {
  const retryEligible = record.status === "FAILED" && Boolean(record.certificateId) && !record.providerCredentialId;

  return baseRow(record, {
    id: `credential:${record.id}`,
    source: "CREDENTIAL_ISSUANCE",
    provider: record.provider,
    operation: "Credential issuance",
    targetType: "certificate",
    targetId: record.certificateId,
    status: record.status,
    lastError: record.errorMessage ?? "Credential issuance failed",
    retryEligible,
    retryReason: retryEligible
      ? "Certificate exists and the provider did not return a credential id."
      : "Credential issuance already has a provider id or lacks a certificate.",
    occurredAt: record.attemptedAt,
  });
}

export function mapScormExtractionFailure(record: ScormFailureRecord): ProviderFailureRow {
  const retryEligible =
    record.processingStatus === "FAILED" &&
    Boolean(record.extractionError) &&
    Boolean(record.storageKey) &&
    record.malwareScanStatus !== "FAILED";

  return baseRow(record, {
    id: `scorm:${record.id}`,
    source: "SCORM_EXTRACTION",
    provider: "R2",
    operation: "SCORM extraction",
    targetType: "scorm_package",
    targetId: record.id,
    status: record.processingStatus,
    lastError: record.extractionError ?? record.validationError ?? "SCORM extraction failed",
    retryEligible,
    retryReason:
      record.malwareScanStatus === "FAILED"
        ? "Malware scan failed; upload a clean package before retrying."
        : retryEligible
          ? "Original zip key is present and extraction can be queued again."
          : "Original zip key is missing.",
    occurredAt: record.updatedAt,
  });
}

export function mapMuxAssetFailure(record: MuxFailureRecord): ProviderFailureRow {
  const retryEligible = record.providerProcessingStatus === "ERRORED" && Boolean(record.providerUploadId || record.providerAssetId);

  return baseRow(record, {
    id: `mux:${record.id}`,
    source: "MUX_ASSET",
    provider: "Mux",
    operation: "Video processing",
    targetType: "video_lesson",
    targetId: record.id,
    status: record.providerProcessingStatus,
    lastError: record.providerError ?? "Mux asset processing failed",
    retryEligible,
    retryReason: retryEligible
      ? "Stored Mux upload or asset id is available for reconciliation."
      : "Mux upload and asset identifiers are missing.",
    occurredAt: record.providerUpdatedAt ?? record.updatedAt,
  });
}

export function mapStorageAuditFailure(record: StorageFailureRecord): ProviderFailureRow {
  const metadata = isObject(record.metadata) ? record.metadata : {};
  const provider = stringValue(metadata.provider) || "Storage";
  const operation = stringValue(metadata.operation) || record.action;
  const retryable = metadata.retryable === true && Boolean(record.targetId);

  return baseRow(record, {
    id: `storage:${record.id}`,
    source: "STORAGE",
    provider,
    operation,
    targetType: record.targetType,
    targetId: record.targetId,
    status: record.action,
    lastError: stringValue(metadata.lastError) || stringValue(metadata.error) || "Storage operation failed",
    retryEligible: retryable,
    retryReason: retryable
      ? "Storage failure metadata marks the operation retryable."
      : "Storage failure requires manual remediation or has no persisted target.",
    occurredAt: record.createdAt,
  });
}

export function redactProviderError(value: string): string {
  return value
    .replace(/Bearer\s+[^,\s;]+/gi, "Bearer [REDACTED]")
    .replace(/((?:X-Amz-Signature|X-Amz-Credential|token|signature|secret|password|apiKey|api_key)=)[^&\s;]+/gi, "$1[REDACTED]")
    .replace(/([A-Za-z0-9+/=_-]{40,})/g, "[REDACTED]");
}

function baseRow(
  record: { organizationId: string; organization: OrganizationRecord },
  row: Omit<ProviderFailureRow, "organizationId" | "organizationName" | "organizationSlug" | "lastError"> & { lastError: string },
): ProviderFailureRow {
  return {
    organizationId: record.organizationId,
    organizationName: record.organization.name,
    organizationSlug: record.organization.slug,
    ...row,
    lastError: redactProviderError(row.lastError),
  };
}

async function loadNotificationFailures(
  client: ProviderFailureClient,
  input: { scope: ProviderFailureScope; filters: ProviderFailureFilters; now: Date },
): Promise<ProviderFailureRow[]> {
  const records = await client.notificationJob.findMany({
    where: composeFailureWhere(
      scopeWhere(input.scope, input.filters),
      {
        OR: [
          { status: "PENDING", lastError: { not: null } },
          { status: "FAILED", lastError: { not: null } },
          { status: "PROCESSING", leaseExpiresAt: { lt: input.now } },
        ],
      },
    ) as Prisma.NotificationJobWhereInput,
    orderBy: [{ updatedAt: "desc" }],
    take: 100,
    select: {
      id: true,
      organizationId: true,
      type: true,
      status: true,
      attempts: true,
      lastError: true,
      nextRunAt: true,
      leaseExpiresAt: true,
      updatedAt: true,
      organization: { select: { name: true, slug: true } },
    },
  });

  return records.map((record) => mapNotificationJobFailure(record as NotificationFailureRecord, input.now));
}

async function loadCredentialFailures(
  client: ProviderFailureClient,
  input: { scope: ProviderFailureScope; filters: ProviderFailureFilters },
): Promise<ProviderFailureRow[]> {
  const records = await client.credentialIssuance.findMany({
    where: composeFailureWhere(scopeWhere(input.scope, input.filters), { status: "FAILED" }) as Prisma.CredentialIssuanceWhereInput,
    orderBy: [{ attemptedAt: "desc" }],
    take: 100,
    select: {
      id: true,
      organizationId: true,
      certificateId: true,
      provider: true,
      status: true,
      providerCredentialId: true,
      errorMessage: true,
      attemptedAt: true,
      organization: { select: { name: true, slug: true } },
    },
  });

  return records.map((record) => mapCredentialIssuanceFailure(record as CredentialFailureRecord));
}

async function loadScormFailures(
  client: ProviderFailureClient,
  input: { scope: ProviderFailureScope; filters: ProviderFailureFilters },
): Promise<ProviderFailureRow[]> {
  const records = await client.scormPackage.findMany({
    where: composeFailureWhere(scopeWhere(input.scope, input.filters), {
      processingStatus: "FAILED",
      extractionError: { not: null },
    }) as Prisma.ScormPackageWhereInput,
    orderBy: [{ updatedAt: "desc" }],
    take: 100,
    select: {
      id: true,
      organizationId: true,
      courseId: true,
      processingStatus: true,
      malwareScanStatus: true,
      extractionError: true,
      validationError: true,
      storageKey: true,
      contentRootKey: true,
      updatedAt: true,
      organization: { select: { name: true, slug: true } },
    },
  });

  return records.map((record) => mapScormExtractionFailure(record as ScormFailureRecord));
}

async function loadMuxFailures(
  client: ProviderFailureClient,
  input: { scope: ProviderFailureScope; filters: ProviderFailureFilters },
): Promise<ProviderFailureRow[]> {
  const records = await client.videoLesson.findMany({
    where: composeFailureWhere(scopeWhere(input.scope, input.filters), {
      providerProcessingStatus: "ERRORED",
    }) as Prisma.VideoLessonWhereInput,
    orderBy: [{ providerUpdatedAt: "desc" }, { updatedAt: "desc" }],
    take: 100,
    select: {
      id: true,
      organizationId: true,
      courseId: true,
      title: true,
      providerUploadId: true,
      providerAssetId: true,
      providerProcessingStatus: true,
      providerError: true,
      providerUpdatedAt: true,
      updatedAt: true,
      organization: { select: { name: true, slug: true } },
    },
  });

  return records.map((record) => mapMuxAssetFailure(record as MuxFailureRecord));
}

async function loadStorageFailures(
  client: ProviderFailureClient,
  input: { scope: ProviderFailureScope; filters: ProviderFailureFilters },
): Promise<ProviderFailureRow[]> {
  const records = await client.auditLog.findMany({
    where: composeFailureWhere(scopeWhere(input.scope, input.filters), {
      targetType: "stored_object",
      action: { in: storageFailureActions },
    }) as Prisma.AuditLogWhereInput,
    orderBy: [{ createdAt: "desc" }],
    take: 100,
    select: {
      id: true,
      organizationId: true,
      action: true,
      targetType: true,
      targetId: true,
      metadata: true,
      createdAt: true,
      organization: { select: { name: true, slug: true } },
    },
  });

  return records.map((record) => mapStorageAuditFailure(record as StorageFailureRecord));
}

function scopeWhere(scope: ProviderFailureScope, filters: ProviderFailureFilters): Record<string, unknown> {
  if (scope.kind === "organization") {
    return { organizationId: scope.organizationId };
  }

  if (!filters.organization) {
    return {};
  }

  return {
    OR: [
      { organizationId: filters.organization },
      { organization: { slug: { contains: filters.organization, mode: "insensitive" } } },
      { organization: { name: { contains: filters.organization, mode: "insensitive" } } },
    ],
  };
}

function composeFailureWhere(...parts: Array<Record<string, unknown>>): Record<string, unknown> {
  const scalars = Object.assign({}, ...parts.map(({ OR: _or, AND: _and, ...rest }) => rest));
  const groups = parts.flatMap((part) => {
    const result: Array<Record<string, unknown>> = [];
    if (Array.isArray(part.AND)) {
      result.push(...(part.AND as Array<Record<string, unknown>>));
    }
    if (Array.isArray(part.OR)) {
      result.push({ OR: part.OR });
    }
    return result;
  });

  return groups.length > 0 ? { ...scalars, AND: groups } : scalars;
}

function shouldLoad(filters: ProviderFailureFilters, source: ProviderFailureSource): boolean {
  return !filters.source || filters.source === source;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}
```

- [ ] **Step 4: Run provider failure tests**

Run:

```powershell
npm run test -- src/modules/operations/provider-failures.test.ts
```

Expected: all provider failure tests pass.

- [ ] **Step 5: Commit checkpoint**

Run:

```powershell
git add src/modules/operations/provider-failures.ts src/modules/operations/provider-failures.test.ts
git commit -m "feat: add operations provider failure read model"
```

## Task 4: Audit Pages And CSV Export Routes

**Files:**
- Create: `src/app/org/[slug]/admin/audit/page.tsx`
- Create: `src/app/platform/audit/page.tsx`
- Create: `src/app/api/org/[slug]/audit.csv/route.ts`
- Create: `src/app/api/platform/audit.csv/route.ts`
- Create: `src/modules/audit/audit-pages.test.ts`

- [ ] **Step 1: Write failing audit page and route tests**

Create `src/modules/audit/audit-pages.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("audit pages and CSV routes", () => {
  it("organization audit page uses tenant guard, tenant repository method, and omits organization export filter", () => {
    const source = readFileSync("src/app/org/[slug]/admin/audit/page.tsx", "utf8");

    expect(source).toContain("requireOrganizationUsersAdminBySlug");
    expect(source).toContain("listOrganizationAuditLogs");
    expect(source).toContain("buildAuditExportQuery(filters, { includeOrganization: false })");
    expect(source).toContain("AuditTable");
    expect(source).toContain("No audit records match these filters.");
  });

  it("platform audit page uses platform guard, platform repository method, and includes organization filter", () => {
    const source = readFileSync("src/app/platform/audit/page.tsx", "utf8");

    expect(source).toContain("requirePlatformOwner");
    expect(source).toContain("type AuditLogRow");
    expect(source).toContain("listPlatformAuditLogs");
    expect(source).toContain("buildAuditExportQuery(filters, { includeOrganization: true })");
    expect(source).toContain("Organization");
  });

  it("CSV routes use the same parsed filters as pages and return CSV attachments", () => {
    const orgRoute = readFileSync("src/app/api/org/[slug]/audit.csv/route.ts", "utf8");
    const platformRoute = readFileSync("src/app/api/platform/audit.csv/route.ts", "utf8");

    expect(orgRoute).toContain("requireOrganizationUsersAdminBySlug");
    expect(orgRoute).toContain("parseAuditFilters(new URL(request.url).searchParams)");
    expect(orgRoute).toContain("listOrganizationAuditLogs");
    expect(orgRoute).toContain("learnhub-org-audit.csv");
    expect(platformRoute).toContain("requirePlatformOwner");
    expect(platformRoute).toContain("listPlatformAuditLogs");
    expect(platformRoute).toContain("learnhub-platform-audit.csv");
  });
});
```

Run:

```powershell
npm run test -- src/modules/audit/audit-pages.test.ts
```

Expected: fail because the audit pages and CSV route files do not exist.

- [ ] **Step 2: Extend audit read-model tests for route/page query reuse**

Append this test to `src/modules/audit/audit-read-models.test.ts`:

```ts
it("omits organization from organization export links while keeping all other filters", () => {
  const filters = parseAuditFilters(
    new URLSearchParams("actor=ada&action=user.invited&targetType=user&targetId=user_1&from=2026-06-01&to=2026-06-12&organization=acme"),
  );

  expect(buildAuditExportQuery(filters, { includeOrganization: false })).toBe(
    "actor=ada&action=user.invited&targetType=user&targetId=user_1&from=2026-06-01&to=2026-06-12",
  );
});
```

- [ ] **Step 3: Run the focused audit tests**

Run:

```powershell
npm run test -- src/modules/audit/audit-read-models.test.ts src/modules/audit/prisma-repository.test.ts
```

Expected: audit read-model and repository tests pass after Task 1 and Task 2. The new query reuse assertion prevents org CSV links from carrying an attacker-supplied organization filter, while `audit-pages.test.ts` from Step 1 remains failing until the page and route files are created.

- [ ] **Step 4: Implement organization audit page**

Create `src/app/org/[slug]/admin/audit/page.tsx` as a server component:

```tsx
import { requireOrganizationUsersAdminBySlug } from "@/lib/auth/guards";
import {
  buildAuditExportQuery,
  parseAuditFilters,
  type AuditLogRow,
} from "@/modules/audit/audit-read-models";
import { createPrismaAuditLogRepository } from "@/modules/audit/prisma-repository";

export const dynamic = "force-dynamic";

type OrganizationAuditPageProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function OrganizationAuditPage({ params, searchParams }: OrganizationAuditPageProps) {
  const { slug } = await params;
  const { organizationId } = await requireOrganizationUsersAdminBySlug(slug);
  const filters = parseAuditFilters(toUrlSearchParams(await searchParams));
  const { prisma } = await import("@/lib/prisma");
  const rows = await createPrismaAuditLogRepository(prisma).listOrganizationAuditLogs({
    organizationId,
    filters,
  });
  const query = buildAuditExportQuery(filters, { includeOrganization: false });
  const csvPath = `/api/org/${encodeURIComponent(slug)}/audit.csv${query ? `?${query}` : ""}`;

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-6 px-6 py-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium uppercase tracking-wide text-slate-500">Organization audit</p>
          <h1 className="text-3xl font-semibold text-slate-950">{slug} audit log</h1>
        </div>
        <a className="rounded-md bg-slate-950 px-4 py-2 text-sm font-medium text-white" href={csvPath}>
          Export CSV
        </a>
      </header>
      <AuditFilterForm filters={filters} includeOrganization={false} />
      <AuditTable rows={rows} includeOrganization={false} />
    </main>
  );
}

function AuditFilterForm({ filters, includeOrganization }: { filters: ReturnType<typeof parseAuditFilters>; includeOrganization: boolean }) {
  return (
    <form className="grid gap-3 rounded-md border border-slate-200 p-4 md:grid-cols-4" method="get">
      <label className="text-sm text-slate-700">
        Actor
        <input className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" name="actor" defaultValue={filters.actor ?? ""} />
      </label>
      <label className="text-sm text-slate-700">
        Action
        <input className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" name="action" defaultValue={filters.action ?? ""} />
      </label>
      <label className="text-sm text-slate-700">
        Target type
        <input className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" name="targetType" defaultValue={filters.targetType ?? ""} />
      </label>
      <label className="text-sm text-slate-700">
        Target id
        <input className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" name="targetId" defaultValue={filters.targetId ?? ""} />
      </label>
      <label className="text-sm text-slate-700">
        From
        <input className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" name="from" type="date" defaultValue={filters.fromInput ?? ""} />
      </label>
      <label className="text-sm text-slate-700">
        To
        <input className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" name="to" type="date" defaultValue={filters.toInput ?? ""} />
      </label>
      {includeOrganization ? (
        <label className="text-sm text-slate-700">
          Organization
          <input className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" name="organization" defaultValue={filters.organization ?? ""} />
        </label>
      ) : null}
      <div className="flex items-end">
        <button className="rounded-md bg-slate-950 px-4 py-2 text-sm font-medium text-white" type="submit">
          Filter
        </button>
      </div>
    </form>
  );
}

function AuditTable({ rows, includeOrganization }: { rows: AuditLogRow[]; includeOrganization: boolean }) {
  return (
    <section className="overflow-hidden rounded-md border border-slate-200">
      <table className="w-full border-collapse text-left text-sm">
        <thead className="bg-slate-50 text-slate-600">
          <tr>
            <th className="px-4 py-3 font-medium">Occurred</th>
            {includeOrganization ? <th className="px-4 py-3 font-medium">Organization</th> : null}
            <th className="px-4 py-3 font-medium">Actor</th>
            <th className="px-4 py-3 font-medium">Action</th>
            <th className="px-4 py-3 font-medium">Target</th>
            <th className="px-4 py-3 font-medium">Metadata</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200">
          {rows.length === 0 ? (
            <tr>
              <td className="px-4 py-6 text-slate-500" colSpan={includeOrganization ? 6 : 5}>
                No audit records match these filters.
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={row.id}>
                <td className="px-4 py-3 text-slate-700">{row.occurredAt.toLocaleString()}</td>
                {includeOrganization ? <td className="px-4 py-3 text-slate-700">{row.organizationName}</td> : null}
                <td className="px-4 py-3">
                  <div className="font-medium text-slate-950">{row.actorName}</div>
                  <div className="text-slate-500">{row.actorEmail || row.actorId || "system"}</div>
                </td>
                <td className="px-4 py-3 text-slate-700">{row.action}</td>
                <td className="px-4 py-3 text-slate-700">
                  <div>{row.targetType}</div>
                  <div className="text-slate-500">{row.targetId}</div>
                </td>
                <td className="px-4 py-3 text-slate-700">
                  {row.metadataFields.length === 0
                    ? "None"
                    : row.metadataFields.map((field) => (
                        <div key={field.key}>
                          <span className="font-medium">{field.label}:</span> {field.value}
                        </div>
                      ))}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </section>
  );
}

function toUrlSearchParams(input: Record<string, string | string[] | undefined>): URLSearchParams {
  const params = new URLSearchParams();
  Object.entries(input).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      value.forEach((item) => params.append(key, item));
    } else if (value) {
      params.set(key, value);
    }
  });
  return params;
}
```

- [ ] **Step 5: Implement platform audit page**

Create `src/app/platform/audit/page.tsx` by reusing the same table and filter shape as the organization page, with these differences:

```tsx
import { requirePlatformOwner } from "@/lib/auth/guards";
import {
  buildAuditExportQuery,
  parseAuditFilters,
  type AuditLogRow,
} from "@/modules/audit/audit-read-models";
import { createPrismaAuditLogRepository } from "@/modules/audit/prisma-repository";

export const dynamic = "force-dynamic";

type PlatformAuditPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function PlatformAuditPage({ searchParams }: PlatformAuditPageProps) {
  await requirePlatformOwner();
  const filters = parseAuditFilters(toUrlSearchParams(await searchParams));
  const { prisma } = await import("@/lib/prisma");
  const rows = await createPrismaAuditLogRepository(prisma).listPlatformAuditLogs({ filters });
  const query = buildAuditExportQuery(filters, { includeOrganization: true });
  const csvPath = `/api/platform/audit.csv${query ? `?${query}` : ""}`;

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-6 px-6 py-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium uppercase tracking-wide text-slate-500">Platform audit</p>
          <h1 className="text-3xl font-semibold text-slate-950">Cross-tenant audit log</h1>
        </div>
        <a className="rounded-md bg-slate-950 px-4 py-2 text-sm font-medium text-white" href={csvPath}>
          Export CSV
        </a>
      </header>
      <AuditFilterForm filters={filters} includeOrganization />
      <AuditTable rows={rows} includeOrganization />
    </main>
  );
}
```

Copy `AuditFilterForm`, `AuditTable`, and `toUrlSearchParams` from the org page into this file, including the `type AuditLogRow` import shown above. Keep the platform page self-contained until a later refactor has a shared component target; this task creates only the requested files.

- [ ] **Step 6: Implement organization audit CSV route**

Create `src/app/api/org/[slug]/audit.csv/route.ts`:

```ts
import { requireOrganizationUsersAdminBySlug } from "@/lib/auth/guards";
import { formatAuditCsv, parseAuditFilters } from "@/modules/audit/audit-read-models";
import { createPrismaAuditLogRepository } from "@/modules/audit/prisma-repository";

type OrganizationAuditCsvRouteContext = {
  params: Promise<{ slug: string }>;
};

export async function GET(request: Request, { params }: OrganizationAuditCsvRouteContext): Promise<Response> {
  try {
    const { slug } = await params;
    const { organizationId } = await requireOrganizationUsersAdminBySlug(slug);
    const filters = parseAuditFilters(new URL(request.url).searchParams);
    const { prisma } = await import("@/lib/prisma");
    const rows = await createPrismaAuditLogRepository(prisma).listOrganizationAuditLogs({
      organizationId,
      filters,
    });

    return new Response(formatAuditCsv(rows), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="learnhub-org-audit.csv"',
      },
    });
  } catch (error) {
    if (isLoginRedirect(error)) {
      return Response.json({ error: "Authentication required" }, { status: 401 });
    }

    if (isRedirect(error)) {
      return Response.json({ error: "Not allowed to export audit logs" }, { status: 403 });
    }

    return Response.json({ error: "Unable to export audit logs" }, { status: 500 });
  }
}

function isRedirect(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    typeof error.digest === "string" &&
    error.digest.startsWith("NEXT_REDIRECT")
  );
}

function isLoginRedirect(error: unknown): boolean {
  return isRedirect(error) && (error as { digest: string }).digest.includes("/login");
}
```

- [ ] **Step 7: Implement platform audit CSV route**

Create `src/app/api/platform/audit.csv/route.ts`:

```ts
import { requirePlatformOwner } from "@/lib/auth/guards";
import { formatAuditCsv, parseAuditFilters } from "@/modules/audit/audit-read-models";
import { createPrismaAuditLogRepository } from "@/modules/audit/prisma-repository";

export async function GET(request: Request): Promise<Response> {
  try {
    await requirePlatformOwner();
    const filters = parseAuditFilters(new URL(request.url).searchParams);
    const { prisma } = await import("@/lib/prisma");
    const rows = await createPrismaAuditLogRepository(prisma).listPlatformAuditLogs({ filters });

    return new Response(formatAuditCsv(rows), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="learnhub-platform-audit.csv"',
      },
    });
  } catch (error) {
    if (isLoginRedirect(error)) {
      return Response.json({ error: "Authentication required" }, { status: 401 });
    }

    if (isRedirect(error)) {
      return Response.json({ error: "Not allowed to export platform audit logs" }, { status: 403 });
    }

    return Response.json({ error: "Unable to export platform audit logs" }, { status: 500 });
  }
}

function isRedirect(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    typeof error.digest === "string" &&
    error.digest.startsWith("NEXT_REDIRECT")
  );
}

function isLoginRedirect(error: unknown): boolean {
  return isRedirect(error) && (error as { digest: string }).digest.includes("/login");
}
```

- [ ] **Step 8: Run focused audit verification**

Run:

```powershell
npm run test -- src/modules/audit/audit-read-models.test.ts src/modules/audit/prisma-repository.test.ts src/modules/audit/audit-pages.test.ts
npx tsc --noEmit --incremental false
```

Expected: tests pass and TypeScript compiles the new pages/routes.

- [ ] **Step 9: Commit checkpoint**

Run:

```powershell
git add src/modules/audit src/app/org/[slug]/admin/audit/page.tsx src/app/platform/audit/page.tsx src/app/api/org/[slug]/audit.csv/route.ts src/app/api/platform/audit.csv/route.ts
git commit -m "feat: add audit browsing and exports"
```

## Task 5: Operations Pages

**Files:**
- Create: `src/app/org/[slug]/admin/operations/page.tsx`
- Create: `src/app/platform/operations/page.tsx`
- Create: `src/modules/operations/operations-pages.test.ts`
- Use `src/modules/operations/provider-failures.ts` from Task 3.

- [ ] **Step 1: Write failing operations page tests**

Create `src/modules/operations/operations-pages.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("operations pages", () => {
  it("organization operations page uses tenant guard and hides organization filter", () => {
    const source = readFileSync("src/app/org/[slug]/admin/operations/page.tsx", "utf8");

    expect(source).toContain("requireOrganizationUsersAdminBySlug");
    expect(source).toContain("scope: { kind: \"organization\", organizationId }");
    expect(source).toContain("ProviderFailureTable");
    expect(source).toContain("No provider failures match these filters.");
    expect(source).toContain("includeOrganization={false}");
  });

  it("platform operations page uses platform guard and includes organization filter", () => {
    const source = readFileSync("src/app/platform/operations/page.tsx", "utf8");

    expect(source).toContain("requirePlatformOwner");
    expect(source).toContain("scope: { kind: \"platform\" }");
    expect(source).toContain("ProviderFailureTable");
    expect(source).toContain("includeOrganization");
    expect(source).toContain("Organization");
  });
});
```

Run:

```powershell
npm run test -- src/modules/operations/operations-pages.test.ts
```

Expected: fail because operations pages do not exist.

- [ ] **Step 2: Extend provider failure tests for platform organization filtering**

Append this test to `src/modules/operations/provider-failures.test.ts`:

```ts
it("applies organization search only for platform operations scope", async () => {
  const client = createProviderFailureClient();

  await listProviderFailureRows(client as unknown as Parameters<typeof listProviderFailureRows>[0], {
    scope: { kind: "platform" },
    now,
    filters: { organization: "acme" },
  });

  expect(client.notificationJob.findMany).toHaveBeenCalledWith(
    expect.objectContaining({
      where: expect.objectContaining({
        AND: [
          {
            OR: [
              { organizationId: "acme" },
              { organization: { slug: { contains: "acme", mode: "insensitive" } } },
              { organization: { name: { contains: "acme", mode: "insensitive" } } },
            ],
          },
          {
            OR: [
              { status: "PENDING", lastError: { not: null } },
              { status: "FAILED", lastError: { not: null } },
              { status: "PROCESSING", leaseExpiresAt: { lt: now } },
            ],
          },
        ],
      }),
    }),
  );
});
```

- [ ] **Step 3: Run the focused operations tests**

Run:

```powershell
npm run test -- src/modules/operations/provider-failures.test.ts
```

Expected: provider failure read-model tests pass after Task 3. `operations-pages.test.ts` from Step 1 remains failing until the operations page files are created.

- [ ] **Step 4: Implement organization operations page**

Create `src/app/org/[slug]/admin/operations/page.tsx`:

```tsx
import { requireOrganizationUsersAdminBySlug } from "@/lib/auth/guards";
import {
  listProviderFailureRows,
  type ProviderFailureFilters,
  type ProviderFailureRow,
  type ProviderFailureSource,
} from "@/modules/operations/provider-failures";

export const dynamic = "force-dynamic";

type OrganizationOperationsPageProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const sources: ProviderFailureSource[] = ["NOTIFICATION_JOB", "CREDENTIAL_ISSUANCE", "SCORM_EXTRACTION", "MUX_ASSET", "STORAGE"];

export default async function OrganizationOperationsPage({ params, searchParams }: OrganizationOperationsPageProps) {
  const { slug } = await params;
  const { organizationId } = await requireOrganizationUsersAdminBySlug(slug);
  const filters = parseProviderFailureFilters(await searchParams, false);
  const { prisma } = await import("@/lib/prisma");
  const rows = await listProviderFailureRows(prisma, {
    scope: { kind: "organization", organizationId },
    filters,
    now: new Date(),
  });

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-6 px-6 py-10">
      <header>
        <p className="text-sm font-medium uppercase tracking-wide text-slate-500">Organization operations</p>
        <h1 className="text-3xl font-semibold text-slate-950">{slug} provider failures</h1>
      </header>
      <ProviderFailureFilterForm filters={filters} includeOrganization={false} />
      <ProviderFailureTable rows={rows} includeOrganization={false} />
    </main>
  );
}

function parseProviderFailureFilters(
  searchParams: Record<string, string | string[] | undefined>,
  includeOrganization: boolean,
): ProviderFailureFilters {
  const source = one(searchParams.source);
  const retryEligible = one(searchParams.retryEligible);
  return {
    ...(sources.includes(source as ProviderFailureSource) ? { source: source as ProviderFailureSource } : {}),
    ...(includeOrganization && one(searchParams.organization) ? { organization: one(searchParams.organization) } : {}),
    ...(retryEligible === "true" ? { retryEligible: true } : retryEligible === "false" ? { retryEligible: false } : {}),
  };
}

function ProviderFailureFilterForm({ filters, includeOrganization }: { filters: ProviderFailureFilters; includeOrganization: boolean }) {
  return (
    <form className="grid gap-3 rounded-md border border-slate-200 p-4 md:grid-cols-4" method="get">
      <label className="text-sm text-slate-700">
        Source
        <select className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" name="source" defaultValue={filters.source ?? ""}>
          <option value="">All sources</option>
          {sources.map((source) => (
            <option key={source} value={source}>
              {source}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm text-slate-700">
        Retry eligibility
        <select className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" name="retryEligible" defaultValue={String(filters.retryEligible ?? "")}>
          <option value="">All rows</option>
          <option value="true">Retry eligible</option>
          <option value="false">Needs review</option>
        </select>
      </label>
      {includeOrganization ? (
        <label className="text-sm text-slate-700">
          Organization
          <input className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" name="organization" defaultValue={filters.organization ?? ""} />
        </label>
      ) : null}
      <div className="flex items-end">
        <button className="rounded-md bg-slate-950 px-4 py-2 text-sm font-medium text-white" type="submit">
          Filter
        </button>
      </div>
    </form>
  );
}

function ProviderFailureTable({ rows, includeOrganization }: { rows: ProviderFailureRow[]; includeOrganization: boolean }) {
  return (
    <section className="overflow-hidden rounded-md border border-slate-200">
      <table className="w-full border-collapse text-left text-sm">
        <thead className="bg-slate-50 text-slate-600">
          <tr>
            <th className="px-4 py-3 font-medium">Occurred</th>
            {includeOrganization ? <th className="px-4 py-3 font-medium">Organization</th> : null}
            <th className="px-4 py-3 font-medium">Source</th>
            <th className="px-4 py-3 font-medium">Target</th>
            <th className="px-4 py-3 font-medium">Retry</th>
            <th className="px-4 py-3 font-medium">Last error</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200">
          {rows.length === 0 ? (
            <tr>
              <td className="px-4 py-6 text-slate-500" colSpan={includeOrganization ? 6 : 5}>
                No provider failures match these filters.
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={row.id}>
                <td className="px-4 py-3 text-slate-700">{row.occurredAt.toLocaleString()}</td>
                {includeOrganization ? <td className="px-4 py-3 text-slate-700">{row.organizationName}</td> : null}
                <td className="px-4 py-3 text-slate-700">
                  <div className="font-medium text-slate-950">{row.source}</div>
                  <div className="text-slate-500">{row.provider} - {row.operation}</div>
                </td>
                <td className="px-4 py-3 text-slate-700">
                  <div>{row.targetType}</div>
                  <div className="text-slate-500">{row.targetId}</div>
                </td>
                <td className="px-4 py-3 text-slate-700">
                  <div className={row.retryEligible ? "font-medium text-emerald-700" : "font-medium text-amber-700"}>
                    {row.retryEligible ? "Eligible" : "Review"}
                  </div>
                  <div className="text-slate-500">{row.retryReason}</div>
                </td>
                <td className="max-w-md px-4 py-3 text-slate-700">
                  <code className="whitespace-pre-wrap break-words text-xs">{row.lastError}</code>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </section>
  );
}

function one(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}
```

- [ ] **Step 5: Implement platform operations page**

Create `src/app/platform/operations/page.tsx` with the same table and filter helpers as the org page, but require platform owner access and include the organization filter:

```tsx
import { requirePlatformOwner } from "@/lib/auth/guards";
import {
  listProviderFailureRows,
  type ProviderFailureFilters,
  type ProviderFailureRow,
  type ProviderFailureSource,
} from "@/modules/operations/provider-failures";

export const dynamic = "force-dynamic";

type PlatformOperationsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function PlatformOperationsPage({ searchParams }: PlatformOperationsPageProps) {
  await requirePlatformOwner();
  const filters = parseProviderFailureFilters(await searchParams, true);
  const { prisma } = await import("@/lib/prisma");
  const rows = await listProviderFailureRows(prisma, {
    scope: { kind: "platform" },
    filters,
    now: new Date(),
  });

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-6 px-6 py-10">
      <header>
        <p className="text-sm font-medium uppercase tracking-wide text-slate-500">Platform operations</p>
        <h1 className="text-3xl font-semibold text-slate-950">Cross-tenant provider failures</h1>
      </header>
      <ProviderFailureFilterForm filters={filters} includeOrganization />
      <ProviderFailureTable rows={rows} includeOrganization />
    </main>
  );
}
```

Copy `sources`, `parseProviderFailureFilters`, `ProviderFailureFilterForm`, `ProviderFailureTable`, and `one` from the org page into this file. Keep the duplicate component code local to the two requested pages for this slice.

- [ ] **Step 6: Run operations verification**

Run:

```powershell
npm run test -- src/modules/operations/provider-failures.test.ts src/modules/operations/operations-pages.test.ts
npx tsc --noEmit --incremental false
```

Expected: operations tests pass and TypeScript compiles both operations pages.

- [ ] **Step 7: Commit checkpoint**

Run:

```powershell
git add src/modules/operations/provider-failures.ts src/modules/operations/provider-failures.test.ts src/modules/operations/operations-pages.test.ts src/app/org/[slug]/admin/operations/page.tsx src/app/platform/operations/page.tsx
git commit -m "feat: add operations failure views"
```

## Task 6: Full Verification And Release Readiness

**Files:**
- Modify: none unless verification exposes a concrete defect in the files from Tasks 1 through 5.

- [ ] **Step 1: Run focused unit tests**

Run:

```powershell
npm run test -- src/modules/audit/audit-read-models.test.ts src/modules/audit/prisma-repository.test.ts src/modules/audit/audit-pages.test.ts src/modules/operations/provider-failures.test.ts src/modules/operations/operations-pages.test.ts
```

Expected: all focused tests pass.

- [ ] **Step 2: Run Prisma validation and TypeScript generation in order**

Run:

```powershell
npx prisma validate
npx prisma generate
npx tsc --noEmit --incremental false
```

Expected: Prisma schema validates, Prisma Client generation succeeds, and TypeScript reports no errors.

- [ ] **Step 3: Run umbrella gates**

Run:

```powershell
npm run test
npm run lint
npm run build
```

Expected: Vitest, ESLint, and Next build all exit `0`.

- [ ] **Step 4: Run local content scans for this plan and implementation**

Run from the repository root after implementing the code:

```powershell
$plan = 'docs\superpowers\plans\2026-06-13-audit-operations-observability-implementation.md'
$requiredTerms = @(
  'Organization admins can browse audit logs only for their organization',
  'Platform owners can browse audit logs across organizations',
  'actor',
  'action',
  'targetType',
  'targetId',
  'date range',
  'organization',
  'CSV',
  'failed notification jobs',
  'failed credential issuance',
  'SCORM extraction failures',
  'Mux asset failures',
  'storage errors',
  'retry eligibility',
  'last error',
  'secrets',
  'JSON',
  'stable known fields'
)
$requiredTerms | ForEach-Object {
  if (-not (Select-String -Path $plan -Pattern ([regex]::Escape($_)) -Quiet)) {
    throw "Missing required coverage term: $_"
  }
}
$literalPaths = @(
  'src\app\org\[slug]\admin\audit\page.tsx',
  'src\app\platform\audit\page.tsx',
  'src\app\org\[slug]\admin\operations\page.tsx',
  'src\app\platform\operations\page.tsx',
  'src\app\api\org\[slug]\audit.csv\route.ts',
  'src\app\api\platform\audit.csv\route.ts'
)
$globPaths = @('src\modules\audit\*.ts', 'src\modules\operations\*.ts')
$sourceCoverageTerms = @(
  'listTenantAuditLogs',
  'listPlatformAuditLogs',
  'formatAuditCsv',
  'listProviderFailureRows',
  'NOTIFICATION_JOB',
  'CREDENTIAL_ISSUANCE',
  'SCORM_EXTRACTION',
  'MUX_ASSET',
  'STORAGE',
  'retryEligible',
  'redactProviderError'
)
$sourceCoverageTerms | ForEach-Object {
  if (-not (Select-String -LiteralPath $literalPaths -Pattern $_ -Quiet -ErrorAction SilentlyContinue) -and -not (Select-String -Path $globPaths -Pattern $_ -Quiet -ErrorAction SilentlyContinue)) {
    throw "Missing source coverage term: $_"
  }
}
$secretPattern = 'Bearer [A-Za-z0-9._~+/=-]{8,}|secret=[^&\s;]+|token=[^&\s;]+|apiKey=[^&\s;]+'
$secretMatches = @()
$secretMatches += Select-String -LiteralPath $literalPaths -Pattern $secretPattern -CaseSensitive -ErrorAction SilentlyContinue
$secretMatches += Select-String -Path $globPaths -Pattern $secretPattern -CaseSensitive -ErrorAction SilentlyContinue
$unexpectedSecretMatches = $secretMatches | Where-Object {
  $_.Path -notmatch '\.test\.ts$' -and $_.Line -notmatch '\[REDACTED\]'
}
if ($unexpectedSecretMatches.Count -gt 0) {
  $unexpectedSecretMatches | Format-Table Path,LineNumber,Line -AutoSize
  throw "Secret-like implementation output was not redacted"
}
```

Expected: required coverage scan exits `0`, and the final secret-leak scan throws on any implementation match that is not a redaction assertion in a test fixture.

- [ ] **Step 5: Manual route checks on a local server**

Start the app:

```powershell
npm run dev
```

Check these paths after signing in as the seeded tenant admin and as a platform owner:

```text
/org/acme/admin/audit
/api/org/acme/audit.csv
/org/acme/admin/operations
/platform/audit
/api/platform/audit.csv
/platform/operations
```

Expected:

- Organization admins can browse audit logs only for their organization.
- Platform owners can browse audit logs across organizations.
- Filters include actor, action, target type, target id, date range, and organization where platform access allows organization filtering.
- CSV exports use the same filters as the page.
- Operations views surface failed notification jobs, failed credential issuance, SCORM extraction failures, Mux asset failures, and storage errors.
- Provider failure rows include retry eligibility and last error without leaking secrets.
- Audit metadata uses JSON internally, but page output renders stable known fields first.

- [ ] **Step 6: Confirm scoped commits already exist**

Run:

```powershell
git status --short
git log --oneline -5
```

Expected: the scoped Task 1 through Task 5 commits already contain the audit read models, audit repository, provider failure read model, audit pages/routes, and operations pages. Do not create a duplicate final commit unless a verification fix was made in this task.

## Self-Review Checklist

- Organization admins can browse audit logs only for their organization: Task 1 org where builder, Task 2 repository test, Task 4 org page and CSV route.
- Platform owners can browse audit logs across organizations: Task 1 platform where builder, Task 2 platform repository test, Task 4 platform page and CSV route.
- Filters include actor, action, target type, target id, date range, and organization: Task 1 parser and query builder, Task 4 forms and CSV links.
- CSV exports use the same filters as the page: Task 1 `buildAuditExportQuery`, Task 4 page links and route parsing.
- Operations views surface failed notification jobs, failed credential issuance, SCORM extraction failures, Mux asset failures, and storage errors: Task 3 source loaders and Task 5 pages.
- Provider failure rows include retry eligibility and last error without leaking secrets: Task 3 row shape, redaction, retry tests, and Task 5 table.
- Audit metadata uses JSON but page output renders stable known fields first: Task 1 `renderAuditMetadata`, Task 4 table metadata rendering.
- Commercial multi-tenant LMS assumptions are preserved: organization routes use `requireOrganizationUsersAdminBySlug(slug)` and platform routes use `requirePlatformOwner()`.
