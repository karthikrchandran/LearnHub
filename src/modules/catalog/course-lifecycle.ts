import type { CourseStatus } from "@prisma/client";

export type CourseLifecycleState = {
  status: CourseStatus;
};

export function assertCourseAssignable(course: CourseLifecycleState): void {
  if (course.status !== "PUBLISHED") {
    throw new Error("Only published courses can be assigned");
  }
}

export function assertCourseSelfEnrollable(course: CourseLifecycleState): void {
  if (course.status !== "PUBLISHED") {
    throw new Error("Only published courses can be self-enrolled");
  }
}

export function courseVisibleToLearner(input: CourseLifecycleState & { alreadyAssigned: boolean }): boolean {
  if (input.status === "PUBLISHED") {
    return true;
  }

  return input.status === "DEPRECATED" && input.alreadyAssigned;
}
