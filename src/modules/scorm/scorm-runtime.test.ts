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
      contentRootKey: "org/org_1/courses/course_1/scorm/package_1/content",
      manifestTitle: "Policy Orientation",
      extractionStatus: "READY",
      malwareScanStatus: "PASSED",
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
  transactions = 0;
  failProgressUpdate = false;
  launched: Parameters<ScormRuntimeRepository["upsertLaunchRegistration"]>[0][] = [];
  commits: Parameters<ScormRuntimeRepository["saveRuntimeCommit"]>[0][] = [];
  learningEvents: LearningEventInput[] = [];
  progressUpdates: Parameters<ScormRuntimeRepository["saveProgressUpdate"]>[0]["progress"][] = [];

  async runInTransaction<T>(operation: () => Promise<T>): Promise<T> {
    this.transactions += 1;
    const commits = structuredClone(this.commits);
    const learningEvents = structuredClone(this.learningEvents);
    const progressUpdates = structuredClone(this.progressUpdates);

    try {
      return await operation();
    } catch (error) {
      this.commits = commits;
      this.learningEvents = learningEvents;
      this.progressUpdates = progressUpdates;
      throw error;
    }
  }

  async findAssignmentForRuntime(): Promise<ScormRuntimeAssignment | null> {
    return this.assignment ? structuredClone(this.assignment) : null;
  }

  async upsertLaunchRegistration(input: Parameters<ScormRuntimeRepository["upsertLaunchRegistration"]>[0]) {
    this.launched.push(input);
    return { ...assignment.scormRegistration!, launchCount: input.launchCount, sessionTimeSeconds: 0 };
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

  async findAssignmentForProgress(): Promise<Awaited<ReturnType<ScormRuntimeRepository["findAssignmentForProgress"]>>> {
    if (!this.assignment) {
      return null;
    }

    return {
      id: this.assignment.id,
      organizationId: this.assignment.organizationId,
      courseType: "SCORM_1_2",
      status: "ASSIGNED",
      currentProgressPercent: this.progressUpdates.at(-1)?.progressPercent ?? 0,
    };
  }

  async saveProgressUpdate(input: Parameters<ScormRuntimeRepository["saveProgressUpdate"]>[0]): Promise<void> {
    if (this.failProgressUpdate) {
      throw new Error("Learning progress persistence failed");
    }

    this.learningEvents.push(input.event);
    this.progressUpdates.push(input.progress);
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
      launchUrl: "/scorm/org/org_1/courses/course_1/scorm/package_1/content/index.html",
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

  it("blocks launch until extraction is ready and malware has passed", async () => {
    const pendingExtraction = structuredClone(assignment);
    pendingExtraction.course.scormPackage = {
      ...pendingExtraction.course.scormPackage!,
      extractionStatus: "PENDING",
      malwareScanStatus: "PASSED",
    };
    const failedMalware = structuredClone(assignment);
    failedMalware.course.scormPackage = {
      ...failedMalware.course.scormPackage!,
      extractionStatus: "READY",
      malwareScanStatus: "FAILED",
    };

    await expect(
      launchScormRegistration(
        { organizationId: "org_1", assignmentId: "assignment_1", occurredAt: now },
        createRepository({ assignment: pendingExtraction }),
      ),
    ).rejects.toThrow("SCORM package is not ready");
    await expect(
      launchScormRegistration(
        { organizationId: "org_1", assignmentId: "assignment_1", occurredAt: now },
        createRepository({ assignment: failedMalware }),
      ),
    ).rejects.toThrow("SCORM package malware scan has not passed");
  });
});

describe("commitScormRuntime", () => {
  it("merges allowed CMI values and records SCORM progress below completion", async () => {
    const repository = createRepository();

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
    expect(repository.learningEvents[0]).toMatchObject({
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
      const repository = createRepository();

      await commitScormRuntime(
        {
          organizationId: "org_1",
          assignmentId: "assignment_1",
          cmiData: { "cmi.core.lesson_status": lessonStatus },
          occurredAt: now,
        },
        repository,
      );

      expect(repository.learningEvents[0]).toMatchObject({
        source: "SCORM",
        type: eventType,
        progressPercent: 100,
      });
    }
  });

  it("does not double-count repeated session time commits in the same launch", async () => {
    const repeatedSessionAssignment = structuredClone(assignment);
    repeatedSessionAssignment.scormRegistration = {
      ...assignment.scormRegistration!,
      cmiData: { "cmi.core.lesson_status": "incomplete", "cmi.core.session_time": "00:05:00" },
      sessionTimeSeconds: 300,
      totalTimeSeconds: 900,
    };
    const repository = createRepository({ assignment: repeatedSessionAssignment });

    await commitScormRuntime(
      {
        organizationId: "org_1",
        assignmentId: "assignment_1",
        cmiData: { "cmi.core.session_time": "00:07:00" },
        occurredAt: now,
      },
      repository,
    );

    expect(repository.commits[0]).toMatchObject({
      sessionTimeSeconds: 420,
      totalTimeSeconds: 1020,
    });
  });

  it("rejects malformed session time without persisting runtime or learning progress", async () => {
    const repository = createRepository();

    await expect(
      commitScormRuntime(
        {
          organizationId: "org_1",
          assignmentId: "assignment_1",
          cmiData: { "cmi.core.session_time": "99:99:99" },
          occurredAt: now,
        },
        repository,
      ),
    ).rejects.toThrow("Invalid SCORM 1.2 time");

    expect(repository.commits).toEqual([]);
    expect(repository.learningEvents).toEqual([]);
  });

  it("ignores incoming total time and persists the LMS-derived total", async () => {
    const repository = createRepository();

    await commitScormRuntime(
      {
        organizationId: "org_1",
        assignmentId: "assignment_1",
        cmiData: {
          "cmi.core.session_time": "00:03:00",
          "cmi.core.total_time": "99:00:00",
        },
        occurredAt: now,
      },
      repository,
    );

    expect(repository.commits[0]).toMatchObject({
      sessionTimeSeconds: 180,
      totalTimeSeconds: 180,
    });
    expect(repository.commits[0].cmiData).not.toHaveProperty("cmi.core.total_time");
  });

  it("keeps failed SCORM attempts with scores incomplete", async () => {
    const repository = createRepository();

    const result = await commitScormRuntime(
      {
        organizationId: "org_1",
        assignmentId: "assignment_1",
        cmiData: {
          "cmi.core.lesson_status": "failed",
          "cmi.core.score.raw": "85",
        },
        occurredAt: now,
      },
      repository,
    );

    expect(result.completed).toBe(false);
    expect(repository.learningEvents[0]).toMatchObject({
      type: "FAILED",
      progressPercent: 85,
    });
    expect(repository.progressUpdates[0]).toMatchObject({
      assignmentStatus: "IN_PROGRESS",
      progressPercent: 85,
    });
  });

  it("rolls back runtime commit when learning progress persistence fails", async () => {
    const repository = createRepository();
    repository.failProgressUpdate = true;

    await expect(
      commitScormRuntime(
        {
          organizationId: "org_1",
          assignmentId: "assignment_1",
          cmiData: { "cmi.core.lesson_status": "completed" },
          occurredAt: now,
        },
        repository,
      ),
    ).rejects.toThrow("Learning progress persistence failed");

    expect(repository.transactions).toBe(1);
    expect(repository.commits).toEqual([]);
    expect(repository.learningEvents).toEqual([]);
    expect(repository.progressUpdates).toEqual([]);
  });
});
