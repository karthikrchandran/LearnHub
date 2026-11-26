import { describe, expect, it } from "vitest";

import {
  launchVideoRuntime,
  recordVideoProgress,
  type RecordVideoProgressInput,
  type VideoRuntimeAssignment,
  type VideoRuntimeRepository,
} from "./video-runtime";
import type { LearningEventInput } from "../progress/progress";

const occurredAt = new Date("2026-06-10T10:00:00.000Z");

const nativeAssignment: VideoRuntimeAssignment = {
  id: "assignment_1",
  organizationId: "org_1",
  courseId: "course_1",
  course: {
    id: "course_1",
    title: "Manager Coaching Basics",
    type: "NATIVE_VIDEO",
    modules: [
      {
        id: "module_1",
        title: "Manager Foundations",
        slug: "manager-foundations",
        sortOrder: 0,
      },
    ],
    lessons: [
      {
        id: "lesson_1",
        moduleId: "module_1",
        title: "Coaching Conversation Basics",
        slug: "coaching-conversation-basics",
        sortOrder: 0,
        durationSeconds: 180,
        required: true,
        playbackUrl: "https://video.learnhub.local/demo/coaching-conversation-basics.mp4",
        providerAssetId: null,
        providerUploadId: null,
        providerPlaybackId: null,
        providerStatus: "READY",
        providerError: null,
        chapters: [
          {
            id: "chapter_1",
            title: "Open the conversation",
            startSecond: 0,
            endSecond: 45,
            sortOrder: 0,
          },
        ],
        transcriptCues: [
          {
            id: "cue_1",
            startSecond: 0,
            endSecond: 30,
            text: "Welcome to coaching basics.",
          },
        ],
      },
      {
        id: "lesson_2",
        moduleId: "module_1",
        title: "Follow Up",
        slug: "follow-up",
        sortOrder: 1,
        durationSeconds: 120,
        required: true,
        playbackUrl: "https://video.learnhub.local/demo/follow-up.mp4",
        providerAssetId: null,
        providerUploadId: null,
        providerPlaybackId: null,
        providerStatus: "READY",
        providerError: null,
        chapters: [],
        transcriptCues: [],
      },
    ],
    knowledgeChecks: [],
  },
  videoProgress: [
    {
      lessonId: "lesson_1",
      lastPositionSecond: 45,
      maxWatchedSecond: 90,
      completed: false,
      lastWatchedAt: new Date("2026-06-10T09:00:00.000Z"),
    },
  ],
  knowledgeCheckAttempts: [],
};

class FakeVideoRuntimeRepository implements VideoRuntimeRepository {
  assignment: VideoRuntimeAssignment | null = nativeAssignment;
  transactions = 0;
  failProgressUpdate = false;
  savedProgress: Parameters<VideoRuntimeRepository["upsertLessonProgress"]>[0][] = [];
  learningEvents: LearningEventInput[] = [];
  progressUpdates: Parameters<VideoRuntimeRepository["saveProgressUpdate"]>[0]["progress"][] = [];

  async runInTransaction<T>(operation: () => Promise<T>): Promise<T> {
    this.transactions += 1;
    const savedProgress = structuredClone(this.savedProgress);
    const learningEvents = structuredClone(this.learningEvents);
    const progressUpdates = structuredClone(this.progressUpdates);

    try {
      return await operation();
    } catch (error) {
      this.savedProgress = savedProgress;
      this.learningEvents = learningEvents;
      this.progressUpdates = progressUpdates;
      throw error;
    }
  }

  async findAssignmentForRuntime(): Promise<VideoRuntimeAssignment | null> {
    return this.assignment;
  }

  async upsertLessonProgress(input: Parameters<VideoRuntimeRepository["upsertLessonProgress"]>[0]) {
    this.savedProgress.push(input);

    return {
      lessonId: input.lessonId,
      lastPositionSecond: input.lastPositionSecond,
      maxWatchedSecond: input.maxWatchedSecond,
      completed: input.completed,
      lastWatchedAt: input.lastWatchedAt,
    };
  }

