# Certificates Credentials Operations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver branded certificate rendering, stable certificate downloads, learner certificate wallet sharing, Credly credential issuing, and admin credential operations for a commercial multi-tenant LMS.

**Architecture:** Certificates remain tenant-scoped records created from completed assignments and store the issued-time learner, course, issuer, and brand snapshot used by public verification and downloads. Credential issuing is modeled as a separate idempotent operation keyed by certificate and provider so failed Credly attempts can be retried without creating duplicate certificates. Learner pages, admin pages, public pages, and provider adapters stay separate so public verification never exposes private membership or assignment ids.

**Tech Stack:** Next.js App Router, React Server Components, TypeScript, Prisma 7, PostgreSQL, Vitest with jsdom, native `fetch`, Task 4 notification jobs.

---

## Scope Boundary

This plan covers certificate display, certificate downloads, learner sharing, course-level Credly template mapping, Credly credential issuing, credential retry operations, and credential admin inspection. It does not add public self-signup, custom domains, billing, learner-purchased courses, or a general badge marketplace.

Task 4 notification work is a required dependency. This plan uses the concrete Task 4 contract:

- `NotificationJob` stores idempotent tenant-scoped jobs.
- `scheduleCertificateNotification` schedules `CERTIFICATE_CREATED`.
- `createPrismaNotificationJobRepository` returns the repository used by the scheduler.
- Certificate email is sent through notification job processing, not directly from the certificate service.

## File Structure

Required files:

- Modify `prisma/schema.prisma`: add certificate brand snapshot fields, course Credly template settings, credential operation fields, idempotency constraints, and relations.
- Create `prisma/migrations/20260613060000_certificate_credential_operations/migration.sql`: apply the data model changes with backfills for existing certificate and credential rows.
- Modify `src/modules/certificates/certificates.ts`: expand issued certificate snapshots, schedule certificate email through Task 4 notification jobs, and delegate Credly issuing to credential operations without duplicating certificates.
- Modify `src/modules/certificates/certificates.test.ts`: cover certificate snapshots, notification scheduling, existing-certificate recovery, and no duplicate certificate creation.
- Create `src/modules/certificates/certificate-renderer.tsx`: shared printable certificate component and deterministic download artifact renderer.
- Create `src/modules/certificates/certificate-renderer.test.tsx`: cover branded print markup and stable artifact output from stored certificate data.
- Create `src/modules/certificates/share-links.ts`: build LinkedIn, email, and plain copyable verification URL values.
- Create `src/modules/certificates/share-links.test.ts`: cover URL encoding, LinkedIn fields, mailto body, and no private ids in share links.
- Create `src/modules/providers/credentials/credly-provider.ts`: Credly adapter with typed config, request mapping, success parsing, and provider error normalization.
- Create `src/modules/providers/credentials/credly-provider.test.ts`: cover Credly request shape, provider credential id/url mapping, non-2xx failures, and network failures.
- Create `src/modules/credentials/credential-operations.ts`: service layer for initial issue, retry, admin status read models, course template settings, and idempotency.
- Create `src/modules/credentials/credential-operations.test.ts`: cover initial issue, retry after failure, succeeded no-op, tenant filters, and admin read models.
- Modify `src/app/certificates/[verificationCode]/page.tsx`: render the public branded verification page using stored public certificate fields only.
- Create `src/app/certificates/[verificationCode]/download/route.ts`: return a stable printable HTML artifact from stored certificate fields.
- Create `src/app/org/[slug]/certificates/page.tsx`: learner wallet filtered to the current learner membership.
- Create `src/app/org/[slug]/admin/certificates/page.tsx`: tenant admin certificate register and per-course Credly template mapping.
- Create `src/app/org/[slug]/admin/credentials/page.tsx`: tenant admin credential status inspection by learner, course, provider, and failure message.
- Create `src/app/org/[slug]/admin/credentials/actions.ts`: server actions for course Credly template mapping and retrying failed credential issuance.

Compile-critical supporting files:

- Modify `src/modules/certificates/prisma-repository.ts`: implement the expanded certificate repository contract used by `certificates.ts`.
- Modify `src/modules/providers/credentials/credential-provider.ts`: add optional `providerRequestId` and `verificationUrl` fields to the provider input type so Credly issuance can carry stable evidence.

## Data Model

Update `Course`:

```prisma
model Course {
  credentialProvider CredentialProviderName?
  credlyTemplateId   String?
  credentialIssuances CredentialIssuance[]

  @@index([organizationId, credentialProvider])
}
```

Update `Certificate`:

```prisma
model Certificate {
  issuerName         String
  issuerLogoUrl      String?
  issuerPrimaryColor String
  issuerAccentColor  String
  artifactVersion    Int                    @default(1)
  credentialIssuances CredentialIssuance[]

  @@unique([organizationId, id])
}
```

Update `CredentialIssuance`:

```prisma
model CredentialIssuance {
  id                   String                   @id @default(cuid())
  organizationId       String
  certificateId        String
  courseId             String
  membershipId         String
  learnerEmail         String
  learnerName          String
  provider             CredentialProviderName
  providerTemplateId   String?
  providerRequestId    String
  status               CredentialIssuanceStatus @default(PENDING)
  providerCredentialId String?
  providerUrl          String?
  errorMessage         String?
  attemptCount         Int                      @default(0)
  attemptedAt          DateTime                 @default(now())
  lastFailedAt         DateTime?
  succeededAt          DateTime?
  createdAt            DateTime                 @default(now())
  updatedAt            DateTime                 @updatedAt
  organization         Organization             @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  certificate          Certificate              @relation(fields: [organizationId, certificateId], references: [organizationId, id], onDelete: Cascade)
  course               Course                   @relation(fields: [organizationId, courseId], references: [organizationId, id], onDelete: Cascade)

  @@unique([organizationId, id])
  @@unique([organizationId, certificateId, provider])
  @@unique([provider, providerRequestId])
  @@index([organizationId, provider, status])
  @@index([organizationId, courseId, status])
  @@index([organizationId, learnerEmail])
  @@index([organizationId, membershipId])
}
```

Credential statuses remain the existing enum values:

```prisma
enum CredentialIssuanceStatus {
  PENDING
  SUCCEEDED
  FAILED
}
```

## Migration SQL

Create `prisma/migrations/20260613060000_certificate_credential_operations/migration.sql`:

```sql
ALTER TABLE "Course"
  ADD COLUMN "credentialProvider" "CredentialProviderName",
  ADD COLUMN "credlyTemplateId" TEXT;

ALTER TABLE "Certificate"
  ADD COLUMN "issuerName" TEXT,
  ADD COLUMN "issuerLogoUrl" TEXT,
  ADD COLUMN "issuerPrimaryColor" TEXT,
  ADD COLUMN "issuerAccentColor" TEXT,
  ADD COLUMN "artifactVersion" INTEGER NOT NULL DEFAULT 1;

UPDATE "Certificate" AS certificate
SET
  "issuerName" = organization."name",
  "issuerLogoUrl" = organization."logoUrl",
  "issuerPrimaryColor" = organization."primaryColor",
  "issuerAccentColor" = organization."accentColor"
FROM "Organization" AS organization
WHERE certificate."organizationId" = organization."id";

ALTER TABLE "Certificate"
  ALTER COLUMN "issuerName" SET NOT NULL,
  ALTER COLUMN "issuerPrimaryColor" SET NOT NULL,
  ALTER COLUMN "issuerAccentColor" SET NOT NULL;

CREATE UNIQUE INDEX "Certificate_organizationId_id_key" ON "Certificate"("organizationId", "id");
CREATE INDEX "Course_organizationId_credentialProvider_idx" ON "Course"("organizationId", "credentialProvider");

WITH ranked_issuances AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "organizationId", "certificateId", "provider"
      ORDER BY "attemptedAt" DESC, "id" DESC
    ) AS row_number
  FROM "CredentialIssuance"
)
DELETE FROM "CredentialIssuance"
USING ranked_issuances
WHERE "CredentialIssuance"."id" = ranked_issuances."id"
  AND ranked_issuances.row_number > 1;

ALTER TABLE "CredentialIssuance"
  ADD COLUMN "courseId" TEXT,
  ADD COLUMN "membershipId" TEXT,
  ADD COLUMN "learnerEmail" TEXT,
  ADD COLUMN "learnerName" TEXT,
  ADD COLUMN "providerTemplateId" TEXT,
  ADD COLUMN "providerRequestId" TEXT,
  ADD COLUMN "attemptCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "lastFailedAt" TIMESTAMP(3),
  ADD COLUMN "succeededAt" TIMESTAMP(3),
  ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "CredentialIssuance" AS issuance
SET
  "courseId" = certificate."courseId",
  "membershipId" = certificate."membershipId",
  "learnerEmail" = certificate."learnerEmail",
  "learnerName" = certificate."learnerName",
  "providerTemplateId" = course."credlyTemplateId",
  "providerRequestId" = CONCAT('learnhub:', issuance."organizationId", ':', issuance."certificateId", ':', issuance."provider"),
  "attemptCount" = CASE WHEN issuance."status" IN ('SUCCEEDED', 'FAILED') THEN 1 ELSE 0 END,
  "lastFailedAt" = CASE WHEN issuance."status" = 'FAILED' THEN issuance."attemptedAt" ELSE NULL END,
  "succeededAt" = CASE WHEN issuance."status" = 'SUCCEEDED' THEN issuance."attemptedAt" ELSE NULL END
FROM "Certificate" AS certificate
JOIN "Course" AS course
  ON course."organizationId" = certificate."organizationId"
 AND course."id" = certificate."courseId"
WHERE issuance."certificateId" = certificate."id";

ALTER TABLE "CredentialIssuance"
  ALTER COLUMN "courseId" SET NOT NULL,
  ALTER COLUMN "membershipId" SET NOT NULL,
  ALTER COLUMN "learnerEmail" SET NOT NULL,
  ALTER COLUMN "learnerName" SET NOT NULL,
  ALTER COLUMN "providerRequestId" SET NOT NULL;

-- Keep providerTemplateId nullable for migrated historical rows. New issuance
-- creation still requires providerTemplateId at the service boundary.

CREATE UNIQUE INDEX "CredentialIssuance_organizationId_certificateId_provider_key"
  ON "CredentialIssuance"("organizationId", "certificateId", "provider");
CREATE UNIQUE INDEX "CredentialIssuance_organizationId_id_key"
  ON "CredentialIssuance"("organizationId", "id");
CREATE UNIQUE INDEX "CredentialIssuance_provider_providerRequestId_key"
  ON "CredentialIssuance"("provider", "providerRequestId");
CREATE INDEX "CredentialIssuance_organizationId_provider_status_idx"
  ON "CredentialIssuance"("organizationId", "provider", "status");
CREATE INDEX "CredentialIssuance_organizationId_courseId_status_idx"
  ON "CredentialIssuance"("organizationId", "courseId", "status");
CREATE INDEX "CredentialIssuance_organizationId_learnerEmail_idx"
  ON "CredentialIssuance"("organizationId", "learnerEmail");
CREATE INDEX "CredentialIssuance_organizationId_membershipId_idx"
  ON "CredentialIssuance"("organizationId", "membershipId");

ALTER TABLE "CredentialIssuance" DROP CONSTRAINT "CredentialIssuance_certificateId_fkey";

ALTER TABLE "CredentialIssuance"
  ADD CONSTRAINT "CredentialIssuance_organizationId_certificateId_fkey"
  FOREIGN KEY ("organizationId", "certificateId")
  REFERENCES "Certificate"("organizationId", "id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CredentialIssuance"
  ADD CONSTRAINT "CredentialIssuance_organizationId_courseId_fkey"
  FOREIGN KEY ("organizationId", "courseId")
  REFERENCES "Course"("organizationId", "id")
  ON DELETE CASCADE ON UPDATE CASCADE;
```

