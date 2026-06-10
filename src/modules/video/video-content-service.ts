import { normalizeCatalogSlug, requireCatalogTitle } from "../catalog/catalog-validation";
import { parseTranscriptText, type ParsedTranscriptCue } from "./transcript-parser";
import {
  requireNonNegativeSecond,
  requirePositiveDurationSeconds,
  validateChapterRange,
} from "./video-validation";

export type VideoContentCourse = {
  id: string;
  organizationId: string;
  type: "NATIVE_VIDEO" | "SCORM_1_2";
};

export type VideoContentModule = {
  id: string;
  organizationId: string;
  courseId: string;
};

export type CreateVideoLessonInput = {
  organizationId: string;
  courseId: string;
  moduleId?: string | null;
  actorId: string;
  title: string;
  slug: string;
  sortOrder: number;
  durationSeconds: number;
  required?: boolean;
  providerAssetId?: string | null;
  playbackUrl?: string | null;
  transcriptLanguage?: string;
};

export type CreateVideoLessonData = {
  organizationId: string;
  courseId: string;
  moduleId: string | null;
  title: string;
  slug: string;
  sortOrder: number;
  durationSeconds: number;
  required: boolean;
  providerAssetId: string | null;
  playbackUrl: string | null;
  transcriptLanguage: string;
};

export type VideoChapterInput = {
  title: string;
  startSecond: number;
  endSecond: number | null;
  sortOrder: number;
};

export type ReplaceVideoChaptersInput = {
  organizationId: string;
  lessonId: string;
  actorId: string;
  chapters: VideoChapterInput[];
};

export type ReplaceVideoTranscriptTextInput = {
  organizationId: string;
  lessonId: string;
  actorId: string;
  transcriptText: string;
};

export type VideoContentRepository = {
  runInTransaction<T>(operation: () => Promise<T>): Promise<T>;
  findCourse(input: { organizationId: string; courseId: string }): Promise<VideoContentCourse | null>;
  findModule(input: { organizationId: string; courseId: string; moduleId: string }): Promise<VideoContentModule | null>;
  createLesson(data: CreateVideoLessonData): Promise<{ id: string; slug: string }>;
  replaceChapters(input: { organizationId: string; lessonId: string; chapters: VideoChapterInput[] }): Promise<void>;
  replaceTranscriptCues(input: {
    organizationId: string;
    lessonId: string;
    cues: ParsedTranscriptCue[];
  }): Promise<void>;
  findLesson(input: { organizationId: string; lessonId: string }): Promise<{ id: string; durationSeconds: number } | null>;
  recordAuditLog(input: {
    organizationId: string;
    actorId: string;
    action: string;
    targetType: string;
    targetId: string;
  }): Promise<void>;
};

export async function createVideoLesson(
  input: CreateVideoLessonInput,
  repository: VideoContentRepository,
): Promise<{ id: string; slug: string }> {
  const data: CreateVideoLessonData = {
    organizationId: requireNonEmptyValue(input.organizationId, "Organization id is required"),
    courseId: requireNonEmptyValue(input.courseId, "Course id is required"),
    moduleId: normalizeNullableValue(input.moduleId),
    title: requireCatalogTitle(input.title),
    slug: normalizeCatalogSlug(input.slug),
    sortOrder: requireNonNegativeSecond(input.sortOrder, "Sort order"),
    durationSeconds: requirePositiveDurationSeconds(input.durationSeconds),
    required: input.required ?? true,
    providerAssetId: normalizeNullableValue(input.providerAssetId),
    playbackUrl: normalizeNullableValue(input.playbackUrl),
    transcriptLanguage: normalizeTranscriptLanguage(input.transcriptLanguage),
  };
  const actorId = requireNonEmptyValue(input.actorId, "Actor id is required");

  if (!data.playbackUrl && !data.providerAssetId) {
    throw new Error("Video lesson requires playback URL or provider asset id");
  }

  const course = await repository.findCourse({
    organizationId: data.organizationId,
    courseId: data.courseId,
  });

  if (!course) {
    throw new Error("Course not found");
  }

  if (course.type !== "NATIVE_VIDEO") {
    throw new Error("Video lessons can only be added to native video courses");
  }

  if (data.moduleId) {
    const courseModule = await repository.findModule({
      organizationId: data.organizationId,
      courseId: data.courseId,
      moduleId: data.moduleId,
    });

    if (!courseModule || courseModule.organizationId !== data.organizationId || courseModule.courseId !== data.courseId) {
      throw new Error("Module does not belong to this course");
    }
  }

  return repository.runInTransaction(async () => {
    const lesson = await repository.createLesson(data);

    await repository.recordAuditLog({
      organizationId: data.organizationId,
      actorId,
      action: "video.lesson_created",
      targetType: "video_lesson",
      targetId: lesson.id,
    });

    return lesson;
  });
}

