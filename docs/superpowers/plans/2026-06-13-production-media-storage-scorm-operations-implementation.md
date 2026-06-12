# Production Media Storage And SCORM Operations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire LearnHub's production media operations so tenant admins can create Mux uploads, store all non-video files in tenant-scoped R2 keys, validate and extract SCORM 1.2 packages safely, and block learner launch until provider processing and package extraction are ready.

**Architecture:** Keep provider-specific code behind the existing video and object-storage provider boundaries while adding focused storage-key, SCORM-manifest, and SCORM-extraction modules. Persist provider state, malware-scan state, and extraction state on tenant-owned records so admin pages and learner launch can make deterministic decisions from the database. Route handlers only authorize, build tenant-scoped inputs from server-side organization/course records, and call module services; no route accepts tenant ids or storage prefixes from client input.

**Tech Stack:** Next.js App Router route handlers and server pages, TypeScript, Prisma 7, PostgreSQL, Vitest, Zod env validation, Mux REST API, AWS S3-compatible Cloudflare R2 signing, ZIP parsing with `yauzl`, XML manifest parsing with `fast-xml-parser`.

---

## Scope Boundary

This plan implements production-shaped media upload, storage signing, SCORM validation, extraction, scan state, and launch blocking. It does not add background queue infrastructure beyond a secret-protected extraction route, SCORM 2004, cmi5, xAPI, multi-SCO sequencing, retention automation, custom domains, automated transcript generation, or PDF report rendering.

Production video files remain in Mux. Cloudflare R2 stores tenant logos, transcript files, certificate files, SCORM zip packages, extracted SCORM files, CSV imports, and CSV exports. Storage keys always include server-derived organization ids and never use a client-provided tenant prefix.

## File Structure

- Modify `package.json`: add provider and parsing dependencies: `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`, `yauzl`, `fast-xml-parser`, and `mux`.
- Modify `prisma/schema.prisma`: add Mux upload/asset state fields to `VideoLesson`, SCORM extraction and scan fields to `ScormPackage`, object metadata model, and relations.
- Create `prisma/migrations/20260613050000_media_storage_operations/migration.sql`: SQL migration for media state enums, object metadata, video fields, and SCORM package status fields.
- Modify `src/lib/env.ts`: validate Mux, R2, media job secret, SCORM size, and scan provider settings.
- Modify `src/lib/env.test.ts`: cover production config requirements and local defaults for the new media settings.
- Create `src/modules/providers/video/mux-video-provider.ts`: Mux direct-upload adapter and webhook signature verification helpers.
- Create `src/modules/providers/video/mux-video-provider.test.ts`: unit tests for upload metadata, Mux request shape, playback source mapping, and webhook signature checks.
- Create `src/modules/providers/storage/r2-object-storage-provider.ts`: Cloudflare R2 signed read/write/delete adapter using S3-compatible APIs.
- Create `src/modules/providers/storage/r2-object-storage-provider.test.ts`: unit tests for endpoint config, signed URL generation, and explicit delete keys.
- Create `src/modules/storage/storage-keys.ts`: tenant-scoped key builders for logos, transcripts, certificates, SCORM zips, extracted SCORM content, CSV imports, and CSV exports.
- Create `src/modules/storage/storage-keys.test.ts`: tests for key shape, path normalization, traversal rejection, and no client tenant override.
- Create `src/modules/scorm/scorm-manifest.ts`: ZIP and `imsmanifest.xml` validation, launch file discovery, and SCORM 1.2 metadata extraction.
- Create `src/modules/scorm/scorm-manifest.test.ts`: tests for zip content type, size, missing manifest, missing launch file, and traversal entries.
- Create `src/modules/scorm/scorm-extraction.ts`: safe extraction to `contentRootKey`, scan state transitions, path traversal rejection, and object writes.
- Create `src/modules/scorm/scorm-extraction.test.ts`: tests for extraction keys, blocked traversal, scan failed behavior, and launch file write.
- Create `src/modules/scorm/scorm-package-jobs.ts`: extraction job orchestration, bounded status transitions, pass-through malware scanner, and admin read models.
- Create `src/modules/scorm/scorm-package-jobs.test.ts`: tests for pending, extracting, ready, failed, malware scan states, and launch blocking.
- Modify `src/modules/scorm/scorm-package-service.ts`: replace metadata-only upload assumptions with manifest validation input, storage keys, extraction status initialization, and malware scan status initialization.
- Modify `src/modules/scorm/prisma-repository.ts`: persist SCORM package state, list admin package status, and mark extraction or scan status transitions.
- Modify `src/modules/scorm/scorm-runtime.ts`: block launch unless active package extraction and malware scan are ready.
- Modify `src/modules/scorm/scorm-runtime.test.ts`: cover launch blocking before extraction completion and scan pass.
- Modify `src/modules/video/video-content-service.ts`: allow Mux upload creation to create a lesson with provider upload id and processing state without a playback URL.
- Modify `src/modules/video/video-runtime.ts`: expose playback only for ready Mux assets and show a blocked media state for not-ready lessons.
- Modify `src/modules/video/prisma-repository.ts`: persist Mux upload id, asset id, playback id, processing state, and admin read data.
- Create `src/app/api/providers/mux/webhook/route.ts`: Mux webhook route that verifies signature before updating upload and asset state.
- Create `src/app/api/jobs/scorm-extraction/route.ts`: shared-secret extraction route that processes bounded SCORM package jobs.
- Create `src/app/api/org/[slug]/storage/upload/route.ts`: admin-only signed upload route for tenant-scoped R2 uploads.
- Modify `src/app/api/org/[slug]/assignments/[assignmentId]/scorm/launch/route.ts`: preserve auth flow and return blocked launch errors from SCORM runtime.
- Modify `src/app/org/[slug]/admin/courses/[courseSlug]/content/page.tsx`: add server-rendered Mux direct upload workflow and ready/processing/error state.
- Modify `src/app/org/[slug]/admin/courses/[courseSlug]/scorm/page.tsx`: add SCORM upload state, validation result, extraction state, scan state, and launch blocking explanation.

## Data Model

Add these enums:

```prisma
enum VideoProviderProcessingStatus {
  UPLOAD_CREATED
  UPLOADED
  ASSET_PREPARING
  READY
  ERRORED
}

enum ScormPackageProcessingStatus {
  UPLOAD_PENDING
  UPLOADED
  VALIDATED
  EXTRACTION_PENDING
  EXTRACTING
  READY
  FAILED
}

enum MalwareScanStatus {
  PENDING
  PASSED
  FAILED
}

enum StoredObjectPurpose {
  ORG_LOGO
  VIDEO_TRANSCRIPT
  CERTIFICATE
  SCORM_ZIP
  SCORM_EXTRACTED_FILE
  CSV_IMPORT
  CSV_EXPORT
}
```

Extend `VideoLesson`:

```prisma
model VideoLesson {
  providerUploadId       String?
  providerAssetId        String?
  providerPlaybackId     String?
  providerProcessingStatus VideoProviderProcessingStatus @default(UPLOAD_CREATED)
  providerError          String?
  providerUpdatedAt      DateTime?

  @@unique([providerUploadId])
  @@unique([providerAssetId])
  @@index([organizationId, providerUploadId])
  @@index([organizationId, providerAssetId])
  @@index([organizationId, providerProcessingStatus])
}
```

Extend `ScormPackage`:

```prisma
model ScormPackage {
  processingStatus    ScormPackageProcessingStatus @default(UPLOAD_PENDING)
  malwareScanStatus   MalwareScanStatus            @default(PENDING)
  validationError     String?
  extractionError     String?
  manifestIdentifier  String?
  manifestVersion     String?
  launchFileKey       String?
  extractedFileCount  Int                          @default(0)
  extractedByteSize   BigInt                       @default(0)
  scanProvider        String?
  scanCompletedAt     DateTime?
  extractionStartedAt DateTime?
  extractionFinishedAt DateTime?

  @@index([organizationId, processingStatus])
  @@index([organizationId, malwareScanStatus])
}
```

Add `StoredObject`:

```prisma
model StoredObject {
  id             String              @id @default(cuid())
  organizationId String
  courseId       String?
  packageId      String?
  purpose        StoredObjectPurpose
  key            String              @unique
  contentType    String
  byteSize       BigInt
  checksumSha256 String?
  createdByUserId String?
  deletedAt      DateTime?
  createdAt      DateTime            @default(now())
  organization   Organization        @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  course         Course?             @relation(fields: [organizationId, courseId], references: [organizationId, id], onDelete: Cascade)
  scormPackage   ScormPackage?       @relation(fields: [organizationId, packageId], references: [organizationId, id], onDelete: Cascade)
  createdBy      User?               @relation(fields: [createdByUserId], references: [id], onDelete: SetNull)

  @@index([organizationId, purpose])
  @@index([organizationId, courseId])
  @@index([organizationId, packageId])
  @@index([deletedAt])
}
```

Also add relation fields:

```prisma
model Organization {
  storedObjects StoredObject[]
}

model Course {
  storedObjects StoredObject[]
}

model User {
  createdStoredObjects StoredObject[]
}

model ScormPackage {
  storedObjects StoredObject[]
}
```

## Acceptance Criteria

- Mux direct upload creation sends `organizationId`, `courseId`, and `lessonId` as Mux passthrough metadata and stores the returned upload id.
- Mux webhook route rejects missing, malformed, or mismatched signatures before reading event fields into state changes.
- Mux webhook updates video lessons by server-stored upload id or asset id and records ready playback id only after the asset has a playback id.
- Native video learner launch includes playback URLs only for lessons whose `providerProcessingStatus` is `READY`; processing or failed lessons remain visible with clear non-playable state.
- R2 write and read signing uses keys from `storage-keys.ts`; route inputs choose purpose and server-side ids, not raw prefixes.
- Logos, transcript files, certificates, SCORM zips, extracted SCORM files, CSV imports, and CSV exports use tenant-scoped keys.
- SCORM upload rejects non-zip content type, file sizes above configured max, missing `imsmanifest.xml`, missing launch file, and ZIP traversal entries.
- SCORM extraction writes every extracted object under `ScormPackage.contentRootKey` and records `launchFileKey`.
- Admin SCORM page shows `processingStatus`, `malwareScanStatus`, file count, byte size, and validation or extraction error.
- Learner SCORM launch returns a 400 blocked response until package `processingStatus` is `READY` and `malwareScanStatus` is `PASSED`.
- ZIP entries with absolute paths, drive letters, empty segments, or `..` are rejected before any object write occurs.
- Malware scan hook stores `PENDING`, `PASSED`, or `FAILED`; the first implementation supports a configured `pass-through` scanner that marks scans as passed.
- Storage delete APIs require a previously persisted key or a server-built key. No delete path derives tenant or prefix from user input.
- Every query that reads or mutates media objects includes `organizationId` unless it is in a platform-owner-only context.

## Task 1: Add Media Storage Schema

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260613050000_media_storage_operations/migration.sql`

- [ ] **Step 1: Run the failing schema smoke**

Before changing the schema, run:

```powershell
npx prisma validate
Select-String -Path prisma/schema.prisma -Pattern 'VideoProviderProcessingStatus|ScormPackageProcessingStatus|MalwareScanStatus|StoredObjectPurpose|model StoredObject'
@(
  'VideoProviderProcessingStatus',
  'ScormPackageProcessingStatus',
  'MalwareScanStatus',
  'StoredObjectPurpose',
  'model StoredObject'
) | ForEach-Object {
  if (-not (Select-String -Path prisma/schema.prisma -Pattern $_ -Quiet)) {
    throw "Missing expected media schema element: $_"
  }
}
```

Expected: `npx prisma validate` exits `0`, the plain `Select-String` returns no matches, and the final assertion fails with `Missing expected media schema element: VideoProviderProcessingStatus`. This establishes that the current schema is valid but the production media storage model is missing.

- [ ] **Step 2: Write schema changes**

Add the enums and model from the Data Model section. Extend the existing `VideoLesson`, `ScormPackage`, `Organization`, `Course`, and `User` models exactly as shown. Keep all existing unique indexes and relations intact.

- [ ] **Step 3: Create SQL migration**

Create `prisma/migrations/20260613050000_media_storage_operations/migration.sql` with:

```sql
CREATE TYPE "VideoProviderProcessingStatus" AS ENUM (
  'UPLOAD_CREATED',
  'UPLOADED',
  'ASSET_PREPARING',
  'READY',
  'ERRORED'
);

CREATE TYPE "ScormPackageProcessingStatus" AS ENUM (
  'UPLOAD_PENDING',
  'UPLOADED',
  'VALIDATED',
  'EXTRACTION_PENDING',
  'EXTRACTING',
  'READY',
  'FAILED'
);

CREATE TYPE "MalwareScanStatus" AS ENUM (
  'PENDING',
  'PASSED',
  'FAILED'
);

CREATE TYPE "StoredObjectPurpose" AS ENUM (
  'ORG_LOGO',
  'VIDEO_TRANSCRIPT',
  'CERTIFICATE',
  'SCORM_ZIP',
  'SCORM_EXTRACTED_FILE',
  'CSV_IMPORT',
  'CSV_EXPORT'
);

ALTER TABLE "VideoLesson"
  ADD COLUMN "providerUploadId" TEXT,
  ADD COLUMN "providerAssetId" TEXT,
  ADD COLUMN "providerPlaybackId" TEXT,
  ADD COLUMN "providerProcessingStatus" "VideoProviderProcessingStatus" NOT NULL DEFAULT 'UPLOAD_CREATED',
  ADD COLUMN "providerError" TEXT,
  ADD COLUMN "providerUpdatedAt" TIMESTAMP(3);

ALTER TABLE "ScormPackage"
  ADD COLUMN "processingStatus" "ScormPackageProcessingStatus" NOT NULL DEFAULT 'UPLOAD_PENDING',
  ADD COLUMN "malwareScanStatus" "MalwareScanStatus" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "validationError" TEXT,
  ADD COLUMN "extractionError" TEXT,
  ADD COLUMN "manifestIdentifier" TEXT,
  ADD COLUMN "manifestVersion" TEXT,
  ADD COLUMN "launchFileKey" TEXT,
  ADD COLUMN "extractedFileCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "extractedByteSize" BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN "scanProvider" TEXT,
  ADD COLUMN "scanCompletedAt" TIMESTAMP(3),
  ADD COLUMN "extractionStartedAt" TIMESTAMP(3),
  ADD COLUMN "extractionFinishedAt" TIMESTAMP(3);

CREATE TABLE "StoredObject" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "courseId" TEXT,
  "packageId" TEXT,
  "purpose" "StoredObjectPurpose" NOT NULL,
  "key" TEXT NOT NULL,
  "contentType" TEXT NOT NULL,
  "byteSize" BIGINT NOT NULL,
  "checksumSha256" TEXT,
  "createdByUserId" TEXT,
  "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StoredObject_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StoredObject_key_key" ON "StoredObject"("key");
CREATE UNIQUE INDEX "VideoLesson_providerUploadId_key" ON "VideoLesson"("providerUploadId");
CREATE UNIQUE INDEX "VideoLesson_providerAssetId_key" ON "VideoLesson"("providerAssetId");
CREATE INDEX "StoredObject_organizationId_purpose_idx" ON "StoredObject"("organizationId", "purpose");
CREATE INDEX "StoredObject_organizationId_courseId_idx" ON "StoredObject"("organizationId", "courseId");
CREATE INDEX "StoredObject_organizationId_packageId_idx" ON "StoredObject"("organizationId", "packageId");
CREATE INDEX "StoredObject_deletedAt_idx" ON "StoredObject"("deletedAt");
CREATE INDEX "VideoLesson_organizationId_providerUploadId_idx" ON "VideoLesson"("organizationId", "providerUploadId");
CREATE INDEX "VideoLesson_organizationId_providerAssetId_idx" ON "VideoLesson"("organizationId", "providerAssetId");
CREATE INDEX "VideoLesson_organizationId_providerProcessingStatus_idx" ON "VideoLesson"("organizationId", "providerProcessingStatus");
CREATE INDEX "ScormPackage_organizationId_processingStatus_idx" ON "ScormPackage"("organizationId", "processingStatus");
CREATE INDEX "ScormPackage_organizationId_malwareScanStatus_idx" ON "ScormPackage"("organizationId", "malwareScanStatus");

ALTER TABLE "StoredObject"
  ADD CONSTRAINT "StoredObject_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StoredObject"
  ADD CONSTRAINT "StoredObject_organizationId_courseId_fkey"
  FOREIGN KEY ("organizationId", "courseId") REFERENCES "Course"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StoredObject"
  ADD CONSTRAINT "StoredObject_organizationId_packageId_fkey"
  FOREIGN KEY ("organizationId", "packageId") REFERENCES "ScormPackage"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StoredObject"
  ADD CONSTRAINT "StoredObject_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
