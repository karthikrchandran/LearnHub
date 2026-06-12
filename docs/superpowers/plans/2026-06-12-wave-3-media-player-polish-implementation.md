# Wave 3 Media Player Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace remaining Wave 3 media/player placeholders with live admin authoring forms, browser player clients, local SCORM content serving foundations, and updated documentation.

**Architecture:** Keep the existing modular monolith pattern. Server pages authorize and render, app-local server actions bridge forms to module services, browser clients call existing Wave 2 runtime endpoints, and local SCORM content serving is constrained to a configured root.

**Tech Stack:** Next.js App Router, React client components, TypeScript, Prisma repositories, Vitest with jsdom, existing LearnHub module services.

---

## File Structure

- Create `src/modules/video/server-actions.ts`: parse admin video content `FormData` and call `createVideoLesson`, `replaceVideoChapters`, and `replaceVideoTranscriptText`.
- Create `src/modules/video/server-actions.test.ts`: focused unit tests for parsed admin video actions.
- Create `src/app/org/[slug]/admin/courses/[courseSlug]/content/actions.ts`: real Next server actions that resolve admin context and course slug, then call the video module actions.
- Modify `src/app/org/[slug]/admin/courses/[courseSlug]/content/page.tsx`: load real course content and replace disabled controls with forms.
- Create `src/modules/scorm/server-actions.ts`: parse admin SCORM package metadata form data and call `uploadScormPackage`.
- Create `src/modules/scorm/server-actions.test.ts`: focused unit tests for parsed admin SCORM actions.
- Create `src/app/org/[slug]/admin/courses/[courseSlug]/scorm/actions.ts`: real Next server action that resolves admin context and course slug, then calls the SCORM module action.
- Modify `src/app/org/[slug]/admin/courses/[courseSlug]/scorm/page.tsx`: load active package metadata and replace disabled controls with upload metadata form.
- Create `src/app/org/[slug]/learn/[courseSlug]/video-player.tsx`: browser video player client that launches, renders lessons/chapters/transcript, and posts progress.
- Create `src/app/org/[slug]/learn/[courseSlug]/video-player.test.tsx`: jsdom tests for launch rendering and progress posting.
- Modify `src/app/org/[slug]/learn/[courseSlug]/page.tsx`: render the client component instead of disabled placeholder controls.
- Create `src/app/org/[slug]/learn/[courseSlug]/scorm/scorm-player.tsx`: browser SCORM iframe host with minimal SCORM 1.2 API bridge.
- Create `src/app/org/[slug]/learn/[courseSlug]/scorm/scorm-player.test.tsx`: jsdom tests for API bridge storage, unsupported writes, and commit behavior.
- Modify `src/app/org/[slug]/learn/[courseSlug]/scorm/page.tsx`: render the SCORM client component instead of disabled placeholder controls.
- Create `src/app/scorm/[...path]/route.ts`: constrained local content-serving route for development SCORM files.
- Create `src/modules/scorm/content-route.test.ts`: tests for serving allowed files, traversal rejection, and missing file behavior.
- Modify `src/modules/video/page-shells.test.ts`: update expectations from disabled controls to live form/client wiring.
- Modify `src/modules/scorm/page-shells.test.ts`: update expectations from disabled controls to live form/client wiring.
- Modify `docs/superpowers/notes/2026-06-11-live-vs-placeholder-capabilities.md`: update Wave 2/Wave 3 status.

---

### Task 1: Admin Video Server Actions

**Files:**
- Create: `src/modules/video/server-actions.ts`
- Create: `src/modules/video/server-actions.test.ts`

- [ ] **Step 1: Write failing tests for parsed admin video actions**

Add tests that verify:

```ts
const actions = createVideoContentActions(dependencies);
await actions.createLesson("acme", "manager-coaching", formData({
  title: "Opening",
  slug: "opening",
  sortOrder: "0",
  durationSeconds: "120",
  required: "on",
  playbackUrl: "https://cdn.example/video.mp4",
  providerAssetId: "",
  transcriptLanguage: "en",
}));

expect(repository.createLesson).toHaveBeenCalledWith(expect.objectContaining({
  organizationId: "org_1",
  courseId: "course_1",
  title: "Opening",
  slug: "opening",
  sortOrder: 0,
  durationSeconds: 120,
  required: true,
  playbackUrl: "https://cdn.example/video.mp4",
  providerAssetId: null,
  transcriptLanguage: "en",
}));
```

