import {
  type ProgressRepository,
  recordLearningEvent,
} from "../progress/progress";
import {
  buildLearnerKnowledgeCheckView,
  calculateNativeCompletionWithChecks,
} from "../assessments/knowledge-checks";
import type { KnowledgeCheckQuestionType } from "../assessments/scoring";
import {
  clampVideoSecond,
  requireNonNegativeSecond,
} from "./video-validation";

export type VideoRuntimeCourseType = "NATIVE_VIDEO" | "SCORM_1_2";

export type VideoRuntimeModule = {
  id: string;
  title: string;
  slug: string;
  sortOrder: number;
};

export type VideoRuntimeChapter = {
  id: string;
  title: string;
  startSecond: number;
  endSecond: number | null;
  sortOrder: number;
};

export type VideoRuntimeTranscriptCue = {
  id: string;
  startSecond: number;
  endSecond: number | null;
  text: string;
};

export type VideoRuntimeLesson = {
  id: string;
  moduleId: string | null;
  title: string;
  slug: string;
  sortOrder: number;
  durationSeconds: number;
  required: boolean;
  playbackUrl: string | null;
  providerAssetId: string | null;
  providerUploadId: string | null;
  providerPlaybackId: string | null;
  muxPlaybackPolicy?: string | null;
  providerStatus: "DRAFT" | "UPLOAD_CREATED" | "PROCESSING" | "READY" | "FAILED";
  providerError: string | null;
  chapters: VideoRuntimeChapter[];
  transcriptCues: VideoRuntimeTranscriptCue[];
};

export type VideoRuntimeLessonProgress = {
  lessonId: string;
  lastPositionSecond: number;
  maxWatchedSecond: number;
  completed: boolean;
  lastWatchedAt: Date | null;
};

export type VideoRuntimeKnowledgeCheck = {
  id: string;
  lessonId: string | null;
  prompt: string;
  questionType: KnowledgeCheckQuestionType;
  required: boolean;
  active: boolean;
  explanation: string | null;
  answers: Array<{
    id: string;
    text: string;
    correct: boolean;
  }>;
};

export type VideoRuntimeKnowledgeCheckAttempt = {
  questionId: string;
  selectedAnswerIds: string[];
  correct: boolean;
  scorePercent: number;
};

export type VideoRuntimeKnowledgeCheckView = ReturnType<typeof buildLearnerKnowledgeCheckView>;

export type VideoRuntimeAssignment = {
  id: string;
  organizationId: string;
  courseId: string;
  course: {
    id: string;
    title: string;
    type: VideoRuntimeCourseType;
    modules: VideoRuntimeModule[];
    lessons: VideoRuntimeLesson[];
    knowledgeChecks: VideoRuntimeKnowledgeCheck[];
  };
  videoProgress: VideoRuntimeLessonProgress[];
  knowledgeCheckAttempts: VideoRuntimeKnowledgeCheckAttempt[];
};

export type LaunchVideoRuntimeInput = {
  organizationId: string;
  assignmentId: string;
  lessonId?: string;
};

export type RecordVideoProgressInput = {
  organizationId: string;
  assignmentId: string;
  lessonId: string;
  positionSecond: number;
  watchedSecond: number;
  occurredAt: Date;
};

export type VideoRuntimeRepository = ProgressRepository & {
  runInTransaction<T>(operation: () => Promise<T>): Promise<T>;
  findAssignmentForRuntime(input: {
    organizationId: string;
    assignmentId: string;
  }): Promise<VideoRuntimeAssignment | null>;
  upsertLessonProgress(input: {
    organizationId: string;
    courseId: string;
    assignmentId: string;
    lessonId: string;
    lastPositionSecond: number;
    maxWatchedSecond: number;
    completed: boolean;
    lastWatchedAt: Date;
  }): Promise<VideoRuntimeLessonProgress>;
};

export type VideoRuntimeLessonView = VideoRuntimeLesson & {
  progress: VideoRuntimeLessonProgress;
  knowledgeChecks: VideoRuntimeKnowledgeCheckView[];
};

export type VideoRuntimeLaunch = {
  assignmentId: string;
  courseId: string;
  courseTitle: string;
  modules: VideoRuntimeModule[];
  lessons: VideoRuntimeLessonView[];
  currentLesson: VideoRuntimeLessonView;
  courseProgressPercent: number;
};

export type RecordVideoProgressResult = {
  lessonProgress: VideoRuntimeLessonProgress;
  courseProgressPercent: number;
  completed: boolean;
};