```

- [ ] **Step 4: Verify schema**

Run:

```powershell
npx prisma validate
npm run prisma:generate
```

Expected: both commands exit `0`, and Prisma Client exposes `storedObject`, `VideoProviderProcessingStatus`, `ScormPackageProcessingStatus`, `MalwareScanStatus`, and `StoredObjectPurpose`.

- [ ] **Step 5: Commit**

```powershell
git add prisma/schema.prisma prisma/migrations/20260613050000_media_storage_operations/migration.sql
git commit -m "feat: add media storage operation schema"
```

Expected: commit succeeds.

## Task 2: Add Environment Contract And Dependencies

**Files:**
- Modify: `package.json`
- Modify: `src/lib/env.ts`
- Modify: `src/lib/env.test.ts`

- [ ] **Step 1: Add failing env tests**

Append these tests to `src/lib/env.test.ts`:

```ts
it("requires Mux webhook secret with Mux credentials in production", () => {
  expect(() =>
    getEnv({
      NODE_ENV: "production",
      DATABASE_URL: localDatabaseUrl,
      NEXTAUTH_SECRET: "production-secret",
      NEXTAUTH_URL: "https://learnhub.example.com",
      APP_BASE_URL: "https://learnhub.example.com",
      EMAIL_PROVIDER: "console",
      MUX_TOKEN_ID: "token-id",
      MUX_TOKEN_SECRET: "token-secret",
      R2_ACCOUNT_ID: "account",
      R2_ACCESS_KEY_ID: "access",
      R2_SECRET_ACCESS_KEY: "secret",
      R2_BUCKET_NAME: "learnhub-media",
      MEDIA_JOB_SECRET: "media-job-secret",
      SCORM_MALWARE_SCANNER: "pass-through",
    }),
  ).toThrow(/MUX_WEBHOOK_SECRET/);
});

it("requires all R2 settings together in production", () => {
  expect(() =>
    getEnv({
      NODE_ENV: "production",
      DATABASE_URL: localDatabaseUrl,
      NEXTAUTH_SECRET: "production-secret",
      NEXTAUTH_URL: "https://learnhub.example.com",
      APP_BASE_URL: "https://learnhub.example.com",
      EMAIL_PROVIDER: "console",
      MUX_TOKEN_ID: "token-id",
      MUX_TOKEN_SECRET: "token-secret",
      MUX_WEBHOOK_SECRET: "webhook-secret",
      R2_ACCOUNT_ID: "account",
      R2_BUCKET_NAME: "learnhub-media",
      MEDIA_JOB_SECRET: "media-job-secret",
      SCORM_MALWARE_SCANNER: "pass-through",
    }),
  ).toThrow(/R2_ACCESS_KEY_ID/);
});