## Route Contracts

- `GET /certificates/[verificationCode]`: public verification page. Returns `404` for unknown codes. Selects only learner name, course title, issued date, issuer name/logo/colors, verification code/url, artifact version, and provider URL/status. Does not select or render assignment id, membership id, user id, organization id, or course id.
- `GET /certificates/[verificationCode]/download`: public artifact download. Returns `200` with `Content-Type: text/html; charset=utf-8`, `Content-Disposition: attachment; filename="certificate-${verificationCode}.html"`, and deterministic HTML from stored certificate data. Returns `404` for unknown codes.
- `GET /org/[slug]/certificates`: authenticated learner wallet. Requires active membership in that tenant and filters by the current learner membership id and current user id.
- `GET /org/[slug]/admin/certificates`: tenant admin page. Requires organization admin or platform owner and filters all records by `organizationId`.
- `GET /org/[slug]/admin/credentials`: tenant admin credential operations page. Requires organization admin or platform owner and filters all records by `organizationId`.
- `POST` server actions in `src/app/org/[slug]/admin/credentials/actions.ts`: update course Credly template and retry failed credential issuance. Both actions resolve `organizationId` from `slug` and never trust an organization id from form input.

## Tenant Safety Rules

- Every Prisma query on an authenticated tenant route includes the resolved `organizationId`.
- Learner wallet queries include both `membershipId` and `userId` from the authenticated context.
- Admin credential status reads include `organizationId` and expose learner email/name, course title, provider, status, provider URL, attempt count, attempted date, and failure message.
- Public verification and download are lookup-by-verification-code only and return public certificate fields.
- Server actions accept `courseId`, `certificateId`, or `credentialIssuanceId` from forms, then re-query those ids inside the resolved tenant before mutating.
- Provider secrets are never passed to React components or rendered in pages.

## Idempotency Rules

- Certificate creation stays unique by `@@unique([organizationId, assignmentId])`.
- Existing certificates are reused and never recreated during credential retry.
- `CredentialIssuance` is unique by `[organizationId, certificateId, provider]`.
- `providerRequestId` is stable: `learnhub:${organizationId}:${certificateId}:CREDLY`.
- Credly requests include the stable `providerRequestId` as the issuer earner id and include the public verification URL as evidence.
- Retrying a failed credential updates the existing `CredentialIssuance` row, increments `attemptCount`, and keeps the same `providerRequestId`.
- Retrying a succeeded credential returns the existing succeeded result and does not call Credly.
- Failed provider calls store sanitized error text and no raw authorization headers or tokens.
- Certificate email uses Task 4 `scheduleCertificateNotification`; it is idempotent through the Task 4 `NotificationJob` key and not sent directly.

## UI Expectations

- The public certificate page presents the issuer logo/name, learner name, course title, issued date, verification code, verification URL, and optional Credly provider link in a print-friendly certificate layout.
- The certificate component includes `@media print` styles, avoids interactive-only controls inside the printable certificate body, and uses stored issuer colors.
- Learner wallet cards show course title, issuer, issued date, verification URL, download link, Credly status/provider URL, and share actions for LinkedIn, email, and copyable URL.
- Admin certificate page shows course settings with a Credly template id field per course and a certificate register for the tenant.
- Admin credential page shows status by learner, course, provider, failure message, provider URL, attempt count, and last attempted date. Retry is visible only for `FAILED` rows.

## Task 1: Add Certificate And Credential Data Model

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260613060000_certificate_credential_operations/migration.sql`

- [ ] **Step 1: Run the failing schema smoke**

Before changing the schema, run:

```powershell
npx prisma validate
@(
  'credlyTemplateId',
  'issuerName',
  'providerRequestId',
  'attemptCount'
) | ForEach-Object {
  if (-not (Select-String -Path prisma/schema.prisma -Pattern $_ -Quiet)) {
    throw "Missing certificate credential schema element: $_"
  }
}
```

Expected: `npx prisma validate` exits `0`, and the final assertion fails on the first missing schema element. This proves the current schema is valid but does not yet contain certificate credential operations fields.

- [ ] **Step 2: Write the schema change**

Add the `Course`, `Certificate`, and `CredentialIssuance` fields and constraints exactly as shown in the Data Model section. Preserve the existing `CredentialProviderName` and `CredentialIssuanceStatus` enum values.

- [ ] **Step 3: Create the SQL migration**

Create `prisma/migrations/20260613060000_certificate_credential_operations/migration.sql` with the SQL from the Migration SQL section.

- [ ] **Step 4: Verify Prisma generation**

Run:

```powershell
npx prisma validate
npm run prisma:generate
```

Expected: both commands exit `0` and Prisma Client exposes `course.credlyTemplateId`, `certificate.issuerName`, and the expanded `credentialIssuance` fields.

- [ ] **Step 5: Commit checkpoint**

```powershell
git add prisma/schema.prisma prisma/migrations/20260613060000_certificate_credential_operations/migration.sql
git commit -m "feat: add certificate credential operations schema"
```

Expected: commit succeeds.

## Task 2: Expand Certificate Service Contracts

**Files:**
- Modify: `src/modules/certificates/certificates.ts`
- Modify: `src/modules/certificates/certificates.test.ts`
- Modify: `src/modules/certificates/prisma-repository.ts`

- [ ] **Step 1: Write failing tests for stored certificate snapshots**

Add tests to `src/modules/certificates/certificates.test.ts`:

```ts
it("stores issuer branding snapshot from the completed assignment tenant", async () => {
  const repository = createRepository({
    assignment: completedAssignmentWithBranding,
  });

  await issueCertificateForCompletedAssignment(
    {
      organizationId: "org_1",
      assignmentId: "assignment_1",
      appBaseUrl: "https://learnhub.example",
      now: new Date("2026-06-13T12:00:00.000Z"),
    },
    repository,
  );

  expect(repository.createdCertificates[0]).toMatchObject({
    issuerName: "Acme Safety",
    issuerLogoUrl: "https://cdn.example/acme-logo.png",
    issuerPrimaryColor: "#14532d",
    issuerAccentColor: "#f59e0b",
    artifactVersion: 1,
  });
});
```

Run:

```powershell
npm run test -- src/modules/certificates/certificates.test.ts
```

Expected: fail because the certificate service does not yet accept or store issuer branding fields.

- [ ] **Step 2: Write failing tests for notification scheduling**

Add tests:

```ts
it("schedules the certificate email through Task 4 notification jobs after creating a certificate", async () => {
  const scheduleCertificateNotification = vi.fn().mockResolvedValue(undefined);
  const notificationRepository = { upsertJob: vi.fn() };
  const repository = createRepository({ assignment: completedAssignmentWithBranding });

  await issueCertificateForCompletedAssignment(
    {
      organizationId: "org_1",
      assignmentId: "assignment_1",
      appBaseUrl: "https://learnhub.example",
      now: new Date("2026-06-13T12:00:00.000Z"),
    },
    repository,
    {
      scheduleCertificateNotification,
      notificationRepository,
    },
  );

  expect(scheduleCertificateNotification).toHaveBeenCalledWith(
    expect.objectContaining({
      appBaseUrl: "https://learnhub.example",
      repository: notificationRepository,
      certificate: expect.objectContaining({
        certificateId: "certificate_1",
        verificationUrl: expect.stringContaining("/certificates/"),
      }),
    }),
  );
});

it("ensures certificate email job exists when returning an existing certificate", async () => {
  const scheduleCertificateNotification = vi.fn().mockResolvedValue(undefined);
  const existingCertificate = createExistingCertificateSnapshot();
  const repository = createRepository({
    assignment: completedAssignmentWithBranding,
    existingCertificate,
  });

  const certificate = await issueCertificateForCompletedAssignment(
    {
      organizationId: "org_1",
      assignmentId: "assignment_1",
      appBaseUrl: "https://learnhub.example",
      now: new Date("2026-06-13T12:00:00.000Z"),
    },
    repository,
    {
      scheduleCertificateNotification,
      notificationRepository: { upsertJob: vi.fn() },
    },
  );

  expect(certificate).toBe(existingCertificate);
  expect(repository.createdCertificates).toHaveLength(0);
  expect(scheduleCertificateNotification).toHaveBeenCalledTimes(1);
});
```

Run:

```powershell
npm run test -- src/modules/certificates/certificates.test.ts
```

Expected: fail because notification dependencies are not wired.

- [ ] **Step 3: Implement the certificate contract**

Update `CertificateAssignment`:

```ts
export type CertificateAssignment = {
  id: string;
  organizationId: string;
  courseId: string;
  membershipId: string;
  userId: string;
  learnerName: string;
  learnerEmail: string;
  courseTitle: string;
  status: "ASSIGNED" | "IN_PROGRESS" | "COMPLETED" | "OVERDUE";
  issuerName: string;
  issuerLogoUrl: string | null;
  issuerPrimaryColor: string;
  issuerAccentColor: string;
  credlyTemplateId: string | null;
};
```

Update `CreateCertificateInput` and `CertificateRecord` with:

```ts
issuerName: string;
issuerLogoUrl: string | null;
issuerPrimaryColor: string;
issuerAccentColor: string;
artifactVersion: 1;
```

Add dependency type:

```ts
export type CertificateSideEffects = {
  scheduleCertificateNotification(input: {
    certificate: {
      organizationId: string;
      assignmentId: string;
      certificateId: string;
      learnerName: string;
      learnerEmail: string;
      courseTitle: string;
      verificationUrl: string;
      issuedAt: Date;
    };
    appBaseUrl: string;
    now: Date;
    repository: unknown;
  }): Promise<void>;
  notificationRepository: unknown;
  issueCredentialForCertificate?(input: {
    organizationId: string;
    certificateId: string;
    now: Date;
  }): Promise<unknown>;
};
```

In `issueCertificateForCompletedAssignment`, create the certificate with stored brand fields, then call `scheduleCertificateNotification` for new and existing certificates. If `assignment.credlyTemplateId` is present and `issueCredentialForCertificate` is provided, call it after certificate persistence:

```ts
if (sideEffects?.issueCredentialForCertificate && assignment.credlyTemplateId) {
  await sideEffects.issueCredentialForCertificate({
    organizationId: assignment.organizationId,
    certificateId: certificate.id,
    now: input.now,
  });
}
```

Do not pass provider credentials through `certificates.ts`; credential operations own provider selection and retry state.

- [ ] **Step 4: Update the Prisma certificate repository**

In `src/modules/certificates/prisma-repository.ts`, include tenant branding and course template fields in `findAssignmentForCertificate`:

```ts
organization: {
  select: {
    name: true,
    logoUrl: true,
    primaryColor: true,
    accentColor: true,
  },
},
course: {
  select: {
    title: true,
    credlyTemplateId: true,
  },
},
```

Map them into `CertificateAssignment`, and ensure `createCertificate` selects the expanded `CertificateRecord` fields.

- [ ] **Step 5: Verify and commit checkpoint**

Run:

```powershell
npm run test -- src/modules/certificates/certificates.test.ts
npx tsc --noEmit --incremental false
```

Expected: focused tests and typecheck pass.

Commit:

```powershell
git add src/modules/certificates/certificates.ts src/modules/certificates/certificates.test.ts src/modules/certificates/prisma-repository.ts
git commit -m "feat: expand certificate issuing snapshots"
```

Expected: commit succeeds.

## Task 3: Add Certificate Renderer And Download Artifact

**Files:**
- Create: `src/modules/certificates/certificate-renderer.tsx`
- Create: `src/modules/certificates/certificate-renderer.test.tsx`
- Modify: `src/app/certificates/[verificationCode]/page.tsx`
- Create: `src/app/certificates/[verificationCode]/download/route.ts`

- [ ] **Step 1: Write failing renderer tests**

Create `src/modules/certificates/certificate-renderer.test.tsx`:

```tsx
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  CertificateDocument,
  renderCertificateArtifactHtml,
  type CertificateRenderData,
} from "./certificate-renderer";

