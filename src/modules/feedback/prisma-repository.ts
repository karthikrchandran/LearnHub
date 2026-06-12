import type { PrismaClient } from "@prisma/client";

export type FeedbackAssignment = {
  id: string;
  organizationId: string;
  courseId: string;
  courseType: "NATIVE_VIDEO" | "SCORM_1_2";
  membershipId: string;
  learner: {
    id: string;
    userId: string;
    organizationId: string;
    managerMembershipId: string | null;
  };
};

type FeedbackAssignmentRecord = Omit<FeedbackAssignment, "courseType" | "learner"> & {
  course: { type: FeedbackAssignment["courseType"] };
  membership: FeedbackAssignment["learner"];
};

export type UpsertCourseFeedbackInput = {
  organizationId: string;
  courseId: string;
  assignmentId: string;
  membershipId: string;
  stars: number;
  text: string | null;
  submittedAt: Date;
};

type PrismaCourseFeedbackClient = Pick<PrismaClient, "courseAssignment" | "courseFeedback">;

export type CourseFeedbackRepository = {
  findAssignmentForFeedback(input: { organizationId: string; assignmentId: string }): Promise<FeedbackAssignment | null>;
  upsertCourseFeedback(input: UpsertCourseFeedbackInput): Promise<{ id: string }>;
  listSatisfactionRows(input: { organizationId: string }): Promise<Array<{
    organizationId: string;
    courseId: string;
    assignmentId: string;
    membershipId: string;
    stars: number;
    text: string | null;
  }>>;
};

export function createPrismaCourseFeedbackRepository(
  client: PrismaCourseFeedbackClient,
): CourseFeedbackRepository {
  return {
    async findAssignmentForFeedback(input) {
      const assignment = await client.courseAssignment.findFirst({
        where: {
          id: input.assignmentId,
          organizationId: input.organizationId,
        },
        select: {
          id: true,
          organizationId: true,
          courseId: true,
          membershipId: true,
          course: {
            select: {
              type: true,
            },
          },
          membership: {
            select: {
              id: true,
              userId: true,
              organizationId: true,
              managerMembershipId: true,
            },
          },
        },
      });

      return assignment ? mapFeedbackAssignment(assignment) : null;
    },
    async upsertCourseFeedback(input) {
      return client.courseFeedback.upsert({
        where: {
          organizationId_assignmentId: {
            organizationId: input.organizationId,
            assignmentId: input.assignmentId,
          },
        },
        update: {
          stars: input.stars,
          text: input.text,
          submittedAt: input.submittedAt,
        },
        create: {
          organizationId: input.organizationId,
          courseId: input.courseId,
          assignmentId: input.assignmentId,
          membershipId: input.membershipId,
          stars: input.stars,
          text: input.text,
          submittedAt: input.submittedAt,
        },
        select: { id: true },
      });
    },
    async listSatisfactionRows(input) {
      return client.courseFeedback.findMany({
        where: { organizationId: input.organizationId },
        select: {
          organizationId: true,
          courseId: true,
          assignmentId: true,
          membershipId: true,
          stars: true,
          text: true,
        },
      });
    },
  };
}

function mapFeedbackAssignment(assignment: FeedbackAssignmentRecord): FeedbackAssignment {
  return {
    id: assignment.id,
    organizationId: assignment.organizationId,
    courseId: assignment.courseId,
    courseType: assignment.course.type,
    membershipId: assignment.membershipId,
    learner: assignment.membership,
  };
}