it("accepts production media provider configuration", () => {
  expect(
    getEnv({
      NODE_ENV: "production",
      DATABASE_URL: localDatabaseUrl,
      NEXTAUTH_SECRET: "production-secret",
      NEXTAUTH_URL: "https://learnhub.example.com",
      APP_BASE_URL: "https://learnhub.example.com",
      EMAIL_PROVIDER: "console",
      MUX_TOKEN_ID: "token-id",
      MUX_TOKEN_SECRET: "token-secret",
      MUX_WEBHOOK_SECRET: "webhook-secret",
      R2_ACCOUNT_ID: "account",
      R2_ACCESS_KEY_ID: "access",
      R2_SECRET_ACCESS_KEY: "secret",
      R2_BUCKET_NAME: "learnhub-media",
      MEDIA_JOB_SECRET: "media-job-secret",
      SCORM_MAX_PACKAGE_BYTES: "536870912",
      SCORM_MALWARE_SCANNER: "pass-through",
    }),
  ).toMatchObject({
    MUX_TOKEN_ID: "token-id",
    MUX_WEBHOOK_SECRET: "webhook-secret",
    R2_BUCKET_NAME: "learnhub-media",
    MEDIA_JOB_SECRET: "media-job-secret",
    SCORM_MAX_PACKAGE_BYTES: 536870912,
    SCORM_MALWARE_SCANNER: "pass-through",
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
  "@aws-sdk/client-s3": "^3.946.0",
  "@aws-sdk/s3-request-presigner": "^3.946.0",
  "fast-xml-parser": "^5.3.2",
  "mux": "^9.2.0",
  "yauzl": "^3.2.0"
},
"devDependencies": {
  "@types/yauzl": "^2.10.3"
}
```

Keep existing dependencies in place.

- [ ] **Step 3: Extend env schema**

Add these keys:

```ts
MUX_WEBHOOK_SECRET: z.string().optional(),
MEDIA_JOB_SECRET: z.string().optional(),
SCORM_MAX_PACKAGE_BYTES: z.coerce.number().int().positive().default(512 * 1024 * 1024),
SCORM_MALWARE_SCANNER: z.enum(["pass-through"]).default("pass-through"),
```

Add this production validation after parsing:

```ts
if (source.NODE_ENV === "production") {
  const requiredMediaKeys: (keyof Env)[] = [
    "MUX_TOKEN_ID",
    "MUX_TOKEN_SECRET",
    "MUX_WEBHOOK_SECRET",
    "R2_ACCOUNT_ID",
    "R2_ACCESS_KEY_ID",
    "R2_SECRET_ACCESS_KEY",
    "R2_BUCKET_NAME",
    "MEDIA_JOB_SECRET",
  ];

  for (const key of requiredMediaKeys) {
    if (!parsedEnv[key] || String(parsedEnv[key]).trim().length === 0) {
      throw new Error(`${key} is required in production.`);
    }
  }
}
```

Update `buildEnvSource` so `MUX_WEBHOOK_SECRET`, `MEDIA_JOB_SECRET`, `SCORM_MAX_PACKAGE_BYTES`, and `SCORM_MALWARE_SCANNER` are read from `process.env`.

- [ ] **Step 4: Verify and commit**

Run:

```powershell
npm run test -- src/lib/env.test.ts
```

Expected: env tests pass.

Commit:

```powershell
git add package.json src/lib/env.ts src/lib/env.test.ts
git commit -m "feat: add media provider env contract"
```

Expected: commit succeeds.

## Task 3: Add Mux Video Provider

**Files:**
- Create: `src/modules/providers/video/mux-video-provider.ts`
- Create: `src/modules/providers/video/mux-video-provider.test.ts`
- Modify: `src/modules/providers/video/video-provider.ts`
- Modify: `src/modules/video/video-content-service.ts`
- Modify: `src/modules/video/video-content-service.test.ts`
- Modify: `src/modules/video/prisma-repository.ts`
- Modify: `src/modules/video/prisma-repository.test.ts`

- [ ] **Step 1: Write provider tests**

Create `src/modules/providers/video/mux-video-provider.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import {
  createMuxVideoProvider,
  verifyMuxWebhookSignature,
} from "./mux-video-provider";

it("creates a direct upload with tenant and course metadata", async () => {
  const uploadsCreate = vi.fn().mockResolvedValue({
    id: "upload_1",
    url: "https://storage.mux.com/direct-upload",
  });
  const provider = createMuxVideoProvider({
    tokenId: "id",
    tokenSecret: "secret",
    muxClient: { video: { uploads: { create: uploadsCreate } } },
  });

  await expect(
    provider.createUpload({
      organizationId: "org_1",
      courseId: "course_1",
      lessonId: "lesson_1",
      title: "Safety intro",
    }),
  ).resolves.toEqual({
    uploadUrl: "https://storage.mux.com/direct-upload",
    providerUploadId: "upload_1",
  });

  expect(uploadsCreate).toHaveBeenCalledWith({
    cors_origin: "*",
    new_asset_settings: {
      playback_policy: ["signed"],
      passthrough: JSON.stringify({
        organizationId: "org_1",
        courseId: "course_1",
        lessonId: "lesson_1",
        title: "Safety intro",
      }),
    },
  });
});

it("maps asset playback source only when a playback id exists", async () => {
  const assetsRetrieve = vi.fn().mockResolvedValue({
    id: "asset_1",
    playback_ids: [{ id: "playback_1", policy: "signed" }],
  });
  const provider = createMuxVideoProvider({
    tokenId: "id",
    tokenSecret: "secret",
    muxClient: { video: { assets: { retrieve: assetsRetrieve } } },
  });

  await expect(provider.getPlaybackSource("asset_1")).resolves.toEqual({
    providerAssetId: "asset_1",
    playbackId: "playback_1",
    playbackUrl: "https://stream.mux.com/playback_1.m3u8",
  });
});

it("rejects webhook signatures that do not match the raw body", () => {
  const body = JSON.stringify({ type: "video.asset.ready" });
  const timestamp = "1790000000";
  const signature = "v1=bad";

  expect(
    verifyMuxWebhookSignature({
      rawBody: body,
      muxSignatureHeader: `t=${timestamp},${signature}`,
      webhookSecret: "secret",
      nowSeconds: 1790000010,
    }),
  ).toBe(false);
});
```

Run:

```powershell
npm run test -- src/modules/providers/video/mux-video-provider.test.ts
```

Expected: fail because the provider file does not exist.

- [ ] **Step 2: Extend provider interface**

Update `src/modules/providers/video/video-provider.ts`:

```ts
export type CreateVideoUploadInput = {
  organizationId: string;
  courseId: string;
  lessonId: string;
  title: string;
};
```

Keep the rest of the exported types unchanged.

- [ ] **Step 3: Implement provider and signature verifier**

Create `src/modules/providers/video/mux-video-provider.ts`:

```ts
import crypto from "node:crypto";
import Mux from "mux";
import type {
  CreateVideoUploadInput,
  CreateVideoUploadResult,
  VideoPlaybackSource,
  VideoProvider,
} from "./video-provider";

type MuxClientShape = {
  video: {
    uploads?: {
      create(input: unknown): Promise<{ id: string; url: string }>;
    };
    assets?: {
      retrieve(assetId: string): Promise<{ id: string; playback_ids?: { id: string; policy?: string }[] }>;
    };
  };
};

export function createMuxVideoProvider(input: {
  tokenId: string;
  tokenSecret: string;
  muxClient?: MuxClientShape;
}): VideoProvider {
  const muxClient =
    input.muxClient ??
    new Mux({
      tokenId: input.tokenId,
      tokenSecret: input.tokenSecret,
    });

  return {
    async createUpload(uploadInput: CreateVideoUploadInput): Promise<CreateVideoUploadResult> {
      const upload = await muxClient.video.uploads!.create({
        cors_origin: "*",
        new_asset_settings: {
          playback_policy: ["signed"],
          passthrough: JSON.stringify({
            organizationId: uploadInput.organizationId,
            courseId: uploadInput.courseId,
            lessonId: uploadInput.lessonId,
            title: uploadInput.title,
          }),
        },
      });

      return {
        uploadUrl: upload.url,
        providerUploadId: upload.id,
      };
    },
    async getPlaybackSource(providerAssetId: string): Promise<VideoPlaybackSource> {
      const asset = await muxClient.video.assets!.retrieve(providerAssetId);
      const playbackId = asset.playback_ids?.[0]?.id;

      if (!playbackId) {
        throw new Error("Mux asset does not have a playback id yet");
      }

      return {
        providerAssetId,
        playbackId,
        playbackUrl: `https://stream.mux.com/${playbackId}.m3u8`,
      };
    },
  };
}

export function verifyMuxWebhookSignature(input: {
  rawBody: string;
  muxSignatureHeader: string | null;
  webhookSecret: string;
  nowSeconds: number;
}): boolean {
  const parsed = parseMuxSignatureHeader(input.muxSignatureHeader);

  if (!parsed || Math.abs(input.nowSeconds - parsed.timestamp) > 300) {
    return false;
  }

  const expected = crypto
    .createHmac("sha256", input.webhookSecret)
    .update(`${parsed.timestamp}.${input.rawBody}`)
    .digest("hex");

  return timingSafeEqualHex(parsed.signature, expected);
}

function parseMuxSignatureHeader(header: string | null): { timestamp: number; signature: string } | null {
  if (!header) {
    return null;
  }

  const parts = Object.fromEntries(
    header.split(",").map((part) => {
      const [key, value] = part.split("=");
      return [key, value];
    }),
  );
  const timestamp = Number(parts.t);
  const signature = parts.v1;

  if (!Number.isFinite(timestamp) || !signature) {
    return null;
  }

  return { timestamp, signature };
}

function timingSafeEqualHex(actual: string, expected: string): boolean {
  const actualBuffer = Buffer.from(actual, "hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  const length = Math.max(actualBuffer.length, expectedBuffer.length);
  const left = Buffer.alloc(length);
  const right = Buffer.alloc(length);
  actualBuffer.copy(left);
  expectedBuffer.copy(right);

  return actualBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(left, right);
}
```

- [ ] **Step 4: Update video lesson creation contract**

In `src/modules/video/video-content-service.ts`, add optional fields to `CreateVideoLessonInput` and `CreateVideoLessonData`:

```ts
providerUploadId?: string | null;
providerAssetId?: string | null;
providerPlaybackId?: string | null;
providerProcessingStatus?: "UPLOAD_CREATED" | "UPLOADED" | "ASSET_PREPARING" | "READY" | "ERRORED";
providerError?: string | null;
```

Change the existing media validation to allow Mux upload creation:

```ts
const isPreMuxUploadLesson =
  data.providerProcessingStatus === "UPLOAD_CREATED" &&
  !data.playbackUrl &&
  !data.providerAssetId &&
  !data.providerUploadId;

if (!isPreMuxUploadLesson && !data.playbackUrl && !data.providerAssetId && !data.providerUploadId) {
  throw new Error("Video lesson requires playback URL, provider asset id, or provider upload id");
}
```

Update repository `createLesson(data)` to pass the new fields through to Prisma. Add a service test that creates a lesson with `providerProcessingStatus: "UPLOAD_CREATED"`, `providerUploadId: null`, and no playback URL, then assert any non-`UPLOAD_CREATED` lesson still requires a playback URL, provider asset id, or provider upload id. Task 10 must persist the real `providerUploadId` immediately after Mux direct-upload creation.

- [ ] **Step 5: Verify and commit**

Run:

```powershell
npm run test -- src/modules/providers/video/mux-video-provider.test.ts src/modules/video/video-content-service.test.ts src/modules/video/prisma-repository.test.ts
```

Expected: provider, service, and repository tests pass.

Commit:

```powershell
git add src/modules/providers/video/video-provider.ts src/modules/providers/video/mux-video-provider.ts src/modules/providers/video/mux-video-provider.test.ts src/modules/video/video-content-service.ts src/modules/video/video-content-service.test.ts src/modules/video/prisma-repository.ts src/modules/video/prisma-repository.test.ts
git commit -m "feat: add mux video upload provider"
```

Expected: commit succeeds.

## Task 4: Add R2 Provider And Tenant Storage Keys

**Files:**
- Create: `src/modules/providers/storage/r2-object-storage-provider.ts`
- Create: `src/modules/providers/storage/r2-object-storage-provider.test.ts`
- Modify: `src/modules/providers/storage/object-storage-provider.ts`
- Create: `src/modules/storage/storage-keys.ts`
- Create: `src/modules/storage/storage-keys.test.ts`

- [ ] **Step 1: Write storage key tests**

Create `src/modules/storage/storage-keys.test.ts`:

```ts
import { Readable } from "node:stream";
import { describe, expect, it } from "vitest";
import {
  buildCertificateKey,
  buildCsvExportKey,
  buildCsvImportKey,
  buildOrganizationLogoKey,
  buildScormContentKey,
  buildScormPackageZipKey,
  buildTranscriptKey,
  normalizeStoragePathSegment,
} from "./storage-keys";

it("builds tenant-scoped keys for every object purpose", () => {
  expect(buildOrganizationLogoKey({ organizationId: "org_1", fileName: "logo.png" })).toBe(
    "org/org_1/branding/logo.png",
  );
  expect(buildTranscriptKey({ organizationId: "org_1", courseId: "course_1", lessonId: "lesson_1", fileName: "en.vtt" })).toBe(
    "org/org_1/courses/course_1/video/lesson_1/transcripts/en.vtt",
  );
  expect(buildCertificateKey({ organizationId: "org_1", certificateId: "cert_1", fileName: "certificate.pdf" })).toBe(
    "org/org_1/certificates/cert_1/certificate.pdf",
  );
  expect(buildScormPackageZipKey({ organizationId: "org_1", courseId: "course_1", packageId: "pkg_1", fileName: "course.zip" })).toBe(
    "org/org_1/courses/course_1/scorm/pkg_1/package/course.zip",
  );
  expect(buildScormContentKey({ contentRootKey: "org/org_1/courses/course_1/scorm/pkg_1/content", relativePath: "index.html" })).toBe(
    "org/org_1/courses/course_1/scorm/pkg_1/content/index.html",
  );
  expect(buildCsvImportKey({ organizationId: "org_1", importId: "import_1", fileName: "users.csv" })).toBe(
    "org/org_1/csv/imports/import_1/users.csv",
  );
  expect(buildCsvExportKey({ organizationId: "org_1", exportId: "export_1", fileName: "progress.csv" })).toBe(
    "org/org_1/csv/exports/export_1/progress.csv",
  );
});

it("rejects traversal and raw slashes in dynamic segments", () => {
  expect(() => normalizeStoragePathSegment("../secret.zip", "file name")).toThrow(/file name/);
  expect(() =>
    buildScormContentKey({
      contentRootKey: "org/org_1/courses/course_1/scorm/pkg_1/content",
      relativePath: "../index.html",
    }),
  ).toThrow(/relative path/);
});
```

Run:

```powershell
npm run test -- src/modules/storage/storage-keys.test.ts
```

Expected: fail because `storage-keys.ts` does not exist.

- [ ] **Step 2: Implement storage keys**

Create `src/modules/storage/storage-keys.ts`:

```ts
export function buildOrganizationLogoKey(input: { organizationId: string; fileName: string }): string {
  return joinKey("org", segment(input.organizationId, "organization id"), "branding", segment(input.fileName, "file name"));
}

export function buildTranscriptKey(input: {
  organizationId: string;
  courseId: string;
  lessonId: string;
  fileName: string;
}): string {
  return joinKey(
    "org",
    segment(input.organizationId, "organization id"),
    "courses",
    segment(input.courseId, "course id"),
    "video",
    segment(input.lessonId, "lesson id"),
    "transcripts",
    segment(input.fileName, "file name"),
  );
}

export function buildCertificateKey(input: { organizationId: string; certificateId: string; fileName: string }): string {
  return joinKey(
    "org",
    segment(input.organizationId, "organization id"),
    "certificates",
    segment(input.certificateId, "certificate id"),
    segment(input.fileName, "file name"),
  );
}

export function buildScormPackageZipKey(input: {
  organizationId: string;
  courseId: string;
  packageId: string;
  fileName: string;
}): string {
  return joinKey(
    "org",
    segment(input.organizationId, "organization id"),
    "courses",
    segment(input.courseId, "course id"),
    "scorm",
    segment(input.packageId, "package id"),
    "package",
    segment(input.fileName, "file name"),
  );
}

export function buildScormContentRootKey(input: { organizationId: string; courseId: string; packageId: string }): string {
  return joinKey(
    "org",
    segment(input.organizationId, "organization id"),
    "courses",
    segment(input.courseId, "course id"),
    "scorm",
    segment(input.packageId, "package id"),
    "content",
  );
}

export function buildScormContentKey(input: { contentRootKey: string; relativePath: string }): string {
  return joinKey(normalizeContentRootKey(input.contentRootKey), normalizeRelativePath(input.relativePath));
}

export function buildCsvImportKey(input: { organizationId: string; importId: string; fileName: string }): string {
  return joinKey(
    "org",
    segment(input.organizationId, "organization id"),
    "csv",
    "imports",
    segment(input.importId, "import id"),
    segment(input.fileName, "file name"),
  );
}

export function buildCsvExportKey(input: { organizationId: string; exportId: string; fileName: string }): string {
  return joinKey(
    "org",
    segment(input.organizationId, "organization id"),
    "csv",
    "exports",
    segment(input.exportId, "export id"),
    segment(input.fileName, "file name"),
  );
}

export function normalizeStoragePathSegment(value: string, label: string): string {
  return segment(value, label);
}

function segment(value: string, label: string): string {
  const normalized = value.trim();

  if (!normalized || normalized.includes("/") || normalized.includes("\\") || normalized === "." || normalized === "..") {
    throw new Error(`Invalid ${label}`);
  }

  return normalized;
}

function normalizeRelativePath(value: string): string {
  const normalized = value.replace(/\\/g, "/").trim();

  if (
    !normalized ||
    normalized.startsWith("/") ||
    /^[A-Za-z]:/.test(normalized) ||
    normalized.split("/").some((part) => !part || part === "." || part === "..")
  ) {
    throw new Error("Invalid relative path");
  }

  return normalized;
}

function normalizeContentRootKey(value: string): string {
  const normalized = value.replace(/\\/g, "/").replace(/\/+$/g, "");

  if (!normalized.startsWith("org/") || normalized.includes("..")) {
    throw new Error("Invalid content root key");
  }

  return normalized;
}

function joinKey(...parts: string[]): string {
  return parts.join("/");
}
```

- [ ] **Step 3: Extend storage provider interface**

Update `src/modules/providers/storage/object-storage-provider.ts`:

```ts
export type CreateSignedWriteUrlInput = {
  key: string;
  contentType: string;
  byteSize: number;
  expiresInSeconds?: number;
};

export type SignedWriteUrl = {
  key: string;
  uploadUrl: string;
  requiredHeaders: Record<string, string>;
};

export type StoredObjectStream = {
  key: string;
  body: NodeJS.ReadableStream;
  contentType: string | null;
  byteSize: number | null;
};

export interface ObjectStorageProvider {
  putObject(input: PutObjectInput): Promise<StoredObject>;
  createSignedWriteUrl(input: CreateSignedWriteUrlInput): Promise<SignedWriteUrl>;
  getObjectStream(input: { key: string }): Promise<StoredObjectStream>;
  getSignedReadUrl(key: string, expiresInSeconds?: number): Promise<string>;
  deleteObject(key: string): Promise<void>;
}
```

- [ ] **Step 4: Write R2 provider tests**

Create `src/modules/providers/storage/r2-object-storage-provider.test.ts`:

```ts
import { Readable } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import { createR2ObjectStorageProvider } from "./r2-object-storage-provider";

it("creates an S3-compatible provider with Cloudflare endpoint", async () => {
  const send = vi.fn().mockResolvedValue({});
  const presign = vi.fn().mockResolvedValue("https://r2.example.com/signed");
  const provider = createR2ObjectStorageProvider({
    accountId: "account",
    accessKeyId: "access",
    secretAccessKey: "secret",
    bucketName: "learnhub-media",
    s3Client: { send },
    presign,
  });

  await expect(
    provider.createSignedWriteUrl({
      key: "org/org_1/branding/logo.png",
      contentType: "image/png",
      byteSize: 1000,
    }),
  ).resolves.toEqual({
    key: "org/org_1/branding/logo.png",
    uploadUrl: "https://r2.example.com/signed",
    requiredHeaders: { "content-type": "image/png" },
  });
});

it("deletes only the exact key passed by a server caller", async () => {
  const send = vi.fn().mockResolvedValue({});
  const provider = createR2ObjectStorageProvider({
    accountId: "account",
    accessKeyId: "access",
    secretAccessKey: "secret",
    bucketName: "learnhub-media",
    s3Client: { send },
    presign: vi.fn(),
  });

  await provider.deleteObject("org/org_1/csv/exports/export_1/progress.csv");

  expect(send).toHaveBeenCalledWith(expect.objectContaining({
    input: expect.objectContaining({
      Bucket: "learnhub-media",
      Key: "org/org_1/csv/exports/export_1/progress.csv",
    }),
  }));
});

it("reads an object stream by explicit server-derived key", async () => {
  const body = Readable.from([Buffer.from("zip-bytes")]);
  const send = vi.fn().mockResolvedValue({
    Body: body,
    ContentType: "application/zip",
    ContentLength: 9,
  });
  const provider = createR2ObjectStorageProvider({
    accountId: "account",
    accessKeyId: "access",
    secretAccessKey: "secret",
    bucketName: "learnhub-media",
    s3Client: { send },
    presign: vi.fn(),
  });

  await expect(provider.getObjectStream({ key: "org/org_1/courses/course_1/scorm/pkg_1/package/course.zip" })).resolves.toEqual({
    key: "org/org_1/courses/course_1/scorm/pkg_1/package/course.zip",
    body,
    contentType: "application/zip",
    byteSize: 9,
  });

  expect(send).toHaveBeenCalledWith(expect.objectContaining({
    input: expect.objectContaining({
      Bucket: "learnhub-media",
      Key: "org/org_1/courses/course_1/scorm/pkg_1/package/course.zip",
    }),
  }));
});
```

Run:

```powershell
npm run test -- src/modules/providers/storage/r2-object-storage-provider.test.ts
```

Expected: fail because the provider file does not exist.

- [ ] **Step 5: Implement R2 provider**

Create `src/modules/providers/storage/r2-object-storage-provider.ts`:

```ts
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import type { Readable } from "node:stream";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type {
  CreateSignedWriteUrlInput,
  ObjectStorageProvider,
  PutObjectInput,
  SignedWriteUrl,
  StoredObject,
} from "./object-storage-provider";

type S3ClientShape = {
  send(command: { input?: unknown }): Promise<unknown>;
};

export function createR2ObjectStorageProvider(input: {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
  s3Client?: S3ClientShape;
  presign?: (client: S3ClientShape, command: unknown, options: { expiresIn: number }) => Promise<string>;
}): ObjectStorageProvider {
  const s3Client =
    input.s3Client ??
    new S3Client({
      region: "auto",
      endpoint: `https://${input.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: input.accessKeyId,
        secretAccessKey: input.secretAccessKey,
      },
    });
  const presign = input.presign ?? getSignedUrl;

  return {
    async putObject(putInput: PutObjectInput): Promise<StoredObject> {
      await s3Client.send(
        new PutObjectCommand({
          Bucket: input.bucketName,
          Key: putInput.key,
          Body: putInput.body,
          ContentType: putInput.contentType,
        }),
      );

      return {
        key: putInput.key,
        url: `r2://${input.bucketName}/${putInput.key}`,
      };
    },
    async createSignedWriteUrl(writeInput: CreateSignedWriteUrlInput): Promise<SignedWriteUrl> {
      const command = new PutObjectCommand({
        Bucket: input.bucketName,
        Key: writeInput.key,
        ContentType: writeInput.contentType,
        ContentLength: writeInput.byteSize,
      });

      return {
        key: writeInput.key,
        uploadUrl: await presign(s3Client, command, { expiresIn: writeInput.expiresInSeconds ?? 900 }),
        requiredHeaders: { "content-type": writeInput.contentType },
      };
    },
    getSignedReadUrl(key: string, expiresInSeconds = 900): Promise<string> {
      return presign(
        s3Client,
        new GetObjectCommand({
          Bucket: input.bucketName,
          Key: key,
        }),
        { expiresIn: expiresInSeconds },
      );
    },
    async getObjectStream(streamInput: { key: string }) {
      const result = await s3Client.send(
        new GetObjectCommand({
          Bucket: input.bucketName,
          Key: streamInput.key,
        }),
      ) as {
        Body?: Readable;
        ContentType?: string;
        ContentLength?: number;
      };

      if (!result.Body) {
        throw new Error("Object body was empty");
      }

      return {
        key: streamInput.key,
        body: result.Body,
        contentType: result.ContentType ?? null,
        byteSize: result.ContentLength ?? null,
      };
    },
    async deleteObject(key: string): Promise<void> {
      await s3Client.send(
        new DeleteObjectCommand({
          Bucket: input.bucketName,
          Key: key,
        }),
      );
    },
  };
}
```

- [ ] **Step 6: Verify and commit**

Run:

```powershell
npm run test -- src/modules/storage/storage-keys.test.ts src/modules/providers/storage/r2-object-storage-provider.test.ts
npx tsc --noEmit --incremental false
```

Expected: storage key and R2 provider tests pass, and TypeScript accepts the `getObjectStream` provider contract used by the extraction route.

Commit:

```powershell
git add src/modules/providers/storage/object-storage-provider.ts src/modules/providers/storage/r2-object-storage-provider.ts src/modules/providers/storage/r2-object-storage-provider.test.ts src/modules/storage/storage-keys.ts src/modules/storage/storage-keys.test.ts
git commit -m "feat: add tenant scoped r2 storage provider"
```

Expected: commit succeeds.

## Task 5: Add Signed Upload Route

**Files:**
- Create: `src/app/api/org/[slug]/storage/upload/route.ts`
- Create: `src/modules/storage/storage-upload-route.test.ts`
- Create: `src/modules/storage/storage-upload-service.ts`
- Create: `src/modules/storage/storage-upload-service.test.ts`
- Modify: `src/modules/storage/storage-keys.ts`
- Modify: `src/modules/storage/storage-keys.test.ts`
- Modify: `src/modules/scorm/prisma-repository.ts`
- Modify: `src/modules/scorm/prisma-repository.test.ts`

- [ ] **Step 1: Write signed upload service tests**

Create `src/modules/storage/storage-upload-service.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { createSignedStorageUpload } from "./storage-upload-service";

it("builds an organization logo key without client ids", async () => {
  const storage = {
    createSignedWriteUrl: vi.fn().mockResolvedValue({
      key: "org/org_1/branding/logo.png",
      uploadUrl: "https://r2.example.com/logo",
      requiredHeaders: { "content-type": "image/png" },
    }),
  };

  await expect(
    createSignedStorageUpload({
      actorId: "user_1",
      organizationId: "org_1",
      request: {
        purpose: "ORG_LOGO",
        fileName: "logo.png",
        contentType: "image/png",
        byteSize: 1000,
      },
      repository: createRepository(),
      storage,
    }),
  ).resolves.toMatchObject({
    key: "org/org_1/branding/logo.png",
    uploadUrl: "https://r2.example.com/logo",
  });
});

it("resolves lesson ownership before signing a transcript upload", async () => {
  const repository = createRepository({
    findVideoLessonBySlug: vi.fn().mockResolvedValue({
      id: "lesson_1",
      courseId: "course_1",
      organizationId: "org_1",
    }),
  });
  const storage = { createSignedWriteUrl: vi.fn().mockResolvedValue({ key: "signed", uploadUrl: "url", requiredHeaders: {} }) };

  await createSignedStorageUpload({
    actorId: "user_1",
    organizationId: "org_1",
    request: {
      purpose: "VIDEO_TRANSCRIPT",
      courseSlug: "safety",
      lessonSlug: "intro",
      fileName: "en.vtt",
      contentType: "text/vtt",
      byteSize: 200,
    },
    repository,
    storage,
  });

  expect(repository.findVideoLessonBySlug).toHaveBeenCalledWith({
    organizationId: "org_1",
    courseSlug: "safety",
    lessonSlug: "intro",
  });
  expect(storage.createSignedWriteUrl).toHaveBeenCalledWith(expect.objectContaining({
    key: "org/org_1/courses/course_1/video/lesson_1/transcripts/en.vtt",
  }));
});

it("creates an initial SCORM package and signs its zip upload", async () => {
  const repository = createRepository({
    findCourseBySlug: vi.fn().mockResolvedValue({
      id: "course_1",
      organizationId: "org_1",
      type: "SCORM_1_2",
    }),
    createPendingScormPackage: vi.fn().mockResolvedValue({
      packageId: "pkg_1",
      storageKey: "org/org_1/courses/course_1/scorm/pkg_1/package/course.zip",
      contentRootKey: "org/org_1/courses/course_1/scorm/pkg_1/content",
    }),
  });
  const storage = {
    createSignedWriteUrl: vi.fn().mockResolvedValue({
      key: "org/org_1/courses/course_1/scorm/pkg_1/package/course.zip",
      uploadUrl: "https://r2.example.com/scorm",
      requiredHeaders: { "content-type": "application/zip" },
    }),
  };

  await expect(
    createSignedStorageUpload({
      actorId: "user_1",
      organizationId: "org_1",
      request: {
        purpose: "SCORM_ZIP",
        courseSlug: "safety",
        fileName: "course.zip",
        contentType: "application/zip",
        byteSize: 1024,
      },
      repository,
      storage,
    }),
  ).resolves.toMatchObject({
    key: "org/org_1/courses/course_1/scorm/pkg_1/package/course.zip",
    scormPackage: {
      packageId: "pkg_1",
      contentRootKey: "org/org_1/courses/course_1/scorm/pkg_1/content",
    },
  });

  expect(repository.createPendingScormPackage).toHaveBeenCalledWith(expect.objectContaining({
    organizationId: "org_1",
    courseId: "course_1",
    originalFileName: "course.zip",
    contentType: "application/zip",
    byteSize: 1024,
    processingStatus: "UPLOAD_PENDING",
    malwareScanStatus: "PENDING",
  }));
});

it("rejects raw keys, tenant ids, prefixes, and unverified record ids", async () => {
  await expect(
    createSignedStorageUpload({
      actorId: "user_1",
      organizationId: "org_1",
      request: {
        purpose: "VIDEO_TRANSCRIPT",
        courseId: "course_1",
        lessonId: "lesson_1",
        key: "org/other/video.vtt",
        fileName: "en.vtt",
        contentType: "text/vtt",
        byteSize: 200,
      } as never,
      repository: createRepository(),
      storage: { createSignedWriteUrl: vi.fn() },
    }),
  ).rejects.toThrow(/raw keys and unverified ids are not accepted/);
});

function createRepository(overrides = {}) {
  return {
    findCourseBySlug: vi.fn().mockResolvedValue(null),
    findVideoLessonBySlug: vi.fn().mockResolvedValue(null),
    findCertificateByVerificationCode: vi.fn().mockResolvedValue(null),
    createPendingCsvImport: vi.fn().mockResolvedValue({ importId: "import_1" }),
    createPendingScormPackage: vi.fn(),
    ...overrides,
  };
}
```

Run:

```powershell
npm run test -- src/modules/storage/storage-upload-service.test.ts
```

Expected: fail because the signed upload service does not exist.

- [ ] **Step 2: Implement signed upload service**

Create `src/modules/storage/storage-upload-service.ts`:

```ts
import type { ObjectStorageProvider, SignedWriteUrl } from "@/modules/providers/storage/object-storage-provider";
import {
  buildCertificateKey,
  buildCsvImportKey,
  buildOrganizationLogoKey,
  buildScormPackageZipKey,
  buildTranscriptKey,
} from "./storage-keys";

export type SignedUploadRequest =
  | { purpose: "ORG_LOGO"; fileName: string; contentType: string; byteSize: number }
  | { purpose: "VIDEO_TRANSCRIPT"; courseSlug: string; lessonSlug: string; fileName: string; contentType: string; byteSize: number }
  | { purpose: "CERTIFICATE"; verificationCode: string; fileName: string; contentType: string; byteSize: number }
  | { purpose: "CSV_IMPORT"; fileName: string; contentType: string; byteSize: number }
  | { purpose: "SCORM_ZIP"; courseSlug: string; fileName: string; contentType: string; byteSize: number };

export type SignedUploadRepository = {
  findCourseBySlug(input: { organizationId: string; courseSlug: string }): Promise<{ id: string; organizationId: string; type: "NATIVE_VIDEO" | "SCORM_1_2" } | null>;
  findVideoLessonBySlug(input: { organizationId: string; courseSlug: string; lessonSlug: string }): Promise<{ id: string; courseId: string; organizationId: string } | null>;
  findCertificateByVerificationCode(input: { organizationId: string; verificationCode: string }): Promise<{ id: string; organizationId: string } | null>;
  createPendingCsvImport(input: { organizationId: string; actorId: string; originalFileName: string; contentType: string; byteSize: number }): Promise<{ importId: string }>;
  createPendingScormPackage(input: {
    organizationId: string;
    courseId: string;
    actorId: string;
    originalFileName: string;
    contentType: string;
    byteSize: number;
    storageKey: string;
    contentRootKey: string;
    processingStatus: "UPLOAD_PENDING";
    malwareScanStatus: "PENDING";
  }): Promise<{ packageId: string; storageKey: string; contentRootKey: string }>;
};

export async function createSignedStorageUpload(input: {
  actorId: string;
  organizationId: string;
  request: SignedUploadRequest;
  repository: SignedUploadRepository;
  storage: Pick<ObjectStorageProvider, "createSignedWriteUrl">;
  maxScormPackageBytes?: number;
}): Promise<SignedWriteUrl & { scormPackage?: { packageId: string; contentRootKey: string } }> {
  rejectRawKeysAndUnverifiedIds(input.request);
  const keyResult = await resolveUploadKey(input);
  const signed = await input.storage.createSignedWriteUrl({
    key: keyResult.key,
    contentType: input.request.contentType,
    byteSize: input.request.byteSize,
  });

  return keyResult.scormPackage ? { ...signed, scormPackage: keyResult.scormPackage } : signed;
}

async function resolveUploadKey(input: {
  actorId: string;
  organizationId: string;
  request: SignedUploadRequest;
  repository: SignedUploadRepository;
  maxScormPackageBytes?: number;
}): Promise<{ key: string; scormPackage?: { packageId: string; contentRootKey: string } }> {
  if (input.request.purpose === "ORG_LOGO") {
    return { key: buildOrganizationLogoKey({ organizationId: input.organizationId, fileName: input.request.fileName }) };
  }

  if (input.request.purpose === "VIDEO_TRANSCRIPT") {
    const lesson = await input.repository.findVideoLessonBySlug({
      organizationId: input.organizationId,
      courseSlug: input.request.courseSlug,
      lessonSlug: input.request.lessonSlug,
    });
    if (!lesson || lesson.organizationId !== input.organizationId) throw new Error("Video lesson was not found");
    return { key: buildTranscriptKey({ organizationId: input.organizationId, courseId: lesson.courseId, lessonId: lesson.id, fileName: input.request.fileName }) };
  }

  if (input.request.purpose === "CERTIFICATE") {
    const certificate = await input.repository.findCertificateByVerificationCode({
      organizationId: input.organizationId,
      verificationCode: input.request.verificationCode,
    });
    if (!certificate || certificate.organizationId !== input.organizationId) throw new Error("Certificate was not found");
    return { key: buildCertificateKey({ organizationId: input.organizationId, certificateId: certificate.id, fileName: input.request.fileName }) };
  }

  if (input.request.purpose === "CSV_IMPORT") {
    const csvImport = await input.repository.createPendingCsvImport({
      organizationId: input.organizationId,
      actorId: input.actorId,
      originalFileName: input.request.fileName,
      contentType: input.request.contentType,
      byteSize: input.request.byteSize,
    });
    return { key: buildCsvImportKey({ organizationId: input.organizationId, importId: csvImport.importId, fileName: input.request.fileName }) };
  }

  const metadata = validateScormZipUploadMetadata({
    originalFileName: input.request.fileName,
    contentType: input.request.contentType,
    byteSize: input.request.byteSize,
    maxPackageBytes: input.maxScormPackageBytes ?? 512 * 1024 * 1024,
  });
  const course = await input.repository.findCourseBySlug({
    organizationId: input.organizationId,
    courseSlug: input.request.courseSlug,
  });

  if (!course || course.organizationId !== input.organizationId || course.type !== "SCORM_1_2") {
    throw new Error("SCORM course was not found");
  }

  const packageId = `pkg_${course.id}_${Date.now()}`;
  const storageKey = buildScormPackageZipKey({
    organizationId: input.organizationId,
    courseId: course.id,
    packageId,
    fileName: metadata.originalFileName,
  });
  const contentRootKey = `org/${input.organizationId}/courses/${course.id}/scorm/${packageId}/content`;
  const scormPackage = await input.repository.createPendingScormPackage({
    organizationId: input.organizationId,
    courseId: course.id,
    actorId: input.actorId,
    originalFileName: metadata.originalFileName,
    contentType: metadata.contentType,
    byteSize: metadata.byteSize,
    storageKey,
    contentRootKey,
    processingStatus: "UPLOAD_PENDING",
    malwareScanStatus: "PENDING",
  });

  return {
    key: scormPackage.storageKey,
    scormPackage: {
      packageId: scormPackage.packageId,
      contentRootKey: scormPackage.contentRootKey,
    },
  };
}

function rejectRawKeysAndUnverifiedIds(request: object): void {
  const forbidden = ["key", "storageKey", "contentRootKey", "organizationId", "courseId", "lessonId", "certificateId", "packageId", "importId", "importHandle", "exportId", "exportHandle"];

  for (const field of forbidden) {
    if (field in request) {
      throw new Error("raw keys and unverified ids are not accepted");
    }
  }
}

function validateScormZipUploadMetadata(input: {
  originalFileName: string;
  contentType: string;
  byteSize: number;
  maxPackageBytes: number;
}) {
  if (!input.originalFileName.toLowerCase().endsWith(".zip")) {
    throw new Error("SCORM package must be a zip file");
  }

  if (!["application/zip", "application/x-zip-compressed", "application/octet-stream"].includes(input.contentType)) {
    throw new Error("SCORM package content type must be zip-compatible");
  }

  if (input.byteSize <= 0 || input.byteSize > input.maxPackageBytes) {
    throw new Error("SCORM package size is outside the configured limit");
  }

  return {
    originalFileName: input.originalFileName,
    contentType: input.contentType,
    byteSize: input.byteSize,
  };
}
```

- [ ] **Step 3: Write route tests**

Create `src/modules/storage/storage-upload-route.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/org/[slug]/storage/upload/route";

vi.mock("@/lib/auth/guards", () => ({
  requireOrganizationUsersAdminBySlug: vi.fn().mockResolvedValue({
    organizationId: "org_1",
    context: { userId: "user_1" },
  }),
}));

vi.mock("@/lib/env", () => ({
  env: {
    R2_ACCOUNT_ID: "account",
    R2_ACCESS_KEY_ID: "access",
    R2_SECRET_ACCESS_KEY: "secret",
    R2_BUCKET_NAME: "learnhub-media",
    SCORM_MAX_PACKAGE_BYTES: 536870912,
  },
}));

it("accepts purpose plus server-resolvable handles", async () => {
  const response = await POST(
    new Request("https://learnhub.example.com/api/org/acme/storage/upload", {
      method: "POST",
      body: JSON.stringify({
        purpose: "ORG_LOGO",
        fileName: "logo.png",
        contentType: "image/png",
        byteSize: 1000,
      }),
    }),
    { params: Promise.resolve({ slug: "acme" }) },
  );

  expect(response.status).toBe(200);
  await expect(response.json()).resolves.toMatchObject({
    key: "org/org_1/branding/logo.png",
    requiredHeaders: { "content-type": "image/png" },
  });
});

it("rejects client-provided raw keys and unverified record ids", async () => {
  const response = await POST(
    new Request("https://learnhub.example.com/api/org/acme/storage/upload", {
      method: "POST",
      body: JSON.stringify({
        purpose: "VIDEO_TRANSCRIPT",
        key: "org/other/branding/logo.png",
        courseId: "course_1",
        lessonId: "lesson_1",
        fileName: "en.vtt",
        contentType: "text/vtt",
        byteSize: 1000,
      }),
    }),
    { params: Promise.resolve({ slug: "acme" }) },
  );

  expect(response.status).toBe(400);
});
```

Run:

```powershell
npm run test -- src/modules/storage/storage-upload-route.test.ts
```

Expected: fail because the route does not exist.

- [ ] **Step 4: Implement route**

Create `src/app/api/org/[slug]/storage/upload/route.ts`:

```ts
import { requireOrganizationUsersAdminBySlug } from "@/lib/auth/guards";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { createR2ObjectStorageProvider } from "@/modules/providers/storage/r2-object-storage-provider";
import { createPrismaStorageUploadRepository } from "@/modules/scorm/prisma-repository";
import { createSignedStorageUpload } from "@/modules/storage/storage-upload-service";
import { z } from "zod";

const uploadRequestSchema = z.object({
  purpose: z.enum(["ORG_LOGO", "VIDEO_TRANSCRIPT", "CERTIFICATE", "CSV_IMPORT", "SCORM_ZIP"]),
  fileName: z.string().min(1),
  contentType: z.string().min(1),
  byteSize: z.number().int().positive().max(512 * 1024 * 1024),
  courseSlug: z.string().optional(),
  lessonSlug: z.string().optional(),
  verificationCode: z.string().optional(),
}).strict();

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
): Promise<Response> {
  const { slug } = await params;
  const { organizationId, context } = await requireOrganizationUsersAdminBySlug(slug);
  const parsed = uploadRequestSchema.safeParse(await request.json());

  if (!parsed.success) {
    return Response.json({ error: "Invalid upload request" }, { status: 400 });
  }

  const provider = createR2ObjectStorageProvider({
    accountId: env.R2_ACCOUNT_ID!,
    accessKeyId: env.R2_ACCESS_KEY_ID!,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY!,
    bucketName: env.R2_BUCKET_NAME!,
  });
  const signed = await createSignedStorageUpload({
    actorId: context.userId,
    organizationId,
    request: parsed.data,
    repository: createPrismaStorageUploadRepository(prisma),
    storage: provider,
    maxScormPackageBytes: env.SCORM_MAX_PACKAGE_BYTES,
  });

  return Response.json(signed);
}
```

- [ ] **Step 5: Add Prisma upload repository methods**

In `src/modules/scorm/prisma-repository.ts`, export `createPrismaStorageUploadRepository(client)` with:

```ts
export function createPrismaStorageUploadRepository(client: PrismaScormClient): SignedUploadRepository {
  return {
    findCourseBySlug(input) {
      return client.course.findFirst({
        where: { organizationId: input.organizationId, slug: input.courseSlug },
        select: { id: true, organizationId: true, type: true },
      });
    },
    findVideoLessonBySlug(input) {
      return client.videoLesson.findFirst({
        where: {
          organizationId: input.organizationId,
          slug: input.lessonSlug,
          course: { slug: input.courseSlug, organizationId: input.organizationId },
        },
        select: { id: true, courseId: true, organizationId: true },
      });
    },
    findCertificateByVerificationCode(input) {
      return client.certificate.findFirst({
        where: { organizationId: input.organizationId, verificationCode: input.verificationCode },
        select: { id: true, organizationId: true },
      });
    },
    async createPendingCsvImport(input) {
      const created = await client.csvImport.create({
        data: {
          organizationId: input.organizationId,
          uploadedByUserId: input.actorId,
          originalFileName: input.originalFileName,
          contentType: input.contentType,
          byteSize: input.byteSize,
          status: "UPLOAD_PENDING",
        },
        select: { id: true },
      });

      return { importId: created.id };
    },
    async createPendingScormPackage(input) {
      const created = await client.scormPackage.create({
        data: {
          organizationId: input.organizationId,
          courseId: input.courseId,
          originalFileName: input.originalFileName,
          contentType: input.contentType,
          byteSize: input.byteSize,
          storageKey: input.storageKey,
          contentRootKey: input.contentRootKey,
          launchPath: "",
          uploadedByUserId: input.actorId,
          active: false,
          processingStatus: input.processingStatus,
          malwareScanStatus: input.malwareScanStatus,
        },
        select: { id: true, storageKey: true, contentRootKey: true },
      });

      return {
        packageId: created.id,
        storageKey: created.storageKey,
        contentRootKey: created.contentRootKey,
      };
    },
  };
}
```

Add tests in `src/modules/scorm/prisma-repository.test.ts` that assert `findCourseBySlug`, `findVideoLessonBySlug`, and `findCertificateByVerificationCode` all include `organizationId` in `where`; `createPendingCsvImport` creates the import id server-side with `status: "UPLOAD_PENDING"`; and `createPendingScormPackage` persists `active: false`, `processingStatus: "UPLOAD_PENDING"`, `malwareScanStatus: "PENDING"`, `storageKey`, and `contentRootKey`.

- [ ] **Step 6: Verify and commit**

Run:

```powershell
npm run test -- src/modules/storage/storage-upload-service.test.ts
npm run test -- src/modules/storage/storage-upload-route.test.ts src/modules/storage/storage-keys.test.ts
npm run test -- src/modules/scorm/prisma-repository.test.ts
npx tsc --noEmit --incremental false
```

Expected: signed upload service, route, storage key, Prisma repository tests pass, and TypeScript accepts the route/service/repository types.

Commit:

```powershell
git add src/app/api/org/[slug]/storage/upload/route.ts src/modules/storage/storage-upload-route.test.ts src/modules/storage/storage-upload-service.ts src/modules/storage/storage-upload-service.test.ts src/modules/storage/storage-keys.ts src/modules/storage/storage-keys.test.ts src/modules/scorm/prisma-repository.ts src/modules/scorm/prisma-repository.test.ts
git commit -m "feat: add tenant scoped signed upload route"
```

Expected: commit succeeds.

## Task 6: Add SCORM Manifest Validation

**Files:**
- Create: `src/modules/scorm/scorm-manifest.ts`
- Create: `src/modules/scorm/scorm-manifest.test.ts`
- Create: `src/modules/scorm/zip-test-helpers.ts`
- Modify: `src/modules/scorm/scorm-package-service.ts`
- Modify: `src/modules/scorm/scorm-package-service.test.ts`

- [ ] **Step 1: Write manifest tests**

Create `src/modules/scorm/scorm-manifest.test.ts`:

```ts
import { Readable } from "node:stream";
import { describe, expect, it } from "vitest";
import { createZipBuffer } from "./zip-test-helpers";
import {
  assertSafeZipEntryPath,
  readScormZipEntries,
  validateScormZipPackage,
  validateScormUploadMetadata,
  validateScormManifestXml,
} from "./scorm-manifest";

it("validates zip content type and configured size", () => {
  expect(() =>
    validateScormUploadMetadata({
      originalFileName: "course.zip",
      contentType: "application/pdf",
      byteSize: 1000,
      maxPackageBytes: 512 * 1024 * 1024,
    }),
  ).toThrow(/zip-compatible/);

  expect(
    validateScormUploadMetadata({
      originalFileName: "course.zip",
      contentType: "application/zip",
      byteSize: 1000,
      maxPackageBytes: 512 * 1024 * 1024,
    }),
  ).toEqual({
    originalFileName: "course.zip",
    contentType: "application/zip",
    byteSize: 1000,
  });
});

it("extracts SCORM 1.2 launch path from imsmanifest xml", () => {
  expect(
    validateScormManifestXml(`
      <manifest identifier="pkg-1" version="1.2">
        <organizations default="org-1">
          <organization identifier="org-1">
            <item identifier="item-1" identifierref="res-1"><title>Safety</title></item>
          </organization>
        </organizations>
        <resources>
          <resource identifier="res-1" type="webcontent" adlcp:scormtype="sco" href="index.html" />
        </resources>
      </manifest>
    `),
  ).toEqual({
    identifier: "pkg-1",
    version: "1.2",
    title: "Safety",
    launchPath: "index.html",
  });
});

it("rejects manifests without a launch file", () => {
  expect(() => validateScormManifestXml("<manifest><resources></resources></manifest>")).toThrow(/launch file/);
});

it("rejects traversal zip entries", () => {
  expect(() => assertSafeZipEntryPath("../index.html")).toThrow(/Unsafe ZIP entry/);
  expect(() => assertSafeZipEntryPath("C:/temp/index.html")).toThrow(/Unsafe ZIP entry/);
  expect(assertSafeZipEntryPath("folder/index.html")).toBe("folder/index.html");
});

it("opens the uploaded zip, parses imsmanifest.xml, enforces SCORM 1.2, and verifies launch file presence", async () => {
  const zip = createZipBuffer({
    "imsmanifest.xml": `
      <manifest identifier="pkg-1" version="1.2">
        <metadata><schema>ADL SCORM</schema><schemaversion>1.2</schemaversion></metadata>
        <organizations><organization><item identifierref="res-1"><title>Safety</title></item></organization></organizations>
        <resources><resource identifier="res-1" type="webcontent" adlcp:scormtype="sco" href="index.html" /></resources>
      </manifest>
    `,
    "index.html": "<html>launch</html>",
  });

  await expect(
    validateScormZipPackage({
      stream: Readable.from([zip]),
      byteSize: zip.byteLength,
      maxPackageBytes: 512 * 1024 * 1024,
    }),
  ).resolves.toMatchObject({
    manifest: {
      identifier: "pkg-1",
      version: "1.2",
      title: "Safety",
      launchPath: "index.html",
    },
    entries: expect.arrayContaining([
      expect.objectContaining({ path: "imsmanifest.xml" }),
      expect.objectContaining({ path: "index.html" }),
    ]),
  });
});

it("rejects zips with missing manifest, non-1.2 manifest, missing launch file, traversal entries, and oversize package", async () => {
  await expect(validateScormZipPackage({
    stream: Readable.from([createZipBuffer({ "index.html": "launch" })]),
    byteSize: 100,
    maxPackageBytes: 512 * 1024 * 1024,
  })).rejects.toThrow(/imsmanifest.xml/);

  await expect(validateScormZipPackage({
    stream: Readable.from([createZipBuffer({
      "imsmanifest.xml": `<manifest><metadata><schemaversion>2004 4th Edition</schemaversion></metadata></manifest>`,
    })]),
    byteSize: 100,
    maxPackageBytes: 512 * 1024 * 1024,
  })).rejects.toThrow(/SCORM 1.2/);

  await expect(validateScormZipPackage({
    stream: Readable.from([createZipBuffer({
      "imsmanifest.xml": `<manifest><metadata><schemaversion>1.2</schemaversion></metadata><resources><resource href="missing.html" /></resources></manifest>`,
    })]),
    byteSize: 100,
    maxPackageBytes: 512 * 1024 * 1024,
  })).rejects.toThrow(/launch file was not found/);

  await expect(validateScormZipPackage({
    stream: Readable.from([createZipBuffer({ "../evil.html": "x" })]),
    byteSize: 100,
    maxPackageBytes: 512 * 1024 * 1024,
  })).rejects.toThrow(/Unsafe ZIP entry/);

  await expect(validateScormZipPackage({
    stream: Readable.from([Buffer.alloc(1)]),
    byteSize: 512 * 1024 * 1024 + 1,
    maxPackageBytes: 512 * 1024 * 1024,
  })).rejects.toThrow(/outside the configured limit/);
});
```

Run:

```powershell
npm run test -- src/modules/scorm/scorm-manifest.test.ts
```

Expected: fail because `scorm-manifest.ts` does not exist.

- [ ] **Step 2: Implement manifest validation**

Create `src/modules/scorm/scorm-manifest.ts`:

```ts
import { Readable } from "node:stream";
import { XMLParser } from "fast-xml-parser";
import yauzl from "yauzl";

const allowedZipContentTypes = new Set([
  "application/zip",
  "application/x-zip-compressed",
  "application/octet-stream",
]);

export type ScormUploadMetadata = {
  originalFileName: string;
  contentType: string;
  byteSize: number;
};

export type ScormManifestValidation = {
  identifier: string | null;
  version: string | null;
  title: string | null;
  launchPath: string;
};

export type ScormZipEntry = {
  path: string;
  contentType: string;
  body: Buffer;
};

export type ScormZipValidation = {
  manifest: ScormManifestValidation;
  entries: ScormZipEntry[];
};

export function validateScormUploadMetadata(input: ScormUploadMetadata & { maxPackageBytes: number }): ScormUploadMetadata {
  const originalFileName = input.originalFileName.trim().replace(/[\\/]/g, "");
  const contentType = input.contentType.trim().toLowerCase();

  if (!originalFileName.toLowerCase().endsWith(".zip")) {
    throw new Error("SCORM package must be a zip file");
  }

  if (!allowedZipContentTypes.has(contentType)) {
    throw new Error("SCORM package content type must be zip-compatible");
  }

  if (!Number.isInteger(input.byteSize) || input.byteSize <= 0 || input.byteSize > input.maxPackageBytes) {
    throw new Error("SCORM package size is outside the configured limit");
  }

  return { originalFileName, contentType, byteSize: input.byteSize };
}

export function validateScormManifestXml(xml: string): ScormManifestValidation {
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "" });
  const manifest = parser.parse(xml).manifest;

  if (!manifest) {
    throw new Error("SCORM manifest file is missing");
  }

  const resources = asArray(manifest.resources?.resource);
  const launchResource = resources.find((resource) => typeof resource.href === "string" && resource.href.trim());
  const launchPath = launchResource ? assertSafeZipEntryPath(launchResource.href) : null;
  const version = String(manifest.metadata?.schemaversion ?? manifest.version ?? "").trim();

  if (version !== "1.2") {
    throw new Error("SCORM package must be SCORM 1.2");
  }

  if (!launchPath) {
    throw new Error("SCORM manifest must declare a launch file");
  }

  return {
    identifier: manifest.identifier ?? null,
    version,
    title: findManifestTitle(manifest),
    launchPath,
  };
}

