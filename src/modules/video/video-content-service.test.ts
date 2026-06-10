import { describe, expect, it } from "vitest";

import {
  createVideoLesson,
  replaceVideoChapters,
  replaceVideoTranscriptText,
  type CreateVideoLessonData,
  type CreateVideoLessonInput,
  type VideoContentCourse,
  type VideoContentModule,
  type VideoContentRepository,
} from "./video-content-service";

const nativeVideoCourse: VideoContentCourse = {
  id: "course_1",
  organizationId: "org_1",
  type: "NATIVE_VIDEO",
};

const validCreateLessonInput: CreateVideoLessonInput = {
  organizationId: "org_1",
  courseId: "course_1",
  moduleId: "module_1",
  actorId: "actor_1",
  title: " Coaching Conversation Basics ",
  slug: " coaching-conversation-basics ",
  sortOrder: 1,
  durationSeconds: 180,
  playbackUrl: "https://video.learnhub.local/demo/coaching-conversation-basics.mp4",
};

class FakeVideoContentRepository implements VideoContentRepository {
  course: VideoContentCourse | null = nativeVideoCourse;
  module: VideoContentModule | null = {
    id: "module_1",
    organizationId: "org_1",
    courseId: "course_1",
  };
  lesson: { id: string; durationSeconds: number } | null = {
    id: "lesson_1",
    durationSeconds: 180,
  };
  transactions = 0;
  calls: string[] = [];
  createdLessons: CreateVideoLessonData[] = [];
  replacedChapters: Array<Parameters<VideoContentRepository["replaceChapters"]>[0]> = [];
  replacedTranscriptCues: Array<Parameters<VideoContentRepository["replaceTranscriptCues"]>[0]> = [];
  auditLogs: Array<Parameters<VideoContentRepository["recordAuditLog"]>[0]> = [];

  async runInTransaction<T>(operation: () => Promise<T>): Promise<T> {
    this.transactions += 1;
    this.calls.push("transaction:start");
    const result = await operation();
    this.calls.push("transaction:end");

    return result;
  }

  async findCourse(): Promise<VideoContentCourse | null> {
    this.calls.push("find-course");

    return this.course;
  }

  async findModule(): Promise<VideoContentModule | null> {
    this.calls.push("find-module");

    return this.module;
  }

  async createLesson(data: CreateVideoLessonData): Promise<{ id: string; slug: string }> {
    this.calls.push("create-lesson");
    this.createdLessons.push(data);

    return { id: "lesson_1", slug: data.slug };
  }

  async replaceChapters(input: Parameters<VideoContentRepository["replaceChapters"]>[0]): Promise<void> {
    this.calls.push("replace-chapters");
    this.replacedChapters.push(input);
  }

  async replaceTranscriptCues(input: Parameters<VideoContentRepository["replaceTranscriptCues"]>[0]): Promise<void> {
    this.calls.push("replace-transcript");
    this.replacedTranscriptCues.push(input);
  }

  async findLesson(): Promise<{ id: string; durationSeconds: number } | null> {
    this.calls.push("find-lesson");

    return this.lesson;
  }

  async recordAuditLog(input: Parameters<VideoContentRepository["recordAuditLog"]>[0]): Promise<void> {
    this.calls.push(`audit:${input.action}`);
    this.auditLogs.push(input);
  }
}

function createRepository(overrides: Partial<FakeVideoContentRepository> = {}): FakeVideoContentRepository {
  return Object.assign(new FakeVideoContentRepository(), overrides);
}

