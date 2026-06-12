import type { Prisma, PrismaClient } from "@prisma/client";

import type { VideoContentRepository } from "./video-content-service";
import type { TranscriptSearchCue } from "./transcript-search";
import type {
  VideoRuntimeAssignment,
  VideoRuntimeRepository,
} from "./video-runtime";

type PrismaVideoClient = Pick<
  PrismaClient,
  | "$transaction"
  | "course"
  | "courseModule"
  | "videoLesson"
  | "videoChapter"
  | "videoTranscriptCue"
  | "videoLessonProgress"
  | "courseAssignment"
  | "assignmentProgress"
  | "learningProgressEvent"
  | "auditLog"
>;

export type PrismaVideoRepository = VideoContentRepository &
  VideoRuntimeRepository & {
    findTranscriptSearchCues(input: {
      organizationId: string;
      courseId: string;
    }): Promise<TranscriptSearchCue[]>;
  };

type RuntimeAssignmentRecord = {
  id: string;
  organizationId: string;
  courseId: string;
  course: {
    id: string;
    title: string;
    type: VideoRuntimeAssignment["course"]["type"];
    status: unknown;
    modules: VideoRuntimeAssignment["course"]["modules"];
    videoLessons: VideoRuntimeAssignment["course"]["lessons"];
    knowledgeCheckQuestions: VideoRuntimeAssignment["course"]["knowledgeChecks"];
  };
  videoProgress: VideoRuntimeAssignment["videoProgress"];
  knowledgeCheckAttempts: VideoRuntimeAssignment["knowledgeCheckAttempts"];
};

function rawPayloadToJson(rawPayload: unknown): Prisma.InputJsonValue {
  if (rawPayload === null || rawPayload === undefined) {
    return {};
  }

  return rawPayload as Prisma.InputJsonValue;
}

