export type LearnerCourseStatus = "ASSIGNED" | "IN_PROGRESS" | "COMPLETED" | "OVERDUE" | "AVAILABLE";
export type LearnerActionVariant = "blue" | "light";

export type LearnerCourseCard = {
  id: string;
  assignmentId: string | null;
  status: LearnerCourseStatus;
  progressPercent: number;
  certificateIssued: boolean;
};

export type LearnerCourseActionInput = {
  slug: string;
  courseSlug: string;
  assignmentId: string | null;
  status: LearnerCourseStatus;
};

export type LearnerCourseAction = {
  label: string;
  href: string;
  variant: LearnerActionVariant;
};

export type LearnerAssessmentQuestion = {
  id: string;
  lessonId?: string | null;
  prompt: string;
  required: boolean;
  questionType: string;
};

export type LearnerAssessmentAttempt = {
  id: string;
  questionId: string;
  attemptNumber: number;
  selectedAnswerIds: string[];
  correct: boolean;
  scorePercent: number;
  submittedAt: Date;
};

export type LearnerAssessmentAssignment = {
  id: string;
  course: {
    title: string;
    slug: string;
    knowledgeCheckQuestions: LearnerAssessmentQuestion[];
  };
  knowledgeCheckAttempts: LearnerAssessmentAttempt[];
};

export type PendingRequiredCheck<TAssignment extends LearnerAssessmentAssignment = LearnerAssessmentAssignment> = {
  assignment: TAssignment;
  check: TAssignment["course"]["knowledgeCheckQuestions"][number];
  latestAttempt: TAssignment["knowledgeCheckAttempts"][number] | null;
};

export type CompletedKnowledgeCheckAttempt<TAssignment extends LearnerAssessmentAssignment = LearnerAssessmentAssignment> = {
  assignment: TAssignment;
  check: TAssignment["course"]["knowledgeCheckQuestions"][number];
  attempt: TAssignment["knowledgeCheckAttempts"][number];
};

export type LearnerCertificateAssignment = {
  id: string;
  courseId: string;
  status: string;
  dueDate?: Date | null;
  progress?: { progressPercent: number } | null;
  course: {
    title: string;
    slug: string;
    type: string;
    expectedDurationMinutes: number;
    credentialProvider: string | null;
  };
};

export type LearnerAvailableCertificateCourse = {
  id: string;
  title: string;
  slug: string;
  type: string;
  expectedDurationMinutes: number;
  credentialProvider: string | null;
};

export type LockedCertificateView = {
  id: string;
  title: string;
  body: string;
  href: string;
  actionLabel: string;
};

export function groupLearnerCourses(courses: LearnerCourseCard[]) {
  return {
    assigned: courses.filter((course) => course.status === "ASSIGNED" || course.status === "OVERDUE"),
    inProgress: courses.filter((course) => course.status === "IN_PROGRESS"),
    completed: courses.filter((course) => course.status === "COMPLETED"),
    available: courses.filter((course) => course.status === "AVAILABLE"),
  };
}

export function buildCourseAction(input: LearnerCourseActionInput): LearnerCourseAction {
  if (input.status === "COMPLETED") {
    return { label: "View certificate", href: `/org/${input.slug}/certificates`, variant: "light" };
  }

  if (input.status === "AVAILABLE") {
    return { label: "Enroll", href: `/org/${input.slug}/learn/catalog`, variant: "light" };
  }

  if (input.status === "IN_PROGRESS") {
    return { label: "Resume", href: `/org/${input.slug}/learn/courses/${input.courseSlug}`, variant: "blue" };
  }

  return { label: "Start", href: `/org/${input.slug}/learn/courses/${input.courseSlug}`, variant: "blue" };
}

export function buildCourseMeta(input: {
  durationMinutes: number;
  lessonCount: number;
  certificateEligible: boolean;
}): string[] {
  return [
    `${input.durationMinutes} min`,
    `${input.lessonCount} ${input.lessonCount === 1 ? "lesson" : "lessons"}`,
    ...(input.certificateEligible ? ["Certificate"] : []),
  ];
}