describe("createVideoLesson", () => {
  it("rejects non-native courses", async () => {
    const repository = createRepository({
      course: { ...nativeVideoCourse, type: "SCORM_1_2" },
    });

    await expect(createVideoLesson(validCreateLessonInput, repository)).rejects.toThrow(
      "Video lessons can only be added to native video courses",
    );

    expect(repository.createdLessons).toHaveLength(0);
    expect(repository.transactions).toBe(0);
  });

  it("requires a playback URL or provider asset id", async () => {
    const repository = createRepository();

    await expect(
      createVideoLesson(
        {
          ...validCreateLessonInput,
          playbackUrl: " ",
          providerAssetId: null,
        },
        repository,
      ),
    ).rejects.toThrow("Video lesson requires playback URL or provider asset id");

    expect(repository.createdLessons).toHaveLength(0);
    expect(repository.transactions).toBe(0);
  });

  it("validates duration and sort order before writes", async () => {
    for (const invalidCase of [
      {
        input: { ...validCreateLessonInput, durationSeconds: 0 },
        error: "Video duration seconds must be positive",
      },
      {
        input: { ...validCreateLessonInput, sortOrder: -1 },
        error: "Sort order cannot be negative",
      },
    ]) {
      const repository = createRepository();

      await expect(createVideoLesson(invalidCase.input, repository)).rejects.toThrow(invalidCase.error);

      expect(repository.createdLessons).toHaveLength(0);
      expect(repository.transactions).toBe(0);
    }
  });

  it("rejects a module from another course", async () => {
    const repository = createRepository({
      module: {
        id: "module_1",
        organizationId: "org_1",
        courseId: "other_course",
      },
    });

    await expect(createVideoLesson(validCreateLessonInput, repository)).rejects.toThrow(
      "Module does not belong to this course",
    );

    expect(repository.createdLessons).toHaveLength(0);
    expect(repository.transactions).toBe(0);
  });

  it("creates a normalized lesson and records the expected audit action inside a transaction", async () => {
    const repository = createRepository();

    const result = await createVideoLesson(
      {
        ...validCreateLessonInput,
        providerAssetId: " asset_1 ",
        transcriptLanguage: "es",
        required: false,
      },
      repository,
    );

    expect(result).toEqual({ id: "lesson_1", slug: "coaching-conversation-basics" });
    expect(repository.createdLessons).toEqual([
      {
        organizationId: "org_1",
        courseId: "course_1",
        moduleId: "module_1",
        title: "Coaching Conversation Basics",
        slug: "coaching-conversation-basics",
        sortOrder: 1,
        durationSeconds: 180,
        required: false,
        providerAssetId: "asset_1",
        playbackUrl: "https://video.learnhub.local/demo/coaching-conversation-basics.mp4",
        transcriptLanguage: "es",
      },
    ]);
    expect(repository.auditLogs).toEqual([
      {
        organizationId: "org_1",
        actorId: "actor_1",
        action: "video.lesson_created",
        targetType: "video_lesson",
        targetId: "lesson_1",
      },
    ]);
    expect(repository.calls).toEqual([
      "find-course",
      "find-module",
      "transaction:start",
      "create-lesson",
      "audit:video.lesson_created",
      "transaction:end",
    ]);
  });
});

describe("replaceVideoChapters", () => {
  it("validates chapter ranges and replaces chapters inside a repository transaction", async () => {
    const repository = createRepository();

    await expect(
      replaceVideoChapters(
        {
          organizationId: "org_1",
          lessonId: "lesson_1",
          actorId: "actor_1",
          chapters: [{ title: "Too late", startSecond: 200, endSecond: null, sortOrder: 0 }],
        },
        repository,
      ),
    ).rejects.toThrow("Chapter start time cannot exceed lesson duration");

    expect(repository.transactions).toBe(0);

    await replaceVideoChapters(
      {
        organizationId: "org_1",
        lessonId: "lesson_1",
        actorId: "actor_1",
        chapters: [
          { title: "Intro", startSecond: 0, endSecond: 45, sortOrder: 0 },
          { title: "Practice", startSecond: 45, endSecond: null, sortOrder: 1 },
        ],
      },
      repository,
    );

    expect(repository.replacedChapters).toEqual([
      {
        organizationId: "org_1",
        lessonId: "lesson_1",
        chapters: [
          { title: "Intro", startSecond: 0, endSecond: 45, sortOrder: 0 },
          { title: "Practice", startSecond: 45, endSecond: null, sortOrder: 1 },
        ],
      },
    ]);
    expect(repository.auditLogs).toEqual([
      {
        organizationId: "org_1",
        actorId: "actor_1",
        action: "video.chapters_replaced",
        targetType: "video_lesson",
        targetId: "lesson_1",
      },
    ]);
    expect(repository.calls).toEqual([
      "find-lesson",
      "find-lesson",
      "transaction:start",
      "replace-chapters",
      "audit:video.chapters_replaced",
      "transaction:end",
    ]);
  });
});

describe("replaceVideoTranscriptText", () => {
  it("parses transcript cues and replaces transcript inside a repository transaction", async () => {
    const repository = createRepository();

    await replaceVideoTranscriptText(
      {
        organizationId: "org_1",
        lessonId: "lesson_1",
        actorId: "actor_1",
        transcriptText: "[00:00] Welcome\n[00:45 - 01:30] Practice the coaching flow",
      },
      repository,
    );

    expect(repository.replacedTranscriptCues).toEqual([
      {
        organizationId: "org_1",
        lessonId: "lesson_1",
        cues: [
          { startSecond: 0, endSecond: null, text: "Welcome" },
          { startSecond: 45, endSecond: 90, text: "Practice the coaching flow" },
        ],
      },
    ]);
    expect(repository.auditLogs).toEqual([
      {
        organizationId: "org_1",
        actorId: "actor_1",
        action: "video.transcript_replaced",
        targetType: "video_lesson",
        targetId: "lesson_1",
      },
    ]);
    expect(repository.calls).toEqual([
      "find-lesson",
      "transaction:start",
      "replace-transcript",
      "audit:video.transcript_replaced",
      "transaction:end",
    ]);
  });
});