const certificate: CertificateRenderData = {
  learnerName: "Asha Rao",
  courseTitle: "Safety Basics",
  issuerName: "Acme Safety",
  issuerLogoUrl: "https://cdn.example/acme-logo.png",
  issuerPrimaryColor: "#14532d",
  issuerAccentColor: "#f59e0b",
  issuedAt: new Date("2026-06-13T12:00:00.000Z"),
  verificationCode: "CERT123456789ABC",
  verificationUrl: "https://learnhub.example/certificates/CERT123456789ABC",
  providerUrl: "https://www.credly.com/badges/provider-1",
};

describe("CertificateDocument", () => {
  it("renders a branded certificate suitable for browser print", () => {
    const html = renderToStaticMarkup(<CertificateDocument certificate={certificate} />);

    expect(html).toContain("Acme Safety");
    expect(html).toContain("Asha Rao");
    expect(html).toContain("Safety Basics");
    expect(html).toContain("CERT123456789ABC");
    expect(html).toContain("#14532d");
    expect(html).toContain("@media print");
  });

  it("does not render private ids", () => {
    const html = renderToStaticMarkup(<CertificateDocument certificate={certificate} />);

    expect(html).not.toContain("assignment_");
    expect(html).not.toContain("membership_");
    expect(html).not.toContain("user_");
  });
});

describe("renderCertificateArtifactHtml", () => {
  it("returns stable artifact HTML from stored certificate data", () => {
    const first = renderCertificateArtifactHtml(certificate);
    const second = renderCertificateArtifactHtml(certificate);

    expect(first).toBe(second);
    expect(first).toContain("<!doctype html>");
    expect(first).toContain("certificate-artifact");
    expect(first).toContain("https://learnhub.example/certificates/CERT123456789ABC");
  });
});
```

Run:

```powershell
npm run test -- src/modules/certificates/certificate-renderer.test.tsx
```

Expected: fail because the renderer file does not exist.

- [ ] **Step 2: Implement renderer**

Create `src/modules/certificates/certificate-renderer.tsx`:

```tsx
import { renderToStaticMarkup } from "react-dom/server";

export type CertificateRenderData = {
  learnerName: string;
  courseTitle: string;
  issuerName: string;
  issuerLogoUrl: string | null;
  issuerPrimaryColor: string;
  issuerAccentColor: string;
  issuedAt: Date;
  verificationCode: string;
  verificationUrl: string;
  providerUrl?: string | null;
};

export function CertificateDocument({ certificate }: { certificate: CertificateRenderData }) {
  const issued = certificate.issuedAt.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });

  return (
    <article
      className="certificate-artifact"
      style={{
        "--issuer-primary": certificate.issuerPrimaryColor,
        "--issuer-accent": certificate.issuerAccentColor,
      } as React.CSSProperties}
    >
      <style>{certificatePrintStyles}</style>
      <header className="certificate-header">
        {certificate.issuerLogoUrl ? <img alt="" src={certificate.issuerLogoUrl} className="certificate-logo" /> : null}
        <p className="issuer-name">{certificate.issuerName}</p>
      </header>
      <section className="certificate-body">
        <p className="certificate-kicker">Certificate of Completion</p>
        <h1>{certificate.learnerName}</h1>
        <p className="certificate-copy">has successfully completed</p>
        <h2>{certificate.courseTitle}</h2>
        <p className="certificate-copy">Issued {issued}</p>
      </section>
      <footer className="certificate-footer">
        <div>
          <span>Verification code</span>
          <strong>{certificate.verificationCode}</strong>
        </div>
        <a href={certificate.verificationUrl}>{certificate.verificationUrl}</a>
        {certificate.providerUrl ? <a href={certificate.providerUrl}>View credential</a> : null}
      </footer>
    </article>
  );
}