  async findAssignmentForProgress(): Promise<Awaited<ReturnType<VideoRuntimeRepository["findAssignmentForProgress"]>>> {
    if (!this.assignment) {
      return null;
    }

    return {
      id: this.assignment.id,
      organizationId: this.assignment.organizationId,
      courseType: "NATIVE_VIDEO",
      status: "ASSIGNED",
      currentProgressPercent: this.progressUpdates.at(-1)?.progressPercent ?? 0,
    };
  }

  async saveProgressUpdate(input: Parameters<VideoRuntimeRepository["saveProgressUpdate"]>[0]): Promise<void> {
    if (this.failProgressUpdate) {
      throw new Error("Learning progress persistence failed");
    }

    this.learningEvents.push(input.event);
    this.progressUpdates.push(input.progress);
  }
}

function createRepository(assignment: VideoRuntimeAssignment | null = nativeAssignment): FakeVideoRuntimeRepository {
  const repository = new FakeVideoRuntimeRepository();
  repository.assignment = assignment ? structuredClone(assignment) : null;

  return repository;
}

function createProgressInput(overrides: Partial<RecordVideoProgressInput> = {}): RecordVideoProgressInput {
  return {
    organizationId: "org_1",
    assignmentId: "assignment_1",
    lessonId: "lesson_1",
    positionSecond: 200,
    watchedSecond: 200,
    occurredAt,
    ...overrides,
  };
}

describe("launchVideoRuntime", () => {
  it("rejects missing assignments", async () => {
    await expect(
      launchVideoRuntime(
        {
          organizationId: "org_1",
          assignmentId: "missing",
        },
        createRepository(null),
      ),
    ).rejects.toThrow("Assignment was not found");
  });

  it("rejects assignments for non-native courses", async () => {
    const assignment = structuredClone(nativeAssignment);
    assignment.course.type = "SCORM_1_2";

    await expect(
      launchVideoRuntime(
        {
          organizationId: "org_1",
          assignmentId: "assignment_1",
        },
        createRepository(assignment),
      ),
    ).rejects.toThrow("Assignment is not for a native video course");
  });

  it("returns modules, lessons, current lesson, chapters, transcript cues, and progress", async () => {
    const runtime = await launchVideoRuntime(
      {
        organizationId: "org_1",
        assignmentId: "assignment_1",
      },
      createRepository(),
    );

    expect(runtime.assignmentId).toBe("assignment_1");
    expect(runtime.modules).toEqual([
      {
        id: "module_1",
        title: "Manager Foundations",
        slug: "manager-foundations",
        sortOrder: 0,
      },
    ]);
    expect(runtime.lessons.map((lesson) => lesson.id)).toEqual(["lesson_1", "lesson_2"]);
    expect(runtime.currentLesson).toMatchObject({
      id: "lesson_1",
      title: "Coaching Conversation Basics",
      chapters: [{ id: "chapter_1", title: "Open the conversation", startSecond: 0 }],
      transcriptCues: [{ id: "cue_1", text: "Welcome to coaching basics." }],
      progress: {
        lastPositionSecond: 45,
        maxWatchedSecond: 90,
        completed: false,
      },
    });
    expect(runtime.courseProgressPercent).toBe(0);
  });

  it("returns active learner-safe knowledge checks grouped by lesson", async () => {
    const assignment = structuredClone(nativeAssignment);
    assignment.course.knowledgeChecks = [
      {
        id: "check_1",
        lessonId: "lesson_1",
        prompt: "Which response is best?",
        questionType: "SINGLE_CHOICE",
        required: true,
        active: true,
        explanation: "Use neutral language.",
        answers: [
          { id: "answer_1", text: "What happened?", correct: true },
          { id: "answer_2", text: "Why did you fail?", correct: false },
        ],
      },
      {
        id: "check_inactive",
        lessonId: "lesson_1",
        prompt: "Inactive",
        questionType: "TRUE_FALSE",
        required: true,
        active: false,
        explanation: null,
        answers: [
          { id: "true", text: "True", correct: true },
          { id: "false", text: "False", correct: false },
        ],
      },
    ];

    const runtime = await launchVideoRuntime(
      {
        organizationId: "org_1",
        assignmentId: "assignment_1",
      },
      createRepository(assignment),
    );

    expect(runtime.lessons[0].knowledgeChecks).toEqual([
      {
        id: "check_1",
        lessonId: "lesson_1",
        prompt: "Which response is best?",
        questionType: "SINGLE_CHOICE",
        required: true,
        explanation: null,
        latestAttempt: null,
        answers: [
          { id: "answer_1", text: "What happened?" },
          { id: "answer_2", text: "Why did you fail?" },
        ],
      },
    ]);
    expect(runtime.currentLesson.knowledgeChecks[0].answers[0]).not.toHaveProperty("correct");
  });

  it("blocks launch while a Mux asset is not ready", async () => {
    const assignment = structuredClone(nativeAssignment);
    assignment.course.lessons[0] = {
      ...assignment.course.lessons[0],
      playbackUrl: null,
      providerAssetId: "asset_1",
      providerUploadId: "upload_1",
      providerPlaybackId: null,
      providerStatus: "PROCESSING",
      providerError: null,
    };

    await expect(
      launchVideoRuntime(
        {
          organizationId: "org_1",
          assignmentId: "assignment_1",
        },
        createRepository(assignment),
      ),
    ).rejects.toThrow("Video asset is not ready");
  });

  it("keeps draft lessons out of learner playback without blocking published lessons", async () => {
    const assignment = structuredClone(nativeAssignment);
    assignment.course.lessons.push({
      ...assignment.course.lessons[0],
      id: "lesson_draft",
      title: "Draft lesson",
      slug: "draft-lesson",
      playbackUrl: null,
      providerStatus: "DRAFT",
    });

    const runtime = await launchVideoRuntime(
      { organizationId: "org_1", assignmentId: "assignment_1" },
      createRepository(assignment),
    );

    expect(runtime.lessons.map((lesson) => lesson.id)).toEqual(["lesson_1", "lesson_2"]);
  });
});

