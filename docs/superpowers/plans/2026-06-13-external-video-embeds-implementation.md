# External Video Embeds Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a deferred next-phase path for YouTube, Vimeo, and external video links without changing the current Mux/native-video and SCORM priorities.

**Architecture:** Keep Mux/native upload as the high-confidence LMS path and model external media as a separate video lesson source mode. Store normalized provider metadata rather than raw embed HTML, render provider-specific learner players through a small adapter layer, and label external-provider progress as best-effort unless the player API reports time reliably.

**Tech Stack:** Next.js App Router, React client components, TypeScript, Prisma 7, PostgreSQL, Vitest, existing auth guards, existing video runtime/progress modules, YouTube IFrame Player API, Vimeo Player SDK.

---

## Phase Status

This plan is intentionally deferred. Do not implement it in the active knowledge-checks, tenant-operations, or production-media hardening lanes.

Start this plan only after the current media baseline is stable:

- Mux/native upload flow is merged and verified.
- Learner native video runtime is verified with progress commits.
- SCORM 1.2 upload/extraction/runtime work remains separate from this plan.
- Existing gates pass before creating a new branch.

Recommended future worktree:

```powershell
git worktree add .worktrees/external-video-embeds -b feature/external-video-embeds main
```

## Scope Boundary

This plan adds external video source support for native-video courses.

In scope:

- YouTube video URL parsing and safe embed URL generation.
- Vimeo video URL parsing and safe embed URL generation.
- Generic external link lessons that open in a new tab and use manual completion.
- Admin lesson source selection: Mux/native upload, direct URL, YouTube, Vimeo, or external link.
- Learner player rendering for provider embeds.
- Best-effort provider progress commits.
- Admin warnings for certificate/compliance courses when external sources are used.
- Reporting metadata that identifies tracking confidence.

Out of scope:

- Raw arbitrary iframe HTML.
- Public search/import from YouTube or Vimeo APIs.
- Downloading videos from third-party providers.
- Re-hosting external videos in R2 or Mux.
- Provider account synchronization.
- DRM, paid video entitlement sync, or private provider library browsing.
- SCORM 2004, cmi5, and xAPI.

## Product Rules

LearnHub should treat content source and tracking confidence separately:

| Source | Admin use case | Tracking mode | Completion confidence |
| --- | --- | --- | --- |
| Mux/native upload | Compliance, certificates, internal training | Native time tracking | High |
| Direct URL | Trusted customer CDN or local demo media | Native HTML video events | Medium/high |
| YouTube | Public or unlisted reference-style learning | Provider player events when available | Medium |
| Vimeo | Customer-hosted video libraries | Provider player events when available | Medium |
| External link | Reference material outside LearnHub | Manual confirmation or link visit | Low |

Rules:

- Mux/native upload remains the default option on new video lessons.
- YouTube and Vimeo embeds are allowed only from validated provider URLs.
- Raw `<iframe>` input is rejected.
- External links are never auto-completed by simply rendering the lesson.
- Certificate-eligible courses may use external videos, but the admin UI must show a warning that tracking is best-effort.
- Reports must expose the source type and tracking mode so admins can distinguish audited completions from best-effort completions.

## Current Baseline

Current code already has these useful anchors:

- `VideoLesson` has `providerAssetId`, `providerUploadId`, `providerPlaybackId`, `providerStatus`, `providerError`, and `playbackUrl`.
- `src/modules/providers/video/mux-video-provider.ts` handles Mux upload and webhook behavior.
- `src/modules/video/video-content-service.ts` creates video lessons and requires either `playbackUrl` or `providerAssetId`.
- `src/modules/video/video-runtime.ts` launches native-video assignments and records progress through `recordLearningEvent`.
- `src/app/org/[slug]/learn/[courseSlug]/video-player.tsx` currently renders an HTML `<video>` when `playbackUrl` exists.

This plan extends that path; it does not replace it.

## File Structure

Create or modify these files:

- Modify: `prisma/schema.prisma` - add source type and tracking mode enums plus external provider fields to `VideoLesson`.
- Create: `prisma/migrations/20260613090000_external_video_embeds/migration.sql` - migration for new enum values, columns, indexes, and safe defaults.
- Create: `src/modules/video/external-video-source.ts` - pure URL parsing, provider detection, embed URL generation, tracking mode selection, and compliance warning rules.
- Create: `src/modules/video/external-video-source.test.ts` - tests for YouTube, Vimeo, external link, malformed URL, raw iframe rejection, and tracking confidence.
- Modify: `src/modules/video/video-content-service.ts` - accept a source type and normalized external source metadata when creating lessons.
- Modify: `src/modules/video/video-content-service.test.ts` - tests for source validation and audit behavior.
- Modify: `src/modules/video/server-actions.ts` - parse admin form source fields and pass normalized input into the domain service.
- Modify: `src/modules/video/server-actions.test.ts` - FormData parsing tests for each source type.
- Modify: `src/modules/video/prisma-repository.ts` - persist and read new source metadata.
- Modify: `src/modules/video/prisma-repository.test.ts` - query-shape tests for writes and runtime reads.
- Modify: `src/modules/video/video-runtime.ts` - include source type, embed URL, external URL, tracking mode, and tracking confidence in learner launch payloads.
- Modify: `src/modules/video/video-runtime.test.ts` - launch and progress behavior tests for provider embeds and link-only lessons.
- Modify: `src/app/org/[slug]/admin/courses/[courseSlug]/content/page.tsx` - replace free-form playback fields with source-aware admin controls.
- Modify: `src/app/org/[slug]/learn/[courseSlug]/video-player.tsx` - render HTML video, YouTube iframe, Vimeo iframe, or external-link completion UI based on source type.
- Create: `src/app/org/[slug]/learn/[courseSlug]/external-video-player.test.tsx` - client behavior tests for provider message handling and manual completion.
- Modify: `src/modules/reports/progress-report.ts` - expose media source and tracking mode in report rows.
- Modify: `src/modules/reports/prisma-repository.ts` - select source metadata for progress reporting.
- Modify: `docs/superpowers/notes/2026-06-11-live-vs-placeholder-capabilities.md` - document the difference between high-confidence native video and best-effort external embeds after implementation.

## Data Model

Add the following enums and fields:

```prisma
enum VideoLessonSourceType {
  MUX
  DIRECT_URL
  YOUTUBE
  VIMEO
  EXTERNAL_LINK
}

enum VideoTrackingMode {
  NATIVE_TIME
  PROVIDER_TIME
  MANUAL_CONFIRMATION
  LINK_VISIT
}

model VideoLesson {
  sourceType       VideoLessonSourceType @default(DIRECT_URL)
  trackingMode     VideoTrackingMode     @default(NATIVE_TIME)
  externalUrl      String?
  externalVideoId  String?
  embedUrl         String?
  embedOrigin      String?
}
```

Migration defaults:

- Existing lessons with `providerAssetId` and no `playbackUrl` become `MUX`.
- Existing lessons with `playbackUrl` become `DIRECT_URL`.
- Existing lessons with neither value should not exist because current creation rejects them; the migration may still default them to `DIRECT_URL` to keep Prisma generation deterministic.

## Task 1: Schema And Migration

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260613090000_external_video_embeds/migration.sql`

- [ ] **Step 1: Write schema expectations**

Run:

```powershell
rg "VideoLessonSourceType|VideoTrackingMode|sourceType|trackingMode|externalVideoId|embedUrl" prisma/schema.prisma
```

Expected before change: no matches.

- [ ] **Step 2: Add Prisma schema fields**

Add the enums and fields from the Data Model section to `prisma/schema.prisma`.

- [ ] **Step 3: Add SQL migration**

Create the migration with this shape:

```sql
CREATE TYPE "VideoLessonSourceType" AS ENUM ('MUX', 'DIRECT_URL', 'YOUTUBE', 'VIMEO', 'EXTERNAL_LINK');
CREATE TYPE "VideoTrackingMode" AS ENUM ('NATIVE_TIME', 'PROVIDER_TIME', 'MANUAL_CONFIRMATION', 'LINK_VISIT');