export async function validateScormZipPackage(input: {
  stream: NodeJS.ReadableStream;
  byteSize: number | null;
  maxPackageBytes: number;
}): Promise<ScormZipValidation> {
  if (input.byteSize !== null && input.byteSize > input.maxPackageBytes) {
    throw new Error("SCORM package size is outside the configured limit");
  }

  const entries = await readScormZipEntries(input.stream, input.maxPackageBytes);
  const manifestEntry = entries.find((entry) => entry.path.toLowerCase() === "imsmanifest.xml");

  if (!manifestEntry) {
    throw new Error("SCORM zip must contain imsmanifest.xml");
  }

  const manifest = validateScormManifestXml(manifestEntry.body.toString("utf8"));
  const hasLaunchFile = entries.some((entry) => entry.path === manifest.launchPath);

  if (!hasLaunchFile) {
    throw new Error("SCORM launch file was not found in the zip");
  }

  return { manifest, entries };
}

export async function readScormZipEntries(stream: NodeJS.ReadableStream, maxPackageBytes: number): Promise<ScormZipEntry[]> {
  const buffer = await readBoundedStream(stream, maxPackageBytes);
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(buffer, { lazyEntries: true }, (openError, zipFile) => {
      if (openError || !zipFile) {
        reject(openError ?? new Error("Could not open SCORM zip"));
        return;
      }

      const entries: ScormZipEntry[] = [];
      zipFile.readEntry();
      zipFile.on("entry", (entry) => {
        if (/\/$/.test(entry.fileName)) {
          zipFile.readEntry();
          return;
        }

        const safePath = assertSafeZipEntryPath(entry.fileName);
        zipFile.openReadStream(entry, (streamError, entryStream) => {
          if (streamError || !entryStream) {
            reject(streamError ?? new Error("Could not read SCORM zip entry"));
            return;
          }

          readBoundedStream(entryStream, maxPackageBytes).then((body) => {
            entries.push({
              path: safePath,
              contentType: contentTypeForPath(safePath),
              body,
            });
            zipFile.readEntry();
          }, reject);
        });
      });
      zipFile.once("end", () => resolve(entries));
      zipFile.once("error", reject);
    });
  });
}