export async function launchVideoRuntime(
  input: LaunchVideoRuntimeInput,
  repository: VideoRuntimeRepository,
): Promise<VideoRuntimeLaunch> {
  const assignment = await loadNativeAssignment(input, repository);
  assertProviderAssetsReady(assignment);
  const lessons = buildLessonViews(assignment);
  const currentLesson = selectCurrentLesson(lessons, input.lessonId);

  return {
    assignmentId: assignment.id,
    courseId: assignment.courseId,
    courseTitle: assignment.course.title,
    modules: sortModules(assignment.course.modules),
    lessons,
    currentLesson,
    courseProgressPercent: calculateCourseProgressPercent(assignment, assignment.videoProgress),
  };
}

export async function recordVideoProgress(
  input: RecordVideoProgressInput,
  repository: VideoRuntimeRepository,
): Promise<RecordVideoProgressResult> {
  return repository.runInTransaction(async () => {
    const assignment = await loadNativeAssignment(input, repository);
    const lesson = assignment.course.lessons.find((candidate) => candidate.id === input.lessonId);

    if (!lesson) {
      throw new Error("Video lesson was not found");
    }

    const positionSecond = clampVideoSecond(
      requireNonNegativeSecond(input.positionSecond, "Position"),
      lesson.durationSeconds,
    );
    const watchedSecond = Math.max(
      existingProgressForLesson(assignment.videoProgress, lesson.id).maxWatchedSecond,
      clampVideoSecond(requireNonNegativeSecond(input.watchedSecond, "Watched second"), lesson.durationSeconds),
    );
    const completed = watchedSecond >= lesson.durationSeconds;
    const lessonProgress = await repository.upsertLessonProgress({
      organizationId: assignment.organizationId,
      courseId: assignment.courseId,
      assignmentId: assignment.id,
      lessonId: lesson.id,
      lastPositionSecond: positionSecond,
      maxWatchedSecond: watchedSecond,
      completed,
      lastWatchedAt: input.occurredAt,
    });
    const nextProgress = replaceLessonProgress(assignment.videoProgress, lessonProgress);
    const progressSummary = summarizeNativeProgress(assignment, nextProgress);
    const eventType = progressSummary.completed ? "COMPLETED" : "PROGRESS";

    const eventResult = await recordLearningEvent(
      {
        organizationId: assignment.organizationId,
        assignmentId: assignment.id,
        source: "NATIVE",
        type: eventType,
        progressPercent: progressSummary.progressPercent,
        occurredAt: input.occurredAt,
        rawPayload: {
          lessonId: lesson.id,
          positionSecond,
          watchedSecond,
          requiredLessonsCompleted: progressSummary.completedRequiredLessonCount,
          requiredLessonsTotal: progressSummary.requiredLessonCount,
          requiredChecksCompleted: progressSummary.completedRequiredCheckCount,
          requiredChecksTotal: progressSummary.requiredCheckCount,
        },
      },
      repository,
    );

    return {
      lessonProgress,
      courseProgressPercent: progressSummary.progressPercent,
      completed: eventResult.completed,
    };
  });
}

async function loadNativeAssignment(
  input: { organizationId: string; assignmentId: string },
  repository: VideoRuntimeRepository,
): Promise<VideoRuntimeAssignment> {
  const assignment = await repository.findAssignmentForRuntime({
    organizationId: input.organizationId,
    assignmentId: input.assignmentId,
  });

  if (!assignment) {
    throw new Error("Assignment was not found");
  }

  if (assignment.course.type !== "NATIVE_VIDEO") {
    throw new Error("Assignment is not for a native video course");
  }

  assignment.course.lessons = assignment.course.lessons.filter((lesson) => lesson.providerStatus !== "DRAFT");

  return assignment;
}

function buildLessonViews(assignment: VideoRuntimeAssignment): VideoRuntimeLessonView[] {
  return sortLessons(assignment.course.lessons).map((lesson) => ({
    ...lesson,
    chapters: [...lesson.chapters].sort((left, right) => left.sortOrder - right.sortOrder),
    transcriptCues: [...lesson.transcriptCues].sort((left, right) => left.startSecond - right.startSecond),
    progress: existingProgressForLesson(assignment.videoProgress, lesson.id),
    knowledgeChecks: activeKnowledgeChecksForLesson(assignment, lesson.id).map((check) =>
      buildLearnerKnowledgeCheckView({
        ...check,
        latestAttempt: latestAttemptForCheck(assignment.knowledgeCheckAttempts, check.id),
      }),
    ),
  }));
}

