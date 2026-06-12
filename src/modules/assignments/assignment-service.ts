import type {
  AssignmentStatus,
  CourseStatus,
  OrganizationEnrollmentPolicy,
  OrganizationRole,
  UserStatus,
} from "@prisma/client";

import { addBusinessDays } from "../../lib/dates/business-days";
import { canAssignDirectReport, type MembershipAuthContext, type TargetMembership } from "../auth/permissions";
import { assertCourseAssignable, assertCourseSelfEnrollable } from "../catalog/course-lifecycle";
import type { AssignmentNotificationScheduleInput } from "../notifications/notification-jobs";

export type AssignmentCourse = {
  id: string;
  organizationId: string;
  title: string;
  status: CourseStatus;
  estimatedCompletionBusinessDays: number;
};

export type AssignmentMembership = TargetMembership & {
  learnerEmail: string;
  learnerName: string;
  managerEmail: string | null;
  managerName: string | null;
  status: UserStatus;
  roles: OrganizationRole[];
};

export type AssignCourseInput = {
  organizationId: string;
  courseId: string;
  learnerMembershipId: string;
  actor: MembershipAuthContext;
  startDate: Date;
  now?: Date;
  assignmentUrl?: string;
};

export type SelfEnrollInput = {
  organizationId: string;
  courseId: string;
  learnerMembershipId: string;
  actor: MembershipAuthContext;
  startDate: Date;
  now?: Date;
  assignmentUrl?: string;
};

export type AssignmentRepository = {
  runInTransaction<T>(operation: () => Promise<T>): Promise<T>;
  findCourse(input: { organizationId: string; courseId: string }): Promise<AssignmentCourse | null>;
  findMembership(input: { organizationId: string; membershipId: string }): Promise<AssignmentMembership | null>;
  findOrganization(input: {
    organizationId: string;
  }): Promise<{ id: string; enrollmentPolicy: OrganizationEnrollmentPolicy } | null>;
  assignmentExists(input: { organizationId: string; courseId: string; membershipId: string }): Promise<boolean>;
  createAssignment(data: {
    organizationId: string;
    courseId: string;
    membershipId: string;
    assignedByMembershipId: string | null;
    startDate: Date;
    dueDate: Date;
    status: AssignmentStatus;
  }): Promise<{ id: string }>;
  recordAuditLog(data: {
    organizationId: string;
    actorId: string;
    action: string;
    targetType: string;
    targetId: string;
  }): Promise<void>;
};

export type AssignmentNotificationScheduler = {
  scheduleAssignmentNotifications(input: AssignmentNotificationScheduleInput): Promise<void> | void;
};

export async function assignCourse(
  input: AssignCourseInput,
  repository: AssignmentRepository,
  notifications?: AssignmentNotificationScheduler,
): Promise<{ id: string }> {
  const course = await requireCourse(input, repository);
  const learner = await requireLearner(input, repository);

  assertCourseAssignable(course);

  if (!canAssignDirectReport(input.actor, learner)) {
    throw new Error("Not allowed to assign this course");
  }

  return createAssignmentWithAudit({
    input,
    repository,
    learner,
    notifications,
    assignedByMembershipId: activeActorMembershipId(input.actor, input.organizationId),
    auditAction: "assignment.created",
  });
}

export async function selfEnrollInCourse(
  input: SelfEnrollInput,
  repository: AssignmentRepository,
  notifications?: AssignmentNotificationScheduler,
): Promise<{ id: string }> {
  const organization = await repository.findOrganization({ organizationId: input.organizationId });

  if (!organization) {
    throw new Error("Organization not found");
  }

  if (organization.enrollmentPolicy !== "ASSIGNMENT_AND_SELF_ENROLLMENT") {
    throw new Error("Self-enrollment is not enabled for this organization");
  }

  const course = await requireCourse(input, repository);
  const learner = await requireLearner(input, repository);

  assertCourseSelfEnrollable(course);

  if (!canSelfEnroll(input.actor, learner)) {
    throw new Error("Not allowed to self-enroll this learner");
  }

  return createAssignmentWithAudit({
    input,
    repository,
    learner,
    notifications,
    assignedByMembershipId: null,
    auditAction: "assignment.self_enrolled",
  });
}

