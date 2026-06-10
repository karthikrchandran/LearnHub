import type { LearningEventType } from "../progress/progress";

export type ScormLessonStatus = "passed" | "completed" | "failed" | "incomplete" | "browsed" | "not attempted";

export type CalculateScormProgressInput = {
  lessonStatus: string | null | undefined;
  scoreRaw?: number | null;
  hasActivity?: boolean;
};

export type ScormProgressResult = {
  lessonStatus: ScormLessonStatus;
  progressPercent: number;
  eventType: LearningEventType;
  completed: boolean;
};

const scormStatuses: ScormLessonStatus[] = [
  "passed",
  "completed",
  "failed",
  "incomplete",
  "browsed",
  "not attempted",
];

export function normalizeScormLessonStatus(status: string | null | undefined): ScormLessonStatus {
  const normalized = status?.trim().toLowerCase() ?? "";

  return scormStatuses.includes(normalized as ScormLessonStatus)
    ? (normalized as ScormLessonStatus)
    : "not attempted";
}

export function calculateScormProgress(input: CalculateScormProgressInput): ScormProgressResult {
  const lessonStatus = normalizeScormLessonStatus(input.lessonStatus);

  if (lessonStatus === "completed") {
    return { lessonStatus, progressPercent: 100, eventType: "COMPLETED", completed: true };
  }

  if (lessonStatus === "passed") {
    return { lessonStatus, progressPercent: 100, eventType: "PASSED", completed: true };
  }

  return {
    lessonStatus,
    progressPercent: progressForIncompleteStatus(lessonStatus, input.scoreRaw, input.hasActivity ?? false),
    eventType: lessonStatus === "failed" ? "FAILED" : "PROGRESS",
    completed: false,
  };
}

function progressForIncompleteStatus(
  lessonStatus: ScormLessonStatus,
  scoreRaw: number | null | undefined,
  hasActivity: boolean,
): number {
  if (typeof scoreRaw === "number" && Number.isFinite(scoreRaw)) {
    return Math.max(0, Math.min(95, Math.round(scoreRaw)));
  }

  if (lessonStatus === "failed") {
    return 0;
  }

  if (lessonStatus === "incomplete" && hasActivity) {
    return 50;
  }

  if (lessonStatus === "browsed") {
    return 25;
  }

  return 0;
}