export function renderCertificateArtifactHtml(certificate: CertificateRenderData): string {
  const body = renderToStaticMarkup(<CertificateDocument certificate={certificate} />);

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(
    certificate.courseTitle,
  )} certificate</title></head><body>${body}</body></html>`;
}

const certificatePrintStyles = `
.certificate-artifact{color:#0f172a;border:6px solid var(--issuer-primary);padding:48px;max-width:960px;margin:0 auto;font-family:Arial,sans-serif}
.certificate-header{display:flex;align-items:center;justify-content:space-between;gap:24px;border-bottom:2px solid var(--issuer-accent);padding-bottom:20px}
.certificate-logo{max-height:64px;max-width:220px;object-fit:contain}
.issuer-name{font-size:18px;font-weight:700;color:var(--issuer-primary)}
.certificate-body{text-align:center;padding:56px 24px}
.certificate-kicker{text-transform:uppercase;font-size:13px;font-weight:700;letter-spacing:.08em;color:var(--issuer-primary)}
.certificate-body h1{font-size:52px;line-height:1.05;margin:18px 0;color:#020617}
.certificate-body h2{font-size:30px;line-height:1.2;margin:16px 0;color:var(--issuer-primary)}
.certificate-copy{font-size:18px;color:#475569}
.certificate-footer{display:grid;gap:8px;border-top:2px solid var(--issuer-accent);padding-top:20px;font-size:14px;color:#334155}
.certificate-footer span{display:block;color:#64748b}
.certificate-footer strong{font-size:18px;color:#020617}
.certificate-footer a{color:var(--issuer-primary);word-break:break-all}
@media print{body{margin:0}.certificate-artifact{border-width:4px;box-shadow:none;page-break-inside:avoid}.certificate-body h1{font-size:44px}}
`;

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const replacements: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };

    return replacements[character];
  });
}
```

- [ ] **Step 3: Update public verification page**

In `src/app/certificates/[verificationCode]/page.tsx`, select only public stored fields:

```ts
select: {
  learnerName: true,
  courseTitle: true,
  issuerName: true,
  issuerLogoUrl: true,
  issuerPrimaryColor: true,
  issuerAccentColor: true,
  verificationCode: true,
  verificationUrl: true,
  issuedAt: true,
  credentialIssuances: {
    where: { status: "SUCCEEDED" },
    orderBy: { succeededAt: "desc" },
    take: 1,
    select: { providerUrl: true },
  },
}
```

Render `CertificateDocument` and add links to download and verify provider credential. Do not select or render `assignmentId`, `membershipId`, `userId`, `organizationId`, or `courseId`.

- [ ] **Step 4: Add download route**

Create `src/app/certificates/[verificationCode]/download/route.ts`:

```ts
import { notFound } from "next/navigation";

import { renderCertificateArtifactHtml } from "@/modules/certificates/certificate-renderer";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ verificationCode: string }> }) {
  const { verificationCode } = await params;
  const { prisma } = await import("@/lib/prisma");
  const certificate = await prisma.certificate.findUnique({
    where: { verificationCode },
    select: {
      learnerName: true,
      courseTitle: true,
      issuerName: true,
      issuerLogoUrl: true,
      issuerPrimaryColor: true,
      issuerAccentColor: true,
      issuedAt: true,
      verificationCode: true,
      verificationUrl: true,
      credentialIssuances: {
        where: { status: "SUCCEEDED" },
        orderBy: { succeededAt: "desc" },
        take: 1,
        select: { providerUrl: true },
      },
    },
  });

  if (!certificate) {
    notFound();
  }

  const artifact = renderCertificateArtifactHtml({
    ...certificate,
    providerUrl: certificate.credentialIssuances[0]?.providerUrl ?? null,
  });

  return new Response(artifact, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Disposition": `attachment; filename="certificate-${certificate.verificationCode}.html"`,
      "Cache-Control": "private, no-store",
    },
  });
}
```

- [ ] **Step 5: Verify and commit checkpoint**

Run:

```powershell
npm run test -- src/modules/certificates/certificate-renderer.test.tsx
npx tsc --noEmit --incremental false
npm run build
```

Expected: renderer tests, typecheck, and build pass.

Commit:

```powershell
git add src/modules/certificates/certificate-renderer.tsx src/modules/certificates/certificate-renderer.test.tsx src/app/certificates/[verificationCode]/page.tsx src/app/certificates/[verificationCode]/download/route.ts
git commit -m "feat: render downloadable certificates"
```

Expected: commit succeeds.

## Task 4: Add Certificate Share Links

**Files:**
- Create: `src/modules/certificates/share-links.ts`
- Create: `src/modules/certificates/share-links.test.ts`

- [ ] **Step 1: Write failing share-link tests**

Create `src/modules/certificates/share-links.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { buildCertificateShareLinks } from "./share-links";

describe("buildCertificateShareLinks", () => {
  it("builds LinkedIn, email, and plain copyable verification URL links", () => {
    const links = buildCertificateShareLinks({
      learnerName: "Asha Rao",
      courseTitle: "Safety Basics",
      issuerName: "Acme Safety",
      issuedAt: new Date("2026-06-13T12:00:00.000Z"),
      verificationCode: "CERT123456789ABC",
      verificationUrl: "https://learnhub.example/certificates/CERT123456789ABC",
    });

    expect(links.copyUrl).toBe("https://learnhub.example/certificates/CERT123456789ABC");
    expect(links.linkedInUrl).toContain("https://www.linkedin.com/profile/add");
    expect(links.linkedInUrl).toContain("name=Safety%20Basics");
    expect(links.linkedInUrl).toContain("organizationName=Acme%20Safety");
    expect(links.linkedInUrl).toContain("certUrl=https%3A%2F%2Flearnhub.example%2Fcertificates%2FCERT123456789ABC");
    expect(links.emailUrl).toContain("mailto:");
    expect(links.emailUrl).toContain("Safety%20Basics");
  });

  it("does not include private ids in share links", () => {
    const links = buildCertificateShareLinks({
      learnerName: "Asha Rao",
      courseTitle: "Safety Basics",
      issuerName: "Acme Safety",
      issuedAt: new Date("2026-06-13T12:00:00.000Z"),
      verificationCode: "CERT123456789ABC",
      verificationUrl: "https://learnhub.example/certificates/CERT123456789ABC",
    });

    expect(JSON.stringify(links)).not.toContain("assignment_");
    expect(JSON.stringify(links)).not.toContain("membership_");
  });
});
```

Run:

```powershell
npm run test -- src/modules/certificates/share-links.test.ts
```

Expected: fail because the module does not exist.

- [ ] **Step 2: Implement share links**

Create `src/modules/certificates/share-links.ts`:

```ts
export type CertificateShareInput = {
  learnerName: string;
  courseTitle: string;
  issuerName: string;
  issuedAt: Date;
  verificationCode: string;
  verificationUrl: string;
};

export type CertificateShareLinks = {
  linkedInUrl: string;
  emailUrl: string;
  copyUrl: string;
};

export function buildCertificateShareLinks(input: CertificateShareInput): CertificateShareLinks {
  const issueYear = String(input.issuedAt.getUTCFullYear());
  const issueMonth = String(input.issuedAt.getUTCMonth() + 1);
  const linkedIn = new URL("https://www.linkedin.com/profile/add");
  linkedIn.searchParams.set("startTask", "CERTIFICATION_NAME");
  linkedIn.searchParams.set("name", input.courseTitle);
  linkedIn.searchParams.set("organizationName", input.issuerName);
  linkedIn.searchParams.set("issueYear", issueYear);
  linkedIn.searchParams.set("issueMonth", issueMonth);
  linkedIn.searchParams.set("certUrl", input.verificationUrl);
  linkedIn.searchParams.set("certId", input.verificationCode);

  const email = new URL("mailto:");
  email.searchParams.set("subject", `${input.learnerName} completed ${input.courseTitle}`);
  email.searchParams.set(
    "body",
    `${input.learnerName} earned a certificate for ${input.courseTitle} from ${input.issuerName}. Verify it here: ${input.verificationUrl}`,
  );

  return {
    linkedInUrl: linkedIn.toString(),
    emailUrl: email.toString(),
    copyUrl: input.verificationUrl,
  };
}
```

- [ ] **Step 3: Verify and commit checkpoint**

Run:

```powershell
npm run test -- src/modules/certificates/share-links.test.ts
```

Expected: tests pass.

Commit:

```powershell
git add src/modules/certificates/share-links.ts src/modules/certificates/share-links.test.ts
git commit -m "feat: add certificate share links"
```

Expected: commit succeeds.

## Task 5: Add Credly Provider Adapter

**Files:**
- Modify: `src/modules/providers/credentials/credential-provider.ts`
- Create: `src/modules/providers/credentials/credly-provider.ts`
- Create: `src/modules/providers/credentials/credly-provider.test.ts`

- [ ] **Step 1: Write failing Credly provider tests**

Create `src/modules/providers/credentials/credly-provider.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

import { createCredlyProvider, CredlyProviderError } from "./credly-provider";

describe("createCredlyProvider", () => {
  it("posts a credential issue request with template id, learner, evidence URL, and provider request id", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          data: {
            id: "credly_badge_1",
            url: "https://www.credly.com/badges/credly_badge_1",
          },
        }),
        { status: 201, headers: { "Content-Type": "application/json" } },
      ),
    );
    const provider = createCredlyProvider({
      baseUrl: "https://api.credly.example",
      organizationId: "credly_org_1",
      authToken: "secret-token",
      fetch: fetchMock,
    });

    const result = await provider.issueCredential({
      organizationId: "org_1",
      courseId: "course_1",
      learnerEmail: "asha@example.com",
      learnerName: "Asha Rao",
      issuedAt: new Date("2026-06-13T12:00:00.000Z"),
      providerTemplateId: "template_123",
      providerRequestId: "learnhub:org_1:certificate_1:CREDLY",
      verificationUrl: "https://learnhub.example/certificates/CERT123456789ABC",
    });

    expect(result).toEqual({
      providerCredentialId: "credly_badge_1",
      providerUrl: "https://www.credly.com/badges/credly_badge_1",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.credly.example/organizations/credly_org_1/badges",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer secret-token",
          "Content-Type": "application/json",
        }),
      }),
    );
    expect(JSON.parse(String(fetchMock.mock.calls[0][1].body))).toMatchObject({
      badge_template_id: "template_123",
      recipient_email: "asha@example.com",
      issued_at: "2026-06-13",
      issuer_earner_id: "learnhub:org_1:certificate_1:CREDLY",
      evidence: [{ type: "url", url: "https://learnhub.example/certificates/CERT123456789ABC" }],
    });
  });

  it("throws a sanitized provider error for non-2xx responses", async () => {
    const provider = createCredlyProvider({
      baseUrl: "https://api.credly.example",
      organizationId: "credly_org_1",
      authToken: "secret-token",
      fetch: vi.fn(async () => new Response(JSON.stringify({ message: "Template is not published" }), { status: 422 })),
    });

    await expect(
      provider.issueCredential({
        organizationId: "org_1",
        courseId: "course_1",
        learnerEmail: "asha@example.com",
        learnerName: "Asha Rao",
        issuedAt: new Date("2026-06-13T12:00:00.000Z"),
        providerTemplateId: "template_123",
        providerRequestId: "learnhub:org_1:certificate_1:CREDLY",
        verificationUrl: "https://learnhub.example/certificates/CERT123456789ABC",
      }),
    ).rejects.toThrow(CredlyProviderError);
  });

  it("normalizes network failures into provider errors", async () => {
    const provider = createCredlyProvider({
      baseUrl: "https://api.credly.example",
      organizationId: "credly_org_1",
      authToken: "secret-token",
      fetch: vi.fn(async () => {
        throw new Error("connect ECONNRESET secret-token");
      }),
    });

    await expect(
      provider.issueCredential({
        organizationId: "org_1",
        courseId: "course_1",
        learnerEmail: "asha@example.com",
        learnerName: "Asha Rao",
        issuedAt: new Date("2026-06-13T12:00:00.000Z"),
        providerTemplateId: "template_123",
        providerRequestId: "learnhub:org_1:certificate_1:CREDLY",
        verificationUrl: "https://learnhub.example/certificates/CERT123456789ABC",
      }),
    ).rejects.toThrow(CredlyProviderError);
  });
});
```

Run:

```powershell
npm run test -- src/modules/providers/credentials/credly-provider.test.ts
```

Expected: fail because the module does not exist and provider input lacks fields.

- [ ] **Step 2: Extend provider input type**

Modify `src/modules/providers/credentials/credential-provider.ts`:

```ts
export type IssueCredentialInput = {
  organizationId: string;
  courseId: string;
  learnerEmail: string;
  learnerName: string;
  issuedAt: Date;
  providerTemplateId: string;
  providerRequestId?: string;
  verificationUrl?: string;
};
```

- [ ] **Step 3: Implement Credly provider**

Create `src/modules/providers/credentials/credly-provider.ts`:

```ts
import type { CredentialProvider, IssueCredentialInput, IssueCredentialResult } from "./credential-provider";

export type CredlyProviderConfig = {
  baseUrl: string;
  organizationId: string;
  authToken: string;
  fetch?: typeof fetch;
};

export class CredlyProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CredlyProviderError";
  }
}

export function createCredlyProvider(config: CredlyProviderConfig): CredentialProvider {
  const fetchImplementation = config.fetch ?? fetch;

  return {
    async issueCredential(input: IssueCredentialInput): Promise<IssueCredentialResult> {
      let response: Response;

      try {
        response = await fetchImplementation(
          `${config.baseUrl.replace(/\/+$/, "")}/organizations/${config.organizationId}/badges`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${config.authToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(toCredlyIssueRequest(input)),
          },
        );
      } catch (error) {
        throw new CredlyProviderError(sanitizeProviderMessage(error instanceof Error ? error.message : "Credly network request failed"));
      }

      const payload = await readJson(response);

      if (!response.ok) {
        throw new CredlyProviderError(readProviderMessage(payload, response.status));
      }

      const data = payload.data ?? payload;
      if (!data.id) {
        throw new CredlyProviderError("Credly response did not include a credential id");
      }

      return {
        providerCredentialId: String(data.id),
        providerUrl: data.url ? String(data.url) : undefined,
      };
    },
  };
}

function toCredlyIssueRequest(input: IssueCredentialInput) {
  const [firstName, ...lastNameParts] = input.learnerName.trim().split(/\s+/);

  return {
    badge_template_id: input.providerTemplateId,
    recipient_email: input.learnerEmail,
    issued_at: input.issuedAt.toISOString().slice(0, 10),
    first_name: firstName || input.learnerName,
    last_name: lastNameParts.join(" "),
    issuer_earner_id: input.providerRequestId,
    evidence: input.verificationUrl ? [{ type: "url", url: input.verificationUrl }] : [],
  };
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  try {
    return (await response.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function readProviderMessage(payload: Record<string, unknown>, status: number): string {
  const message = payload.message ?? payload.error ?? `Credly request failed with status ${status}`;

  return sanitizeProviderMessage(String(message));
}

function sanitizeProviderMessage(message: string): string {
  return message
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [REDACTED]")
    .replace(/(token|secret|apiKey|api_key)=?[A-Za-z0-9._~+/=-]+/gi, "$1=[REDACTED]")
    .slice(0, 500);
}
```

- [ ] **Step 4: Verify and commit checkpoint**

Run:

```powershell
npm run test -- src/modules/providers/credentials/credly-provider.test.ts
npx tsc --noEmit --incremental false
```

Expected: tests and typecheck pass.

Commit:

```powershell
git add src/modules/providers/credentials/credential-provider.ts src/modules/providers/credentials/credly-provider.ts src/modules/providers/credentials/credly-provider.test.ts
git commit -m "feat: add credly credential provider"
```

Expected: commit succeeds.

## Task 6: Add Credential Operations Service

**Files:**
- Create: `src/modules/credentials/credential-operations.ts`
- Create: `src/modules/credentials/credential-operations.test.ts`

- [ ] **Step 1: Write failing credential operation tests**

Create `src/modules/credentials/credential-operations.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

import {
  buildProviderRequestId,
  createPrismaCredentialOperationsRepository,
  issueCredentialForCertificate,
  retryFailedCredentialIssuance,
  updateCourseCredlyTemplate,
  type CredentialOperationsRepository,
} from "./credential-operations";

const certificate = {
  certificateId: "certificate_1",
  organizationId: "org_1",
  courseId: "course_1",
  membershipId: "membership_1",
  learnerEmail: "asha@example.com",
  learnerName: "Asha Rao",
  courseTitle: "Safety Basics",
  issuedAt: new Date("2026-06-13T12:00:00.000Z"),
  verificationUrl: "https://learnhub.example/certificates/CERT123456789ABC",
  credlyTemplateId: "template_123",
};

function createRepository(overrides: Partial<CredentialOperationsRepository> = {}): CredentialOperationsRepository & {
  saved: unknown[];
} {
  const saved: unknown[] = [];

  return {
    saved,
    async findCertificateForCredential() {
      return certificate;
    },
    async findIssuanceByCertificateProvider() {
      return null;
    },
    async findFailedIssuance() {
      return { id: "issuance_1", status: "FAILED", certificateId: "certificate_1", organizationId: "org_1" };
    },
    async upsertPendingIssuance(input) {
      saved.push(input);
      return { id: "issuance_1", attemptCount: 0 };
    },
    async markIssuanceSucceeded(input) {
      saved.push(input);
    },
    async markIssuanceFailed(input) {
      saved.push(input);
    },
    async updateCourseCredentialSettings(input) {
      saved.push(input);
    },
    async listCredentialStatuses() {
      return [];
    },
    ...overrides,
  };
}

describe("credential operations", () => {
  it("builds a stable provider request id", () => {
    expect(buildProviderRequestId("org_1", "certificate_1", "CREDLY")).toBe("learnhub:org_1:certificate_1:CREDLY");
  });

  it("issues a Credly credential and stores provider credential id and provider URL", async () => {
    const repository = createRepository();
    const provider = {
      issueCredential: vi.fn(async () => ({
        providerCredentialId: "credly_badge_1",
        providerUrl: "https://www.credly.com/badges/credly_badge_1",
      })),
    };

    await issueCredentialForCertificate(
      { organizationId: "org_1", certificateId: "certificate_1", now: new Date("2026-06-13T12:05:00.000Z") },
      repository,
      { CREDLY: provider },
    );

    expect(provider.issueCredential).toHaveBeenCalledWith(expect.objectContaining({
      providerTemplateId: "template_123",
      providerRequestId: "learnhub:org_1:certificate_1:CREDLY",
      verificationUrl: certificate.verificationUrl,
    }));
    expect(repository.saved).toContainEqual(expect.objectContaining({
      providerCredentialId: "credly_badge_1",
      providerUrl: "https://www.credly.com/badges/credly_badge_1",
    }));
  });

  it("does not call Credly again when issuance already succeeded", async () => {
    const provider = { issueCredential: vi.fn() };
    const repository = createRepository({
      async findIssuanceByCertificateProvider() {
        return { id: "issuance_1", status: "SUCCEEDED", providerCredentialId: "credly_badge_1", providerUrl: "https://credly.example/badge" };
      },
    });

    await issueCredentialForCertificate(
      { organizationId: "org_1", certificateId: "certificate_1", now: new Date("2026-06-13T12:05:00.000Z") },
      repository,
      { CREDLY: provider },
    );

    expect(provider.issueCredential).not.toHaveBeenCalled();
  });

  it("retries failed credential issuance without creating another certificate", async () => {
    const provider = {
      issueCredential: vi.fn(async () => ({
        providerCredentialId: "credly_badge_retry",
        providerUrl: "https://www.credly.com/badges/credly_badge_retry",
      })),
    };
    const repository = createRepository();

    await retryFailedCredentialIssuance(
      { organizationId: "org_1", credentialIssuanceId: "issuance_1", now: new Date("2026-06-13T13:00:00.000Z") },
      repository,
      { CREDLY: provider },
    );

    expect(provider.issueCredential).toHaveBeenCalledTimes(1);
    expect(repository.saved).not.toContainEqual(expect.objectContaining({ createCertificate: true }));
  });

  it("maps a course to a Credly template id", async () => {
    const repository = createRepository();

    await updateCourseCredlyTemplate(
      { organizationId: "org_1", courseId: "course_1", credlyTemplateId: " template_123 " },
      repository,
    );

    expect(repository.saved).toContainEqual({
      organizationId: "org_1",
      courseId: "course_1",
      credentialProvider: "CREDLY",
      credlyTemplateId: "template_123",
    });
  });

  it("uses organization-scoped Prisma where clauses for credential operations", async () => {
    const update = vi.fn().mockResolvedValue({});
    const findFirst = vi.fn().mockResolvedValue(null);
    const findMany = vi.fn().mockResolvedValue([]);
    const upsert = vi.fn().mockResolvedValue({ id: "issuance_1", attemptCount: 1 });
    const repository = createPrismaCredentialOperationsRepository({
      certificate: { findFirst },
      credentialIssuance: { findFirst, findMany, upsert, update },
      course: { update },
    } as never);

    await repository.findCertificateForCredential({ organizationId: "org_1", certificateId: "certificate_1" });
    await repository.findFailedIssuance({ organizationId: "org_1", credentialIssuanceId: "issuance_1" });
    await repository.updateCourseCredentialSettings({
      organizationId: "org_1",
      courseId: "course_1",
      credentialProvider: "CREDLY",
      credlyTemplateId: "template_123",
    });
    await repository.listCredentialStatuses({ organizationId: "org_1", provider: "CREDLY", status: "FAILED" });

    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ organizationId: "org_1" }),
    }));
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      where: { organizationId_id: { organizationId: "org_1", id: "course_1" } },
    }));
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ organizationId: "org_1", provider: "CREDLY", status: "FAILED" }),
    }));
  });
});
```

Run:

```powershell
npm run test -- src/modules/credentials/credential-operations.test.ts
```

Expected: fail because credential operations do not exist.

- [ ] **Step 2: Implement credential operations**

Create `src/modules/credentials/credential-operations.ts` with these exported types and functions:

```ts
import type { CredentialIssuanceStatus, CredentialProviderName } from "@prisma/client";

import type { CredentialProvider } from "../providers/credentials/credential-provider";

export type CredentialCertificateSnapshot = {
  certificateId: string;
  organizationId: string;
  courseId: string;
  membershipId: string;
  learnerEmail: string;
  learnerName: string;
  courseTitle: string;
  issuedAt: Date;
  verificationUrl: string;
  credlyTemplateId: string | null;
};

export type CredentialStatusRow = {
  id: string;
  certificateId: string;
  learnerName: string;
  learnerEmail: string;
  courseTitle: string;
  provider: CredentialProviderName;
  status: CredentialIssuanceStatus;
  providerUrl: string | null;
  errorMessage: string | null;
  attemptCount: number;
  attemptedAt: Date;
};

export type CredentialOperationsRepository = {
  findCertificateForCredential(input: { organizationId: string; certificateId: string }): Promise<CredentialCertificateSnapshot | null>;
  findIssuanceByCertificateProvider(input: {
    organizationId: string;
    certificateId: string;
    provider: CredentialProviderName;
  }): Promise<{ id: string; status: CredentialIssuanceStatus; providerCredentialId?: string | null; providerUrl?: string | null } | null>;
  findFailedIssuance(input: {
    organizationId: string;
    credentialIssuanceId: string;
  }): Promise<{ id: string; status: CredentialIssuanceStatus; certificateId: string; organizationId: string } | null>;
  upsertPendingIssuance(input: {
    organizationId: string;
    certificateId: string;
    courseId: string;
    membershipId: string;
    learnerEmail: string;
    learnerName: string;
    provider: CredentialProviderName;
    providerTemplateId: string;
    providerRequestId: string;
    attemptedAt: Date;
  }): Promise<{ id: string; attemptCount: number }>;
  markIssuanceSucceeded(input: {
    organizationId: string;
    credentialIssuanceId: string;
    providerCredentialId: string;
    providerUrl?: string;
    attemptedAt: Date;
  }): Promise<void>;
  markIssuanceFailed(input: {
    organizationId: string;
    credentialIssuanceId: string;
    errorMessage: string;
    attemptedAt: Date;
  }): Promise<void>;
  updateCourseCredentialSettings(input: {
    organizationId: string;
    courseId: string;
    credentialProvider: CredentialProviderName | null;
    credlyTemplateId: string | null;
  }): Promise<void>;
  listCredentialStatuses(input: {
    organizationId: string;
    provider?: CredentialProviderName;
    status?: CredentialIssuanceStatus;
    courseId?: string;
    learnerQuery?: string;
  }): Promise<CredentialStatusRow[]>;
};

export function buildProviderRequestId(
  organizationId: string,
  certificateId: string,
  provider: CredentialProviderName,
): string {
  return `learnhub:${organizationId}:${certificateId}:${provider}`;
}
```

Implement `issueCredentialForCertificate`:

```ts
export async function issueCredentialForCertificate(
  input: { organizationId: string; certificateId: string; now: Date },
  repository: CredentialOperationsRepository,
  providers: Record<CredentialProviderName, CredentialProvider>,
) {
  const certificate = await repository.findCertificateForCredential(input);
  if (!certificate) {
    throw new Error("Certificate was not found for this tenant");
  }

  if (!certificate.credlyTemplateId) {
    return { status: "SKIPPED" as const, reason: "NO_CREDLY_TEMPLATE" as const };
  }

  const existing = await repository.findIssuanceByCertificateProvider({
    organizationId: input.organizationId,
    certificateId: input.certificateId,
    provider: "CREDLY",
  });

  if (existing?.status === "SUCCEEDED") {
    return { status: "SUCCEEDED" as const, issuance: existing };
  }

  const providerRequestId = buildProviderRequestId(input.organizationId, input.certificateId, "CREDLY");
  const pending = await repository.upsertPendingIssuance({
    organizationId: input.organizationId,
    certificateId: input.certificateId,
    courseId: certificate.courseId,
    membershipId: certificate.membershipId,
    learnerEmail: certificate.learnerEmail,
    learnerName: certificate.learnerName,
    provider: "CREDLY",
    providerTemplateId: certificate.credlyTemplateId,
    providerRequestId,
    attemptedAt: input.now,
  });

  try {
    const result = await providers.CREDLY.issueCredential({
      organizationId: input.organizationId,
      courseId: certificate.courseId,
      learnerEmail: certificate.learnerEmail,
      learnerName: certificate.learnerName,
      issuedAt: certificate.issuedAt,
      providerTemplateId: certificate.credlyTemplateId,
      providerRequestId,
      verificationUrl: certificate.verificationUrl,
    });

    await repository.markIssuanceSucceeded({
      organizationId: input.organizationId,
      credentialIssuanceId: pending.id,
      providerCredentialId: result.providerCredentialId,
      providerUrl: result.providerUrl,
      attemptedAt: input.now,
    });

    return { status: "SUCCEEDED" as const, providerResult: result };
  } catch (error) {
    await repository.markIssuanceFailed({
      organizationId: input.organizationId,
      credentialIssuanceId: pending.id,
      errorMessage: sanitizeCredentialError(error),
      attemptedAt: input.now,
    });

    return { status: "FAILED" as const };
  }
}
```

Implement retry and settings:

```ts
export async function retryFailedCredentialIssuance(
  input: { organizationId: string; credentialIssuanceId: string; now: Date },
  repository: CredentialOperationsRepository,
  providers: Record<CredentialProviderName, CredentialProvider>,
) {
  const issuance = await repository.findFailedIssuance(input);

  if (!issuance) {
    throw new Error("Failed credential issuance was not found for this tenant");
  }

  if (issuance.status !== "FAILED") {
    return { status: issuance.status };
  }

  return issueCredentialForCertificate(
    { organizationId: input.organizationId, certificateId: issuance.certificateId, now: input.now },
    repository,
    providers,
  );
}

export async function updateCourseCredlyTemplate(
  input: { organizationId: string; courseId: string; credlyTemplateId: string },
  repository: CredentialOperationsRepository,
) {
  const credlyTemplateId = input.credlyTemplateId.trim();

  await repository.updateCourseCredentialSettings({
    organizationId: input.organizationId,
    courseId: input.courseId,
    credentialProvider: credlyTemplateId ? "CREDLY" : null,
    credlyTemplateId: credlyTemplateId || null,
  });
}

function sanitizeCredentialError(error: unknown): string {
  const message = error instanceof Error ? error.message : "Credential provider failed";

  return message.replace(/Bearer\s+[A-Za-z0-9._-]+/g, "Bearer [redacted]").slice(0, 500);
}

export function createPrismaCredentialOperationsRepository(client: {
  certificate: { findFirst(input: unknown): Promise<unknown> };
  credentialIssuance: {
    findFirst(input: unknown): Promise<unknown>;
    findMany(input: unknown): Promise<unknown[]>;
    upsert(input: unknown): Promise<{ id: string; attemptCount: number }>;
    update(input: unknown): Promise<unknown>;
  };
  course: { update(input: unknown): Promise<unknown> };
}): CredentialOperationsRepository {
  return {
    async findCertificateForCredential(input) {
      const certificate = await client.certificate.findFirst({
        where: { organizationId: input.organizationId, id: input.certificateId },
        select: {
          id: true,
          organizationId: true,
          courseId: true,
          membershipId: true,
          learnerEmail: true,
          learnerName: true,
          courseTitle: true,
          issuedAt: true,
          verificationUrl: true,
          course: { select: { credlyTemplateId: true } },
        },
      }) as {
        id: string;
        organizationId: string;
        courseId: string;
        membershipId: string;
        learnerEmail: string;
        learnerName: string;
        courseTitle: string;
        issuedAt: Date;
        verificationUrl: string;
        course: { credlyTemplateId: string | null };
      } | null;

      if (!certificate) {
        return null;
      }

      return {
        certificateId: certificate.id,
        organizationId: certificate.organizationId,
        courseId: certificate.courseId,
        membershipId: certificate.membershipId,
        learnerEmail: certificate.learnerEmail,
        learnerName: certificate.learnerName,
        courseTitle: certificate.courseTitle,
        issuedAt: certificate.issuedAt,
        verificationUrl: certificate.verificationUrl,
        credlyTemplateId: certificate.course.credlyTemplateId,
      };
    },
    async findIssuanceByCertificateProvider(input) {
      return client.credentialIssuance.findFirst({
        where: {
          organizationId: input.organizationId,
          certificateId: input.certificateId,
          provider: input.provider,
        },
        orderBy: { attemptedAt: "desc" },
      }) as Promise<{ id: string; status: CredentialIssuanceStatus; providerCredentialId?: string | null; providerUrl?: string | null } | null>;
    },
    async findFailedIssuance(input) {
      return client.credentialIssuance.findFirst({
        where: {
          organizationId: input.organizationId,
          id: input.credentialIssuanceId,
          status: "FAILED",
        },
        select: { id: true, status: true, certificateId: true, organizationId: true },
      }) as Promise<{ id: string; status: CredentialIssuanceStatus; certificateId: string; organizationId: string } | null>;
    },
    upsertPendingIssuance(input) {
      return client.credentialIssuance.upsert({
        where: {
          organizationId_certificateId_provider: {
            organizationId: input.organizationId,
            certificateId: input.certificateId,
            provider: input.provider,
          },
        },
        create: { ...input, status: "PENDING", attemptCount: 1, attemptedAt: input.attemptedAt },
        update: {
          status: "PENDING",
          providerTemplateId: input.providerTemplateId,
          providerRequestId: input.providerRequestId,
          errorMessage: null,
          attemptedAt: input.attemptedAt,
          attemptCount: { increment: 1 },
        },
        select: { id: true, attemptCount: true },
      });
    },
    async markIssuanceSucceeded(input) {
      await client.credentialIssuance.update({
        where: {
          organizationId_id: {
            organizationId: input.organizationId,
            id: input.credentialIssuanceId,
          },
        },
        data: {
          status: "SUCCEEDED",
          providerCredentialId: input.providerCredentialId,
          providerUrl: input.providerUrl ?? null,
          errorMessage: null,
          attemptedAt: input.attemptedAt,
          succeededAt: input.attemptedAt,
        },
      });
    },
    async markIssuanceFailed(input) {
      await client.credentialIssuance.update({
        where: {
          organizationId_id: {
            organizationId: input.organizationId,
            id: input.credentialIssuanceId,
          },
        },
        data: {
          status: "FAILED",
          errorMessage: input.errorMessage,
          attemptedAt: input.attemptedAt,
          lastFailedAt: input.attemptedAt,
        },
      });
    },
    async updateCourseCredentialSettings(input) {
      await client.course.update({
        where: {
          organizationId_id: {
            organizationId: input.organizationId,
            id: input.courseId,
          },
        },
        data: {
          credentialProvider: input.credentialProvider,
          credlyTemplateId: input.credlyTemplateId,
        },
      });
    },
    async listCredentialStatuses(input) {
      const rows = await client.credentialIssuance.findMany({
        where: {
          organizationId: input.organizationId,
          ...(input.provider ? { provider: input.provider } : {}),
          ...(input.status ? { status: input.status } : {}),
          ...(input.courseId ? { courseId: input.courseId } : {}),
          ...(input.learnerQuery
            ? {
                OR: [
                  { learnerEmail: { contains: input.learnerQuery, mode: "insensitive" } },
                  { learnerName: { contains: input.learnerQuery, mode: "insensitive" } },
                ],
              }
            : {}),
        },
        orderBy: [{ status: "asc" }, { attemptedAt: "desc" }],
        select: {
          id: true,
          certificateId: true,
          learnerName: true,
          learnerEmail: true,
          course: { select: { title: true } },
          provider: true,
          status: true,
          providerUrl: true,
          errorMessage: true,
          attemptCount: true,
          attemptedAt: true,
        },
      }) as Array<{
        id: string;
        certificateId: string;
        learnerName: string;
        learnerEmail: string;
        course: { title: string };
        provider: CredentialProviderName;
        status: CredentialIssuanceStatus;
        providerUrl: string | null;
        errorMessage: string | null;
        attemptCount: number;
        attemptedAt: Date;
      }>;

      return rows.map((row) => ({
        id: row.id,
        certificateId: row.certificateId,
        learnerName: row.learnerName,
        learnerEmail: row.learnerEmail,
        courseTitle: row.course.title,
        provider: row.provider,
        status: row.status,
        providerUrl: row.providerUrl,
        errorMessage: row.errorMessage,
        attemptCount: row.attemptCount,
        attemptedAt: row.attemptedAt,
      }));
    },
  };
}
```

- [ ] **Step 3: Verify and commit checkpoint**

Run:

```powershell
npm run test -- src/modules/credentials/credential-operations.test.ts
npx tsc --noEmit --incremental false
```

Expected: tests and typecheck pass.

Commit:

```powershell
git add src/modules/credentials/credential-operations.ts src/modules/credentials/credential-operations.test.ts
git commit -m "feat: add credential operations service"
```

Expected: commit succeeds.

## Task 7: Wire Certificate Issuing To Credential Operations

**Files:**
- Modify: `src/modules/certificates/certificates.ts`
- Modify: `src/modules/certificates/certificates.test.ts`
- Modify: `src/modules/certificates/prisma-repository.ts`

- [ ] **Step 1: Write failing tests for credential delegation**

Add to `src/modules/certificates/certificates.test.ts`:

```ts
it("delegates Credly issuing after certificate creation when the course has a template", async () => {
  const issueCredentialForCertificate = vi.fn().mockResolvedValue({ status: "SUCCEEDED" });
  const repository = createRepository({
    assignment: { ...completedAssignmentWithBranding, credlyTemplateId: "template_123" },
  });

  await issueCertificateForCompletedAssignment(
    {
      organizationId: "org_1",
      assignmentId: "assignment_1",
      appBaseUrl: "https://learnhub.example",
      now: new Date("2026-06-13T12:00:00.000Z"),
    },
    repository,
    {
      scheduleCertificateNotification: vi.fn(),
      notificationRepository: { upsertJob: vi.fn() },
      issueCredentialForCertificate,
    },
  );

  expect(issueCredentialForCertificate).toHaveBeenCalledWith({
    organizationId: "org_1",
    certificateId: "certificate_1",
    now: new Date("2026-06-13T12:00:00.000Z"),
  });
});

it("does not create a second certificate when credential issuing is retried elsewhere", async () => {
  const existing = createExistingCertificateSnapshot();
  const repository = createRepository({
    assignment: { ...completedAssignmentWithBranding, credlyTemplateId: "template_123" },
    existingCertificate: existing,
  });

  await issueCertificateForCompletedAssignment(
    {
      organizationId: "org_1",
      assignmentId: "assignment_1",
      appBaseUrl: "https://learnhub.example",
      now: new Date("2026-06-13T12:00:00.000Z"),
    },
    repository,
    {
      scheduleCertificateNotification: vi.fn(),
      notificationRepository: { upsertJob: vi.fn() },
      issueCredentialForCertificate: vi.fn(),
    },
  );

  expect(repository.createdCertificates).toHaveLength(0);
});
```

Run:

```powershell
npm run test -- src/modules/certificates/certificates.test.ts
```

Expected: fail until certificate issuing delegates to credential operations.

- [ ] **Step 2: Refactor old provider issuing path**

Remove the direct `credentialProvider` and `credentialProviderTemplateId` path from `IssueCertificateInput`. Replace it with side-effect dependency `issueCredentialForCertificate` from Task 6. Keep the old provider interface only for provider adapters and credential operations.

- [ ] **Step 3: Verify and commit checkpoint**

Run:

```powershell
npm run test -- src/modules/certificates/certificates.test.ts src/modules/credentials/credential-operations.test.ts
npx tsc --noEmit --incremental false
```

Expected: certificate and credential tests pass.

Commit:

```powershell
git add src/modules/certificates/certificates.ts src/modules/certificates/certificates.test.ts src/modules/certificates/prisma-repository.ts
git commit -m "feat: connect certificates to credential operations"
```

Expected: commit succeeds.

## Task 8: Add Learner Certificate Wallet

**Files:**
- Create: `src/app/org/[slug]/certificates/page.tsx`
- Create: `src/modules/certificates/certificate-wallet-page.test.tsx`

- [ ] **Step 1: Write failing wallet page test**

Create `src/modules/certificates/certificate-wallet-page.test.tsx`:

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("learner certificate wallet page", () => {
  it("uses learner membership and user scope and renders verification, download, LinkedIn, email, and copy links", () => {
    const source = readFileSync("src/app/org/[slug]/certificates/page.tsx", "utf8");

    expect(source).toContain("requireOrganizationMemberBySlug");
    expect(source).toContain("membershipId: learnerMembership.id");
    expect(source).toContain("userId: context.userId");
    expect(source).toContain("buildCertificateShareLinks");
    expect(source).toContain("Verify certificate");
    expect(source).toContain("Download certificate");
    expect(source).toContain("Add to LinkedIn");
    expect(source).toContain("Share by email");
    expect(source).toContain("Copy verification URL");
  });
});
```

Run:

```powershell
npm run test -- src/modules/certificates/certificate-wallet-page.test.tsx
```

Expected: fail because the learner wallet page does not exist.

- [ ] **Step 2: Verify share links are already covered**

Run:

```powershell
npm run test -- src/modules/certificates/share-links.test.ts
```

Expected: share-link tests pass; the wallet page test from Step 1 still fails until the page is created.

- [ ] **Step 3: Implement wallet page**

Create `src/app/org/[slug]/certificates/page.tsx`:

```tsx
import { requireOrganizationMemberBySlug } from "@/lib/auth/guards";
import { buildCertificateShareLinks } from "@/modules/certificates/share-links";

export const dynamic = "force-dynamic";

export default async function CertificatesPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { context, organizationId } = await requireOrganizationMemberBySlug(slug);
  const learnerMembership = context.memberships.find(
    (membership) =>
      membership.organizationId === organizationId &&
      membership.status === "ACTIVE" &&
      membership.roles.includes("LEARNER"),
  );

  const { prisma } = await import("@/lib/prisma");
  const certificates = learnerMembership
    ? await prisma.certificate.findMany({
        where: {
          organizationId,
          membershipId: learnerMembership.id,
          userId: context.userId,
        },
        orderBy: { issuedAt: "desc" },
        select: {
          id: true,
          learnerName: true,
          courseTitle: true,
          issuerName: true,
          issuedAt: true,
          verificationCode: true,
          verificationUrl: true,
          credentialIssuances: {
            orderBy: { attemptedAt: "desc" },
            take: 1,
            select: { provider: true, status: true, providerUrl: true },
          },
        },
      })
    : [];

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-6 px-6 py-10">
      <header>
        <p className="text-sm font-medium uppercase tracking-wide text-slate-500">Certificates</p>
        <h1 className="text-3xl font-semibold text-slate-950">{slug} certificate wallet</h1>
      </header>
      <section className="grid gap-4 md:grid-cols-2">
        {certificates.length === 0 ? (
          <p className="text-sm text-slate-500">Earned certificates appear here after course completion.</p>
        ) : (
          certificates.map((certificate) => {
            const links = buildCertificateShareLinks(certificate);
            const credential = certificate.credentialIssuances[0];

            return (
              <article key={certificate.id} className="rounded-md border border-slate-200 p-4">
                <h2 className="text-lg font-semibold text-slate-950">{certificate.courseTitle}</h2>
                <p className="mt-1 text-sm text-slate-600">
                  Issued by {certificate.issuerName} on {certificate.issuedAt.toLocaleDateString()}
                </p>
                <div className="mt-4 grid gap-2 text-sm">
                  <a className="text-blue-700 underline" href={certificate.verificationUrl}>Verify certificate</a>
                  <a className="text-blue-700 underline" href={`/certificates/${certificate.verificationCode}/download`}>Download certificate</a>
                  <a className="text-blue-700 underline" href={links.linkedInUrl}>Add to LinkedIn</a>
                  <a className="text-blue-700 underline" href={links.emailUrl}>Share by email</a>
                  <label className="grid gap-1 text-slate-700">
                    Copy verification URL
                    <input readOnly value={links.copyUrl} className="rounded-md border border-slate-300 px-3 py-2" />
                  </label>
                  <p className="text-slate-600">
                    Credential: {credential ? `${credential.provider} ${credential.status}` : "Not issued"}
                    {credential?.providerUrl ? (
                      <>
                        {" "}
                        <a className="text-blue-700 underline" href={credential.providerUrl}>View provider credential</a>
                      </>
                    ) : null}
                  </p>
                </div>
              </article>
            );
          })
        )}
      </section>
    </main>
  );
}
```

- [ ] **Step 4: Verify and commit checkpoint**

Run:

```powershell
npm run test -- src/modules/certificates/share-links.test.ts src/modules/certificates/certificate-wallet-page.test.tsx
npx tsc --noEmit --incremental false
npm run build
```

Expected: share-link tests, typecheck, and build pass.

Commit:

```powershell
git add src/app/org/[slug]/certificates/page.tsx src/modules/certificates/certificate-wallet-page.test.tsx
git commit -m "feat: add learner certificate wallet"
```

Expected: commit succeeds.

## Task 9: Add Admin Certificate Settings Page

**Files:**
- Create: `src/app/org/[slug]/admin/certificates/page.tsx`
- Create: `src/app/org/[slug]/admin/credentials/actions.ts`
- Create: `src/modules/credentials/admin-certificate-pages.test.ts`

- [ ] **Step 1: Write failing admin certificate settings tests**

Create `src/modules/credentials/admin-certificate-pages.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("admin certificate and credential settings pages", () => {
  it("defines tenant-scoped course credential settings action", () => {
    const source = readFileSync("src/app/org/[slug]/admin/credentials/actions.ts", "utf8");

    expect(source).toContain("updateCourseCredentialSettingsAction");
    expect(source).toContain("requireOrganizationUsersAdminBySlug");
    expect(source).toContain("createPrismaCredentialOperationsRepository");
    expect(source).toContain("updateCourseCredlyTemplate");
    expect(source).toContain("courseId");
    expect(source).not.toContain("organizationId = readFormString");
  });

  it("renders tenant certificate register and Credly template settings", () => {
    const source = readFileSync("src/app/org/[slug]/admin/certificates/page.tsx", "utf8");

    expect(source).toContain("requireOrganizationUsersAdminBySlug");
    expect(source).toContain("where: { organizationId }");
    expect(source).toContain("Credly template id");
    expect(source).toContain("Verification");
    expect(source).toContain("updateCourseCredentialSettingsAction");
  });
});
```

Run:

```powershell
npm run test -- src/modules/credentials/admin-certificate-pages.test.ts
```

Expected: fail because the admin certificates page and credentials actions file do not exist.

- [ ] **Step 2: Add course settings action**

In `src/app/org/[slug]/admin/credentials/actions.ts`, add:

```ts
"use server";

import { requireOrganizationUsersAdminBySlug } from "@/lib/auth/guards";
import {
  createPrismaCredentialOperationsRepository,
  updateCourseCredlyTemplate,
} from "@/modules/credentials/credential-operations";

function readFormString(formData: FormData, key: string): string {
  const value = formData.get(key);

  return typeof value === "string" ? value : "";
}

export async function updateCourseCredentialSettingsAction(slug: string, formData: FormData) {
  const { organizationId } = await requireOrganizationUsersAdminBySlug(slug);
  const { prisma } = await import("@/lib/prisma");

  await updateCourseCredlyTemplate(
    {
      organizationId,
      courseId: readFormString(formData, "courseId"),
      credlyTemplateId: readFormString(formData, "credlyTemplateId"),
    },
    createPrismaCredentialOperationsRepository(prisma),
  );
}
```

This action trusts only `slug` for tenant resolution. `courseId` is re-scoped through `organizationId_id`.

- [ ] **Step 3: Add admin certificates page**

Create `src/app/org/[slug]/admin/certificates/page.tsx`:

```tsx
import { requireOrganizationUsersAdminBySlug } from "@/lib/auth/guards";

import { updateCourseCredentialSettingsAction } from "../credentials/actions";

export const dynamic = "force-dynamic";

export default async function AdminCertificatesPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { organizationId } = await requireOrganizationUsersAdminBySlug(slug);
  const { prisma } = await import("@/lib/prisma");
  const [courses, certificates] = await Promise.all([
    prisma.course.findMany({
      where: { organizationId },
      orderBy: { title: "asc" },
      select: {
        id: true,
        title: true,
        slug: true,
        type: true,
        credentialProvider: true,
        credlyTemplateId: true,
      },
    }),
    prisma.certificate.findMany({
      where: { organizationId },
      orderBy: { issuedAt: "desc" },
      take: 100,
      select: {
        id: true,
        learnerName: true,
        learnerEmail: true,
        courseTitle: true,
        issuedAt: true,
        verificationUrl: true,
      },
    }),
  ]);
  const updateAction = async (formData: FormData) => {
    "use server";

    await updateCourseCredentialSettingsAction(slug, formData);
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-6 px-6 py-10">
      <header>
        <p className="text-sm font-medium uppercase tracking-wide text-slate-500">Certificate admin</p>
        <h1 className="text-3xl font-semibold text-slate-950">{slug} certificate operations</h1>
      </header>
      <section className="rounded-md border border-slate-200 p-4">
        <h2 className="text-lg font-semibold text-slate-950">Course credential settings</h2>
        <div className="mt-4 grid gap-3">
          {courses.map((course) => (
            <form key={course.id} action={updateAction} className="grid gap-3 rounded-md bg-slate-50 p-3 md:grid-cols-[1fr_240px_auto]">
              <input type="hidden" name="courseId" value={course.id} />
              <div>
                <p className="font-medium text-slate-950">{course.title}</p>
                <p className="text-sm text-slate-500">{course.type} / {course.slug}</p>
              </div>
              <label className="grid gap-1 text-sm font-medium text-slate-700">
                Credly template id
                <input name="credlyTemplateId" defaultValue={course.credlyTemplateId ?? ""} className="rounded-md border border-slate-300 px-3 py-2" />
              </label>
              <button type="submit" className="self-end rounded-md bg-slate-950 px-3 py-2 text-sm font-medium text-white">Save</button>
            </form>
          ))}
        </div>
      </section>
      <section className="overflow-hidden rounded-md border border-slate-200">
        <table className="w-full border-collapse text-left text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="px-4 py-3 font-medium">Learner</th>
              <th className="px-4 py-3 font-medium">Course</th>
              <th className="px-4 py-3 font-medium">Issued</th>
              <th className="px-4 py-3 font-medium">Verification</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {certificates.map((certificate) => (
              <tr key={certificate.id}>
                <td className="px-4 py-3">
                  <div className="font-medium text-slate-950">{certificate.learnerName}</div>
                  <div className="text-slate-500">{certificate.learnerEmail}</div>
                </td>
                <td className="px-4 py-3 text-slate-700">{certificate.courseTitle}</td>
                <td className="px-4 py-3 text-slate-700">{certificate.issuedAt.toLocaleDateString()}</td>
                <td className="px-4 py-3"><a className="text-blue-700 underline" href={certificate.verificationUrl}>Verify</a></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
```

- [ ] **Step 4: Verify and commit checkpoint**

Run:

```powershell
npm run test -- src/modules/credentials/credential-operations.test.ts src/modules/credentials/admin-certificate-pages.test.ts
npx tsc --noEmit --incremental false
npm run build
```

Expected: credential tests, typecheck, and build pass.

Commit:

```powershell
git add src/app/org/[slug]/admin/certificates/page.tsx src/app/org/[slug]/admin/credentials/actions.ts src/modules/credentials/admin-certificate-pages.test.ts
git commit -m "feat: add certificate credential settings"
```

Expected: commit succeeds.

## Task 10: Add Admin Credential Operations Page And Retry

**Files:**
- Create: `src/app/org/[slug]/admin/credentials/page.tsx`
- Modify: `src/app/org/[slug]/admin/credentials/actions.ts`
- Modify: `src/modules/credentials/admin-certificate-pages.test.ts`

- [ ] **Step 1: Write failing admin credential operations tests**

Extend `src/modules/credentials/admin-certificate-pages.test.ts`:

```ts
it("defines tenant-scoped failed credential retry action", () => {
  const source = readFileSync("src/app/org/[slug]/admin/credentials/actions.ts", "utf8");

  expect(source).toContain("retryCredentialIssuanceAction");
  expect(source).toContain("requireOrganizationUsersAdminBySlug");
  expect(source).toContain("retryFailedCredentialIssuance");
  expect(source).toContain("createConfiguredCredlyProvider");
  expect(source).toContain("createPrismaCredentialOperationsRepository(prisma)");
  expect(source).not.toContain("organizationId = readFormString");
});

it("renders credential status page with learner, course, provider, failure message, and retry button", () => {
  const source = readFileSync("src/app/org/[slug]/admin/credentials/page.tsx", "utf8");

  expect(source).toContain("requireOrganizationUsersAdminBySlug");
  expect(source).toContain("where: { organizationId }");
  expect(source).toContain("Learner");
  expect(source).toContain("Course");
  expect(source).toContain("Provider");
  expect(source).toContain("Failure message");
  expect(source).toContain("Retry");
});
```

Run:

```powershell
npm run test -- src/modules/credentials/admin-certificate-pages.test.ts
```

Expected: fail because the retry action and admin credential operations page do not exist.

- [ ] **Step 2: Add retry action**

Extend `src/app/org/[slug]/admin/credentials/actions.ts`:

```ts
import { env } from "@/lib/env";
import {
  createPrismaCredentialOperationsRepository,
  retryFailedCredentialIssuance,
} from "@/modules/credentials/credential-operations";
import { createCredlyProvider } from "@/modules/providers/credentials/credly-provider";

function createConfiguredCredlyProvider() {
  if (!env.CREDLY_ORGANIZATION_ID || !env.CREDLY_API_TOKEN) {
    throw new Error("Credly provider is not configured");
  }

  return createCredlyProvider({
    baseUrl: process.env.CREDLY_BASE_URL ?? "https://api.credly.com/v1",
    organizationId: env.CREDLY_ORGANIZATION_ID,
    authToken: env.CREDLY_API_TOKEN,
  });
}

export async function retryCredentialIssuanceAction(slug: string, formData: FormData) {
  const { organizationId } = await requireOrganizationUsersAdminBySlug(slug);
  const { prisma } = await import("@/lib/prisma");
  const credentialIssuanceId = readFormString(formData, "credentialIssuanceId");

  await retryFailedCredentialIssuance(
    { organizationId, credentialIssuanceId, now: new Date() },
    createPrismaCredentialOperationsRepository(prisma),
    {
      CREDLY: createConfiguredCredlyProvider(),
    },
  );
}
```

`createPrismaCredentialOperationsRepository` is defined in Task 6 inside `src/modules/credentials/credential-operations.ts`; do not redefine it in the action file. Its tests assert tenant-safe `where` clauses for retry lookup, idempotent upsert, status listing, and course template updates.

- [ ] **Step 3: Implement credential status page**

Create `src/app/org/[slug]/admin/credentials/page.tsx`:

```tsx
import { requireOrganizationUsersAdminBySlug } from "@/lib/auth/guards";

import { retryCredentialIssuanceAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function AdminCredentialsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { organizationId } = await requireOrganizationUsersAdminBySlug(slug);
  const { prisma } = await import("@/lib/prisma");
  const credentials = await prisma.credentialIssuance.findMany({
    where: { organizationId },
    orderBy: [{ status: "asc" }, { attemptedAt: "desc" }],
    select: {
      id: true,
      learnerName: true,
      learnerEmail: true,
      provider: true,
      status: true,
      providerUrl: true,
      errorMessage: true,
      attemptCount: true,
      attemptedAt: true,
      course: { select: { title: true } },
    },
  });
  const retryAction = async (formData: FormData) => {
    "use server";

    await retryCredentialIssuanceAction(slug, formData);
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-6 px-6 py-10">
      <header>
        <p className="text-sm font-medium uppercase tracking-wide text-slate-500">Credentials</p>
        <h1 className="text-3xl font-semibold text-slate-950">{slug} credential operations</h1>
      </header>
      <section className="overflow-hidden rounded-md border border-slate-200">
        <table className="w-full border-collapse text-left text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="px-4 py-3 font-medium">Learner</th>
              <th className="px-4 py-3 font-medium">Course</th>
              <th className="px-4 py-3 font-medium">Provider</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Attempts</th>
              <th className="px-4 py-3 font-medium">Failure message</th>
              <th className="px-4 py-3 font-medium">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {credentials.length === 0 ? (
              <tr><td className="px-4 py-6 text-slate-500" colSpan={7}>No credential issuance records yet.</td></tr>
            ) : (
              credentials.map((credential) => (
                <tr key={credential.id}>
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-950">{credential.learnerName}</div>
                    <div className="text-slate-500">{credential.learnerEmail}</div>
                  </td>
                  <td className="px-4 py-3 text-slate-700">{credential.course.title}</td>
                  <td className="px-4 py-3 text-slate-700">{credential.provider}</td>
                  <td className="px-4 py-3 text-slate-700">
                    {credential.providerUrl ? <a className="text-blue-700 underline" href={credential.providerUrl}>{credential.status}</a> : credential.status}
                  </td>
                  <td className="px-4 py-3 text-slate-700">{credential.attemptCount}</td>
                  <td className="px-4 py-3 text-slate-700">{credential.errorMessage ?? "None"}</td>
                  <td className="px-4 py-3">
                    {credential.status === "FAILED" ? (
                      <form action={retryAction}>
                        <input type="hidden" name="credentialIssuanceId" value={credential.id} />
                        <button type="submit" className="rounded-md bg-slate-950 px-3 py-2 text-sm font-medium text-white">Retry</button>
                      </form>
                    ) : (
                      <span className="text-slate-500">No action</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
    </main>
  );
}
```

- [ ] **Step 4: Verify and commit checkpoint**

Run:

```powershell
npm run test -- src/modules/credentials/credential-operations.test.ts src/modules/providers/credentials/credly-provider.test.ts src/modules/credentials/admin-certificate-pages.test.ts
npx tsc --noEmit --incremental false
npm run build
```

Expected: focused tests, typecheck, and build pass.

Commit:

```powershell
git add src/app/org/[slug]/admin/credentials/page.tsx src/app/org/[slug]/admin/credentials/actions.ts src/modules/credentials/admin-certificate-pages.test.ts
git commit -m "feat: add credential operations admin"
```

Expected: commit succeeds.

## Task 11: Final Verification

**Files:**
- All files changed in Tasks 1-10.

- [ ] **Step 1: Run focused test commands**

```powershell
npm run test -- src/modules/certificates/certificates.test.ts
npm run test -- src/modules/certificates/certificate-renderer.test.tsx
npm run test -- src/modules/certificates/share-links.test.ts
npm run test -- src/modules/providers/credentials/credly-provider.test.ts
npm run test -- src/modules/credentials/credential-operations.test.ts
```

Expected: every focused command exits `0`.

- [ ] **Step 2: Run umbrella verification commands**

```powershell
npm run test
npm run lint
npx prisma validate
npm run prisma:generate
npx tsc --noEmit --incremental false
npm run build
```

Expected: every umbrella command exits `0`.

- [ ] **Step 3: Run release coverage text scan**

Run this from the repository root:

```powershell
$plan='docs/superpowers/plans/2026-06-13-certificates-credentials-operations-implementation.md'
$terms=@(
  'branded certificate',
  'browser print',
  'stable certificate artifact',
  'stored certificate data',
  'learner certificate wallet',
  'verification URLs',
  'private membership',
  'assignment ids',
  'LinkedIn',
  'email',
  'copyable verification URL',
  'Credly template id',
  'provider credential id',
  'provider URL',
  'retry',
  'duplicate certificates',
  'failure message',
  'notification job infrastructure from Task 4'
)
foreach ($term in $terms) {
  if (-not (Select-String -LiteralPath $plan -SimpleMatch $term -Quiet)) {
    throw "Missing coverage term: $term"
  }
}
```

Expected: command exits `0`.

- [ ] **Step 4: Run red-flag language scan**

Run:

```powershell
$plan='docs/superpowers/plans/2026-06-13-certificates-credentials-operations-implementation.md'
$pattern='T[O]DO|T[B]D|F[I]XME|implement\s+la[te]r|fill\s+in\s+details|place\s*holder'
if (Select-String -LiteralPath $plan -Pattern $pattern -Quiet) {
  throw 'Plan contains red-flag planning language'
}
```

Expected: command exits `0`.

- [ ] **Step 5: Manual acceptance checklist**

Confirm:

- Certificate page renders a branded certificate suitable for browser print.
- Download route returns a stable certificate artifact generated from stored certificate data.
- Learner certificate wallet lists earned certificates and verification URLs.
- Public verification page never exposes private membership or assignment ids.
- Share links include LinkedIn, email, and plain copyable verification URL.
- Course settings can map a Credly template id.
- Credly adapter issues credentials and stores provider credential id and provider URL.
- Failed credential issuance can be retried by an admin without creating duplicate certificates.
- Admin can inspect credential status by learner, course, provider, and failure message.
- Certificate email uses notification job infrastructure from Task 4.
- Every tenant-scoped query includes `organizationId`.
- Retry actions use existing `CredentialIssuance` and `Certificate` rows.
- Credly failures are sanitized before storage.
- Provider secrets are not rendered in server components.

## Self-Review

- Spec coverage: Tasks 1-10 cover schema, migration, certificate issuing, branded rendering, download route, learner wallet, share links, Credly template settings, Credly provider issuing, retry operations, admin inspection, public data safety, idempotency, and Task 4 notification job integration.
- Type consistency: `CredentialProviderName`, `CredentialIssuanceStatus`, `CertificateRenderData`, `CredentialOperationsRepository`, `providerRequestId`, `credlyTemplateId`, and `verificationUrl` are used consistently across service, provider, page, and test tasks.
- Verification coverage: focused commands cover every new test file, and umbrella commands cover lint, Prisma schema validity, Prisma Client generation, TypeScript, full tests, and production build.