export async function replaceVideoChapters(
  input: ReplaceVideoChaptersInput,
  repository: VideoContentRepository,
): Promise<void> {
  const organizationId = requireNonEmptyValue(input.organizationId, "Organization id is required");
  const lessonId = requireNonEmptyValue(input.lessonId, "Lesson id is required");
  const actorId = requireNonEmptyValue(input.actorId, "Actor id is required");
  const lesson = await requireLesson(repository, organizationId, lessonId);
  const chapters = input.chapters.map((chapter) => normalizeChapter(chapter, lesson.durationSeconds));

  await repository.runInTransaction(async () => {
    await repository.replaceChapters({
      organizationId,
      lessonId,
      chapters,
    });
    await repository.recordAuditLog({
      organizationId,
      actorId,
      action: "video.chapters_replaced",
      targetType: "video_lesson",
      targetId: lessonId,
    });
  });
}

export async function replaceVideoTranscriptText(
  input: ReplaceVideoTranscriptTextInput,
  repository: VideoContentRepository,
): Promise<void> {
  const organizationId = requireNonEmptyValue(input.organizationId, "Organization id is required");
  const lessonId = requireNonEmptyValue(input.lessonId, "Lesson id is required");
  const actorId = requireNonEmptyValue(input.actorId, "Actor id is required");
  const lesson = await requireLesson(repository, organizationId, lessonId);
  const cues = parseTranscriptText(input.transcriptText);

  for (const cue of cues) {
    validateChapterRange({
      startSecond: cue.startSecond,
      endSecond: cue.endSecond,
      durationSeconds: lesson.durationSeconds,
    });
  }

  await repository.runInTransaction(async () => {
    await repository.replaceTranscriptCues({
      organizationId,
      lessonId,
      cues,
    });
    await repository.recordAuditLog({
      organizationId,
      actorId,
      action: "video.transcript_replaced",
      targetType: "video_lesson",
      targetId: lessonId,
    });
  });
}

async function requireLesson(
  repository: VideoContentRepository,
  organizationId: string,
  lessonId: string,
): Promise<{ id: string; durationSeconds: number }> {
  const lesson = await repository.findLesson({ organizationId, lessonId });

  if (!lesson) {
    throw new Error("Video lesson not found");
  }

  return lesson;
}

function normalizeChapter(chapter: VideoChapterInput, durationSeconds: number): VideoChapterInput {
  const normalizedChapter = {
    title: requireCatalogTitle(chapter.title),
    startSecond: requireNonNegativeSecond(chapter.startSecond, "Chapter start time"),
    endSecond:
      chapter.endSecond === null ? null : requireNonNegativeSecond(chapter.endSecond, "Chapter end time"),
    sortOrder: requireNonNegativeSecond(chapter.sortOrder, "Sort order"),
  };

  validateChapterRange({
    startSecond: normalizedChapter.startSecond,
    endSecond: normalizedChapter.endSecond,
    durationSeconds,
  });

  return normalizedChapter;
}

function normalizeNullableValue(value: string | null | undefined): string | null {
  const normalized = value?.trim() ?? "";

  return normalized ? normalized : null;
}

function normalizeTranscriptLanguage(language: string | undefined): string {
  const normalized = language?.trim() ?? "";

  return normalized || "en";
}

function requireNonEmptyValue(value: string, message: string): string {
  const normalized = value.trim();

  if (!normalized) {
    throw new Error(message);
  }

  return normalized;
}