Also test:

```ts
await actions.replaceChapters("acme", "manager-coaching", formData({
  lessonId: "lesson_1",
  chapterTitle: ["Intro", "Demo"],
  chapterStartSecond: ["0", "60"],
  chapterEndSecond: ["59", ""],
}));

expect(repository.replaceChapters).toHaveBeenCalledWith({
  organizationId: "org_1",
  lessonId: "lesson_1",
  chapters: [
    { title: "Intro", startSecond: 0, endSecond: 59, sortOrder: 0 },
    { title: "Demo", startSecond: 60, endSecond: null, sortOrder: 1 },
  ],
});
```

And:

```ts
await actions.replaceTranscript("acme", "manager-coaching", formData({
  lessonId: "lesson_1",
  transcriptText: "00:00 Welcome",
}));

expect(repository.replaceTranscriptCues).toHaveBeenCalled();
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```powershell
npm run test -- src/modules/video/server-actions.test.ts
```

Expected: fails because `src/modules/video/server-actions.ts` does not exist.

- [ ] **Step 3: Implement `createVideoContentActions`**

Implement:

```ts
export type VideoContentActionResult = { status: "success" | "error"; message: string };
export type VideoContentActionContext = { actorId: string; organizationId: string; courseId: string };
export type VideoContentActionDependencies = {
  getContext(slug: string, courseSlug: string): Promise<VideoContentActionContext>;
  repository: VideoContentRepository;
};
```

Expose `createLesson`, `replaceChapters`, and `replaceTranscript` functions that:

- resolve context first,
- read strings and integers from `FormData`,
- pass empty optional fields as `null`,
- return `{ status: "success", message: "..." }`,
- catch domain errors and return `{ status: "error", message }`.

- [ ] **Step 4: Run tests to verify pass**

Run:

```powershell
npm run test -- src/modules/video/server-actions.test.ts
```

Expected: pass.

---

### Task 2: Admin Video Content Page

**Files:**
- Create: `src/app/org/[slug]/admin/courses/[courseSlug]/content/actions.ts`
- Modify: `src/app/org/[slug]/admin/courses/[courseSlug]/content/page.tsx`
- Modify: `src/modules/video/page-shells.test.ts`

- [ ] **Step 1: Update page shell tests first**

Change the admin content shell test to expect:

```ts
expect(page).toContain("createLessonFormAction");
expect(page).toContain("replaceChaptersFormAction");
expect(page).toContain("replaceTranscriptFormAction");
expect(page).toContain("<form action={createLessonAction}");
expect(page).not.toContain("disabled");
```

- [ ] **Step 2: Run test to verify failure**

Run:

```powershell
npm run test -- src/modules/video/page-shells.test.ts
```

Expected: fails because the page still contains disabled controls and no action imports.

- [ ] **Step 3: Add app server actions**

Create `"use server"` actions that:

- call `requireOrganizationUsersAdminBySlug(slug)`,
- find the course by `{ organizationId, slug: courseSlug, type: "NATIVE_VIDEO" }`,
- return `actorId: context.userId`, `organizationId`, and `courseId`,
- call `createPrismaVideoRepository(prisma)`,
- export `createLessonFormAction`, `replaceChaptersFormAction`, and `replaceTranscriptFormAction`.

- [ ] **Step 4: Replace disabled admin page controls with live forms**

Update the page to load:

```ts
const course = await prisma.course.findFirst({
  where: { organizationId, slug: courseSlug, type: "NATIVE_VIDEO" },
  select: {
    id: true,
    title: true,
    modules: { orderBy: { sortOrder: "asc" }, select: { id: true, title: true } },
    videoLessons: {
      orderBy: { sortOrder: "asc" },
      select: {
        id: true,
        title: true,
        slug: true,
        sortOrder: true,
        durationSeconds: true,
        required: true,
        playbackUrl: true,
        providerAssetId: true,
        chapters: { orderBy: { sortOrder: "asc" }, select: { title: true, startSecond: true, endSecond: true } },
        transcriptCues: { orderBy: { startSecond: "asc" }, select: { startSecond: true, text: true } },
      },
    },
  },
});
```

Render:

- a create lesson form,
- a replace chapters form for a selected lesson id,
- a replace transcript form for a selected lesson id,
- a lesson list with stored metadata.

- [ ] **Step 5: Run test to verify pass**

Run:

```powershell
npm run test -- src/modules/video/page-shells.test.ts
```

Expected: pass.

---

### Task 3: Admin SCORM Server Actions And Page

**Files:**
- Create: `src/modules/scorm/server-actions.ts`
- Create: `src/modules/scorm/server-actions.test.ts`
- Create: `src/app/org/[slug]/admin/courses/[courseSlug]/scorm/actions.ts`
- Modify: `src/app/org/[slug]/admin/courses/[courseSlug]/scorm/page.tsx`
- Modify: `src/modules/scorm/page-shells.test.ts`

- [ ] **Step 1: Write failing SCORM action tests**

Test that:

```ts
await actions.uploadPackage("acme", "policy", formData({
  originalFileName: "policy.zip",
  contentType: "application/zip",
  byteSize: "1024",
  launchPath: "index.html",
  manifestTitle: "Policy",
}));

