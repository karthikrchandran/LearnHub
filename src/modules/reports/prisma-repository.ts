import type { Prisma, PrismaClient } from "@prisma/client";

import {
  progressReportWhere,
  summarizeRequiredCheckScores,
  type ProgressReportRow,
  type ProgressReportScope,
} from "./progress-report";

type PrismaProgressReportClient = Pick<PrismaClient, "courseAssignment">;

export type ProgressReportRepository = {
  listProgressRows(input: {
    organizationId: string;
    scope: ProgressReportScope;
  }): Promise<ProgressReportRow[]>;
};

type ProgressReportAssignmentRecord = {
  id: string;
  status: ProgressReportRow["assignmentStatus"];
  dueDate: Date;
  course: {
    title: string;
    type: ProgressReportRow["courseType"];
    knowledgeCheckQuestions: Array<{ id: string }>;
  };
  knowledgeCheckAttempts: Array<{
    questionId: string;
    scorePercent: number;
    submittedAt: Date;
  }>;
  membership: {
    user: {
      firstName: string;
      lastName: string;
      email: string;
    };
  };
  progress: {
    progressPercent: number;
    lastEventAt: Date | null;
  } | null;
  learningEvents: Array<{
    occurredAt: Date;
  }>;
  certificate: {
    verificationUrl: string;
  } | null;
};

export function createPrismaProgressReportRepository(
  client: PrismaProgressReportClient,
): ProgressReportRepository {
  return {
    async listProgressRows(input) {
      const assignments = await client.courseAssignment.findMany({
        where: progressReportWhere(input.organizationId, input.scope) as Prisma.CourseAssignmentWhereInput,
        orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
        select: {
          id: true,
          status: true,
          dueDate: true,
          course: {
            select: {
              title: true,
              type: true,
              knowledgeCheckQuestions: {
                where: { active: true, required: true },
                select: { id: true },
              },
            },
          },
          knowledgeCheckAttempts: {
            orderBy: [{ questionId: "asc" }, { submittedAt: "desc" }],
            select: { questionId: true, scorePercent: true, submittedAt: true },
          },
          membership: {
            select: {
              user: {
                select: {
                  firstName: true,
                  lastName: true,
                  email: true,
                },
              },
            },
          },
          progress: {
            select: {
              progressPercent: true,
              lastEventAt: true,
            },
          },
          learningEvents: {
            orderBy: { occurredAt: "desc" },
            take: 1,
            select: { occurredAt: true },
          },
          certificate: {
            select: {
              verificationUrl: true,
            },
          },
        },
      });

      return assignments.map((assignment) => mapProgressRow(assignment));
    },
  };
}

function mapProgressRow(assignment: ProgressReportAssignmentRecord): ProgressReportRow {
  const learnerName = `${assignment.membership.user.firstName} ${assignment.membership.user.lastName}`.trim();
  const checkScores = summarizeRequiredCheckScores({
    requiredActiveCheckIds: assignment.course.knowledgeCheckQuestions.map((question) => question.id),
    attempts: assignment.knowledgeCheckAttempts,
  });

  return {
    assignmentId: assignment.id,
    learnerName: learnerName || assignment.membership.user.email,
    learnerEmail: assignment.membership.user.email,
    courseTitle: assignment.course.title,
    courseType: assignment.course.type,
    assignmentStatus: assignment.status,
    progressPercent: assignment.progress?.progressPercent ?? 0,
    latestRequiredCheckAverageScore: checkScores.latestRequiredCheckAverageScore,
    bestRequiredCheckAverageScore: checkScores.bestRequiredCheckAverageScore,
    dueDate: assignment.dueDate,
    lastEventAt: assignment.learningEvents[0]?.occurredAt ?? assignment.progress?.lastEventAt ?? null,
    certificateUrl: assignment.certificate?.verificationUrl ?? null,
  };
}