export function assertSafeZipEntryPath(path: string): string {
  const normalized = path.replace(/\\/g, "/").trim();

  if (
    !normalized ||
    normalized.startsWith("/") ||
    /^[A-Za-z]:/.test(normalized) ||
    normalized.split("/").some((part) => !part || part === "." || part === "..")
  ) {
    throw new Error(`Unsafe ZIP entry path: ${path}`);
  }

  return normalized;
}

function findManifestTitle(manifest: Record<string, unknown>): string | null {
  const organizations = manifest.organizations as { organization?: unknown } | undefined;
  const firstOrganization = asArray(organizations?.organization)[0] as { item?: unknown; title?: string } | undefined;
  const firstItem = asArray(firstOrganization?.item)[0] as { title?: string } | undefined;
  return firstItem?.title ?? firstOrganization?.title ?? null;
}

function asArray<T>(value: T | T[] | undefined): T[] {
  if (!value) {
    return [];
  }

  return Array.isArray(value) ? value : [value];
}

async function readBoundedStream(stream: NodeJS.ReadableStream, maxBytes: number): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let total = 0;

  for await (const chunk of stream as Readable) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.byteLength;
    if (total > maxBytes) {
      throw new Error("SCORM package size is outside the configured limit");
    }
    chunks.push(buffer);
  }

  return Buffer.concat(chunks);
}

function contentTypeForPath(path: string): string {
  if (path.endsWith(".html") || path.endsWith(".htm")) return "text/html";
  if (path.endsWith(".js")) return "application/javascript";
  if (path.endsWith(".css")) return "text/css";
  if (path.endsWith(".xml")) return "application/xml";
  return "application/octet-stream";
}
```

Create `src/modules/scorm/zip-test-helpers.ts` with a concrete `createZipBuffer(entries: Record<string, string>): Buffer` helper that writes local file headers, central directory records, CRC32 values, and the end-of-central-directory record. Import this helper in `src/modules/scorm/scorm-manifest.test.ts`. Do not mock `readScormZipEntries`, because this test must prove server-side ZIP opening and entry inspection.

- [ ] **Step 3: Update SCORM package service**

Replace local file/content/size/launch validation in `src/modules/scorm/scorm-package-service.ts` with calls to `validateScormUploadMetadata`. Extend `UploadScormPackageInput`:

```ts
manifestIdentifier?: string | null;
manifestVersion?: string | null;
processingStatus?: "UPLOAD_PENDING" | "UPLOADED" | "VALIDATED" | "EXTRACTION_PENDING";
malwareScanStatus?: "PENDING" | "PASSED" | "FAILED";
maxPackageBytes: number;
```

Use `buildScormPackageZipKey` and `buildScormContentRootKey` instead of inline key strings:

```ts
const storageKey = buildScormPackageZipKey({
  organizationId,
  courseId,
  packageId,
  fileName: metadata.originalFileName,
});
const contentRootKey = buildScormContentRootKey({ organizationId, courseId, packageId });
```

Persist initial package state:

```ts
processingStatus: input.processingStatus ?? "EXTRACTION_PENDING",
malwareScanStatus: input.malwareScanStatus ?? "PENDING",
manifestIdentifier: normalizeNullable(input.manifestIdentifier),
manifestVersion: normalizeNullable(input.manifestVersion),
validationError: null,
extractionError: null,
```

- [ ] **Step 4: Verify and commit**

Run:

```powershell
npm run test -- src/modules/scorm/scorm-manifest.test.ts src/modules/scorm/scorm-package-service.test.ts
```

Expected: manifest and package service tests pass.

Commit:

```powershell
git add src/modules/scorm/scorm-manifest.ts src/modules/scorm/scorm-manifest.test.ts src/modules/scorm/zip-test-helpers.ts src/modules/scorm/scorm-package-service.ts src/modules/scorm/scorm-package-service.test.ts
git commit -m "feat: validate scorm package manifests"
```

Expected: commit succeeds.

## Task 7: Add SCORM Extraction And Malware Scan Jobs

**Files:**
- Create: `src/modules/scorm/scorm-extraction.ts`
- Create: `src/modules/scorm/scorm-extraction.test.ts`
- Create: `src/modules/scorm/scorm-package-jobs.ts`
- Create: `src/modules/scorm/scorm-package-jobs.test.ts`
- Modify: `src/modules/scorm/prisma-repository.ts`
- Modify: `src/modules/scorm/prisma-repository.test.ts`

- [ ] **Step 1: Write extraction tests**

Create `src/modules/scorm/scorm-extraction.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { extractScormPackageEntries, scanScormPackage } from "./scorm-extraction";

it("writes extracted files under contentRootKey", async () => {
  const storage = { putObject: vi.fn().mockResolvedValue({ key: "stored", url: "r2://stored" }) };
  const result = await extractScormPackageEntries({
    contentRootKey: "org/org_1/courses/course_1/scorm/pkg_1/content",
    entries: [
      { path: "index.html", contentType: "text/html", body: Buffer.from("<html></html>") },
      { path: "assets/app.js", contentType: "application/javascript", body: Buffer.from("console.log(1)") },
    ],
    storage,
  });

  expect(result).toEqual({
    fileCount: 2,
    byteSize: 36,
    writtenKeys: [
      "org/org_1/courses/course_1/scorm/pkg_1/content/index.html",
      "org/org_1/courses/course_1/scorm/pkg_1/content/assets/app.js",
    ],
  });
});

it("rejects traversal before object writes", async () => {
  const storage = { putObject: vi.fn() };

  await expect(
    extractScormPackageEntries({
      contentRootKey: "org/org_1/courses/course_1/scorm/pkg_1/content",
      entries: [{ path: "../index.html", contentType: "text/html", body: Buffer.from("x") }],
      storage,
    }),
  ).rejects.toThrow(/Unsafe ZIP entry/);

  expect(storage.putObject).not.toHaveBeenCalled();
});

it("marks pass-through malware scanner as passed", async () => {
  await expect(scanScormPackage({ scanner: "pass-through", storageKey: "org/org_1/course.zip" })).resolves.toEqual({
    status: "PASSED",
    provider: "pass-through",
  });
});
```

Run:

```powershell
npm run test -- src/modules/scorm/scorm-extraction.test.ts
```

Expected: fail because `scorm-extraction.ts` does not exist.

- [ ] **Step 2: Implement extraction helpers**

Create `src/modules/scorm/scorm-extraction.ts`:

```ts
import type { ObjectStorageProvider } from "@/modules/providers/storage/object-storage-provider";
import { buildScormContentKey } from "@/modules/storage/storage-keys";
import { assertSafeZipEntryPath } from "./scorm-manifest";

export type ExtractableScormEntry = {
  path: string;
  contentType: string;
  body: Buffer;
};

export async function extractScormPackageEntries(input: {
  contentRootKey: string;
  entries: ExtractableScormEntry[];
  storage: Pick<ObjectStorageProvider, "putObject">;
}): Promise<{ fileCount: number; byteSize: number; writtenKeys: string[] }> {
  const normalizedEntries = input.entries.map((entry) => ({
    ...entry,
    path: assertSafeZipEntryPath(entry.path),
  }));
  const writtenKeys: string[] = [];
  let byteSize = 0;

  for (const entry of normalizedEntries) {
    const key = buildScormContentKey({
      contentRootKey: input.contentRootKey,
      relativePath: entry.path,
    });
    await input.storage.putObject({
      key,
      contentType: entry.contentType,
      body: entry.body,
    });
    writtenKeys.push(key);
    byteSize += entry.body.byteLength;
  }

  return {
    fileCount: normalizedEntries.length,
    byteSize,
    writtenKeys,
  };
}

export async function scanScormPackage(input: {
  scanner: "pass-through";
  storageKey: string;
}): Promise<{ status: "PASSED" | "FAILED"; provider: string; message?: string }> {
  if (input.scanner === "pass-through") {
    return { status: "PASSED", provider: "pass-through" };
  }

  return { status: "FAILED", provider: input.scanner, message: "Unsupported scanner" };
}
```

- [ ] **Step 3: Write package job tests**

Create `src/modules/scorm/scorm-package-jobs.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { createPrismaScormRepository } from "./prisma-repository";
import { processNextScormExtractionJob } from "./scorm-package-jobs";

function createPrismaMock(overrides: Record<string, unknown>) {
  return {
    scormPackage: {
      findFirst: vi.fn(),
      updateMany: vi.fn(),
      ...((overrides.scormPackage as object | undefined) ?? {}),
    },
  } as never;
}

it("marks package ready after scan passes and extraction writes launch file", async () => {
  const repository = {
    claimNextExtractionPackage: vi.fn().mockResolvedValue({
      id: "pkg_1",
      organizationId: "org_1",
      courseId: "course_1",
      storageKey: "org/org_1/courses/course_1/scorm/pkg_1/package/course.zip",
      contentRootKey: "org/org_1/courses/course_1/scorm/pkg_1/content",
      launchPath: "index.html",
    }),
    markScanPassed: vi.fn(),
    markScanFailed: vi.fn(),
    markExtractionReady: vi.fn(),
    markExtractionFailed: vi.fn(),
  };
  const storage = { putObject: vi.fn().mockResolvedValue({ key: "stored", url: "r2://stored" }) };

  await expect(
    processNextScormExtractionJob({
      repository,
      storage,
      scanner: "pass-through",
      readZipEntries: vi.fn().mockResolvedValue([
        { path: "index.html", contentType: "text/html", body: Buffer.from("launch") },
      ]),
    }),
  ).resolves.toEqual({ processed: 1, ready: 1, failed: 0 });

  expect(repository.markScanPassed).toHaveBeenCalledWith({
    organizationId: "org_1",
    packageId: "pkg_1",
    scanProvider: "pass-through",
  });
  expect(repository.markExtractionReady).toHaveBeenCalledWith({
    organizationId: "org_1",
    packageId: "pkg_1",
    extractedFileCount: 1,
    extractedByteSize: 6,
    launchFileKey: "org/org_1/courses/course_1/scorm/pkg_1/content/index.html",
  });
});