expect(repository.upsertPackage).toHaveBeenCalledWith(expect.objectContaining({
  organizationId: "org_1",
  courseId: "course_1",
  originalFileName: "policy.zip",
  contentType: "application/zip",
  byteSize: 1024,
  storageKey: "org/org_1/courses/course_1/scorm/pkg_course_1/policy.zip",
  contentRootKey: "org/org_1/courses/course_1/scorm/pkg_course_1/content",
  launchPath: "index.html",
  manifestTitle: "Policy",
}));
```

- [ ] **Step 2: Run failing SCORM tests**

Run:

```powershell
npm run test -- src/modules/scorm/server-actions.test.ts src/modules/scorm/page-shells.test.ts
```

Expected: server action test fails because the file does not exist; page shell test fails after expectation update.

- [ ] **Step 3: Implement SCORM server actions**

Create `createScormPackageActions` with dependencies:

```ts
export type ScormPackageActionContext = { actorId: string; organizationId: string; courseId: string };
export type ScormPackageActionDependencies = {
  getContext(slug: string, courseSlug: string): Promise<ScormPackageActionContext>;
  repository: ScormPackageRepository;
};
```

Expose `uploadPackage(slug, courseSlug, formData)` and parse `byteSize` as a number before calling `uploadScormPackage`.

- [ ] **Step 4: Replace disabled SCORM page controls**

Page must import `uploadScormPackageFormAction`, load active package metadata, render a form with `originalFileName`, `contentType`, `byteSize`, `launchPath`, `manifestTitle`, and render the active package `storageKey` and `contentRootKey`.

- [ ] **Step 5: Run SCORM tests**

Run:

```powershell
npm run test -- src/modules/scorm/server-actions.test.ts src/modules/scorm/page-shells.test.ts
```

Expected: pass.

---

### Task 4: Learner Video Player Client

**Files:**
- Create: `src/app/org/[slug]/learn/[courseSlug]/video-player.tsx`
- Create: `src/app/org/[slug]/learn/[courseSlug]/video-player.test.tsx`
- Modify: `src/app/org/[slug]/learn/[courseSlug]/page.tsx`
- Modify: `src/modules/video/page-shells.test.ts`

- [ ] **Step 1: Write failing client/page tests**

Add a component test that mocks `fetch`:

```ts
vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
  if (url.endsWith("/launch")) {
    return Response.json({
      assignmentId: "assignment_1",
      courseId: "course_1",
      courseTitle: "Course One",
      modules: [],
      lessons: [{
        id: "lesson_1",
        title: "Lesson One",
        slug: "lesson-one",
        sortOrder: 0,
        durationSeconds: 120,
        required: true,
        playbackUrl: "https://cdn.example/video.mp4",
        providerAssetId: null,
        chapters: [{ id: "chapter_1", title: "Intro", startSecond: 0, endSecond: 60, sortOrder: 0 }],
        transcriptCues: [{ id: "cue_1", startSecond: 0, endSecond: 5, text: "Welcome" }],
        progress: { lessonId: "lesson_1", lastPositionSecond: 10, maxWatchedSecond: 20, completed: false, lastWatchedAt: null },
      }],
      currentLesson: {
        id: "lesson_1",
        title: "Lesson One",
        slug: "lesson-one",
        sortOrder: 0,
        durationSeconds: 120,
        required: true,
        playbackUrl: "https://cdn.example/video.mp4",
        providerAssetId: null,
        chapters: [],
        transcriptCues: [],
        progress: { lessonId: "lesson_1", lastPositionSecond: 10, maxWatchedSecond: 20, completed: false, lastWatchedAt: null },
      },
      courseProgressPercent: 25,
    });
  }

  return Response.json({ courseProgressPercent: 50, completed: false });
}));
```

Assert that "Lesson One", "Intro", and "Welcome" render, then click a "Save progress" button and assert the progress endpoint receives JSON with `lessonId`.

- [ ] **Step 2: Run failing tests**

Run:

```powershell
npm run test -- src/app/org/[slug]/learn/[courseSlug]/video-player.test.tsx src/modules/video/page-shells.test.ts
```

Expected: fails because the component does not exist and the page still has disabled controls.

- [ ] **Step 3: Implement `VideoPlayer` client**

The component must:

- fetch `launchPath` on mount,
- render loading, error, no-lessons, and loaded states,
- render `<video controls src={currentLesson.playbackUrl}>` when a URL exists,
- render a missing-media message when no playback URL exists,
- show lessons, chapters, and transcript cues,
- post progress to `progressPath` with `{ lessonId, positionSecond, watchedSecond }`,
- expose a `Save progress` button for deterministic testing.

- [ ] **Step 4: Wire learner page to client**

Import `VideoPlayer` and replace placeholder controls with:

```tsx
<VideoPlayer
  launchPath={videoLaunchPath}
  progressPath={videoProgressPath}
  initialProgressPercent={assignment.progress?.progressPercent ?? 0}
