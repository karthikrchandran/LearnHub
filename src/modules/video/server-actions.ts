import {
  createVideoLesson,
  replaceVideoChapters,
  replaceVideoTranscriptText,
  type VideoChapterInput,
  type VideoContentRepository,
} from "./video-content-service";

export type VideoContentActionResult = { status: "success" | "error"; message: string };

export type VideoContentActionContext = {
  actorId: string;
  organizationId: string;
  courseId: string;
};

export type VideoContentActionDependencies = {
  getContext(slug: string, courseSlug: string): Promise<VideoContentActionContext>;
  repository: VideoContentRepository;
};

export function createVideoContentActions(dependencies: VideoContentActionDependencies): {
  createLesson(slug: string, courseSlug: string, formData: FormData): Promise<VideoContentActionResult>;
  replaceChapters(slug: string, courseSlug: string, formData: FormData): Promise<VideoContentActionResult>;
  replaceTranscript(slug: string, courseSlug: string, formData: FormData): Promise<VideoContentActionResult>;
} {
  return {
    async createLesson(slug, courseSlug, formData) {
      return runAction(async () => {
        const context = await dependencies.getContext(slug, courseSlug);

        await createVideoLesson(
          {
            organizationId: context.organizationId,
            courseId: context.courseId,
            moduleId: readOptionalFormString(formData, "moduleId"),
            actorId: context.actorId,
            title: readFormString(formData, "title"),
            slug: readFormString(formData, "slug"),
            sortOrder: readInteger(formData, "sortOrder"),
            durationSeconds: readInteger(formData, "durationSeconds"),
            required: formData.has("required"),
            providerAssetId: readOptionalFormString(formData, "providerAssetId"),
            playbackUrl: readOptionalFormString(formData, "playbackUrl"),
            transcriptLanguage: readOptionalFormString(formData, "transcriptLanguage") ?? undefined,
          },
          dependencies.repository,
        );

        return "Video lesson created.";
      });
    },
    async replaceChapters(slug, courseSlug, formData) {
      return runAction(async () => {
        const context = await dependencies.getContext(slug, courseSlug);

        await replaceVideoChapters(
          {
            organizationId: context.organizationId,
            lessonId: readFormString(formData, "lessonId"),
            actorId: context.actorId,
            chapters: readChapterRows(formData),
          },
          dependencies.repository,
        );

        return "Video chapters replaced.";
      });
    },
    async replaceTranscript(slug, courseSlug, formData) {
      return runAction(async () => {
        const context = await dependencies.getContext(slug, courseSlug);

        await replaceVideoTranscriptText(
          {
            organizationId: context.organizationId,
            lessonId: readFormString(formData, "lessonId"),
            actorId: context.actorId,
            transcriptText: readFormString(formData, "transcriptText"),
          },
          dependencies.repository,
        );

        return "Video transcript replaced.";
      });
    },
  };
}

async function runAction(operation: () => Promise<string>): Promise<VideoContentActionResult> {
  try {
    return { status: "success", message: await operation() };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "Video content action failed" };
  }
}

function readChapterRows(formData: FormData): VideoChapterInput[] {
  const titles = readFormStringList(formData, "chapterTitle");
  const starts = readFormStringList(formData, "chapterStartSecond");
  const ends = readFormStringList(formData, "chapterEndSecond");
  const rowCount = Math.max(titles.length, starts.length, ends.length);
  const chapters: VideoChapterInput[] = [];

  for (let index = 0; index < rowCount; index += 1) {
    const title = titles[index]?.trim() ?? "";
    const start = starts[index]?.trim() ?? "";
    const end = ends[index]?.trim() ?? "";

    if (!title && !start && !end) {
      continue;
    }

    chapters.push({
      title,
      startSecond: Number(start),
      endSecond: end ? Number(end) : null,
      sortOrder: chapters.length,
    });
  }

  return chapters;
}

function readFormString(formData: FormData, key: string): string {
  const value = formData.get(key);

  return typeof value === "string" ? value : "";
}

function readOptionalFormString(formData: FormData, key: string): string | null {
  const value = readFormString(formData, key).trim();

  return value || null;
}

function readFormStringList(formData: FormData, key: string): string[] {
  return formData.getAll(key).filter((value): value is string => typeof value === "string");
}

function readInteger(formData: FormData, key: string): number {
  return Number(readFormString(formData, key));
}