ALTER TABLE "VideoLesson"
  ADD COLUMN "sourceType" "VideoLessonSourceType" NOT NULL DEFAULT 'DIRECT_URL',
  ADD COLUMN "trackingMode" "VideoTrackingMode" NOT NULL DEFAULT 'NATIVE_TIME',
  ADD COLUMN "externalUrl" TEXT,
  ADD COLUMN "externalVideoId" TEXT,
  ADD COLUMN "embedUrl" TEXT,
  ADD COLUMN "embedOrigin" TEXT;

UPDATE "VideoLesson"
SET "sourceType" = 'MUX',
    "trackingMode" = 'NATIVE_TIME'
WHERE "providerAssetId" IS NOT NULL
  AND "playbackUrl" IS NULL;

CREATE INDEX "VideoLesson_organizationId_sourceType_idx"
  ON "VideoLesson"("organizationId", "sourceType");

CREATE INDEX "VideoLesson_organizationId_externalVideoId_idx"
  ON "VideoLesson"("organizationId", "externalVideoId");
```

- [ ] **Step 4: Validate Prisma**

Run:

```powershell
npx prisma validate
npm run prisma:generate
```

Expected: both commands pass.

- [ ] **Step 5: Commit schema work**

```powershell
git add prisma/schema.prisma prisma/migrations/20260613090000_external_video_embeds/migration.sql
git commit -m "feat: model external video lesson sources"
```

## Task 2: External Video Source Domain Rules

**Files:**
- Create: `src/modules/video/external-video-source.ts`
- Create: `src/modules/video/external-video-source.test.ts`

- [ ] **Step 1: Write failing parser tests**

Create `src/modules/video/external-video-source.test.ts`:

```ts
import {
  normalizeVideoLessonSource,
  shouldWarnForBestEffortTracking,
} from "./external-video-source";

