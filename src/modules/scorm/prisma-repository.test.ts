import type { PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import { createPrismaScormRepository } from "./prisma-repository";

describe("createPrismaScormRepository", () => {
  it("looks up package courses by organization and course id", async () => {
    const findFirst = vi.fn(async () => null);
    const repository = createPrismaScormRepository({
      $transaction: vi.fn(),
      course: { findFirst } as unknown as PrismaClient["course"],
      scormPackage: {} as never,
      scormRegistration: {} as never,
      courseAssignment: {} as never,
      assignmentProgress: {} as never,
      learningProgressEvent: {} as never,
      auditLog: {} as never,
    });

    await repository.findCourse({ organizationId: "org_1", courseId: "course_1" });

    expect(findFirst).toHaveBeenCalledWith({
      where: { id: "course_1", organizationId: "org_1" },
      select: { id: true, organizationId: true, type: true },
    });
  });

  it("loads runtime assignment with course type, active package, and registration", async () => {
    const findFirst = vi.fn(async () => null);
    const repository = createPrismaScormRepository({
      $transaction: vi.fn(),
      course: {} as never,
      scormPackage: {} as never,
      scormRegistration: {} as never,
      courseAssignment: { findFirst } as unknown as PrismaClient["courseAssignment"],
      assignmentProgress: {} as never,
      learningProgressEvent: {} as never,
      auditLog: {} as never,
    });

    await repository.findAssignmentForRuntime({ organizationId: "org_1", assignmentId: "assignment_1" });

    expect(findFirst).toHaveBeenCalledWith({
      where: { id: "assignment_1", organizationId: "org_1" },
      select: {
        id: true,
        organizationId: true,
        courseId: true,
        course: {
          select: {
            id: true,
            title: true,
            type: true,
            scormPackages: {
              where: { active: true },
              take: 1,
              orderBy: { updatedAt: "desc" },
              select: {
                id: true,
                launchPath: true,
                storageKey: true,
                contentRootKey: true,
                manifestTitle: true,
                extractionStatus: true,
                malwareScanStatus: true,
              },
            },
          },
        },
        scormRegistration: {
          select: {
            id: true,
            packageId: true,
            cmiData: true,
            lessonStatus: true,
            scoreRaw: true,
            sessionTimeSeconds: true,
            totalTimeSeconds: true,
            launchCount: true,
            lastLaunchedAt: true,
            lastCommittedAt: true,
          },
        },
      },
    });
  });

  it("upserts registration launch state using organization and assignment", async () => {
    const upsert = vi.fn(async () => ({
      id: "registration_1",
      packageId: "package_1",
      cmiData: {},
      lessonStatus: "not attempted",
      scoreRaw: null,
      sessionTimeSeconds: 0,
      totalTimeSeconds: 0,
      launchCount: 2,
      lastLaunchedAt: new Date("2026-06-10T12:00:00.000Z"),
      lastCommittedAt: null,
    }));
    const repository = createPrismaScormRepository({
      $transaction: vi.fn(),
      course: {} as never,
      scormPackage: {} as never,
      scormRegistration: { upsert } as unknown as PrismaClient["scormRegistration"],
      courseAssignment: {} as never,
      assignmentProgress: {} as never,
      learningProgressEvent: {} as never,
      auditLog: {} as never,
    });
    const launchedAt = new Date("2026-06-10T12:00:00.000Z");

    await repository.upsertLaunchRegistration({
      organizationId: "org_1",
      assignmentId: "assignment_1",
      packageId: "package_1",
      launchCount: 2,
      launchedAt,
    });

    expect(upsert).toHaveBeenCalledWith({
      where: {
        organizationId_assignmentId: {
          organizationId: "org_1",
          assignmentId: "assignment_1",
        },
      },
      update: {
        packageId: "package_1",
        launchCount: 2,
        sessionTimeSeconds: 0,
        lastLaunchedAt: launchedAt,
      },
      create: {
        organizationId: "org_1",
        assignmentId: "assignment_1",
        packageId: "package_1",
        launchCount: 2,
        sessionTimeSeconds: 0,
        lastLaunchedAt: launchedAt,
      },
      select: {
        id: true,
        packageId: true,
        cmiData: true,
        lessonStatus: true,
        scoreRaw: true,
        sessionTimeSeconds: true,
        totalTimeSeconds: true,
        launchCount: true,
        lastLaunchedAt: true,
        lastCommittedAt: true,
      },
    });
  });

  it("upserts packages with separate zip storage and content root keys", async () => {
    const upsert = vi.fn(async () => ({
      id: "package_1",
      storageKey: "org/org_1/courses/course_1/scorm/package_1/policy.zip",
    }));
    const repository = createPrismaScormRepository({
      $transaction: vi.fn(),
      course: {} as never,
      scormPackage: { upsert } as unknown as PrismaClient["scormPackage"],
      scormRegistration: {} as never,
      courseAssignment: {} as never,
      assignmentProgress: {} as never,
      learningProgressEvent: {} as never,
      auditLog: {} as never,
    });

    await repository.upsertPackage({
      packageId: "package_1",
      organizationId: "org_1",
      courseId: "course_1",
      originalFileName: "policy.zip",
      contentType: "application/zip",
      byteSize: 1024,
      storageKey: "org/org_1/courses/course_1/scorm/package_1/policy.zip",
      contentRootKey: "org/org_1/courses/course_1/scorm/package_1/content",
      launchPath: "index.html",
      manifestTitle: "Policy",
      uploadedByUserId: "user_1",
      extractionStatus: "PENDING",
      malwareScanStatus: "PENDING",
    });

    expect(upsert).toHaveBeenCalledWith({
      where: {
        organizationId_courseId: {
          organizationId: "org_1",
          courseId: "course_1",
        },
      },
      update: expect.objectContaining({
        storageKey: "org/org_1/courses/course_1/scorm/package_1/policy.zip",
        contentRootKey: "org/org_1/courses/course_1/scorm/package_1/content",
        extractionStatus: "PENDING",
        malwareScanStatus: "PENDING",
      }),
      create: expect.objectContaining({
        id: "package_1",
        storageKey: "org/org_1/courses/course_1/scorm/package_1/policy.zip",
        contentRootKey: "org/org_1/courses/course_1/scorm/package_1/content",
        extractionStatus: "PENDING",
        malwareScanStatus: "PENDING",
      }),
      select: { id: true, storageKey: true },
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
    const repository = createPrismaScormRepository({
      $transaction: transaction as unknown as PrismaClient["$transaction"],
      course: {} as never,
      scormPackage: {} as never,
      scormRegistration: {} as never,
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
          source: "SCORM",
          type: "PROGRESS",
          progressPercent: 50,
          rawPayload: { lessonStatus: "incomplete" },
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
