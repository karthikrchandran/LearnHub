export type ProgressCourseType = "NATIVE_VIDEO" | "SCORM_1_2";
export type AssignmentProgressStatus = "ASSIGNED" | "IN_PROGRESS" | "COMPLETED" | "OVERDUE";
export type LearningEventSource = "NATIVE" | "SCORM";
export type LearningEventType = "PROGRESS" | "COMPLETED" | "PASSED" | "FAILED";

export type ProgressAssignment = {
  id: string;
  organizationId: string;
  courseType: ProgressCourseType;
  status: AssignmentProgressStatus;
  currentProgressPercent: number;
};

export type LearningEventInput = {
  organizationId: string;
  assignmentId: string;
  source: LearningEventSource;
  type: LearningEventType;
  progressPercent?: number;
  occurredAt: Date;
  rawPayload: unknown;
};

export type ProgressUpdate = {
  progressPercent: number;
  assignmentStatus: AssignmentProgressStatus;
};

export interface ProgressRepository {
  findAssignmentForProgress(input: {
    organizationId: string;
    assignmentId: string;
  }): Promise<ProgressAssignment | null>;
  saveProgressUpdate(input: {
    organizationId: string;
    assignmentId: string;
    event: LearningEventInput;
    progress: ProgressUpdate;
  }): Promise<void>;
}

export type RecordLearningEventResult = ProgressUpdate & {
  completed: boolean;
};

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(100, Math.round(value)));
}

function isCompletionEvent(type: LearningEventType): boolean {
  return type === "COMPLETED" || type === "PASSED";
}

function nextProgressPercent(assignment: ProgressAssignment, event: LearningEventInput): number {
  if (isCompletionEvent(event.type)) {
    return 100;
  }

  const requestedPercent =
    typeof event.progressPercent === "number" ? clampPercent(event.progressPercent) : assignment.currentProgressPercent;

  if (assignment.courseType === "SCORM_1_2" && requestedPercent >= 100) {
    return 95;
  }

  return requestedPercent;
}

function nextAssignmentStatus(
  currentStatus: AssignmentProgressStatus,
  progressPercent: number,
): AssignmentProgressStatus {
  if (progressPercent >= 100) {
    return "COMPLETED";
  }

  if (currentStatus === "COMPLETED") {
    return "COMPLETED";
  }

  if (progressPercent > 0) {
    return "IN_PROGRESS";
  }

  return currentStatus;
}

export async function recordLearningEvent(
  event: LearningEventInput,
  repository: ProgressRepository,
): Promise<RecordLearningEventResult> {
  const assignment = await repository.findAssignmentForProgress({
    organizationId: event.organizationId,
    assignmentId: event.assignmentId,
  });

  if (!assignment) {
    throw new Error("Assignment was not found");
  }

  const progressPercent = nextProgressPercent(assignment, event);
  const assignmentStatus = nextAssignmentStatus(assignment.status, progressPercent);

  await repository.saveProgressUpdate({
    organizationId: event.organizationId,
    assignmentId: event.assignmentId,
    event,
    progress: {
      progressPercent,
      assignmentStatus,
    },
  });

  return {
    progressPercent,
    assignmentStatus,
    completed: assignmentStatus === "COMPLETED",
  };
}
