import type { PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import { createPrismaVideoRepository } from "./prisma-repository";

describe("createPrismaVideoRepository", () => {
  it("loads runtime assignments with tenant, course, content, and lesson progress scope", async () => {
    const findFirst = vi.fn(async () => null);
    const repository = createPrismaVideoRepository({
      $transaction: vi.fn(),
      course: {} as never,
      courseModule: {} as never,
      videoLesson: {} as never,
      videoChapter: {} as never,
      videoTranscriptCue: {} as never,
      videoLessonProgress: {} as never,
      courseAssignment: { findFirst } as unknown as PrismaClient["courseAssignment"],
      assignmentProgress: {} as never,
      learningProgressEvent: {} as never,
      auditLog: {} as never,
    });

    await repository.findAssignmentForRuntime({
      organizationId: "org_1",
      assignmentId: "assignment_1",
    });

    expect(findFirst).toHaveBeenCalledWith({
      where: {
        id: "assignment_1",
        organizationId: "org_1",
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
      },
    });
  });

  it("upserts lesson progress with the compound organization assignment lesson key", async () => {
    const upsert = vi.fn(async () => ({
      lessonId: "lesson_1",
      lastPositionSecond: 180,
      maxWatchedSecond: 180,
      completed: true,
      lastWatchedAt: new Date("2026-06-10T10:00:00.000Z"),
    }));
    const repository = createPrismaVideoRepository({
      $transaction: vi.fn(),
      course: {} as never,
      courseModule: {} as never,
      videoLesson: {} as never,
      videoChapter: {} as never,
      videoTranscriptCue: {} as never,
      videoLessonProgress: { upsert } as unknown as PrismaClient["videoLessonProgress"],
      courseAssignment: {} as never,
      assignmentProgress: {} as never,
      learningProgressEvent: {} as never,
      auditLog: {} as never,
    });
    const lastWatchedAt = new Date("2026-06-10T10:00:00.000Z");

    await repository.upsertLessonProgress({
      organizationId: "org_1",
      courseId: "course_1",
      assignmentId: "assignment_1",
      lessonId: "lesson_1",
      lastPositionSecond: 180,
      maxWatchedSecond: 180,
      completed: true,
      lastWatchedAt,
    });

    expect(upsert).toHaveBeenCalledWith({
      where: {
        organizationId_assignmentId_lessonId: {
          organizationId: "org_1",
          assignmentId: "assignment_1",
          lessonId: "lesson_1",
        },
      },
      update: {
        lastPositionSecond: 180,
        maxWatchedSecond: 180,
        completed: true,
        lastWatchedAt,
      },
      create: {
        organizationId: "org_1",
        courseId: "course_1",
        assignmentId: "assignment_1",
        lessonId: "lesson_1",
        lastPositionSecond: 180,
        maxWatchedSecond: 180,
        completed: true,
        lastWatchedAt,
      },
      select: {
        lessonId: true,
        lastPositionSecond: true,
        maxWatchedSecond: true,
        completed: true,
        lastWatchedAt: true,
      },
    });
  });

  it("loads transcript search cues by organization and course lessons only", async () => {
    const findMany = vi.fn(async () => []);
    const repository = createPrismaVideoRepository({
      $transaction: vi.fn(),
      course: {} as never,
      courseModule: {} as never,
      videoLesson: {} as never,
      videoChapter: {} as never,
      videoTranscriptCue: { findMany } as unknown as PrismaClient["videoTranscriptCue"],
      videoLessonProgress: {} as never,
      courseAssignment: {} as never,
      assignmentProgress: {} as never,
      learningProgressEvent: {} as never,
      auditLog: {} as never,
    });

    await repository.findTranscriptSearchCues({
      organizationId: "org_1",
      courseId: "course_1",
    });

    expect(findMany).toHaveBeenCalledWith({
      where: {
        organizationId: "org_1",
        lesson: {
          courseId: "course_1",
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
  });

  it("saves learning progress through the active transaction client", async () => {
    const learningProgressEventCreate = vi.fn(async () => null);
    const assignmentProgressUpsert = vi.fn(async () => null);
    const courseAssignmentUpdate = vi.fn(async () => null);
    const rootLearningProgressEventCreate = vi.fn(async () => null);
    const rootAssignmentProgressUpsert = vi.fn(async () => null);
    const rootCourseAssignmentUpdate = vi.fn(async () => null);
    const transaction = vi.fn(async (operation) =>
      operation({
        learningProgressEvent: { create: learningProgressEventCreate },
        assignmentProgress: { upsert: assignmentProgressUpsert },
        courseAssignment: { update: courseAssignmentUpdate },
      }),
    );
    const repository = createPrismaVideoRepository({
      $transaction: transaction as unknown as PrismaClient["$transaction"],
      course: {} as never,
      courseModule: {} as never,
      videoLesson: {} as never,
      videoChapter: {} as never,
      videoTranscriptCue: {} as never,
      videoLessonProgress: {} as never,
      courseAssignment: { update: rootCourseAssignmentUpdate } as unknown as PrismaClient["courseAssignment"],
      assignmentProgress: { upsert: rootAssignmentProgressUpsert } as unknown as PrismaClient["assignmentProgress"],
      learningProgressEvent: { create: rootLearningProgressEventCreate } as unknown as PrismaClient["learningProgressEvent"],
      auditLog: {} as never,
    });
    const occurredAt = new Date("2026-06-11T10:00:00.000Z");

    await repository.runInTransaction(async () => {
      await repository.saveProgressUpdate({
        organizationId: "org_1",
        assignmentId: "assignment_1",
        event: {
          organizationId: "org_1",
          assignmentId: "assignment_1",
          source: "NATIVE",
          type: "PROGRESS",
          progressPercent: 50,
          rawPayload: { lessonId: "lesson_1" },
          occurredAt,
        },
        progress: {
          progressPercent: 50,
          assignmentStatus: "IN_PROGRESS",
        },
      });
    });

    expect(learningProgressEventCreate).toHaveBeenCalledTimes(1);
    expect(assignmentProgressUpsert).toHaveBeenCalledTimes(1);
    expect(courseAssignmentUpdate).toHaveBeenCalledTimes(1);
    expect(rootLearningProgressEventCreate).not.toHaveBeenCalled();
    expect(rootAssignmentProgressUpsert).not.toHaveBeenCalled();
    expect(rootCourseAssignmentUpdate).not.toHaveBeenCalled();
  });
});