async function requireCourse(
  input: Pick<AssignCourseInput, "organizationId" | "courseId">,
  repository: AssignmentRepository,
): Promise<AssignmentCourse> {
  const course = await repository.findCourse({
    organizationId: input.organizationId,
    courseId: input.courseId,
  });

  if (!course) {
    throw new Error("Course not found");
  }

  return course;
}

async function requireLearner(
  input: Pick<AssignCourseInput, "organizationId" | "learnerMembershipId">,
  repository: AssignmentRepository,
): Promise<AssignmentMembership> {
  const learner = await repository.findMembership({
    organizationId: input.organizationId,
    membershipId: input.learnerMembershipId,
  });

  if (!learner) {
    throw new Error("Learner membership not found");
  }

  if (learner.status !== "ACTIVE") {
    throw new Error("Learner membership must be active");
  }

  if (!learner.roles.includes("LEARNER")) {
    throw new Error("Course can only be assigned to learners");
  }

  return learner;
}

async function createAssignmentWithAudit(input: {
  input: AssignCourseInput | SelfEnrollInput;
  repository: AssignmentRepository;
  learner: AssignmentMembership;
  notifications?: AssignmentNotificationScheduler;
  assignedByMembershipId: string | null;
  auditAction: string;
}): Promise<{ id: string }> {
  const { repository } = input;

  const created = await repository.runInTransaction(async () => {
    const existingAssignment = await repository.assignmentExists({
      organizationId: input.input.organizationId,
      courseId: input.input.courseId,
      membershipId: input.input.learnerMembershipId,
    });

    if (existingAssignment) {
      throw new Error("Learner already has this course assigned");
    }

    const course = await repository.findCourse({
      organizationId: input.input.organizationId,
      courseId: input.input.courseId,
    });

    if (!course) {
      throw new Error("Course not found");
    }

    const dueDate = addBusinessDays(input.input.startDate, course.estimatedCompletionBusinessDays);
    const assignment = await repository.createAssignment({
      organizationId: input.input.organizationId,
      courseId: input.input.courseId,
      membershipId: input.input.learnerMembershipId,
      assignedByMembershipId: input.assignedByMembershipId,
      startDate: input.input.startDate,
      dueDate,
      status: "ASSIGNED",
    });

    await repository.recordAuditLog({
      organizationId: input.input.organizationId,
      actorId: input.input.actor.userId,
      action: input.auditAction,
      targetType: "course_assignment",
      targetId: assignment.id,
    });

    return { assignment, course, dueDate };
  });

  if (input.notifications) {
    try {
      await input.notifications.scheduleAssignmentNotifications({
        organizationId: input.input.organizationId,
        assignmentId: created.assignment.id,
        learnerEmail: input.learner.learnerEmail,
        learnerName: input.learner.learnerName,
        courseTitle: created.course.title,
        dueDate: created.dueDate,
        assignmentUrl: input.input.assignmentUrl ?? "",
        managerEmail: input.learner.managerEmail,
        managerName: input.learner.managerName,
        now: input.input.now ?? new Date(),
      });
    } catch (error) {
      console.error("Notification enqueue failed after assignment commit", {
        organizationId: input.input.organizationId,
        assignmentId: created.assignment.id,
        error: error instanceof Error ? error.message : "Notification enqueue failed",
      });
    }
  }

  return created.assignment;
}

function activeActorMembershipId(actor: MembershipAuthContext, organizationId: string): string | null {
  return (
    actor.memberships.find((membership) => membership.organizationId === organizationId && membership.status === "ACTIVE")
      ?.id ?? null
  );
}

function canSelfEnroll(actor: MembershipAuthContext, learner: AssignmentMembership): boolean {
  if (actor.userId !== learner.userId) {
    return false;
  }

  return actor.memberships.some(
    (membership) =>
      membership.id === learner.id &&
      membership.organizationId === learner.organizationId &&
      membership.status === "ACTIVE" &&
      membership.roles.includes("LEARNER"),
  );
}
