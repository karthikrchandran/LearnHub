import {
  assignCourse,
  selfEnrollInCourse,
  type AssignmentRepository,
  type AssignmentNotificationScheduler,
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
  notificationScheduler?: AssignmentNotificationScheduler;
  buildAssignmentUrl?(slug: string): string;
  now?(): Date;
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
          now: dependencies.now?.() ?? new Date(),
          assignmentUrl: dependencies.buildAssignmentUrl?.(slug) ?? "",
        },
        dependencies.repository,
        dependencies.notificationScheduler,
      );

      return { status: "success", message: "Course assigned." };
    } catch (error) {
      return { status: "error", message: error instanceof Error ? error.message : "Course assignment failed" };
    }
  };
}

export function createBulkAssignCourseAction(dependencies: AssignCourseActionDependencies) {
  return async function bulkAssignCourseAction(slug: string, formData: FormData): Promise<AssignmentActionResult> {
    const startDate = readStartDate(formData);

    if (!startDate) {
      return { status: "error", message: "Start date is required" };
    }

    const learnerMembershipIds = Array.from(new Set(readFormStringList(formData, "learnerMembershipIds")));

    if (learnerMembershipIds.length === 0) {
      return { status: "error", message: "Select at least one learner" };
    }

    try {
      const context = await dependencies.getActorAndOrganization(slug);
      const now = dependencies.now?.() ?? new Date();
      const assignmentUrl = dependencies.buildAssignmentUrl?.(slug) ?? "";
      const failures: string[] = [];
      let assignedCount = 0;

      for (const learnerMembershipId of learnerMembershipIds) {
        try {
          await assignCourse(
            {
              organizationId: context.organizationId,
              courseId: readFormString(formData, "courseId"),
              learnerMembershipId,
              actor: context.actor,
              startDate,
              now,
              assignmentUrl,
            },
            dependencies.repository,
            dependencies.notificationScheduler,
          );
          assignedCount += 1;
        } catch (error) {
          failures.push(error instanceof Error ? error.message : "Course assignment failed");
        }
      }

      if (assignedCount === 0) {
        return {
          status: "error",
          message: failures[0] ?? "Course assignment failed",
        };
      }

      const noun = assignedCount === 1 ? "learner" : "learners";
      const message = `Assigned course to ${assignedCount} ${noun}.`;

      return failures.length > 0
        ? { status: "success", message: `${message} ${failures.length} failed.` }
        : { status: "success", message };
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
          now: dependencies.now?.() ?? new Date(),
          assignmentUrl: dependencies.buildAssignmentUrl?.(slug) ?? "",
        },
        dependencies.repository,
        dependencies.notificationScheduler,
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

function readFormStringList(formData: FormData, key: string): string[] {
  return formData
    .getAll(key)
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter(Boolean);
}

function readStartDate(formData: FormData): Date | null {
  const value = readFormString(formData, "startDate");
  const date = new Date(value);

  if (!value || Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}
