import {
  assignCourse,
  selfEnrollInCourse,
  type AssignmentRepository,
} from "./assignment-service";
import type { MembershipAuthContext } from "../auth/permissions";

export type AssignmentActionResult = { status: "success" | "error"; message: string };

export type AssignmentActionContext = {
  actor: MembershipAuthContext;
  organizationId: string;
};

export type AssignCourseActionDependencies = {
  getActorAndOrganization(slug: string): Promise<AssignmentActionContext>;
  repository: AssignmentRepository;
};

export type SelfEnrollActionDependencies = AssignCourseActionDependencies;

export function createAssignCourseAction(dependencies: AssignCourseActionDependencies) {
  return async function assignCourseAction(slug: string, formData: FormData): Promise<AssignmentActionResult> {
    const startDate = readStartDate(formData);

    if (!startDate) {
      return { status: "error", message: "Start date is required" };
    }

    try {
      const context = await dependencies.getActorAndOrganization(slug);

      await assignCourse(
        {
          organizationId: context.organizationId,
          courseId: readFormString(formData, "courseId"),
          learnerMembershipId: readFormString(formData, "learnerMembershipId"),
          actor: context.actor,
          startDate,
        },
        dependencies.repository,
      );

      return { status: "success", message: "Course assigned." };
    } catch (error) {
      return { status: "error", message: error instanceof Error ? error.message : "Course assignment failed" };
    }
  };
}

export function createSelfEnrollAction(dependencies: SelfEnrollActionDependencies) {
  return async function selfEnrollAction(slug: string, formData: FormData): Promise<AssignmentActionResult> {
    const startDate = readStartDate(formData);

    if (!startDate) {
      return { status: "error", message: "Start date is required" };
    }

    try {
      const context = await dependencies.getActorAndOrganization(slug);

      await selfEnrollInCourse(
        {
          organizationId: context.organizationId,
          courseId: readFormString(formData, "courseId"),
          learnerMembershipId: readFormString(formData, "learnerMembershipId"),
          actor: context.actor,
          startDate,
        },
        dependencies.repository,
      );

      return { status: "success", message: "Course added." };
    } catch (error) {
      return { status: "error", message: error instanceof Error ? error.message : "Course enrollment failed" };
    }
  };
}

function readFormString(formData: FormData, key: string): string {
  const value = formData.get(key);

  return typeof value === "string" ? value : "";
}

function readStartDate(formData: FormData): Date | null {
  const value = readFormString(formData, "startDate");
  const date = new Date(value);

  if (!value || Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}