/>
```

- [ ] **Step 5: Run tests**

Run:

```powershell
npm run test -- src/app/org/[slug]/learn/[courseSlug]/video-player.test.tsx src/modules/video/page-shells.test.ts
```

Expected: pass.

---

### Task 5: SCORM Player Client And API Bridge

**Files:**
- Create: `src/app/org/[slug]/learn/[courseSlug]/scorm/scorm-player.tsx`
- Create: `src/app/org/[slug]/learn/[courseSlug]/scorm/scorm-player.test.tsx`
- Modify: `src/app/org/[slug]/learn/[courseSlug]/scorm/page.tsx`
- Modify: `src/modules/scorm/page-shells.test.ts`

- [ ] **Step 1: Write failing SCORM client tests**

Test that:

```ts
render(<ScormPlayer launchPath="/launch" commitPath="/commit" initialProgressPercent={0} initialScore={null} />);
await screen.findByText("Policy");
expect(screen.getByTitle("SCORM content")).toHaveAttribute("src", "/scorm/org/org_1/course/index.html");
expect(window.API.LMSInitialize("")).toBe("true");
expect(window.API.LMSSetValue("cmi.core.lesson_status", "completed")).toBe("true");
expect(window.API.LMSSetValue("cmi.core.total_time", "99:00:00")).toBe("false");
expect(window.API.LMSGetLastError()).not.toBe("0");
await user.click(screen.getByText("Commit"));
expect(fetch).toHaveBeenCalledWith("/commit", expect.objectContaining({ method: "POST" }));
```

- [ ] **Step 2: Run failing tests**

Run:

```powershell
npm run test -- src/app/org/[slug]/learn/[courseSlug]/scorm/scorm-player.test.tsx src/modules/scorm/page-shells.test.ts
```

Expected: fails because the component does not exist and the page still has disabled controls.

- [ ] **Step 3: Implement `ScormPlayer`**

The component must:

- fetch `launchPath`,
- install `window.API`,
- keep allowed CMI values in memory,
- return `"false"` for unsupported keys such as `cmi.core.total_time`,
- call the commit endpoint with the in-memory CMI map,
- render iframe, launch count, lesson status, score, progress, and commit result.

Allowed write keys must match the server runtime allow-list:

```ts
const allowedCmiKeys = new Set([
  "cmi.core.lesson_status",
  "cmi.core.score.raw",
  "cmi.core.session_time",
  "cmi.core.exit",
  "cmi.core.lesson_location",
  "cmi.suspend_data",
  "cmi.comments",
]);
```

- [ ] **Step 4: Wire SCORM learner page to client**

Render:

```tsx
<ScormPlayer
  launchPath={scormLaunchPath}
  commitPath={scormCommitPath}
  initialProgressPercent={assignment.progress?.progressPercent ?? 0}
  initialScore={assignment.scormRegistration?.scoreRaw ?? null}
