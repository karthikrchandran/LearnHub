import { type ProgressRepository, recordLearningEvent } from "../progress/progress";
import { calculateScormProgress } from "./scorm-progress";
import { parseScorm12Time } from "./scorm-time";

export type ScormRuntimePackage = {
  id: string;
  launchPath: string;
  storageKey: string;
  contentRootKey: string;
  manifestTitle: string | null;
};

export type ScormRegistrationState = {
  id: string;
  packageId: string;
  cmiData: Record<string, unknown>;
  lessonStatus: string;
  scoreRaw: number | null;
  sessionTimeSeconds: number;
  totalTimeSeconds: number;
  launchCount: number;
  lastLaunchedAt: Date | null;
  lastCommittedAt: Date | null;
};

export type ScormRuntimeAssignment = {
  id: string;
  organizationId: string;
  courseId: string;
  course: {
    id: string;
    title: string;
    type: "NATIVE_VIDEO" | "SCORM_1_2";
    scormPackage: ScormRuntimePackage | null;
  };
  scormRegistration: ScormRegistrationState | null;
};

export type LaunchScormRegistrationInput = {
  organizationId: string;
  assignmentId: string;
  occurredAt: Date;
};

export type CommitScormRuntimeInput = {
  organizationId: string;
  assignmentId: string;
  cmiData: Record<string, string>;
  occurredAt: Date;
};

export type ScormRuntimeRepository = ProgressRepository & {
  runInTransaction<T>(operation: () => Promise<T>): Promise<T>;
  findAssignmentForRuntime(input: {
    organizationId: string;
    assignmentId: string;
  }): Promise<ScormRuntimeAssignment | null>;
  upsertLaunchRegistration(input: {
    organizationId: string;
    assignmentId: string;
    packageId: string;
    launchCount: number;
    launchedAt: Date;
  }): Promise<ScormRegistrationState>;
  saveRuntimeCommit(input: {
    organizationId: string;
    assignmentId: string;
    packageId: string;
    cmiData: Record<string, unknown>;
    lessonStatus: string;
    scoreRaw: number | null;
    sessionTimeSeconds: number;
    totalTimeSeconds: number;
    committedAt: Date;
  }): Promise<ScormRegistrationState>;
};

const allowedCmiKeys = new Set([
  "cmi.core.lesson_status",
  "cmi.core.score.raw",
  "cmi.core.session_time",
  "cmi.core.exit",
  "cmi.core.lesson_location",
  "cmi.suspend_data",
  "cmi.comments",
]);

export async function launchScormRegistration(
  input: LaunchScormRegistrationInput,
  repository: ScormRuntimeRepository,
): Promise<{
  assignmentId: string;
  packageId: string;
  launchUrl: string;
  cmiData: Record<string, unknown>;
  launchCount: number;
}> {
  const assignment = await loadScormAssignment(input, repository);
  const scormPackage = requirePackage(assignment);
  const nextLaunchCount = (assignment.scormRegistration?.launchCount ?? 0) + 1;
  const registration = await repository.upsertLaunchRegistration({
    organizationId: assignment.organizationId,
    assignmentId: assignment.id,
    packageId: scormPackage.id,
    launchCount: nextLaunchCount,
    launchedAt: input.occurredAt,
  });

  return {
    assignmentId: assignment.id,
    packageId: scormPackage.id,
    launchUrl: buildLaunchUrl(scormPackage),
    cmiData: registration.cmiData,
    launchCount: registration.launchCount,
  };
}

export async function commitScormRuntime(
  input: CommitScormRuntimeInput,
  repository: ScormRuntimeRepository,
): Promise<{ progressPercent: number; completed: boolean; registration: ScormRegistrationState }> {
  return repository.runInTransaction(async () => {
    const assignment = await loadScormAssignment(input, repository);
    const scormPackage = requirePackage(assignment);
    const mergedCmiData = mergeAllowedCmiData(assignment.scormRegistration?.cmiData ?? {}, input.cmiData);
    const lessonStatus = String(mergedCmiData["cmi.core.lesson_status"] ?? "not attempted");
    const scoreRaw = parseScore(mergedCmiData["cmi.core.score.raw"]);
    const sessionTimeSeconds = parseOptionalTime(mergedCmiData["cmi.core.session_time"]);
    const previousSessionTimeSeconds = assignment.scormRegistration?.sessionTimeSeconds ?? 0;
    const previousTotalTimeSeconds = assignment.scormRegistration?.totalTimeSeconds ?? 0;
    const priorSessionsTotalSeconds = Math.max(0, previousTotalTimeSeconds - previousSessionTimeSeconds);
    const totalTimeSeconds = priorSessionsTotalSeconds + sessionTimeSeconds;
    const progress = calculateScormProgress({
      lessonStatus,
      scoreRaw,
      hasActivity: Object.keys(input.cmiData).length > 0 || sessionTimeSeconds > 0,
    });
    const registration = await repository.saveRuntimeCommit({
      organizationId: assignment.organizationId,
      assignmentId: assignment.id,
      packageId: scormPackage.id,
      cmiData: mergedCmiData,
      lessonStatus: progress.lessonStatus,
      scoreRaw,
      sessionTimeSeconds,
      totalTimeSeconds,
      committedAt: input.occurredAt,
    });
    const eventResult = await recordLearningEvent(
      {
        organizationId: assignment.organizationId,
        assignmentId: assignment.id,
        source: "SCORM",
        type: progress.eventType,
        progressPercent: progress.progressPercent,
        occurredAt: input.occurredAt,
        rawPayload: {
          packageId: scormPackage.id,
          lessonStatus: progress.lessonStatus,
          scoreRaw,
          sessionTimeSeconds,
          totalTimeSeconds,
          cmiData: mergedCmiData,
        },
      },
      repository,
    );

    return {
      progressPercent: eventResult.progressPercent,
      completed: eventResult.completed,
      registration,
    };
  });
}

async function loadScormAssignment(
  input: { organizationId: string; assignmentId: string },
  repository: ScormRuntimeRepository,
): Promise<ScormRuntimeAssignment> {
  const assignment = await repository.findAssignmentForRuntime(input);

  if (!assignment) {
    throw new Error("Assignment was not found");
  }

  if (assignment.course.type !== "SCORM_1_2") {
    throw new Error("Assignment is not for a SCORM 1.2 course");
  }

  return assignment;
}

function requirePackage(assignment: ScormRuntimeAssignment): ScormRuntimePackage {
  if (!assignment.course.scormPackage) {
    throw new Error("SCORM package was not found");
  }

  return assignment.course.scormPackage;
}

function buildLaunchUrl(scormPackage: ScormRuntimePackage): string {
  return `/scorm/${scormPackage.contentRootKey}/${scormPackage.launchPath}`;
}

function mergeAllowedCmiData(
  existing: Record<string, unknown>,
  incoming: Record<string, string>,
): Record<string, unknown> {
  const merged = { ...existing };

  for (const [key, value] of Object.entries(incoming)) {
    if (allowedCmiKeys.has(key)) {
      merged[key] = value;
    }
  }

  return merged;
}

function parseScore(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const score = Number(value);

  if (!Number.isFinite(score)) {
    return null;
  }

  return Math.max(0, Math.min(100, Math.round(score)));
}

function parseOptionalTime(value: unknown): number {
  if (typeof value !== "string" || !value.trim()) {
    return 0;
  }

  return parseScorm12Time(value);
}
