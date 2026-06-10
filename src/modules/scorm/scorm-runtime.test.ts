import { describe, expect, it } from "vitest";

import {
  commitScormRuntime,
  launchScormRegistration,
  type ScormRuntimeAssignment,
  type ScormRuntimeRepository,
} from "./scorm-runtime";
import type { LearningEventInput } from "../progress/progress";

const now = new Date("2026-06-10T12:00:00.000Z");

const assignment: ScormRuntimeAssignment = {
  id: "assignment_1",
  organizationId: "org_1",
  courseId: "course_1",
  course: {
    id: "course_1",
    title: "Policy Orientation",
    type: "SCORM_1_2",
    scormPackage: {
      id: "package_1",
      launchPath: "index.html",
      storageKey: "org/org_1/courses/course_1/scorm/package_1/policy.zip",
      manifestTitle: "Policy Orientation",
    },
  },
  scormRegistration: {
    id: "registration_1",
    packageId: "package_1",
    cmiData: { "cmi.core.lesson_status": "incomplete" },
    lessonStatus: "incomplete",
    scoreRaw: null,
    sessionTimeSeconds: 0,
    totalTimeSeconds: 0,
    launchCount: 1,
    lastLaunchedAt: null,
    lastCommittedAt: null,
  },
};

class FakeScormRuntimeRepository implements ScormRuntimeRepository {
  assignment: ScormRuntimeAssignment | null = assignment;
  launched: Parameters<ScormRuntimeRepository["upsertLaunchRegistration"]>[0][] = [];
  commits: Parameters<ScormRuntimeRepository["saveRuntimeCommit"]>[0][] = [];

  async findAssignmentForRuntime(): Promise<ScormRuntimeAssignment | null> {
    return this.assignment ? structuredClone(this.assignment) : null;
  }

  async upsertLaunchRegistration(input: Parameters<ScormRuntimeRepository["upsertLaunchRegistration"]>[0]) {
    this.launched.push(input);
    return { ...assignment.scormRegistration!, launchCount: input.launchCount };
  }

  async saveRuntimeCommit(input: Parameters<ScormRuntimeRepository["saveRuntimeCommit"]>[0]) {
    this.commits.push(input);
    return {
      id: "registration_1",
      packageId: input.packageId,
      cmiData: input.cmiData,
      lessonStatus: input.lessonStatus,
      scoreRaw: input.scoreRaw,
      sessionTimeSeconds: input.sessionTimeSeconds,
      totalTimeSeconds: input.totalTimeSeconds,
      launchCount: 2,
      lastLaunchedAt: now,
      lastCommittedAt: input.committedAt,
    };
  }
}

function createRepository(overrides: Partial<FakeScormRuntimeRepository> = {}): FakeScormRuntimeRepository {
  return Object.assign(new FakeScormRuntimeRepository(), overrides);
}

describe("launchScormRegistration", () => {
  it("rejects missing assignments", async () => {
    await expect(
      launchScormRegistration(
        { organizationId: "org_1", assignmentId: "missing", occurredAt: now },
        createRepository({ assignment: null }),
      ),
    ).rejects.toThrow("Assignment was not found");
  });

  it("rejects non-SCORM assignments", async () => {
    const nonScorm = structuredClone(assignment);
    nonScorm.course.type = "NATIVE_VIDEO";

    await expect(
      launchScormRegistration(
        { organizationId: "org_1", assignmentId: "assignment_1", occurredAt: now },
        createRepository({ assignment: nonScorm }),
      ),
    ).rejects.toThrow("Assignment is not for a SCORM 1.2 course");
  });

  it("rejects assignments without a package", async () => {
    const missingPackage = structuredClone(assignment);
    missingPackage.course.scormPackage = null;

    await expect(
      launchScormRegistration(
        { organizationId: "org_1", assignmentId: "assignment_1", occurredAt: now },
        createRepository({ assignment: missingPackage }),
      ),
    ).rejects.toThrow("SCORM package was not found");
  });

  it("increments launch count and returns launch URL and state", async () => {
    const repository = createRepository();

    const result = await launchScormRegistration(
      { organizationId: "org_1", assignmentId: "assignment_1", occurredAt: now },
      repository,
    );

    expect(result).toEqual({
      assignmentId: "assignment_1",
      packageId: "package_1",
      launchUrl: "/scorm/org/org_1/courses/course_1/scorm/package_1/policy.zip/index.html",
      cmiData: { "cmi.core.lesson_status": "incomplete" },
      launchCount: 2,
    });
    expect(repository.launched[0]).toMatchObject({
      organizationId: "org_1",
      assignmentId: "assignment_1",
      packageId: "package_1",
      launchCount: 2,
      launchedAt: now,
    });
  });
});

describe("commitScormRuntime", () => {
  it("merges allowed CMI values and records SCORM progress below completion", async () => {
    const repository = createRepository();
    const events: LearningEventInput[] = [];

    const result = await commitScormRuntime(
      {
        organizationId: "org_1",
        assignmentId: "assignment_1",
        cmiData: {
          "cmi.core.lesson_status": "incomplete",
          "cmi.core.score.raw": "80",
          "cmi.core.session_time": "00:10:00",
          "cmi.suspend_data": "bookmark=page2",
          "cmi.not_allowed": "ignored",
        },
        occurredAt: now,
      },
      repository,
      async (event) => {
        events.push(event);
        return { progressPercent: event.progressPercent ?? 0, assignmentStatus: "IN_PROGRESS", completed: false };
      },
    );

    expect(result.progressPercent).toBe(80);
    expect(repository.commits[0]).toMatchObject({
      lessonStatus: "incomplete",
      scoreRaw: 80,
      sessionTimeSeconds: 600,
      totalTimeSeconds: 600,
      cmiData: {
        "cmi.core.lesson_status": "incomplete",
        "cmi.core.score.raw": "80",
        "cmi.core.session_time": "00:10:00",
        "cmi.suspend_data": "bookmark=page2",
      },
    });
    expect(events[0]).toMatchObject({
      source: "SCORM",
      type: "PROGRESS",
      progressPercent: 80,
    });
  });

  it("records SCORM completed and passed events", async () => {
    for (const [lessonStatus, eventType] of [
      ["completed", "COMPLETED"],
      ["passed", "PASSED"],
    ] as const) {
      const events: LearningEventInput[] = [];

      await commitScormRuntime(
        {
          organizationId: "org_1",
          assignmentId: "assignment_1",
          cmiData: { "cmi.core.lesson_status": lessonStatus },
          occurredAt: now,
        },
        createRepository(),
        async (event) => {
          events.push(event);
          return { progressPercent: 100, assignmentStatus: "COMPLETED", completed: true };
        },
      );

      expect(events[0]).toMatchObject({
        source: "SCORM",
        type: eventType,
        progressPercent: 100,
      });
    }
  });
});
