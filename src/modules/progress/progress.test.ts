import { describe, expect, it } from "vitest";

import { recordLearningEvent, type ProgressRepository } from "./progress";

function createRepository(
  assignment: Awaited<ReturnType<ProgressRepository["findAssignmentForProgress"]>>,
): ProgressRepository & {
  events: Parameters<ProgressRepository["saveProgressUpdate"]>[0]["event"][];
  updates: Parameters<ProgressRepository["saveProgressUpdate"]>[0]["progress"][];
} {
  const events: Parameters<ProgressRepository["saveProgressUpdate"]>[0]["event"][] = [];
  const updates: Parameters<ProgressRepository["saveProgressUpdate"]>[0]["progress"][] = [];

  return {
    events,
    updates,
    async findAssignmentForProgress() {
      return assignment;
    },
    async saveProgressUpdate(data) {
      events.push(data.event);
      updates.push(data.progress);
    },
  };
}

describe("recordLearningEvent", () => {
  it("caps SCORM estimated progress at 95 percent until completion or pass", async () => {
    const repository = createRepository({
      id: "assignment_1",
      organizationId: "org_1",
      courseType: "SCORM_1_2",
      status: "ASSIGNED",
      currentProgressPercent: 20,
    });

    const result = await recordLearningEvent(
      {
        organizationId: "org_1",
        assignmentId: "assignment_1",
        source: "SCORM",
        type: "PROGRESS",
        progressPercent: 100,
        occurredAt: new Date("2026-06-09T10:00:00.000Z"),
        rawPayload: { lesson_status: "incomplete", progress_measure: 1 },
      },
      repository,
    );

    expect(result).toEqual({ progressPercent: 95, assignmentStatus: "IN_PROGRESS", completed: false });
    expect(repository.updates[0]).toMatchObject({
      progressPercent: 95,
      assignmentStatus: "IN_PROGRESS",
    });
    expect(repository.events[0]).toMatchObject({
      source: "SCORM",
      type: "PROGRESS",
      progressPercent: 100,
    });
  });

  it("marks completion at 100 percent and completes the assignment when SCORM reports completed", async () => {
    const repository = createRepository({
      id: "assignment_1",
      organizationId: "org_1",
      courseType: "SCORM_1_2",
      status: "IN_PROGRESS",
      currentProgressPercent: 95,
    });

    const result = await recordLearningEvent(
      {
        organizationId: "org_1",
        assignmentId: "assignment_1",
        source: "SCORM",
        type: "COMPLETED",
        occurredAt: new Date("2026-06-09T10:05:00.000Z"),
        rawPayload: { lesson_status: "completed" },
      },
      repository,
    );

    expect(result).toEqual({ progressPercent: 100, assignmentStatus: "COMPLETED", completed: true });
    expect(repository.updates[0]).toMatchObject({
      progressPercent: 100,
      assignmentStatus: "COMPLETED",
    });
  });

  it("keeps native progress exact and completes at 100 percent", async () => {
    const repository = createRepository({
      id: "assignment_2",
      organizationId: "org_1",
      courseType: "NATIVE_VIDEO",
      status: "ASSIGNED",
      currentProgressPercent: 0,
    });

    const result = await recordLearningEvent(
      {
        organizationId: "org_1",
        assignmentId: "assignment_2",
        source: "NATIVE",
        type: "PROGRESS",
        progressPercent: 100,
        occurredAt: new Date("2026-06-09T11:00:00.000Z"),
        rawPayload: { requiredItemsComplete: true },
      },
      repository,
    );

    expect(result).toEqual({ progressPercent: 100, assignmentStatus: "COMPLETED", completed: true });
  });

  it("keeps native completion source-compatible when raw payload includes knowledge check counts", async () => {
    const repository = createRepository({
      id: "assignment_2",
      organizationId: "org_1",
      courseType: "NATIVE_VIDEO",
      status: "IN_PROGRESS",
      currentProgressPercent: 67,
    });

    const result = await recordLearningEvent(
      {
        organizationId: "org_1",
        assignmentId: "assignment_2",
        source: "NATIVE",
        type: "COMPLETED",
        progressPercent: 100,
        occurredAt: new Date("2026-06-09T11:05:00.000Z"),
        rawPayload: {
          requiredLessonsCompleted: 2,
          requiredLessonsTotal: 2,
          requiredChecksCompleted: 1,
          requiredChecksTotal: 1,
        },
      },
      repository,
    );

    expect(result).toEqual({ progressPercent: 100, assignmentStatus: "COMPLETED", completed: true });
    expect(repository.events[0].rawPayload).toEqual({
      requiredLessonsCompleted: 2,
      requiredLessonsTotal: 2,
      requiredChecksCompleted: 1,
      requiredChecksTotal: 1,
    });
  });
});