it("marks package failed when launch file is not extracted", async () => {
  const repository = {
    claimNextExtractionPackage: vi.fn().mockResolvedValue({
      id: "pkg_1",
      organizationId: "org_1",
      courseId: "course_1",
      storageKey: "org/org_1/course.zip",
      contentRootKey: "org/org_1/content",
      launchPath: "index.html",
    }),
    markScanPassed: vi.fn(),
    markScanFailed: vi.fn(),
    markExtractionReady: vi.fn(),
    markExtractionFailed: vi.fn(),
  };

  await processNextScormExtractionJob({
    repository,
    storage: { putObject: vi.fn() },
    scanner: "pass-through",
    readZipEntries: vi.fn().mockResolvedValue([
      { path: "other.html", contentType: "text/html", body: Buffer.from("x") },
    ]),
  });

  expect(repository.markExtractionFailed).toHaveBeenCalledWith({
    organizationId: "org_1",
    packageId: "pkg_1",
    error: "SCORM launch file was not extracted",
  });
});

it("rejects invalid extraction transition updates", async () => {
  const repository = createPrismaScormRepository(createPrismaMock({
    scormPackage: {
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
  }));

  await expect(repository.markExtractionReady({
    organizationId: "org_1",
    packageId: "pkg_1",
    extractedFileCount: 1,
    extractedByteSize: 6,
    launchFileKey: "org/org_1/content/index.html",
  })).rejects.toThrow(/Invalid SCORM package extraction transition/);
});

it("updates scan and extraction states with tenant-scoped bounded transitions", async () => {
  const updateMany = vi.fn().mockResolvedValue({ count: 1 });
  const repository = createPrismaScormRepository(createPrismaMock({
    scormPackage: { updateMany },
  }));

  await repository.markScanPassed({
    organizationId: "org_1",
    packageId: "pkg_1",
    scanProvider: "pass-through",
  });
  await repository.markExtractionReady({
    organizationId: "org_1",
    packageId: "pkg_1",
    extractedFileCount: 2,
    extractedByteSize: 128,
    launchFileKey: "org/org_1/content/index.html",
  });

  expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({
    where: {
      organizationId: "org_1",
      id: "pkg_1",
      malwareScanStatus: "PENDING",
      processingStatus: "EXTRACTING",
    },
    data: expect.objectContaining({
      malwareScanStatus: "PASSED",
      scanProvider: "pass-through",
      scanCompletedAt: expect.any(Date),
    }),
  }));
  expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({
    where: {
      organizationId: "org_1",
      id: "pkg_1",
      processingStatus: "EXTRACTING",
      malwareScanStatus: "PASSED",
    },
    data: expect.objectContaining({
      processingStatus: "READY",
      extractedFileCount: 2,
      extractedByteSize: 128,
      launchFileKey: "org/org_1/content/index.html",
      extractionFinishedAt: expect.any(Date),
      extractionError: null,
    }),
  }));
});
```

Run:

```powershell
npm run test -- src/modules/scorm/scorm-package-jobs.test.ts
```

Expected: fail because `scorm-package-jobs.ts` does not exist.

- [ ] **Step 4: Implement package job orchestration**

Create `src/modules/scorm/scorm-package-jobs.ts`:

```ts
import type { ObjectStorageProvider } from "@/modules/providers/storage/object-storage-provider";
import { buildScormContentKey } from "@/modules/storage/storage-keys";
import {
  extractScormPackageEntries,
  scanScormPackage,
  type ExtractableScormEntry,
} from "./scorm-extraction";

export type ScormExtractionPackage = {
  id: string;
  organizationId: string;
  courseId: string;
  storageKey: string;
  contentRootKey: string;
  launchPath: string;
};

export type ScormPackageJobRepository = {
  claimNextExtractionPackage(): Promise<ScormExtractionPackage | null>;
  markScanPassed(input: { organizationId: string; packageId: string; scanProvider: string }): Promise<void>;
  markScanFailed(input: { organizationId: string; packageId: string; scanProvider: string; error: string }): Promise<void>;
  markExtractionReady(input: {
    organizationId: string;
    packageId: string;
    extractedFileCount: number;
    extractedByteSize: number;
    launchFileKey: string;
  }): Promise<void>;
  markExtractionFailed(input: { organizationId: string; packageId: string; error: string }): Promise<void>;
};

export async function processNextScormExtractionJob(input: {
  repository: ScormPackageJobRepository;
  storage: Pick<ObjectStorageProvider, "putObject">;
  scanner: "pass-through";
  readZipEntries(packageStorageKey: string): Promise<ExtractableScormEntry[]>;
}): Promise<{ processed: number; ready: number; failed: number }> {
  const scormPackage = await input.repository.claimNextExtractionPackage();

  if (!scormPackage) {
    return { processed: 0, ready: 0, failed: 0 };
  }

  try {
    const scan = await scanScormPackage({ scanner: input.scanner, storageKey: scormPackage.storageKey });

    if (scan.status === "FAILED") {
      await input.repository.markScanFailed({
        organizationId: scormPackage.organizationId,
        packageId: scormPackage.id,
        scanProvider: scan.provider,
        error: scan.message ?? "SCORM package malware scan failed",
      });
      return { processed: 1, ready: 0, failed: 1 };
    }

    await input.repository.markScanPassed({
      organizationId: scormPackage.organizationId,
      packageId: scormPackage.id,
      scanProvider: scan.provider,
    });

    const extraction = await extractScormPackageEntries({
      contentRootKey: scormPackage.contentRootKey,
      entries: await input.readZipEntries(scormPackage.storageKey),
      storage: input.storage,
    });
    const launchFileKey = buildScormContentKey({
      contentRootKey: scormPackage.contentRootKey,
      relativePath: scormPackage.launchPath,
    });

    if (!extraction.writtenKeys.includes(launchFileKey)) {
      throw new Error("SCORM launch file was not extracted");
    }

    await input.repository.markExtractionReady({
      organizationId: scormPackage.organizationId,
      packageId: scormPackage.id,
      extractedFileCount: extraction.fileCount,
      extractedByteSize: extraction.byteSize,
      launchFileKey,
    });

    return { processed: 1, ready: 1, failed: 0 };
  } catch (error) {
    await input.repository.markExtractionFailed({
      organizationId: scormPackage.organizationId,
      packageId: scormPackage.id,
      error: error instanceof Error ? error.message : "SCORM extraction failed",
    });
    return { processed: 1, ready: 0, failed: 1 };
  }
}
```

- [ ] **Step 5: Extend Prisma repository**

Add methods to `src/modules/scorm/prisma-repository.ts`:

```ts
claimNextExtractionPackage() {
  return activeClient().scormPackage.findFirst({
    where: {
      processingStatus: "EXTRACTION_PENDING",
      malwareScanStatus: "PENDING",
      active: false,
    },
    orderBy: { updatedAt: "asc" },
    select: {
      id: true,
      organizationId: true,
      courseId: true,
      storageKey: true,
      contentRootKey: true,
      launchPath: true,
    },
  }).then(async (candidate) => {
    if (!candidate) return null;
    const claimed = await activeClient().scormPackage.updateMany({
      where: {
        id: candidate.id,
        organizationId: candidate.organizationId,
        processingStatus: "EXTRACTION_PENDING",
        active: false,
      },
      data: {
        processingStatus: "EXTRACTING",
        extractionStartedAt: new Date(),
        extractionError: null,
      },
    });
    return claimed.count === 1 ? candidate : null;
  });
}
```

Add `markScanPassed`, `markScanFailed`, `markExtractionReady`, and `markExtractionFailed` as tenant-scoped bounded `updateMany` calls. Each method must check `result.count === 1` and throw `new Error("Invalid SCORM package extraction transition")` when the current row is not in the expected status.

```ts
async function requireTransition(result: { count: number }): Promise<void> {
  if (result.count !== 1) {
    throw new Error("Invalid SCORM package extraction transition");
  }
}

async markScanPassed(input) {
  await requireTransition(await activeClient().scormPackage.updateMany({
    where: {
      organizationId: input.organizationId,
      id: input.packageId,
      processingStatus: "EXTRACTING",
      malwareScanStatus: "PENDING",
    },
    data: {
      malwareScanStatus: "PASSED",
      scanProvider: input.scanProvider,
      scanCompletedAt: new Date(),
    },
  }));
}

async markScanFailed(input) {
  await requireTransition(await activeClient().scormPackage.updateMany({
    where: {
      organizationId: input.organizationId,
      id: input.packageId,
      processingStatus: "EXTRACTING",
      malwareScanStatus: "PENDING",
    },
    data: {
      malwareScanStatus: "FAILED",
      processingStatus: "FAILED",
      scanProvider: input.scanProvider,
      scanCompletedAt: new Date(),
      extractionError: input.error,
      extractionFinishedAt: new Date(),
    },
  }));
}

async markExtractionReady(input) {
  await requireTransition(await activeClient().scormPackage.updateMany({
    where: {
      organizationId: input.organizationId,
      id: input.packageId,
      processingStatus: "EXTRACTING",
      malwareScanStatus: "PASSED",
    },
    data: {
      processingStatus: "READY",
      extractedFileCount: input.extractedFileCount,
      extractedByteSize: input.extractedByteSize,
      launchFileKey: input.launchFileKey,
      extractionError: null,
      extractionFinishedAt: new Date(),
      active: true,
    },
  }));
}

async markExtractionFailed(input) {
  await requireTransition(await activeClient().scormPackage.updateMany({
    where: {
      organizationId: input.organizationId,
      id: input.packageId,
      processingStatus: { in: ["EXTRACTING", "EXTRACTION_PENDING"] },
    },
    data: {
      processingStatus: "FAILED",
      extractionError: input.error,
      extractionFinishedAt: new Date(),
      active: false,
    },
  }));
}
```

Repository tests must assert the `where` objects include `organizationId`, `id`, and the expected current status, and that the `data` objects set timestamps, error fields, counts/bytes, `launchFileKey`, and `active` exactly as shown.

- [ ] **Step 6: Verify and commit**

Run:

```powershell
npm run test -- src/modules/scorm/scorm-extraction.test.ts src/modules/scorm/scorm-package-jobs.test.ts src/modules/scorm/prisma-repository.test.ts
```

Expected: extraction, job, and repository tests pass.

Commit:

```powershell
git add src/modules/scorm/scorm-extraction.ts src/modules/scorm/scorm-extraction.test.ts src/modules/scorm/scorm-package-jobs.ts src/modules/scorm/scorm-package-jobs.test.ts src/modules/scorm/prisma-repository.ts src/modules/scorm/prisma-repository.test.ts
git commit -m "feat: add scorm extraction jobs"
```

Expected: commit succeeds.

## Task 8: Add Provider And Job Routes

**Files:**
- Create: `src/app/api/providers/mux/webhook/route.ts`
- Create: `src/app/api/jobs/scorm-extraction/route.ts`
- Create: `src/modules/providers/video/mux-webhook-route.test.ts`
- Create: `src/modules/scorm/scorm-extraction-route.test.ts`
- Modify: `src/modules/scorm/zip-test-helpers.ts`
- Modify: `src/modules/providers/storage/object-storage-provider.ts`
- Modify: `src/modules/providers/storage/r2-object-storage-provider.ts`
- Modify: `src/modules/providers/storage/r2-object-storage-provider.test.ts`
- Modify: `src/modules/scorm/scorm-manifest.ts`
- Modify: `src/modules/scorm/scorm-manifest.test.ts`

- [ ] **Step 1: Write Mux webhook route tests**

Create `src/modules/providers/video/mux-webhook-route.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/providers/mux/webhook/route";

vi.mock("@/lib/env", () => ({ env: { MUX_WEBHOOK_SECRET: "secret" } }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    videoLesson: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  },
}));

it("rejects webhook before state mutation when signature is invalid", async () => {
  const response = await POST(
    new Request("https://learnhub.example.com/api/providers/mux/webhook", {
      method: "POST",
      headers: { "mux-signature": "t=1790000000,v1=bad" },
      body: JSON.stringify({ type: "video.asset.ready" }),
    }),
  );

  expect(response.status).toBe(401);
});
```

Run:

```powershell
npm run test -- src/modules/providers/video/mux-webhook-route.test.ts
```

Expected: fail because the route does not exist.

- [ ] **Step 2: Implement Mux webhook route**

Create `src/app/api/providers/mux/webhook/route.ts`:

```ts
import { env } from "@/lib/env";
import { verifyMuxWebhookSignature } from "@/modules/providers/video/mux-video-provider";

export async function POST(request: Request): Promise<Response> {
  const rawBody = await request.text();
  const verified = verifyMuxWebhookSignature({
    rawBody,
    muxSignatureHeader: request.headers.get("mux-signature"),
    webhookSecret: env.MUX_WEBHOOK_SECRET!,
    nowSeconds: Math.floor(Date.now() / 1000),
  });

  if (!verified) {
    return Response.json({ error: "Invalid Mux signature" }, { status: 401 });
  }

  const event = JSON.parse(rawBody) as {
    type: string;
    data?: {
      id?: string;
      upload_id?: string;
      asset_id?: string;
      playback_ids?: { id: string }[];
      errors?: { messages?: string[] };
    };
  };
  const { prisma } = await import("@/lib/prisma");

  if (event.type === "video.upload.asset_created" && event.data?.id && event.data.asset_id) {
    await prisma.videoLesson.updateMany({
      where: { providerUploadId: event.data.id },
      data: {
        providerAssetId: event.data.asset_id,
        providerProcessingStatus: "ASSET_PREPARING",
        providerUpdatedAt: new Date(),
      },
    });
  }

  if (event.type === "video.asset.ready" && event.data?.id) {
    const playbackId = event.data.playback_ids?.[0]?.id ?? null;
    await prisma.videoLesson.updateMany({
      where: { providerAssetId: event.data.id },
      data: {
        providerPlaybackId: playbackId,
        playbackUrl: playbackId ? `https://stream.mux.com/${playbackId}.m3u8` : null,
        providerProcessingStatus: playbackId ? "READY" : "ASSET_PREPARING",
        providerUpdatedAt: new Date(),
      },
    });
  }

  if (event.type === "video.asset.errored" && event.data?.id) {
    await prisma.videoLesson.updateMany({
      where: { providerAssetId: event.data.id },
      data: {
        providerProcessingStatus: "ERRORED",
        providerError: event.data.errors?.messages?.join("; ") ?? "Mux asset processing failed",
        providerUpdatedAt: new Date(),
      },
    });
  }

  return Response.json({ received: true });
}
```

- [ ] **Step 3: Write extraction route tests**

Create `src/modules/scorm/scorm-extraction-route.test.ts`:

```ts
import { Readable } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import {
  POST,
  buildScormZipEntryReader,
  constantTimeEquals,
} from "@/app/api/jobs/scorm-extraction/route";
import { createZipBuffer } from "@/modules/scorm/zip-test-helpers";

vi.mock("@/lib/env", () => ({
  env: {
    MEDIA_JOB_SECRET: "secret",
    SCORM_MALWARE_SCANNER: "pass-through",
    R2_ACCOUNT_ID: "account",
    R2_ACCESS_KEY_ID: "access",
    R2_SECRET_ACCESS_KEY: "secret",
    R2_BUCKET_NAME: "learnhub-media",
  },
}));

it("rejects extraction jobs without bearer secret", async () => {
  const response = await POST(new Request("https://learnhub.example.com/api/jobs/scorm-extraction", { method: "POST" }));
  expect(response.status).toBe(401);
});

it("compares secrets without early length return", () => {
  expect(constantTimeEquals("Bearer secret", "Bearer secret")).toBe(true);
  expect(constantTimeEquals("Bearer wrong", "Bearer secret")).toBe(false);
  expect(constantTimeEquals("Bearer secret-extra", "Bearer secret")).toBe(false);
});