export function createPrismaVideoRepository(client: PrismaVideoClient): PrismaVideoRepository {
  let transactionClient: PrismaVideoClient | null = null;
  const activeClient = () => transactionClient ?? client;

  return {
    async runInTransaction(operation) {
      return client.$transaction(async (transaction) => {
        transactionClient = transaction as PrismaVideoClient;

        try {
          return await operation();
        } finally {
          transactionClient = null;
        }
      });
    },
    findCourse(input) {
      return activeClient().course.findFirst({
        where: {
          id: input.courseId,
          organizationId: input.organizationId,
        },
        select: {
          id: true,
          organizationId: true,
          type: true,
        },
      });
    },
    findModule(input) {
      return activeClient().courseModule.findFirst({
        where: {
          id: input.moduleId,
          organizationId: input.organizationId,
          courseId: input.courseId,
        },
        select: {
          id: true,
          organizationId: true,
          courseId: true,
        },
      });
    },
    createLesson(data) {
      return activeClient().videoLesson.create({
        data,
        select: {
          id: true,
          slug: true,
        },
      });
    },
    async replaceChapters(input) {
      await activeClient().videoChapter.deleteMany({
        where: {
          organizationId: input.organizationId,
          lessonId: input.lessonId,
        },
      });

      if (input.chapters.length === 0) {
        return;
      }

      await activeClient().videoChapter.createMany({
        data: input.chapters.map((chapter) => ({
          organizationId: input.organizationId,
          lessonId: input.lessonId,
          title: chapter.title,
          startSecond: chapter.startSecond,
          endSecond: chapter.endSecond,
          sortOrder: chapter.sortOrder,
        })),
      });
    },
    async replaceTranscriptCues(input) {
      await activeClient().videoTranscriptCue.deleteMany({
        where: {
          organizationId: input.organizationId,
          lessonId: input.lessonId,
        },
      });

      if (input.cues.length === 0) {
        return;
      }

      await activeClient().videoTranscriptCue.createMany({
        data: input.cues.map((cue) => ({
          organizationId: input.organizationId,
          lessonId: input.lessonId,
          startSecond: cue.startSecond,
          endSecond: cue.endSecond,
          text: cue.text,
        })),
      });
    },
    findLesson(input) {
      return activeClient().videoLesson.findFirst({
        where: {
          id: input.lessonId,
          organizationId: input.organizationId,
        },
        select: {
          id: true,
          durationSeconds: true,
        },
      });
    },
    async recordAuditLog(input) {
      await activeClient().auditLog.create({
        data: {
          organizationId: input.organizationId,
          actorId: input.actorId,
          action: input.action,
          targetType: input.targetType,
          targetId: input.targetId,
        },
      });
    },
    async findAssignmentForRuntime(input) {
      const assignment = await activeClient().courseAssignment.findFirst({
        where: {
          id: input.assignmentId,
          organizationId: input.organizationId,
        },
        select: {
          id: true,
          organizationId: true,
          courseId: true,
          course: {
            select: {
              id: true,
              title: true,
              type: true,
              status: true,
              modules: {
                orderBy: { sortOrder: "asc" },
                select: {
                  id: true,
                  title: true,
                  slug: true,
                  sortOrder: true,
                },
              },
              videoLessons: {
                orderBy: { sortOrder: "asc" },
                select: {
                  id: true,
                  moduleId: true,
                  title: true,
                  slug: true,
                  sortOrder: true,
                  durationSeconds: true,
                  required: true,
                  playbackUrl: true,
                  providerAssetId: true,
                  providerUploadId: true,
                  providerPlaybackId: true,
                  providerStatus: true,
                  providerError: true,
                  chapters: {
                    orderBy: { sortOrder: "asc" },
                    select: {
                      id: true,
                      title: true,
                      startSecond: true,
                      endSecond: true,
                      sortOrder: true,
                    },
                  },
                  transcriptCues: {
                    orderBy: { startSecond: "asc" },
                    select: {
                      id: true,
                      startSecond: true,
                      endSecond: true,
                      text: true,
                    },
                  },
                },
              },
              knowledgeCheckQuestions: {
                where: { active: true },
                orderBy: [{ lessonId: "asc" }, { sortOrder: "asc" }],
                select: {
                  id: true,
                  lessonId: true,
                  prompt: true,
                  questionType: true,
                  required: true,
                  active: true,
                  explanation: true,
                  answers: {
                    where: { organizationId: input.organizationId },
                    orderBy: { sortOrder: "asc" },
                    select: {
                      id: true,
                      text: true,
                      correct: true,
                    },
                  },
                },
              },
            },
          },
          videoProgress: {
            select: {
              lessonId: true,
              lastPositionSecond: true,
              maxWatchedSecond: true,
              completed: true,
              lastWatchedAt: true,
            },
          },
          knowledgeCheckAttempts: {
            orderBy: [{ questionId: "asc" }, { submittedAt: "asc" }],
            select: {
              questionId: true,
              selectedAnswerIds: true,
              correct: true,
              scorePercent: true,
            },
          },
        },
      });

      return assignment ? mapRuntimeAssignment(assignment) : null;
    },
    upsertLessonProgress(input) {
      return activeClient().videoLessonProgress.upsert({
        where: {
          organizationId_assignmentId_lessonId: {
            organizationId: input.organizationId,
            assignmentId: input.assignmentId,
            lessonId: input.lessonId,
          },
        },
        update: {
          lastPositionSecond: input.lastPositionSecond,
          maxWatchedSecond: input.maxWatchedSecond,
          completed: input.completed,
          lastWatchedAt: input.lastWatchedAt,
        },
        create: {
          organizationId: input.organizationId,
          courseId: input.courseId,
          assignmentId: input.assignmentId,
          lessonId: input.lessonId,
          lastPositionSecond: input.lastPositionSecond,
          maxWatchedSecond: input.maxWatchedSecond,
          completed: input.completed,
          lastWatchedAt: input.lastWatchedAt,
        },
        select: {
          lessonId: true,
          lastPositionSecond: true,
          maxWatchedSecond: true,
          completed: true,
          lastWatchedAt: true,
        },
      });
    },
    async findAssignmentForProgress(input) {
      const assignment = await activeClient().courseAssignment.findFirst({
        where: {
          id: input.assignmentId,
          organizationId: input.organizationId,
        },
        select: {
          id: true,
          organizationId: true,
          status: true,
          course: {
            select: {
              type: true,
            },
          },
          progress: {
            select: {
              progressPercent: true,
            },
          },
        },
      });

      return assignment
        ? {
            id: assignment.id,
            organizationId: assignment.organizationId,
            courseType: assignment.course.type,
            status: assignment.status,
            currentProgressPercent: assignment.progress?.progressPercent ?? 0,
          }
        : null;
    },
    async saveProgressUpdate(input) {
      await activeClient().learningProgressEvent.create({
        data: {
          organizationId: input.organizationId,
          assignmentId: input.assignmentId,
          source: input.event.source,
          type: input.event.type,
          progressPercent: input.event.progressPercent,
          rawPayload: rawPayloadToJson(input.event.rawPayload),
          occurredAt: input.event.occurredAt,
        },
      });

      await activeClient().assignmentProgress.upsert({
        where: {
          organizationId_assignmentId: {
            organizationId: input.organizationId,
            assignmentId: input.assignmentId,
          },
        },
        update: {
          progressPercent: input.progress.progressPercent,
          lastEventAt: input.event.occurredAt,
        },
        create: {
          organizationId: input.organizationId,
          assignmentId: input.assignmentId,
          progressPercent: input.progress.progressPercent,
          lastEventAt: input.event.occurredAt,
        },
      });

      await activeClient().courseAssignment.update({
        where: {
          organizationId_id: {
            organizationId: input.organizationId,
            id: input.assignmentId,
          },
        },
        data: {
          status: input.progress.assignmentStatus,
        },
      });
    },
    async findTranscriptSearchCues(input) {
      const cues = await activeClient().videoTranscriptCue.findMany({
        where: {
          organizationId: input.organizationId,
          lesson: {
            courseId: input.courseId,
          },
        },
        orderBy: [
          { lesson: { sortOrder: "asc" } },
          { startSecond: "asc" },
        ],
        select: {
          startSecond: true,
          endSecond: true,
          text: true,
          lesson: {
            select: {
              id: true,
              title: true,
              sortOrder: true,
            },
          },
        },
      });

      return cues.map((cue) => ({
        lessonId: cue.lesson.id,
        lessonTitle: cue.lesson.title,
        lessonSortOrder: cue.lesson.sortOrder,
        startSecond: cue.startSecond,
        endSecond: cue.endSecond,
        text: cue.text,
      }));
    },
  };
}

function mapRuntimeAssignment(assignment: RuntimeAssignmentRecord): VideoRuntimeAssignment {
  if (!assignment) {
    throw new Error("Assignment was not found");
  }

  return {
    id: assignment.id,
    organizationId: assignment.organizationId,
    courseId: assignment.courseId,
    course: {
      id: assignment.course.id,
      title: assignment.course.title,
      type: assignment.course.type,
      modules: assignment.course.modules,
      lessons: assignment.course.videoLessons,
      knowledgeChecks: assignment.course.knowledgeCheckQuestions,
    },
    videoProgress: assignment.videoProgress,
    knowledgeCheckAttempts: assignment.knowledgeCheckAttempts,
  };
}
