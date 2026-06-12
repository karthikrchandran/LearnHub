import type { MembershipAuthContext } from "../auth/permissions";

export type ProgressReportScope =
  | { kind: "learner"; membershipIds: string[] }
  | { kind: "manager"; membershipIds: string[] }
  | { kind: "admin" };

export type ProgressReportTargetMembership = {
  id: string;
  organizationId: string;
};

export type ProgressReportRow = {
  assignmentId: string;
  learnerName: string;
  learnerEmail: string;
  courseTitle: string;
  courseType: "NATIVE_VIDEO" | "SCORM_1_2";
  assignmentStatus: "ASSIGNED" | "IN_PROGRESS" | "COMPLETED" | "OVERDUE";
  progressPercent: number;
  latestRequiredCheckAverageScore: number | null;
  bestRequiredCheckAverageScore: number | null;
  dueDate: Date;
  lastEventAt: Date | null;
  certificateUrl: string | null;
};

export function resolveProgressReportScope(
  context: MembershipAuthContext,
  organizationId: string,
  targetMemberships: ProgressReportTargetMembership[] = [],
): ProgressReportScope {
  const activeMemberships = context.memberships.filter(
    (membership) => membership.organizationId === organizationId && membership.status === "ACTIVE",
  );

  if (context.isPlatformOwner || activeMemberships.some((membership) => membership.roles.includes("ADMIN"))) {
    return { kind: "admin" };
  }

  if (activeMemberships.some((membership) => membership.roles.includes("MANAGER"))) {
    return {
      kind: "manager",
      membershipIds: targetMemberships
        .filter((membership) => membership.organizationId === organizationId)
        .map((membership) => membership.id),
    };
  }

  return {
    kind: "learner",
    membershipIds: activeMemberships
      .filter((membership) => membership.roles.includes("LEARNER"))
      .map((membership) => membership.id),
  };
}

export function progressReportWhere(
  organizationId: string,
  scope: ProgressReportScope,
): Record<string, unknown> {
  if (scope.kind === "admin") {
    return { organizationId };
  }

  return {
    organizationId,
    membershipId: { in: scope.membershipIds },
  };
}

export function formatProgressReportCsv(rows: ProgressReportRow[]): string {
  const header = [
    "Learner Name",
    "Learner Email",
    "Course Title",
    "Course Type",
    "Assignment Status",
    "Progress Percent",
    "Latest Required Check Average Score",
    "Best Required Check Average Score",
    "Due Date",
    "Completed",
    "Certificate URL",
    "Last Event Date",
  ];
  const body = rows.map((row) => [
    row.learnerName,
    row.learnerEmail,
    row.courseTitle,
    row.courseType,
    row.assignmentStatus,
    row.progressPercent,
    row.latestRequiredCheckAverageScore ?? "",
    row.bestRequiredCheckAverageScore ?? "",
    row.dueDate.toISOString(),
    row.assignmentStatus === "COMPLETED",
    row.certificateUrl ?? "",
    row.lastEventAt?.toISOString() ?? "",
  ]);

  return [header, ...body]
    .map((values) => values.map((value) => formatCsvValue(value)).join(","))
    .join("\r\n");
}

export type RequiredCheckAttemptSummary = {
  requiredActiveCheckIds: string[];
  attempts: Array<{
    questionId: string;
    scorePercent: number;
    submittedAt: Date;
  }>;
};

export function summarizeRequiredCheckScores(input: RequiredCheckAttemptSummary): {
  latestRequiredCheckAverageScore: number | null;
  bestRequiredCheckAverageScore: number | null;
} {
  const attemptedRequiredIds = input.requiredActiveCheckIds.filter((questionId) =>
    input.attempts.some((attempt) => attempt.questionId === questionId),
  );

  if (attemptedRequiredIds.length === 0) {
    return {
      latestRequiredCheckAverageScore: null,
      bestRequiredCheckAverageScore: null,
    };
  }

  const latestScores = attemptedRequiredIds.map((questionId) =>
    [...input.attempts]
      .filter((attempt) => attempt.questionId === questionId)
      .sort((left, right) => right.submittedAt.getTime() - left.submittedAt.getTime())[0].scorePercent,
  );
  const bestScores = attemptedRequiredIds.map((questionId) =>
    Math.max(...input.attempts
      .filter((attempt) => attempt.questionId === questionId)
      .map((attempt) => attempt.scorePercent)),
  );

  return {
    latestRequiredCheckAverageScore: averageScore(latestScores),
    bestRequiredCheckAverageScore: averageScore(bestScores),
  };
}

function averageScore(scores: number[]): number {
  return Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length);
}

function formatCsvValue(value: string | number | boolean): string {
  const text = String(value);

  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }

  return text;
}