/>
```

- [ ] **Step 5: Run tests**

Run:

```powershell
npm run test -- src/app/org/[slug]/learn/[courseSlug]/scorm/scorm-player.test.tsx src/modules/scorm/page-shells.test.ts
```

Expected: pass.

---

### Task 6: Local SCORM Content Route

**Files:**
- Create: `src/app/scorm/[...path]/route.ts`
- Create: `src/modules/scorm/content-route.test.ts`

- [ ] **Step 1: Write failing route tests**

Test:

```ts
const response = await GET(new Request("http://learnhub.test/scorm/org/org_1/course/index.html"), {
  params: Promise.resolve({ path: ["org", "org_1", "course", "index.html"] }),
});
expect(response.status).toBe(200);
expect(await response.text()).toContain("SCORM");
```

Also test:

```ts
await expectStatus(["org", "..", "secret.txt"], 400);
await expectStatus(["org", "missing.html"], 404);
```

- [ ] **Step 2: Run failing tests**

Run:

```powershell
npm run test -- src/modules/scorm/content-route.test.ts
```

Expected: fails because the route does not exist.

- [ ] **Step 3: Implement constrained route**

Use `LEARNHUB_SCORM_CONTENT_DIR` when set; otherwise use `.learnhub/scorm` under `process.cwd()`. Reject empty path segments, `..`, absolute paths, null bytes, and directories. Serve content types for `.html`, `.js`, `.css`, `.json`, `.png`, `.jpg`, `.jpeg`, `.gif`, `.svg`, and default to `application/octet-stream`.

- [ ] **Step 4: Run route tests**

Run:

```powershell
npm run test -- src/modules/scorm/content-route.test.ts
```

Expected: pass.

---

### Task 7: Documentation And Verification

**Files:**
- Modify: `docs/superpowers/notes/2026-06-11-live-vs-placeholder-capabilities.md`
- Modify tests as needed only to reflect implemented live behavior.

- [ ] **Step 1: Update live-vs-placeholder documentation**

Document:

- Wave 2 runtime endpoints and reporting pages are live.
- Wave 3 admin media forms, video player client, SCORM iframe/API bridge, and local SCORM route are live.
- Remaining placeholders are production provider integrations: Mux, R2 signed URLs, real ZIP extraction, malware scanning, notification jobs, PDF/scheduled exports, and audit-log browser polish.

- [ ] **Step 2: Run focused Wave 3 tests**

Run:

```powershell
npm run test -- src/modules/video/server-actions.test.ts src/modules/scorm/server-actions.test.ts src/app/org/[slug]/learn/[courseSlug]/video-player.test.tsx src/app/org/[slug]/learn/[courseSlug]/scorm/scorm-player.test.tsx src/modules/scorm/content-route.test.ts src/modules/video/page-shells.test.ts src/modules/scorm/page-shells.test.ts
```

Expected: pass.

- [ ] **Step 3: Run full gates sequentially**

Run:

```powershell
npm run test
npm run lint
npx prisma validate
npm run prisma:generate
npx tsc --noEmit --incremental false
npm run build
```

Expected: all pass.

- [ ] **Step 4: Commit Wave 3 implementation**

Run:

```powershell
git status --short
git add src docs
git commit -m "feat: add wave 3 media player polish"
```

Expected: feature branch has a clean working tree after commit.

- [ ] **Step 5: Merge locally to main after verification**

From `C:\Users\K.Ramachandran\LearnHub`:

```powershell
git checkout main
git merge --no-ff feature/wave-3-media-player-polish -m "merge: wave 3 media player polish"
```

Run the same sequential gates on `main` after merge.

Expected: `main` contains Wave 3 and remains green.

---

## Self-Review

- Spec coverage: all goals in `docs/superpowers/specs/2026-06-12-wave-3-media-player-polish-design.md` map to Tasks 1-7.
- Placeholder scan: this plan contains no incomplete implementation gaps; remaining production provider work is intentionally documented as out of scope.
- Type consistency: action dependency names, player prop names, and SCORM allowed CMI keys are consistent across tasks.