describe("normalizeVideoLessonSource", () => {
  it("normalizes YouTube watch and short URLs", () => {
    expect(normalizeVideoLessonSource({ sourceType: "YOUTUBE", url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" })).toMatchObject({
      sourceType: "YOUTUBE",
      externalVideoId: "dQw4w9WgXcQ",
      embedUrl: "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
      trackingMode: "PROVIDER_TIME",
    });

    expect(normalizeVideoLessonSource({ sourceType: "YOUTUBE", url: "https://youtu.be/dQw4w9WgXcQ" }).externalVideoId).toBe("dQw4w9WgXcQ");
  });

  it("normalizes Vimeo URLs", () => {
    expect(normalizeVideoLessonSource({ sourceType: "VIMEO", url: "https://vimeo.com/123456789" })).toMatchObject({
      sourceType: "VIMEO",
      externalVideoId: "123456789",
      embedUrl: "https://player.vimeo.com/video/123456789",
      trackingMode: "PROVIDER_TIME",
    });
  });

  it("rejects raw iframe HTML", () => {
    expect(() => normalizeVideoLessonSource({ sourceType: "YOUTUBE", url: "<iframe src=\"https://www.youtube.com/embed/dQw4w9WgXcQ\"></iframe>" })).toThrow(
      "Paste a video URL instead of embed HTML",
    );
  });

  it("keeps external links as manual completion sources", () => {
    expect(normalizeVideoLessonSource({ sourceType: "EXTERNAL_LINK", url: "https://example.com/training" })).toMatchObject({
      sourceType: "EXTERNAL_LINK",
      trackingMode: "MANUAL_CONFIRMATION",
      embedUrl: null,
    });
  });
});

describe("shouldWarnForBestEffortTracking", () => {
  it("warns for provider and link tracking in certificate courses", () => {
    expect(shouldWarnForBestEffortTracking({ certificateEligible: true, trackingMode: "PROVIDER_TIME" })).toBe(true);
    expect(shouldWarnForBestEffortTracking({ certificateEligible: true, trackingMode: "MANUAL_CONFIRMATION" })).toBe(true);
    expect(shouldWarnForBestEffortTracking({ certificateEligible: true, trackingMode: "NATIVE_TIME" })).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

```powershell
npm run test -- src/modules/video/external-video-source.test.ts
```

Expected: fail because `external-video-source.ts` does not exist.

- [ ] **Step 3: Implement parser**

Create `src/modules/video/external-video-source.ts`:

```ts
export type VideoLessonSourceType = "MUX" | "DIRECT_URL" | "YOUTUBE" | "VIMEO" | "EXTERNAL_LINK";
export type VideoTrackingMode = "NATIVE_TIME" | "PROVIDER_TIME" | "MANUAL_CONFIRMATION" | "LINK_VISIT";

export type NormalizeVideoLessonSourceInput = {
  sourceType: VideoLessonSourceType;
  url?: string | null;
  providerAssetId?: string | null;
};

export type NormalizedVideoLessonSource = {
  sourceType: VideoLessonSourceType;
  trackingMode: VideoTrackingMode;
  playbackUrl: string | null;
  providerAssetId: string | null;
  externalUrl: string | null;
  externalVideoId: string | null;
  embedUrl: string | null;
  embedOrigin: string | null;
};

export function normalizeVideoLessonSource(input: NormalizeVideoLessonSourceInput): NormalizedVideoLessonSource {
  const url = normalizeOptionalUrl(input.url);
  const providerAssetId = normalizeNullable(input.providerAssetId);

  if (input.sourceType === "MUX") {
    if (!providerAssetId) {
      throw new Error("Mux lessons require a provider asset id or direct upload flow");
    }

    return base({ sourceType: "MUX", trackingMode: "NATIVE_TIME", providerAssetId });
  }

  if (input.sourceType === "DIRECT_URL") {
    if (!url) {
      throw new Error("Direct URL lessons require a playback URL");
    }

    return { ...base({ sourceType: "DIRECT_URL", trackingMode: "NATIVE_TIME" }), playbackUrl: url.href };
  }

  if (input.sourceType === "YOUTUBE") {
    const videoId = parseYouTubeVideoId(requiredUrl(url, "YouTube lessons require a YouTube URL"));

    return {
      ...base({ sourceType: "YOUTUBE", trackingMode: "PROVIDER_TIME" }),
      externalUrl: url.href,
      externalVideoId: videoId,
      embedUrl: `https://www.youtube-nocookie.com/embed/${videoId}`,
      embedOrigin: "https://www.youtube-nocookie.com",
    };
  }

  if (input.sourceType === "VIMEO") {
    const videoId = parseVimeoVideoId(requiredUrl(url, "Vimeo lessons require a Vimeo URL"));

    return {
      ...base({ sourceType: "VIMEO", trackingMode: "PROVIDER_TIME" }),
      externalUrl: url.href,
      externalVideoId: videoId,
      embedUrl: `https://player.vimeo.com/video/${videoId}`,
      embedOrigin: "https://player.vimeo.com",
    };
  }

  if (!url) {
    throw new Error("External link lessons require a URL");
  }

  return {
    ...base({ sourceType: "EXTERNAL_LINK", trackingMode: "MANUAL_CONFIRMATION" }),
    externalUrl: url.href,
  };
}

export function shouldWarnForBestEffortTracking(input: {
  certificateEligible: boolean;
  trackingMode: VideoTrackingMode;
}): boolean {
  return input.certificateEligible && input.trackingMode !== "NATIVE_TIME";
}

function base(input: {
  sourceType: VideoLessonSourceType;
  trackingMode: VideoTrackingMode;
  providerAssetId?: string | null;
}): NormalizedVideoLessonSource {
  return {
    sourceType: input.sourceType,
    trackingMode: input.trackingMode,
    playbackUrl: null,
    providerAssetId: input.providerAssetId ?? null,
    externalUrl: null,
    externalVideoId: null,
    embedUrl: null,
    embedOrigin: null,
  };
}

function normalizeOptionalUrl(value: string | null | undefined): URL | null {
  const normalized = normalizeNullable(value);

  if (!normalized) {
    return null;
  }

  if (normalized.includes("<iframe")) {
    throw new Error("Paste a video URL instead of embed HTML");
  }

  let url: URL;

  try {
    url = new URL(normalized);
  } catch {
    throw new Error("Video source URL is invalid");
  }

  if (url.protocol !== "https:") {
    throw new Error("Video source URL must use HTTPS");
  }

  return url;
}

function requiredUrl(value: URL | null, message: string): URL {
  if (!value) {
    throw new Error(message);
  }

  return value;
}

function parseYouTubeVideoId(url: URL): string {
  if (url.hostname === "youtu.be") {
    return requireProviderId(url.pathname.slice(1), "YouTube video id is invalid");
  }

  if (url.hostname === "www.youtube.com" || url.hostname === "youtube.com" || url.hostname === "m.youtube.com") {
    if (url.pathname === "/watch") {
      return requireProviderId(url.searchParams.get("v"), "YouTube video id is invalid");
    }

    if (url.pathname.startsWith("/embed/") || url.pathname.startsWith("/shorts/")) {
      return requireProviderId(url.pathname.split("/")[2], "YouTube video id is invalid");
    }
  }

  throw new Error("YouTube URL must be a youtube.com or youtu.be video URL");
}

function parseVimeoVideoId(url: URL): string {
  if (url.hostname !== "vimeo.com" && url.hostname !== "www.vimeo.com" && url.hostname !== "player.vimeo.com") {
    throw new Error("Vimeo URL must be a vimeo.com video URL");
  }

  const segment = url.pathname.split("/").filter(Boolean).pop();

  return requireProviderId(segment, "Vimeo video id is invalid");
}

function requireProviderId(value: string | null | undefined, message: string): string {
  const normalized = normalizeNullable(value);

  if (!normalized || !/^[A-Za-z0-9_-]+$/.test(normalized)) {
    throw new Error(message);
  }

  return normalized;
}

function normalizeNullable(value: string | null | undefined): string | null {
  const normalized = value?.trim() ?? "";

  return normalized || null;
}
```

- [ ] **Step 4: Verify tests pass**

```powershell
npm run test -- src/modules/video/external-video-source.test.ts
```

Expected: pass.

- [ ] **Step 5: Commit domain rules**

```powershell
git add src/modules/video/external-video-source.ts src/modules/video/external-video-source.test.ts
git commit -m "feat: add external video source normalization"
```

## Task 3: Lesson Authoring Integration

**Files:**
- Modify: `src/modules/video/video-content-service.ts`
- Modify: `src/modules/video/video-content-service.test.ts`
- Modify: `src/modules/video/server-actions.ts`
- Modify: `src/modules/video/server-actions.test.ts`
- Modify: `src/modules/video/prisma-repository.ts`
- Modify: `src/modules/video/prisma-repository.test.ts`

- [ ] **Step 1: Add failing service tests**

Add tests proving:

```ts
await expect(
  createVideoLesson(
    {
      ...validCreateLessonInput,
      sourceType: "YOUTUBE",
      playbackUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      providerAssetId: null,
    },
    repository,
  ),
).resolves.toEqual({ id: "lesson_1", slug: "lesson-one" });

expect(repository.lessons[0]).toMatchObject({
  sourceType: "YOUTUBE",
  trackingMode: "PROVIDER_TIME",
  externalVideoId: "dQw4w9WgXcQ",
  embedUrl: "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
});
```

Add a rejection test:

```ts
await expect(
  createVideoLesson(
    {
      ...validCreateLessonInput,
      sourceType: "YOUTUBE",
      playbackUrl: "<iframe></iframe>",
      providerAssetId: null,
    },
    repository,
  ),
).rejects.toThrow("Paste a video URL instead of embed HTML");
```

- [ ] **Step 2: Run focused tests to verify failure**

```powershell
npm run test -- src/modules/video/video-content-service.test.ts src/modules/video/server-actions.test.ts src/modules/video/prisma-repository.test.ts
```

Expected: fail because the new source fields are not wired.

- [ ] **Step 3: Extend content service types**

Add these fields to `CreateVideoLessonInput` and `CreateVideoLessonData`:

```ts
sourceType?: VideoLessonSourceType;
trackingMode: VideoTrackingMode;
externalUrl: string | null;
externalVideoId: string | null;
embedUrl: string | null;
embedOrigin: string | null;
```

Use `normalizeVideoLessonSource` before repository writes:

```ts
const source = normalizeVideoLessonSource({
  sourceType: input.sourceType ?? (input.providerAssetId ? "MUX" : "DIRECT_URL"),
  url: input.playbackUrl,
  providerAssetId: input.providerAssetId,
});
```

Keep this validation:

```ts
if (source.sourceType === "EXTERNAL_LINK" && input.required) {
  throw new Error("Required lessons cannot use external link-only completion");
}
```

- [ ] **Step 4: Extend server actions**

Parse `sourceType`, `playbackUrl`, and `providerAssetId` from the existing form. Pass the raw URL as `playbackUrl`; the domain service normalizes it.

Expected accepted source values:

```ts
const sourceTypes = new Set(["MUX", "DIRECT_URL", "YOUTUBE", "VIMEO", "EXTERNAL_LINK"]);
```

- [ ] **Step 5: Extend Prisma repository**

Write the normalized fields in `createLesson` and include them in runtime reads:

```ts
sourceType: data.sourceType,
trackingMode: data.trackingMode,
externalUrl: data.externalUrl,
externalVideoId: data.externalVideoId,
embedUrl: data.embedUrl,
embedOrigin: data.embedOrigin,
```

- [ ] **Step 6: Verify authoring tests**

```powershell
npm run test -- src/modules/video/video-content-service.test.ts src/modules/video/server-actions.test.ts src/modules/video/prisma-repository.test.ts
```

Expected: pass.

- [ ] **Step 7: Commit authoring integration**

```powershell
git add src/modules/video/video-content-service.ts src/modules/video/video-content-service.test.ts src/modules/video/server-actions.ts src/modules/video/server-actions.test.ts src/modules/video/prisma-repository.ts src/modules/video/prisma-repository.test.ts
git commit -m "feat: wire external video sources into lesson authoring"
```

## Task 4: Learner Runtime And Player Rendering

**Files:**
- Modify: `src/modules/video/video-runtime.ts`
- Modify: `src/modules/video/video-runtime.test.ts`
- Modify: `src/app/org/[slug]/learn/[courseSlug]/video-player.tsx`
- Create: `src/app/org/[slug]/learn/[courseSlug]/external-video-player.test.tsx`

- [ ] **Step 1: Write failing runtime tests**

Add launch expectations:

```ts
expect(result.currentLesson).toMatchObject({
  sourceType: "YOUTUBE",
  trackingMode: "PROVIDER_TIME",
  embedUrl: "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
  trackingConfidence: "BEST_EFFORT",
});
```

Add link-only rejection for automatic time commits:

```ts
await expect(
  recordVideoProgress(
    {
      organizationId: "org_1",
      assignmentId: "assignment_1",
      lessonId: "external_link_lesson",
      positionSecond: 60,
      watchedSecond: 60,
      occurredAt: new Date("2026-06-13T10:00:00.000Z"),
    },
    repository,
  ),
).rejects.toThrow("External link lessons require manual completion");
```

- [ ] **Step 2: Run focused tests to verify failure**

```powershell
npm run test -- src/modules/video/video-runtime.test.ts src/app/org/[slug]/learn/[courseSlug]/external-video-player.test.tsx
```

Expected: fail because runtime payload and client tests are not implemented.

- [ ] **Step 3: Extend runtime launch payload**

Add to `VideoRuntimeLesson`:

```ts
sourceType: "MUX" | "DIRECT_URL" | "YOUTUBE" | "VIMEO" | "EXTERNAL_LINK";
trackingMode: "NATIVE_TIME" | "PROVIDER_TIME" | "MANUAL_CONFIRMATION" | "LINK_VISIT";
externalUrl: string | null;
externalVideoId: string | null;
embedUrl: string | null;
embedOrigin: string | null;
trackingConfidence: "HIGH" | "BEST_EFFORT" | "LOW";
```

Map confidence:

```ts
function trackingConfidenceFor(mode: VideoRuntimeLesson["trackingMode"]): "HIGH" | "BEST_EFFORT" | "LOW" {
  if (mode === "NATIVE_TIME") {
    return "HIGH";
  }

  if (mode === "PROVIDER_TIME") {
    return "BEST_EFFORT";
  }

  return "LOW";
}
```

- [ ] **Step 4: Render provider-specific learner UI**

In `video-player.tsx`, render:

```tsx
{currentLesson.sourceType === "DIRECT_URL" || currentLesson.sourceType === "MUX" ? (
  <video controls className="aspect-video w-full rounded-md bg-slate-950" src={currentLesson.playbackUrl ?? ""} />
) : currentLesson.sourceType === "YOUTUBE" || currentLesson.sourceType === "VIMEO" ? (
  <iframe
    title={currentLesson.title}
    className="aspect-video w-full rounded-md bg-slate-950"
    src={currentLesson.embedUrl ?? ""}
    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
    allowFullScreen
  />
) : (
  <a href={currentLesson.externalUrl ?? "#"} target="_blank" rel="noreferrer" className="rounded-md bg-slate-950 px-4 py-2 text-sm font-medium text-white">
    Open lesson resource
  </a>
)}
```

Then keep the existing Save progress button for native/provided time modes and show a manual completion button for link-only lessons.

- [ ] **Step 5: Add provider event adapter after basic iframe rendering**

Create a small internal client helper in `video-player.tsx` or a local sibling component. It should emit the same progress payload as native video:

```ts
type ProviderProgressSnapshot = {
  positionSecond: number;
  watchedSecond: number;
};
```

For MVP, use a timer that asks the provider player for current time only when the SDK is available. If the SDK is unavailable, leave progress unchanged and keep manual save disabled for provider time.

- [ ] **Step 6: Verify runtime and client tests**

```powershell
npm run test -- src/modules/video/video-runtime.test.ts src/app/org/[slug]/learn/[courseSlug]/external-video-player.test.tsx
```

Expected: pass.

- [ ] **Step 7: Commit learner runtime**

```powershell
git add src/modules/video/video-runtime.ts src/modules/video/video-runtime.test.ts src/app/org/[slug]/learn/[courseSlug]/video-player.tsx src/app/org/[slug]/learn/[courseSlug]/external-video-player.test.tsx
git commit -m "feat: render external video lesson sources"
```

## Task 5: Admin UI Warnings And Reports

**Files:**
- Modify: `src/app/org/[slug]/admin/courses/[courseSlug]/content/page.tsx`
- Modify: `src/modules/video/page-shells.test.ts`
- Modify: `src/modules/reports/progress-report.ts`
- Modify: `src/modules/reports/prisma-repository.ts`
- Modify: `src/modules/reports/progress-report.test.ts`
- Modify: `src/modules/reports/prisma-repository.test.ts`

- [ ] **Step 1: Add failing page-shell tests**

Assert the admin page contains source options:

```ts
expect(page).toContain("Mux upload");
expect(page).toContain("Direct video URL");
expect(page).toContain("YouTube");
expect(page).toContain("Vimeo");
expect(page).toContain("External link");
expect(page).toContain("External videos use best-effort progress tracking.");
```

- [ ] **Step 2: Add failing report tests**

Expected report row fields:

```ts
expect(row).toMatchObject({
  mediaSourceType: "YOUTUBE",
  mediaTrackingMode: "PROVIDER_TIME",
  mediaTrackingConfidence: "BEST_EFFORT",
});
```

- [ ] **Step 3: Run focused tests to verify failure**

```powershell
npm run test -- src/modules/video/page-shells.test.ts src/modules/reports/progress-report.test.ts src/modules/reports/prisma-repository.test.ts
```

Expected: fail because UI and report fields are missing.

- [ ] **Step 4: Update admin source controls**

Replace the raw playback URL/provider asset pair with a source selector and source URL field. Keep provider asset id visible only for Mux.

Use visible warning copy:

```tsx
<p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
  External videos use best-effort progress tracking. Use Mux/native upload for compliance-heavy courses.
</p>
```

- [ ] **Step 5: Extend report rows**

Add fields:

```ts
mediaSourceType: "MUX" | "DIRECT_URL" | "YOUTUBE" | "VIMEO" | "EXTERNAL_LINK";
mediaTrackingMode: "NATIVE_TIME" | "PROVIDER_TIME" | "MANUAL_CONFIRMATION" | "LINK_VISIT";
mediaTrackingConfidence: "HIGH" | "BEST_EFFORT" | "LOW";
```

- [ ] **Step 6: Verify UI and report tests**

```powershell
npm run test -- src/modules/video/page-shells.test.ts src/modules/reports/progress-report.test.ts src/modules/reports/prisma-repository.test.ts
```

Expected: pass.

- [ ] **Step 7: Commit UI and reporting**

```powershell
git add src/app/org/[slug]/admin/courses/[courseSlug]/content/page.tsx src/modules/video/page-shells.test.ts src/modules/reports/progress-report.ts src/modules/reports/prisma-repository.ts src/modules/reports/progress-report.test.ts src/modules/reports/prisma-repository.test.ts
git commit -m "feat: expose external video tracking confidence"
```

## Task 6: Documentation And Gates

**Files:**
- Modify: `docs/superpowers/notes/2026-06-11-live-vs-placeholder-capabilities.md`
- Modify: `.env.example` only if provider SDK keys are introduced; the recommended MVP path uses public embeds and should not need new secrets.

- [ ] **Step 1: Document source choices**

Add a section that states:

```markdown
## External Video Embeds

LearnHub supports YouTube and Vimeo embeds as best-effort native-video lesson sources. Mux/native upload remains the recommended source for compliance-heavy courses because LearnHub controls player events, duration, and progress commits more directly. External links are treated as learner-confirmed resources and should not be used as the only required item in a certificate-critical course.
```

- [ ] **Step 2: Run focused media tests**

```powershell
npm run test -- src/modules/video/external-video-source.test.ts src/modules/video/video-content-service.test.ts src/modules/video/server-actions.test.ts src/modules/video/prisma-repository.test.ts src/modules/video/video-runtime.test.ts src/modules/video/page-shells.test.ts
```

Expected: pass.

- [ ] **Step 3: Run shared gates**

```powershell
npm run lint
npx prisma validate
npm run prisma:generate
npx tsc --noEmit --incremental false
npm run build
```

Expected: all pass.

- [ ] **Step 4: Commit docs and final gate cleanup**

```powershell
git add docs/superpowers/notes/2026-06-11-live-vs-placeholder-capabilities.md
git commit -m "docs: document external video tracking limits"
```

## Source References

Use these provider references during implementation:

- YouTube IFrame Player API: `https://developers.google.com/youtube/iframe_api_reference`
- YouTube embed parameters: `https://developers.google.com/youtube/player_parameters`
- Vimeo embed help: `https://help.vimeo.com/hc/en-us/articles/12426259908881-How-to-embed-my-video`
- Vimeo Player SDK: `https://developer.vimeo.com/player/sdk`

## Final Verification Checklist

- [ ] YouTube, Vimeo, and external link lessons can be authored without raw iframe HTML.
- [ ] Existing Mux and direct URL lessons keep working.
- [ ] Learner launch payload includes source type and tracking confidence.
- [ ] External links use manual completion, not fake time tracking.
- [ ] Admins see a warning before relying on external media for compliance-heavy courses.
- [ ] Reports expose media source and tracking confidence.
- [ ] Focused tests pass.
- [ ] `npm run lint` passes.
- [ ] `npx prisma validate` passes.
- [ ] `npm run prisma:generate` passes.
- [ ] `npx tsc --noEmit --incremental false` passes.
- [ ] `npm run build` passes.