it("builds a zip entry reader from the storage provider stream", async () => {
  const body = Readable.from([createZipBuffer({
    "imsmanifest.xml": `<manifest><metadata><schemaversion>1.2</schemaversion></metadata><resources><resource href="index.html" /></resources></manifest>`,
    "index.html": "launch",
  })]);
  const storage = {
    getObjectStream: vi.fn().mockResolvedValue({
      key: "org/org_1/courses/course_1/scorm/pkg_1/package/course.zip",
      body,
      contentType: "application/zip",
      byteSize: 512,
    }),
  };
  const reader = buildScormZipEntryReader({
    storage,
    maxPackageBytes: 512 * 1024 * 1024,
  });

  await expect(reader("org/org_1/courses/course_1/scorm/pkg_1/package/course.zip")).resolves.toEqual(
    expect.arrayContaining([expect.objectContaining({ path: "index.html" })]),
  );
  expect(storage.getObjectStream).toHaveBeenCalledWith({
    key: "org/org_1/courses/course_1/scorm/pkg_1/package/course.zip",
  });
});
```

Create `src/modules/scorm/zip-test-helpers.ts` with `createZipBuffer(entries: Record<string, string>): Buffer`, and import it in both `src/modules/scorm/scorm-manifest.test.ts` and `src/modules/scorm/scorm-extraction-route.test.ts`.

Run:

```powershell
npm run test -- src/modules/scorm/scorm-extraction-route.test.ts
```

Expected: fail because the route does not exist.

- [ ] **Step 4: Implement extraction route**

Create `src/app/api/jobs/scorm-extraction/route.ts`:

```ts
import { env } from "@/lib/env";
import type { ObjectStorageProvider } from "@/modules/providers/storage/object-storage-provider";
import { createR2ObjectStorageProvider } from "@/modules/providers/storage/r2-object-storage-provider";
import { createPrismaScormRepository } from "@/modules/scorm/prisma-repository";
import type { ExtractableScormEntry } from "@/modules/scorm/scorm-extraction";
import { readScormZipEntries } from "@/modules/scorm/scorm-manifest";
import { processNextScormExtractionJob } from "@/modules/scorm/scorm-package-jobs";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  if (!authorized(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limit = readLimit(request);
  const { prisma } = await import("@/lib/prisma");
  const repository = createPrismaScormRepository(prisma);
  const storage = createR2ObjectStorageProvider({
    accountId: env.R2_ACCOUNT_ID!,
    accessKeyId: env.R2_ACCESS_KEY_ID!,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY!,
    bucketName: env.R2_BUCKET_NAME!,
  });
  const readZipEntries = buildScormZipEntryReader({
    storage,
    maxPackageBytes: env.SCORM_MAX_PACKAGE_BYTES,
  });
  let processed = 0;
  let ready = 0;
  let failed = 0;

  for (let index = 0; index < limit; index += 1) {
    const result = await processNextScormExtractionJob({
      repository,
      storage,
      scanner: env.SCORM_MALWARE_SCANNER,
      readZipEntries,
    });
    processed += result.processed;
    ready += result.ready;
    failed += result.failed;

    if (result.processed === 0) {
      break;
    }
  }

  return Response.json({ limit, processed, ready, failed });
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

function authorized(request: Request): boolean {
  return Boolean(env.MEDIA_JOB_SECRET && constantTimeEquals(request.headers.get("authorization") ?? "", `Bearer ${env.MEDIA_JOB_SECRET}`));
}

function readLimit(request: Request): number {
  const parsed = Number.parseInt(new URL(request.url).searchParams.get("limit") ?? "1", 10);
  return Number.isFinite(parsed) ? Math.max(1, Math.min(parsed, 10)) : 1;
}

export function buildScormZipEntryReader(input: {
  storage: Pick<ObjectStorageProvider, "getObjectStream">;
  maxPackageBytes: number;
}): (packageStorageKey: string) => Promise<ExtractableScormEntry[]> {
  return async (packageStorageKey: string) => {
    const source = await input.storage.getObjectStream({ key: packageStorageKey });
    return readScormZipEntries(source.body, input.maxPackageBytes);
  };
}
```

`getObjectStream` is added in Task 4 and must be present before this route is implemented. `readScormZipEntries` is defined in Task 6, uses `yauzl` over the bounded R2 stream, rejects directory entries, passes each entry name through `assertSafeZipEntryPath`, and returns `ExtractableScormEntry[]`. Buffered reads stay within `SCORM_MAX_PACKAGE_BYTES` so package size remains bounded by env validation.

- [ ] **Step 5: Verify and commit**

Run:

```powershell
npm run test -- src/modules/providers/video/mux-webhook-route.test.ts src/modules/scorm/scorm-extraction-route.test.ts src/modules/providers/video/mux-video-provider.test.ts src/modules/scorm/scorm-package-jobs.test.ts
npm run test -- src/modules/providers/storage/r2-object-storage-provider.test.ts src/modules/scorm/scorm-manifest.test.ts
npx tsc --noEmit --incremental false
```

Expected: route, provider, storage stream, ZIP reader, and job tests pass; TypeScript compiles the extraction route with no out-of-scope `storage` reference.

Commit:

```powershell
git add src/app/api/providers/mux/webhook/route.ts src/app/api/jobs/scorm-extraction/route.ts src/modules/providers/video/mux-webhook-route.test.ts src/modules/scorm/scorm-extraction-route.test.ts src/modules/providers/storage/object-storage-provider.ts src/modules/providers/storage/r2-object-storage-provider.ts src/modules/providers/storage/r2-object-storage-provider.test.ts src/modules/scorm/scorm-manifest.ts src/modules/scorm/scorm-manifest.test.ts src/modules/scorm/zip-test-helpers.ts
git commit -m "feat: add media provider job routes"
```

Expected: commit succeeds.

## Task 9: Block Learner Launch Until Media Is Ready

**Files:**
- Modify: `src/modules/video/video-runtime.ts`
- Modify: `src/modules/video/video-runtime.test.ts`
- Modify: `src/modules/video/prisma-repository.ts`
- Modify: `src/modules/scorm/scorm-runtime.ts`
- Modify: `src/modules/scorm/scorm-runtime.test.ts`
- Modify: `src/app/api/org/[slug]/assignments/[assignmentId]/scorm/launch/route.ts`

- [ ] **Step 1: Add video runtime tests**

Add to `src/modules/video/video-runtime.test.ts`:

```ts
it("does not expose playback url when mux asset is not ready", async () => {
  const repository = createVideoRuntimeRepository({
    lessons: [
      {
        id: "lesson_1",
        moduleId: null,
        title: "Intro",
        slug: "intro",
        sortOrder: 0,
        durationSeconds: 60,
        required: true,
        playbackUrl: "https://stream.mux.com/playback.m3u8",
        providerAssetId: "asset_1",
        providerProcessingStatus: "ASSET_PREPARING",
        chapters: [],
        transcriptCues: [],
      },
    ],
  });

  const launch = await launchVideoRuntime({ organizationId: "org_1", assignmentId: "assignment_1" }, repository);

  expect(launch.currentLesson.playbackUrl).toBeNull();
  expect(launch.currentLesson.mediaStatus).toBe("ASSET_PREPARING");
});
```

Run:

```powershell
npm run test -- src/modules/video/video-runtime.test.ts
```

Expected: fail because `mediaStatus` is not exposed and playback is not filtered.

- [ ] **Step 2: Update video runtime view**

Extend `VideoRuntimeLesson`:

```ts
providerProcessingStatus: "UPLOAD_CREATED" | "UPLOADED" | "ASSET_PREPARING" | "READY" | "ERRORED";
providerError: string | null;
```

Extend `VideoRuntimeLessonView`:

```ts
mediaStatus: VideoRuntimeLesson["providerProcessingStatus"];
mediaError: string | null;
```

In `buildLessonViews`, return:

```ts
const isReady = lesson.providerProcessingStatus === "READY";

return {
  ...lesson,
  playbackUrl: isReady ? lesson.playbackUrl : null,
  mediaStatus: lesson.providerProcessingStatus,
  mediaError: lesson.providerError,
  chapters: [...lesson.chapters].sort((left, right) => left.sortOrder - right.sortOrder),
  transcriptCues: [...lesson.transcriptCues].sort((left, right) => left.startSecond - right.startSecond),
  progress: existingProgressForLesson(assignment.videoProgress, lesson.id),
};
```

Update `src/modules/video/prisma-repository.ts` lesson selects to include `providerProcessingStatus` and `providerError`.

- [ ] **Step 3: Add SCORM launch blocking tests**

Add to `src/modules/scorm/scorm-runtime.test.ts`:

```ts
it("blocks launch until extraction is ready and malware scan passed", async () => {
  const repository = createScormRuntimeRepository({
    package: {
      id: "pkg_1",
      launchPath: "index.html",
      storageKey: "org/org_1/course.zip",
      contentRootKey: "org/org_1/content",
      manifestTitle: "Safety",
      processingStatus: "EXTRACTION_PENDING",
      malwareScanStatus: "PENDING",
    },
  });

  await expect(
    launchScormRegistration(
      { organizationId: "org_1", assignmentId: "assignment_1", occurredAt: new Date("2026-06-13T12:00:00.000Z") },
      repository,
    ),
  ).rejects.toThrow(/SCORM package is not ready/);
});
```

Run:

```powershell
npm run test -- src/modules/scorm/scorm-runtime.test.ts
```

Expected: fail because runtime package readiness is not checked.

- [ ] **Step 4: Implement SCORM readiness check**

Extend `ScormRuntimePackage`:

```ts
processingStatus: "UPLOAD_PENDING" | "UPLOADED" | "VALIDATED" | "EXTRACTION_PENDING" | "EXTRACTING" | "READY" | "FAILED";
malwareScanStatus: "PENDING" | "PASSED" | "FAILED";
extractionError: string | null;
validationError: string | null;
```

Change `requirePackage`:

```ts
function requirePackage(assignment: ScormRuntimeAssignment): ScormRuntimePackage {
  const scormPackage = assignment.course.scormPackage;

  if (!scormPackage) {
    throw new Error("SCORM package was not found");
  }

  if (scormPackage.processingStatus !== "READY" || scormPackage.malwareScanStatus !== "PASSED") {
    throw new Error("SCORM package is not ready for launch");
  }

  return scormPackage;
}
```

Update repository package select and mapping to include readiness fields.

- [ ] **Step 5: Keep launch route response deterministic**

In `src/app/api/org/[slug]/assignments/[assignmentId]/scorm/launch/route.ts`, keep `RuntimeRouteError` handling unchanged. For ordinary `Error`, preserve the existing `400` response with the runtime message. Add a test in `src/modules/runtime/scorm-route-handlers.test.ts` asserting that "SCORM package is not ready for launch" returns status `400` and JSON `{ error: "SCORM package is not ready for launch" }`.

- [ ] **Step 6: Verify and commit**

Run:

```powershell
npm run test -- src/modules/video/video-runtime.test.ts src/modules/video/prisma-repository.test.ts src/modules/scorm/scorm-runtime.test.ts src/modules/scorm/prisma-repository.test.ts src/modules/runtime/scorm-route-handlers.test.ts
```

Expected: video readiness, SCORM readiness, repository, and route tests pass.

Commit:

```powershell
git add src/modules/video/video-runtime.ts src/modules/video/video-runtime.test.ts src/modules/video/prisma-repository.ts src/modules/video/prisma-repository.test.ts src/modules/scorm/scorm-runtime.ts src/modules/scorm/scorm-runtime.test.ts src/modules/scorm/prisma-repository.ts src/modules/scorm/prisma-repository.test.ts src/app/api/org/[slug]/assignments/[assignmentId]/scorm/launch/route.ts src/modules/runtime/scorm-route-handlers.test.ts
git commit -m "feat: block media launch until ready"
```

Expected: commit succeeds.

## Task 10: Update Admin Media Pages

**Files:**
- Modify: `src/app/org/[slug]/admin/courses/[courseSlug]/content/page.tsx`
- Modify: `src/app/org/[slug]/admin/courses/[courseSlug]/scorm/page.tsx`
- Create: `src/app/api/org/[slug]/courses/[courseSlug]/scorm/packages/[packageId]/validate/route.ts`
- Modify: `src/modules/video/prisma-repository.ts`
- Modify: `src/modules/video/prisma-repository.test.ts`
- Modify: `src/modules/scorm/prisma-repository.ts`
- Modify: `src/modules/scorm/prisma-repository.test.ts`
- Create: `src/modules/video/admin-content-page.test.tsx`
- Create: `src/modules/scorm/admin-scorm-page.test.tsx`
- Create: `src/modules/scorm/scorm-validate-route.test.ts`

- [ ] **Step 1: Add admin video page test**

Create `src/modules/video/admin-content-page.test.tsx`:

```tsx
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { VideoLessonStatusTable } from "@/app/org/[slug]/admin/courses/[courseSlug]/content/page";

it("renders Mux processing and ready states", () => {
  const html = renderToStaticMarkup(
    <VideoLessonStatusTable
      lessons={[
        {
          id: "lesson_1",
          title: "Intro",
          providerProcessingStatus: "ASSET_PREPARING",
          providerError: null,
          playbackUrl: null,
        },
        {
          id: "lesson_2",
          title: "Ready",
          providerProcessingStatus: "READY",
          providerError: null,
          playbackUrl: "https://stream.mux.com/playback.m3u8",
        },
      ]}
    />,
  );

  expect(html).toContain("ASSET_PREPARING");
  expect(html).toContain("READY");
});
```

Run:

```powershell
npm run test -- src/modules/video/admin-content-page.test.tsx
```

Expected: fail because `VideoLessonStatusTable` is not exported.

- [ ] **Step 2: Update content page with one server action**

In `src/app/org/[slug]/admin/courses/[courseSlug]/content/page.tsx`, keep the auth call to `requireOrganizationUsersAdminBySlug(slug)`. Add exactly one server action named `createMuxUploadAction(formData: FormData)`. The form posts to that server action, and the action:

1. Resolves `{ slug, courseSlug }` to `organizationId` and `courseId` server-side.
2. Creates the `VideoLesson` first with `providerProcessingStatus: "UPLOAD_CREATED"` and no `playbackUrl`.
3. Calls `createMuxVideoProvider(...).createUpload({ organizationId, courseId, lessonId, title })`.
4. Updates the lesson with `providerUploadId`.
5. Returns the Mux direct upload URL as `?uploadUrl=<encoded-url>&lessonId=<lesson-id>` through `redirect()`.

Use this server action name in tests and page forms:

```tsx
async function createMuxUploadAction(formData: FormData) {
  "use server";
  const { organizationId, context } = await requireOrganizationUsersAdminBySlug(String(formData.get("tenantSlug")));
  const course = await loadAdminCourseBySlug({
    organizationId,
    courseSlug: String(formData.get("courseSlug")),
  });
  const lesson = await createVideoLesson({
    organizationId,
    courseId: course.id,
    actorId: context.userId,
    title: String(formData.get("title")),
    slug: String(formData.get("lessonSlug")),
    sortOrder: Number(formData.get("sortOrder") ?? 0),
    durationSeconds: Number(formData.get("durationSeconds") ?? 1),
    providerUploadId: null,
    providerProcessingStatus: "UPLOAD_CREATED",
  }, createPrismaVideoRepository(prisma));
  const upload = await createMuxVideoProvider({
    tokenId: env.MUX_TOKEN_ID!,
    tokenSecret: env.MUX_TOKEN_SECRET!,
  }).createUpload({
    organizationId,
    courseId: course.id,
    lessonId: lesson.id,
    title: String(formData.get("title")),
  });

  await updateVideoLessonMuxUpload({
    organizationId,
    lessonId: lesson.id,
    providerUploadId: upload.providerUploadId,
  });
  redirect(`/org/${formData.get("tenantSlug")}/admin/courses/${formData.get("courseSlug")}/content?lessonId=${lesson.id}&uploadUrl=${encodeURIComponent(upload.uploadUrl)}`);
}
```

Add `updateVideoLessonMuxUpload` to `src/modules/video/prisma-repository.ts` before wiring the page. It must update by `organizationId + lessonId + providerProcessingStatus: "UPLOAD_CREATED" + providerUploadId: null`, set the real `providerUploadId`, and throw `new Error("Invalid video upload transition")` when `updateMany.count !== 1`. Add `src/modules/video/prisma-repository.test.ts` coverage for the successful transition and the duplicate/stale transition failure.

Export this table component from the same file:

```tsx
export function VideoLessonStatusTable({ lessons }: { lessons: {
  id: string;
  title: string;
  providerProcessingStatus: string;
  providerError: string | null;
  playbackUrl: string | null;
}[] }) {
  return (
    <table className="w-full border-collapse text-left text-sm">
      <thead className="bg-slate-50 text-slate-600">
        <tr>
          <th className="px-4 py-3 font-medium">Lesson</th>
          <th className="px-4 py-3 font-medium">Media status</th>
          <th className="px-4 py-3 font-medium">Playback</th>
          <th className="px-4 py-3 font-medium">Provider error</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-200">
        {lessons.map((lesson) => (
          <tr key={lesson.id}>
            <td className="px-4 py-3 text-slate-950">{lesson.title}</td>
            <td className="px-4 py-3 text-slate-700">{lesson.providerProcessingStatus}</td>
            <td className="px-4 py-3 text-slate-700">{lesson.playbackUrl ? "Ready" : "Not playable"}</td>
            <td className="px-4 py-3 text-slate-700">{lesson.providerError ?? "None"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

The page reads `searchParams.uploadUrl` and shows that direct upload URL in a readonly `<input aria-label="Mux direct upload URL">`. Do not render disabled media controls after this task.

- [ ] **Step 3: Add admin SCORM page test**

Create `src/modules/scorm/admin-scorm-page.test.tsx`:

```tsx
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ScormPackageStatusPanel } from "@/app/org/[slug]/admin/courses/[courseSlug]/scorm/page";

it("renders extraction and malware scan states", () => {
  const html = renderToStaticMarkup(
    <ScormPackageStatusPanel
      scormPackage={{
        originalFileName: "course.zip",
        processingStatus: "EXTRACTION_PENDING",
        malwareScanStatus: "PENDING",
        launchPath: "index.html",
        extractedFileCount: 0,
        extractedByteSize: 0n,
        validationError: null,
        extractionError: null,
      }}
    />,
  );

  expect(html).toContain("EXTRACTION_PENDING");
  expect(html).toContain("PENDING");
  expect(html).toContain("0 bytes");
  expect(html).toContain("Learner launch is blocked until extraction is ready and malware scan passes.");
});
```

Run:

```powershell
npm run test -- src/modules/scorm/admin-scorm-page.test.tsx
```

Expected: fail because `ScormPackageStatusPanel` is not exported.

- [ ] **Step 4: Add SCORM validate route**

Create `src/modules/scorm/scorm-validate-route.test.ts`:

```ts
import { Readable } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/org/[slug]/courses/[courseSlug]/scorm/packages/[packageId]/validate/route";
import { createZipBuffer } from "@/modules/scorm/zip-test-helpers";

const markPackageValidated = vi.fn();
const markPackageValidationFailed = vi.fn();
let zipEntries: Record<string, string> = {
  "imsmanifest.xml": `
    <manifest identifier="pkg-1" version="1.2">
      <metadata><schema>ADL SCORM</schema><schemaversion>1.2</schemaversion></metadata>
      <organizations><organization><item identifierref="res-1"><title>Safety</title></item></organization></organizations>
      <resources><resource identifier="res-1" type="webcontent" adlcp:scormtype="sco" href="index.html" /></resources>
    </manifest>
  `,
  "index.html": "<html>launch</html>",
};

vi.mock("@/lib/auth/guards", () => ({
  requireOrganizationUsersAdminBySlug: vi.fn().mockResolvedValue({ organizationId: "org_1" }),
}));

vi.mock("@/lib/env", () => ({
  env: {
    R2_ACCOUNT_ID: "account",
    R2_ACCESS_KEY_ID: "access",
    R2_SECRET_ACCESS_KEY: "secret",
    R2_BUCKET_NAME: "learnhub-media",
    SCORM_MAX_PACKAGE_BYTES: 536870912,
  },
}));

vi.mock("@/modules/providers/storage/r2-object-storage-provider", () => ({
  createR2ObjectStorageProvider: vi.fn(() => ({
    getObjectStream: vi.fn(async () => {
      const zip = createZipBuffer(zipEntries);
      return { key: "pkg.zip", body: Readable.from([zip]), contentType: "application/zip", byteSize: zip.byteLength };
    }),
  })),
}));

vi.mock("@/modules/scorm/prisma-repository", () => ({
  createPrismaScormRepository: vi.fn(() => ({
    findPackageForAdminValidation: vi.fn(async ({ packageId }) => ({
      id: packageId,
      organizationId: "org_1",
      storageKey: "org/org_1/courses/course_1/scorm/pkg_1/package/course.zip",
    })),
    markPackageValidated,
    markPackageValidationFailed,
  })),
}));

it("validates uploaded zip from R2 and moves package to extraction pending", async () => {
  const response = await POST(
    new Request("https://learnhub.example.com/api/org/acme/courses/safety/scorm/packages/pkg_1/validate", {
      method: "POST",
    }),
    { params: Promise.resolve({ slug: "acme", courseSlug: "safety", packageId: "pkg_1" }) },
  );

  expect(response.status).toBe(200);
  await expect(response.json()).resolves.toMatchObject({
    packageId: "pkg_1",
    processingStatus: "EXTRACTION_PENDING",
  });
});

it("persists validation failure for admin visibility", async () => {
  zipEntries = { "index.html": "launch" };

  const response = await POST(
    new Request("https://learnhub.example.com/api/org/acme/courses/safety/scorm/packages/pkg_bad/validate", {
      method: "POST",
    }),
    { params: Promise.resolve({ slug: "acme", courseSlug: "safety", packageId: "pkg_bad" }) },
  );

  expect(response.status).toBe(400);
  await expect(response.json()).resolves.toMatchObject({
    packageId: "pkg_bad",
    processingStatus: "FAILED",
    error: expect.stringMatching(/SCORM/i),
  });
  expect(markPackageValidationFailed).toHaveBeenCalledWith(expect.objectContaining({
    organizationId: "org_1",
    packageId: "pkg_bad",
  }));
});
```

Create `src/app/api/org/[slug]/courses/[courseSlug]/scorm/packages/[packageId]/validate/route.ts`:

```ts
import { requireOrganizationUsersAdminBySlug } from "@/lib/auth/guards";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { createR2ObjectStorageProvider } from "@/modules/providers/storage/r2-object-storage-provider";
import { createPrismaScormRepository } from "@/modules/scorm/prisma-repository";
import { validateScormZipPackage } from "@/modules/scorm/scorm-manifest";

export async function POST(_request: Request, { params }: { params: Promise<{ slug: string; courseSlug: string; packageId: string }> }) {
  const { slug, courseSlug, packageId } = await params;
  const { organizationId } = await requireOrganizationUsersAdminBySlug(slug);
  const repository = createPrismaScormRepository(prisma);
  const scormPackage = await repository.findPackageForAdminValidation({ organizationId, courseSlug, packageId });

  if (!scormPackage) {
    return Response.json({ error: "SCORM package was not found" }, { status: 404 });
  }

  const storage = createR2ObjectStorageProvider({
    accountId: env.R2_ACCOUNT_ID!,
    accessKeyId: env.R2_ACCESS_KEY_ID!,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY!,
    bucketName: env.R2_BUCKET_NAME!,
  });
  try {
    const source = await storage.getObjectStream({ key: scormPackage.storageKey });
    const validation = await validateScormZipPackage({
      stream: source.body,
      byteSize: source.byteSize,
      maxPackageBytes: env.SCORM_MAX_PACKAGE_BYTES,
    });
    await repository.markPackageValidated({
      organizationId,
      packageId,
      manifestIdentifier: validation.manifest.identifier,
      manifestVersion: validation.manifest.version,
      manifestTitle: validation.manifest.title,
      launchPath: validation.manifest.launchPath,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "SCORM package validation failed";
    await repository.markPackageValidationFailed({
      organizationId,
      packageId,
      error: message,
    });
    return Response.json({ packageId, processingStatus: "FAILED", error: message }, { status: 400 });
  }

  return Response.json({ packageId, processingStatus: "EXTRACTION_PENDING" });
}
```

`findPackageForAdminValidation` must filter by `organizationId`, `course.slug`, `packageId`, and `processingStatus: "UPLOAD_PENDING"`. `markPackageValidated` must update by `organizationId + packageId + processingStatus: "UPLOAD_PENDING"` and set `processingStatus: "EXTRACTION_PENDING"`, `validationError: null`, `launchPath`, manifest fields, and `active: false`. `markPackageValidationFailed` must update by `organizationId + packageId + processingStatus: "UPLOAD_PENDING"` and set `processingStatus: "FAILED"`, `validationError`, `active: false`, and `extractionError: null`. `claimNextExtractionPackage` must claim `EXTRACTION_PENDING` packages while `active: false`; extraction readiness is what later makes the package eligible for activation. Add Prisma repository tests for both success and failure transitions, including the admin-visible `validationError`.

- [ ] **Step 5: Update SCORM page with one route-driven upload flow**

In `src/app/org/[slug]/admin/courses/[courseSlug]/scorm/page.tsx`, keep tenant admin authorization. Replace disabled blocks with a client form component named `ScormZipUploadForm` rendered by this page. The form has exactly this flow:

1. Browser submits `{ purpose: "SCORM_ZIP", courseSlug, fileName, contentType, byteSize }` to `POST /api/org/${slug}/storage/upload`.
2. Browser uploads the selected file bytes to the returned `uploadUrl` with the returned `requiredHeaders`.
3. Browser calls `POST /api/org/${slug}/courses/${courseSlug}/scorm/packages/${packageId}/validate`.
4. The page refreshes and shows the package state panel.

Do not parse manifest XML in the browser and do not ask the admin for manifest metadata or launch path. The server-side validate route opens the R2 ZIP, finds `imsmanifest.xml`, enforces SCORM 1.2, and verifies the launch file exists before marking the package `EXTRACTION_PENDING`.

Export:

```tsx
export function ScormPackageStatusPanel({ scormPackage }: { scormPackage: {
  originalFileName: string;
  processingStatus: string;
  malwareScanStatus: string;
  launchPath: string;
  extractedFileCount: number;
  extractedByteSize: bigint;
  validationError: string | null;
  extractionError: string | null;
} | null }) {
  if (!scormPackage) {
    return <p className="text-sm text-slate-600">No SCORM package has been uploaded for this course.</p>;
  }

  const ready = scormPackage.processingStatus === "READY" && scormPackage.malwareScanStatus === "PASSED";

  return (
    <section className="rounded-md border border-slate-200 p-4">
      <h2 className="text-lg font-semibold text-slate-950">{scormPackage.originalFileName}</h2>
      <dl className="mt-4 grid gap-3 sm:grid-cols-2">
        <div><dt className="text-xs uppercase text-slate-500">Extraction</dt><dd className="text-sm text-slate-900">{scormPackage.processingStatus}</dd></div>
        <div><dt className="text-xs uppercase text-slate-500">Malware scan</dt><dd className="text-sm text-slate-900">{scormPackage.malwareScanStatus}</dd></div>
        <div><dt className="text-xs uppercase text-slate-500">Launch path</dt><dd className="text-sm text-slate-900">{scormPackage.launchPath}</dd></div>
        <div><dt className="text-xs uppercase text-slate-500">Extracted files</dt><dd className="text-sm text-slate-900">{scormPackage.extractedFileCount}</dd></div>
        <div><dt className="text-xs uppercase text-slate-500">Extracted size</dt><dd className="text-sm text-slate-900">{scormPackage.extractedByteSize.toLocaleString()} bytes</dd></div>
      </dl>
      {!ready ? (
        <p className="mt-4 text-sm text-amber-700">Learner launch is blocked until extraction is ready and malware scan passes.</p>
      ) : (
        <p className="mt-4 text-sm text-emerald-700">Learner launch is available.</p>
      )}
      {scormPackage.validationError ? <p className="mt-3 text-sm text-red-700">{scormPackage.validationError}</p> : null}
      {scormPackage.extractionError ? <p className="mt-3 text-sm text-red-700">{scormPackage.extractionError}</p> : null}
    </section>
  );
}
```

- [ ] **Step 6: Verify and commit**

Run:

```powershell
npm run test -- src/modules/video/admin-content-page.test.tsx src/modules/scorm/admin-scorm-page.test.tsx
npm run test -- src/modules/scorm/scorm-validate-route.test.ts
npm run build
```

Expected: page tests, SCORM validate route tests, and Next build pass.

Commit:

```powershell
git add src/app/org/[slug]/admin/courses/[courseSlug]/content/page.tsx src/app/org/[slug]/admin/courses/[courseSlug]/scorm/page.tsx src/app/api/org/[slug]/courses/[courseSlug]/scorm/packages/[packageId]/validate/route.ts src/modules/video/prisma-repository.ts src/modules/video/prisma-repository.test.ts src/modules/scorm/prisma-repository.ts src/modules/scorm/prisma-repository.test.ts src/modules/video/admin-content-page.test.tsx src/modules/scorm/admin-scorm-page.test.tsx src/modules/scorm/scorm-validate-route.test.ts
git commit -m "feat: show production media operation status"
```

Expected: commit succeeds.

## Task 11: Storage Delete And Tenant-Safety Review

**Files:**
- Modify: `src/modules/providers/storage/r2-object-storage-provider.test.ts`
- Modify: `src/modules/storage/storage-keys.test.ts`
- Modify: `src/modules/scorm/scorm-package-jobs.test.ts`
- Modify: `src/modules/scorm/prisma-repository.test.ts`

- [ ] **Step 1: Add tenant-safety assertions**

Add these assertions to focused tests:

```ts
it("does not expose a helper that accepts tenant prefixes from callers", () => {
  expect(() => normalizeStoragePathSegment("org/other", "organization id")).toThrow(/organization id/);
});
```

Add repository assertions that `markExtractionReady`, `markExtractionFailed`, `markScanPassed`, and `markScanFailed` all use bounded `updateMany` calls whose `where` includes `organizationId`, `id`, and the expected current processing or scan status, not `id` alone.

Add provider assertion:

```ts
it("does not build delete keys from request-like tenant input", async () => {
  const send = vi.fn().mockResolvedValue({});
  const provider = createR2ObjectStorageProvider({
    accountId: "account",
    accessKeyId: "access",
    secretAccessKey: "secret",
    bucketName: "learnhub-media",
    s3Client: { send },
    presign: vi.fn(),
  });

  await provider.deleteObject(buildCsvExportKey({
    organizationId: "org_1",
    exportId: "export_1",
    fileName: "progress.csv",
  }));

  expect(send).toHaveBeenCalledWith(expect.objectContaining({
    input: expect.objectContaining({ Key: "org/org_1/csv/exports/export_1/progress.csv" }),
  }));
});
```

Run:

```powershell
npm run test -- src/modules/storage/storage-keys.test.ts src/modules/providers/storage/r2-object-storage-provider.test.ts src/modules/scorm/prisma-repository.test.ts
```

Expected: tests pass after tenant-scoped repository updates from earlier tasks.

- [ ] **Step 2: Manual code review checklist**

Inspect the changed files and confirm:

- No route accepts `organizationId`, `contentRootKey`, `storageKey`, or raw object key from browser input.
- `src/app/api/org/[slug]/storage/upload/route.ts` uses `organizationId` from `requireOrganizationUsersAdminBySlug(slug)`.
- Mux upload metadata is informational only; webhook updates target stored `providerUploadId` or `providerAssetId`.
- R2 deletes receive exact keys from server-side records or key builders.
- SCORM extraction validates all ZIP entry names before first `putObject`.
- SCORM launch blocks unless `processingStatus === "READY"` and `malwareScanStatus === "PASSED"`.
- Prisma queries that mutate SCORM package state include `organizationId`.

- [ ] **Step 3: Commit**

```powershell
git add src/modules/providers/storage/r2-object-storage-provider.test.ts src/modules/storage/storage-keys.test.ts src/modules/scorm/scorm-package-jobs.test.ts src/modules/scorm/prisma-repository.test.ts
git commit -m "test: lock media tenant safety rules"
```

Expected: commit succeeds.

## Task 12: Final Verification

**Files:**
- All files changed by Tasks 1-11.

- [ ] **Step 1: Run focused tests**

```powershell
npm run test -- src/lib/env.test.ts
npm run test -- src/modules/providers/video/mux-video-provider.test.ts src/modules/providers/video/mux-webhook-route.test.ts
npm run test -- src/modules/providers/storage/r2-object-storage-provider.test.ts src/modules/storage/storage-keys.test.ts src/modules/storage/storage-upload-route.test.ts
npm run test -- src/modules/scorm/scorm-manifest.test.ts src/modules/scorm/scorm-extraction.test.ts src/modules/scorm/scorm-package-jobs.test.ts
npm run test -- src/modules/scorm/scorm-package-service.test.ts src/modules/scorm/scorm-runtime.test.ts src/modules/scorm/prisma-repository.test.ts src/modules/scorm/scorm-extraction-route.test.ts src/modules/scorm/admin-scorm-page.test.tsx
npm run test -- src/modules/video/video-content-service.test.ts src/modules/video/video-runtime.test.ts src/modules/video/prisma-repository.test.ts src/modules/video/admin-content-page.test.tsx
npm run test -- src/modules/runtime/scorm-route-handlers.test.ts
```

Expected: every focused command exits `0`.

- [ ] **Step 2: Run repository gates sequentially**

```powershell
npm run test
npm run lint
npx prisma validate
npm run prisma:generate
npx tsc --noEmit --incremental false
npm run build
```

Expected: all commands exit `0`.

- [ ] **Step 3: Manual acceptance review**

Confirm each item is true in the final diff:

- Mux direct upload creation includes tenant and course metadata.
- Mux webhook verifies signature before mutation.
- Video lessons expose playback only when Mux processing status is `READY`.
- R2 signed read/write URLs are built from tenant-scoped keys.
- Logos, transcripts, certificates, SCORM zips, extracted SCORM files, CSV imports, and CSV exports have key builders and tests.
- SCORM upload validates zip type, size, manifest, launch path, and launch file presence.
- Extraction writes under `contentRootKey` and records `launchFileKey`.
- Admin SCORM page shows extraction and scan state.
- Learner launch blocks until extraction is ready and scan passed.
- ZIP traversal entries are rejected before object writes.
- Malware scan status persists `PENDING`, `PASSED`, or `FAILED`.
- Storage delete operations use explicit keys and never infer tenant from user input.

## Self-Review

- Spec coverage: Mux direct upload metadata, signature-verified webhooks, ready-only video playback, R2 signed URLs, tenant-scoped keys for all required object types, SCORM zip validation, manifest launch validation, extraction under `contentRootKey`, admin status visibility, learner launch blocking, traversal rejection, malware scan state, and explicit delete rules are covered by Tasks 1-12.
- Forbidden term scan: the plan avoids deferred-work markers and vague catch-all instructions; each implementation step includes concrete files, commands, expected outcomes, and representative code.
- Type consistency: `VideoProviderProcessingStatus`, `ScormPackageProcessingStatus`, `MalwareScanStatus`, storage-key function names, Mux provider input names, and SCORM job repository method names are used consistently across schema, providers, services, routes, tests, and page components.