describe("recordVideoProgress", () => {
  it("clamps position and watched seconds to the lesson duration", async () => {
    const repository = createRepository();

    await recordVideoProgress(createProgressInput(), repository);

    expect(repository.savedProgress).toEqual([
      {
        organizationId: "org_1",
        courseId: "course_1",
        assignmentId: "assignment_1",
        lessonId: "lesson_1",
        lastPositionSecond: 180,
        maxWatchedSecond: 180,
        completed: true,
        lastWatchedAt: occurredAt,
      },
    ]);
  });

  it("marks a lesson complete at 100 percent watched", async () => {
    const repository = createRepository();

    const result = await recordVideoProgress(createProgressInput(), repository);

    expect(result.lessonProgress).toMatchObject({
      lessonId: "lesson_1",
      maxWatchedSecond: 180,
      completed: true,
    });
  });

  it("calculates course progress from completed required lessons", async () => {
    const repository = createRepository();

    const result = await recordVideoProgress(
      createProgressInput({ watchedSecond: 180 }),
      repository,
    );

    expect(result.courseProgressPercent).toBe(50);
  });

  it("sends a native progress event below 100 percent", async () => {
    const repository = createRepository();

    await recordVideoProgress(
      createProgressInput({
        watchedSecond: 60,
        positionSecond: 60,
      }),
      repository,
    );

    expect(repository.learningEvents).toEqual([
      {
        organizationId: "org_1",
        assignmentId: "assignment_1",
        source: "NATIVE",
        type: "PROGRESS",
        progressPercent: 0,
        occurredAt,
        rawPayload: {
          lessonId: "lesson_1",
          positionSecond: 60,
          watchedSecond: 90,
          requiredLessonsCompleted: 0,
          requiredLessonsTotal: 2,
          requiredChecksCompleted: 0,
          requiredChecksTotal: 0,
        },
      },
    ]);
  });

  it("sends a native completed event at 100 percent", async () => {
    const assignment = structuredClone(nativeAssignment);
    assignment.videoProgress = [
      {
        lessonId: "lesson_1",
        lastPositionSecond: 180,
        maxWatchedSecond: 180,
        completed: true,
        lastWatchedAt: occurredAt,
      },
    ];
    const repository = createRepository(assignment);

    await recordVideoProgress(
      createProgressInput({
        lessonId: "lesson_2",
        positionSecond: 120,
        watchedSecond: 120,
      }),
      repository,
    );

    expect(repository.learningEvents[0]).toMatchObject({
      source: "NATIVE",
      type: "COMPLETED",
      progressPercent: 100,
      rawPayload: {
        lessonId: "lesson_2",
        positionSecond: 120,
        watchedSecond: 120,
        requiredLessonsCompleted: 2,
        requiredLessonsTotal: 2,
        requiredChecksCompleted: 0,
        requiredChecksTotal: 0,
      },
    });
  });

  it("does not complete a native course until required active knowledge checks are correct", async () => {
    const assignment = structuredClone(nativeAssignment);
    assignment.course.knowledgeChecks = [
      {
        id: "check_1",
        lessonId: "lesson_1",
        prompt: "Which response is best?",
        questionType: "SINGLE_CHOICE",
        required: true,
        active: true,
        explanation: null,
        answers: [
          { id: "answer_1", text: "What happened?", correct: true },
          { id: "answer_2", text: "Why did you fail?", correct: false },
        ],
      },
    ];
    assignment.videoProgress = [
      {
        lessonId: "lesson_1",
        lastPositionSecond: 180,
        maxWatchedSecond: 180,
        completed: true,
        lastWatchedAt: occurredAt,
      },
    ];
    const repository = createRepository(assignment);

    await recordVideoProgress(
      createProgressInput({
        lessonId: "lesson_2",
        positionSecond: 120,
        watchedSecond: 120,
      }),
      repository,
    );

    expect(repository.learningEvents[0]).toMatchObject({
      type: "PROGRESS",
      progressPercent: 67,
      rawPayload: {
        requiredLessonsCompleted: 2,
        requiredLessonsTotal: 2,
        requiredChecksCompleted: 0,
        requiredChecksTotal: 1,
      },
    });
  });

  it("requires required active knowledge checks for native course completion", async () => {
    const assignment = structuredClone(nativeAssignment);
    assignment.course.knowledgeChecks = [
      {
        id: "check_1",
        lessonId: "lesson_1",
        prompt: "Which response is best?",
        questionType: "SINGLE_CHOICE",
        required: true,
        active: true,
        explanation: null,
        answers: [
          { id: "answer_1", text: "What happened?", correct: true },
          { id: "answer_2", text: "Why did you fail?", correct: false },
        ],
      },
    ];
    assignment.knowledgeCheckAttempts = [
      {
        questionId: "check_1",
        correct: true,
        scorePercent: 100,
        selectedAnswerIds: ["answer_1"],
      },
    ];
    assignment.videoProgress = [
      {
        lessonId: "lesson_1",
        lastPositionSecond: 180,
        maxWatchedSecond: 180,
        completed: true,
        lastWatchedAt: occurredAt,
      },
    ];
    const repository = createRepository(assignment);

    await recordVideoProgress(
      createProgressInput({
        lessonId: "lesson_2",
        positionSecond: 120,
        watchedSecond: 120,
      }),
      repository,
    );

    expect(repository.learningEvents[0]).toMatchObject({
      type: "COMPLETED",
      progressPercent: 100,
      rawPayload: {
        requiredChecksCompleted: 1,
        requiredChecksTotal: 1,
      },
    });
  });

  it("rolls back lesson progress when learning progress persistence fails", async () => {
    const repository = createRepository();
    repository.failProgressUpdate = true;

    await expect(recordVideoProgress(createProgressInput(), repository)).rejects.toThrow(
      "Learning progress persistence failed",
    );

    expect(repository.transactions).toBe(1);
    expect(repository.savedProgress).toEqual([]);
    expect(repository.learningEvents).toEqual([]);
    expect(repository.progressUpdates).toEqual([]);
  });
});