function assertProviderAssetsReady(assignment: VideoRuntimeAssignment): void {
  const unavailableLesson = assignment.course.lessons.find(
    (lesson) =>
      lesson.providerStatus === "DRAFT" ||
      !lesson.playbackUrl ||
      Boolean(lesson.providerAssetId && (lesson.providerStatus !== "READY" || lesson.muxPlaybackPolicy !== "signed")),
  );

  if (unavailableLesson) {
    throw new Error("Video asset is not ready");
  }
}

function selectCurrentLesson(
  lessons: VideoRuntimeLessonView[],
  requestedLessonId: string | undefined,
): VideoRuntimeLessonView {
  const lesson = requestedLessonId
    ? lessons.find((candidate) => candidate.id === requestedLessonId)
    : lessons[0];

  if (!lesson) {
    throw new Error("Video lesson was not found");
  }

  return lesson;
}

function sortModules(modules: VideoRuntimeModule[]): VideoRuntimeModule[] {
  return [...modules].sort((left, right) => left.sortOrder - right.sortOrder);
}

function sortLessons(lessons: VideoRuntimeLesson[]): VideoRuntimeLesson[] {
  return [...lessons].sort((left, right) => left.sortOrder - right.sortOrder);
}

function existingProgressForLesson(
  progress: VideoRuntimeLessonProgress[],
  lessonId: string,
): VideoRuntimeLessonProgress {
  return (
    progress.find((candidate) => candidate.lessonId === lessonId) ?? {
      lessonId,
      lastPositionSecond: 0,
      maxWatchedSecond: 0,
      completed: false,
      lastWatchedAt: null,
    }
  );
}

function replaceLessonProgress(
  progress: VideoRuntimeLessonProgress[],
  replacement: VideoRuntimeLessonProgress,
): VideoRuntimeLessonProgress[] {
  return [
    ...progress.filter((candidate) => candidate.lessonId !== replacement.lessonId),
    replacement,
  ];
}

function calculateCourseProgressPercent(
  assignment: VideoRuntimeAssignment,
  progress: VideoRuntimeLessonProgress[],
): number {
  return summarizeNativeProgress(assignment, progress).progressPercent;
}

function summarizeNativeProgress(
  assignment: VideoRuntimeAssignment,
  progress: VideoRuntimeLessonProgress[],
): {
  requiredLessonCount: number;
  completedRequiredLessonCount: number;
  requiredCheckCount: number;
  completedRequiredCheckCount: number;
  completed: boolean;
  progressPercent: number;
} {
  const requiredLessons = assignment.course.lessons.filter((lesson) => lesson.required);
  const requiredChecks = assignment.course.knowledgeChecks.filter((check) => check.active && check.required);
  const completedRequiredLessonCount = requiredLessons.filter(
    (lesson) => existingProgressForLesson(progress, lesson.id).completed,
  ).length;
  const completedRequiredCheckCount = requiredChecks.filter((check) =>
    assignment.knowledgeCheckAttempts.some((attempt) => attempt.questionId === check.id && attempt.correct),
  ).length;
  const completion = calculateNativeCompletionWithChecks({
    requiredLessonCount: requiredLessons.length,
    completedRequiredLessonCount,
    requiredCheckCount: requiredChecks.length,
    completedRequiredCheckCount,
  });


  return {
    requiredLessonCount: requiredLessons.length,
    completedRequiredLessonCount,
    requiredCheckCount: requiredChecks.length,
    completedRequiredCheckCount,
    completed: completion.completed,
    progressPercent: completion.progressPercent,
  };
}

function activeKnowledgeChecksForLesson(
  assignment: VideoRuntimeAssignment,
  lessonId: string,
): VideoRuntimeKnowledgeCheck[] {
  return assignment.course.knowledgeChecks.filter((check) => check.active && check.lessonId === lessonId);
}

function latestAttemptForCheck(
  attempts: VideoRuntimeKnowledgeCheckAttempt[],
  questionId: string,
): VideoRuntimeKnowledgeCheckView["latestAttempt"] {
  const attempt = [...attempts].reverse().find((candidate) => candidate.questionId === questionId);

  return attempt
    ? {
        correct: attempt.correct,
        scorePercent: attempt.scorePercent,
        selectedAnswerIds: attempt.selectedAnswerIds,
      }
    : null;
}