export function buildPendingRequiredChecks<TAssignment extends LearnerAssessmentAssignment>(
  assignments: TAssignment[],
): Array<PendingRequiredCheck<TAssignment>> {
  return assignments.flatMap((assignment) =>
    assignment.course.knowledgeCheckQuestions
      .filter((check) => check.required)
      .filter((check) => !assignment.knowledgeCheckAttempts.some((attempt) => attempt.questionId === check.id && attempt.correct))
      .map((check) => ({
        assignment,
        check,
        latestAttempt: latestAttemptForQuestion(assignment.knowledgeCheckAttempts, check.id),
      })),
  );
}

export function buildCompletedKnowledgeCheckAttempts<TAssignment extends LearnerAssessmentAssignment>(
  assignments: TAssignment[],
): Array<CompletedKnowledgeCheckAttempt<TAssignment>> {
  return assignments
    .flatMap((assignment) =>
      assignment.knowledgeCheckAttempts.flatMap((attempt) => {
        const check = assignment.course.knowledgeCheckQuestions.find((candidate) => candidate.id === attempt.questionId);

        return check ? [{ assignment, check, attempt }] : [];
      }),
    )
    .sort((left, right) => compareAttemptsDescending(left.attempt, right.attempt));
}

export function buildLockedCertificates({
  assignments,
  availableCourses,
  earnedCourseIds,
  slug,
}: {
  assignments: LearnerCertificateAssignment[];
  availableCourses: LearnerAvailableCertificateCourse[];
  earnedCourseIds: Set<string>;
  slug: string;
}): LockedCertificateView[] {
  const seenCourseIds = new Set<string>();
  const includeCourse = (courseId: string) => {
    if (earnedCourseIds.has(courseId) || seenCourseIds.has(courseId)) {
      return false;
    }

    seenCourseIds.add(courseId);
    return true;
  };
  const assignedCertificates = assignments
    .filter((assignment) => includeCourse(assignment.courseId))
    .map((assignment) => ({
      id: `assignment-${assignment.id}`,
      title: assignment.course.title,
      body: lockedAssignmentBody(assignment),
      href: `/org/${encodeURIComponent(slug)}/learn/courses/${encodeURIComponent(assignment.course.slug)}`,
      actionLabel: assignment.status === "COMPLETED" ? "Review course" : "Continue course",
    }));

  const availableCertificates = availableCourses
    .filter((course) => includeCourse(course.id))
    .map((course) => ({
      id: `available-${course.id}`,
      title: course.title,
      body: `${formatCourseType(course.type)} / ${course.expectedDurationMinutes} min / ${credentialLabel(course.credentialProvider)} eligible when enrolled and completed.`,
      href: `/org/${encodeURIComponent(slug)}/learn/courses/${encodeURIComponent(course.slug)}`,
      actionLabel: "View course",
    }));

  return [...assignedCertificates, ...availableCertificates];
}

function latestAttemptForQuestion<TAttempt extends LearnerAssessmentAttempt>(
  attempts: TAttempt[],
  questionId: string,
): TAttempt | null {
  return attempts
    .filter((attempt) => attempt.questionId === questionId)
    .sort(compareAttemptsDescending)[0] ?? null;
}

function compareAttemptsDescending(left: LearnerAssessmentAttempt, right: LearnerAssessmentAttempt): number {
  const submittedAtDiff = right.submittedAt.getTime() - left.submittedAt.getTime();

  return submittedAtDiff || right.attemptNumber - left.attemptNumber;
}

function lockedAssignmentBody(assignment: LearnerCertificateAssignment): string {
  const dueDate = assignment.dueDate ? ` / Due ${formatDate(assignment.dueDate)}` : "";
  const progress = assignment.progress?.progressPercent ?? (assignment.status === "COMPLETED" ? 100 : 0);

  if (assignment.status === "COMPLETED") {
    return `Completed / certificate issue pending / ${credentialLabel(assignment.course.credentialProvider)}`;
  }

  return `${formatAssignmentStatus(assignment.status)} / ${progress}% complete${dueDate} / ${credentialLabel(assignment.course.credentialProvider)}`;
}

function credentialLabel(provider: string | null): string {
  return provider ? `${provider} credential` : "LearnHub certificate";
}

function formatAssignmentStatus(status: string): string {
  return status
    .split("_")
    .map((part) => part.slice(0, 1) + part.slice(1).toLowerCase())
    .join(" ");
}

function formatCourseType(type: string): string {
  return type === "SCORM_1_2" ? "SCORM" : "Native video";
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
