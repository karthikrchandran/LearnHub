import { describe, expect, it, vi } from "vitest";

import { createVideoContentActions, type VideoContentActionDependencies } from "./server-actions";
import type {
  CreateVideoLessonData,
  VideoContentCourse,
  VideoContentRepository,
} from "./video-content-service";

const nativeVideoCourse: VideoContentCourse = {
  id: "course_1",
  organizationId: "org_1",
  type: "NATIVE_VIDEO",
};

function formData(entries: Record<string, string | string[]>): FormData {
  const data = new FormData();

  for (const [key, value] of Object.entries(entries)) {
    for (const item of Array.isArray(value) ? value : [value]) {
      data.append(key, item);
    }
  }

  return data;
}

function createRepository(): VideoContentRepository & {
  createdLessons: CreateVideoLessonData[];
  replacedChapters: Array<Parameters<VideoContentRepository["replaceChapters"]>[0]>;
  replacedTranscriptCues: Array<Parameters<VideoContentRepository["replaceTranscriptCues"]>[0]>;
} {
  return {
    createdLessons: [],
    replacedChapters: [],
    replacedTranscriptCues: [],
    runInTransaction: vi.fn(async (operation) => operation()),
    findCourse: vi.fn(async () => nativeVideoCourse),
    findModule: vi.fn(async () => null),
    createLesson: vi.fn(async (data) => {
      const repository = createRepositoryRef.current;
      repository.createdLessons.push(data);

      return { id: "lesson_1", slug: data.slug };
    }),
    replaceChapters: vi.fn(async (input) => {
      const repository = createRepositoryRef.current;
      repository.replacedChapters.push(input);
    }),
    replaceTranscriptCues: vi.fn(async (input) => {
      const repository = createRepositoryRef.current;
      repository.replacedTranscriptCues.push(input);
    }),
    findLesson: vi.fn(async () => ({ id: "lesson_1", durationSeconds: 180 })),
    recordAuditLog: vi.fn(async () => {}),
  };
}

const createRepositoryRef: { current: ReturnType<typeof createRepository> } = {
  current: {} as ReturnType<typeof createRepository>,
};

function createDependencies(): VideoContentActionDependencies & {
  repository: ReturnType<typeof createRepository>;
} {
  const repository = createRepository();
  createRepositoryRef.current = repository;

  return {
    repository,
    getContext: vi.fn(async (slug, courseSlug) => {
      expect(slug).toBe("acme");
      expect(courseSlug).toBe("manager-coaching");

      return {
        actorId: "actor_1",
        organizationId: "org_1",
        courseId: "course_1",
      };
    }),
  };
}

describe("video content server actions", () => {
  it("parses lesson metadata and calls the video lesson service", async () => {
    const dependencies = createDependencies();
    const actions = createVideoContentActions(dependencies);

    await expect(
      actions.createLesson(
        "acme",
        "manager-coaching",
        formData({
          title: "Opening",
          sortOrder: "0",
          durationMinutes: "2",
          required: "on",
          authoringPrompt: "Teach a safe opening",
          narrationScript: "Welcome to this short lesson.",
          videoGenerationPrompt: "An original workplace training scene.",
        }),
      ),
    ).resolves.toEqual({ status: "success", message: "Video lesson created." });

    expect(dependencies.repository.createLesson).toHaveBeenCalledWith({
      organizationId: "org_1",
      courseId: "course_1",
      moduleId: null,
      title: "Opening",
      slug: "opening",
      sortOrder: 0,
      durationSeconds: 120,
      required: true,
      playbackUrl: null,
      providerAssetId: null,
      transcriptLanguage: "en",
      providerStatus: "DRAFT",
      authoringPrompt: "Teach a safe opening",
      narrationScript: "Welcome to this short lesson.",
      videoGenerationPrompt: "An original workplace training scene.",
    });
  });

  it("parses chapter rows and replaces chapters for the selected lesson", async () => {
    const dependencies = createDependencies();
    const actions = createVideoContentActions(dependencies);

    await expect(
      actions.replaceChapters(
        "acme",
        "manager-coaching",
        formData({
          lessonId: "lesson_1",
          chapterTitle: ["Intro", "Demo"],
          chapterStartSecond: ["0", "60"],
          chapterEndSecond: ["59", ""],
        }),
      ),
    ).resolves.toEqual({ status: "success", message: "Video chapters replaced." });

    expect(dependencies.repository.replaceChapters).toHaveBeenCalledWith({
      organizationId: "org_1",
      lessonId: "lesson_1",
      chapters: [
        { title: "Intro", startSecond: 0, endSecond: 59, sortOrder: 0 },
        { title: "Demo", startSecond: 60, endSecond: null, sortOrder: 1 },
      ],
    });
  });

  it("parses transcript text and replaces transcript cues for the selected lesson", async () => {
    const dependencies = createDependencies();
    const actions = createVideoContentActions(dependencies);

    await expect(
      actions.replaceTranscript(
        "acme",
        "manager-coaching",
        formData({
          lessonId: "lesson_1",
          transcriptText: "[00:00] Welcome",
        }),
      ),
    ).resolves.toEqual({ status: "success", message: "Video transcript replaced." });

    expect(dependencies.repository.replaceTranscriptCues).toHaveBeenCalledWith({
      organizationId: "org_1",
      lessonId: "lesson_1",
      cues: [{ startSecond: 0, endSecond: null, text: "Welcome" }],
    });
  });

  it("returns domain validation errors without throwing", async () => {
    const dependencies = createDependencies();
    const actions = createVideoContentActions(dependencies);

    await expect(
      actions.createLesson(
        "acme",
        "manager-coaching",
        formData({
          title: " ",
          sortOrder: "0",
          durationMinutes: "2",
          playbackUrl: "https://cdn.example/video.mp4",
        }),
      ),
    ).resolves.toEqual({ status: "error", message: "Course title is required" });
  });
});
