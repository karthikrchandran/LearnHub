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
                manifestTitle: true,
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
        lastLaunchedAt: launchedAt,
      },
      create: {
        organizationId: "org_1",
        assignmentId: "assignment_1",
        packageId: "package_1",
        launchCount: 2,
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
});
