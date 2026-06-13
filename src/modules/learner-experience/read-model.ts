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
    return { label: "Enroll", href: `/org/${input.slug}/learn/courses/${input.courseSlug}`, variant: "light" };
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
