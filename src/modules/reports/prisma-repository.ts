import type { Prisma, PrismaClient } from "@prisma/client";

import { type CertificateCredentialReportRow } from "./certificate-credential-report";
import {
  buildCourseCompletionReportRows,
  type CourseCompletionReportRow,
} from "./course-completion-report";
import {
  buildPlatformAggregateReportRows,
  type PlatformAggregateReportRow,
} from "./platform-aggregate-report";
import { buildPopularityReportRows, type PopularityReportRows } from "./popularity-report";
import {
  progressReportWhere,
  summarizeRequiredCheckScores,
  type ProgressReportRow,
  type ProgressReportScope,
} from "./progress-report";
import {
  buildQuizDifficultyReportRows,
  type QuizDifficultyReportRow,
} from "./quiz-difficulty-report";
import { buildSatisfactionReportRows, type SatisfactionReportRow } from "./satisfaction-report";
import { buildScoringReportRows } from "./scoring-report";
import { buildTimingReportRows, type TimingReportRow } from "./timing-report";

type PrismaProgressReportClient = Pick<
  PrismaClient,
  "courseAssignment" | "knowledgeCheckAttempt" | "courseFeedback" | "certificate" | "course" | "organization"
>;

export type ProgressReportRepository = {
  listProgressRows(input: {
    organizationId: string;
    scope: ProgressReportScope;
  }): Promise<ProgressReportRow[]>;
  listCourseCompletionRows(input: {
    organizationId: string;
    scope: ProgressReportScope;
  }): Promise<CourseCompletionReportRow[]>;
  listScoringRows(input: { organizationId: string; scope: ProgressReportScope }): Promise<ReturnType<typeof buildScoringReportRows>>;
  listTimingRows(input: { organizationId: string; scope: ProgressReportScope }): Promise<TimingReportRow[]>;
  getPopularityRows(input: { organizationId: string; scope: ProgressReportScope }): Promise<PopularityReportRows>;
  listSatisfactionRows(input: { organizationId: string; scope: ProgressReportScope }): Promise<SatisfactionReportRow[]>;
  listQuizDifficultyRows(input: { organizationId: string; scope: ProgressReportScope }): Promise<QuizDifficultyReportRow[]>;
  listCertificateCredentialRows(input: {
    organizationId: string;
    scope: ProgressReportScope;
  }): Promise<CertificateCredentialReportRow[]>;
  listPlatformAggregateRows(): Promise<PlatformAggregateReportRow[]>;
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
    async listCourseCompletionRows(input) {
      const assignments = await client.courseAssignment.findMany({
        where: progressReportWhere(input.organizationId, input.scope) as Prisma.CourseAssignmentWhereInput,
        select: {
          status: true,
          courseId: true,
          course: { select: { title: true } },
          progress: { select: { progressPercent: true } },
        },
      });

      return buildCourseCompletionReportRows(
        assignments.map((assignment) => ({
          courseId: assignment.courseId,
          courseTitle: assignment.course.title,
          assignmentStatus: assignment.status,
          progressPercent: assignment.progress?.progressPercent ?? 0,
        })),
      );
    },
    async listScoringRows(input) {
      const attempts = await client.knowledgeCheckAttempt.findMany({
        where: scopedKnowledgeAttemptWhere(input.organizationId, input.scope),
        select: {
          organizationId: true,
          scorePercent: true,
          submittedAt: true,
          question: {
            select: {
              courseId: true,
              course: { select: { title: true } },
            },
          },
        },
      });

      return buildScoringReportRows(
        attempts.map((attempt) => ({
          organizationId: attempt.organizationId,
          courseId: attempt.question.courseId,
          courseTitle: attempt.question.course.title,
          scorePercent: attempt.scorePercent,
          submittedAt: attempt.submittedAt,
        })),
        input.organizationId,
      );
    },
    async listTimingRows(input) {
      const assignments = await client.courseAssignment.findMany({
        where: progressReportWhere(input.organizationId, input.scope) as Prisma.CourseAssignmentWhereInput,
        select: {
          courseId: true,
          course: { select: { title: true } },
          progress: { select: { lastEventAt: true } },
          videoProgress: { select: { maxWatchedSecond: true, lastWatchedAt: true } },
          scormRegistration: { select: { totalTimeSeconds: true, lastCommittedAt: true, lastLaunchedAt: true } },
        },
      });

      return buildTimingReportRows(
        assignments.map((assignment) => {
          const videoTime = assignment.videoProgress.reduce((sum, progress) => sum + progress.maxWatchedSecond, 0);
          const scormTime = assignment.scormRegistration?.totalTimeSeconds ?? 0;
          const activityDates = [
            assignment.progress?.lastEventAt ?? null,
            ...assignment.videoProgress.map((progress) => progress.lastWatchedAt),
            assignment.scormRegistration?.lastCommittedAt ?? null,
            assignment.scormRegistration?.lastLaunchedAt ?? null,
          ].filter((date): date is Date => Boolean(date));

          return {
            courseId: assignment.courseId,
            courseTitle: assignment.course.title,
            totalTimeSeconds: Math.max(videoTime, scormTime),
            lastActivityAt:
              activityDates.length === 0 ? null : new Date(Math.max(...activityDates.map((date) => date.getTime()))),
          };
        }),
      );
    },
    async getPopularityRows(input) {
      const courses = await client.course.findMany({
        where: { organizationId: input.organizationId },
        select: {
          id: true,
          title: true,
          assignments: {
            where: scopedAssignmentWhere(input.organizationId, input.scope),
            select: { status: true, learningEvents: { select: { id: true } } },
          },
          feedback: {
            where: scopedFeedbackWhere(input.organizationId, input.scope),
            select: { stars: true },
          },
        },
      });

      return buildPopularityReportRows(
        courses.map((course) => ({
          courseId: course.id,
          courseTitle: course.title,
          viewCount: course.assignments.reduce((sum, assignment) => sum + assignment.learningEvents.length, 0),
          enrollmentCount: course.assignments.length,
          completionCount: course.assignments.filter((assignment) => assignment.status === "COMPLETED").length,
          averageRating:
            course.feedback.length === 0
              ? null
              : Number((course.feedback.reduce((sum, feedback) => sum + feedback.stars, 0) / course.feedback.length).toFixed(1)),
        })),
      );
    },
    async listSatisfactionRows(input) {
      const feedbackRows = await client.courseFeedback.findMany({
        where: scopedFeedbackWhere(input.organizationId, input.scope),
        select: {
          courseId: true,
          stars: true,
          text: true,
          submittedAt: true,
          course: { select: { title: true } },
        },
      });

      return buildSatisfactionReportRows(
        feedbackRows.map((feedback) => ({
          courseId: feedback.courseId,
          courseTitle: feedback.course.title,
          stars: feedback.stars,
          text: feedback.text,
          submittedAt: feedback.submittedAt,
        })),
      );
    },
    async listQuizDifficultyRows(input) {
      const attempts = await client.knowledgeCheckAttempt.findMany({
        where: scopedKnowledgeAttemptWhere(input.organizationId, input.scope),
        select: {
          questionId: true,
          selectedAnswerIds: true,
          correct: true,
          question: {
            select: {
              prompt: true,
              courseId: true,
              course: { select: { title: true } },
            },
          },
        },
      });

      return buildQuizDifficultyReportRows(
        attempts.map((attempt) => ({
          courseId: attempt.question.courseId,
          courseTitle: attempt.question.course.title,
          questionId: attempt.questionId,
          prompt: attempt.question.prompt,
          selectedAnswerIds: attempt.selectedAnswerIds,
          correct: attempt.correct,
        })),
      );
    },
    async listCertificateCredentialRows(input) {
      const certificates = await client.certificate.findMany({
        where: {
          organizationId: input.organizationId,
          ...(input.scope.kind === "admin" ? {} : { membershipId: { in: input.scope.membershipIds } }),
        },
        orderBy: { issuedAt: "desc" },
        select: {
          verificationUrl: true,
          issuedAt: true,
          learnerName: true,
          learnerEmail: true,
          courseTitle: true,
          credentialIssuances: {
            orderBy: { attemptedAt: "desc" },
            take: 1,
            select: {
              provider: true,
              status: true,
              providerCredentialId: true,
              providerUrl: true,
              errorMessage: true,
            },
          },
        },
      });

      return certificates.map((certificate) => {
        const credential = certificate.credentialIssuances[0] ?? null;

        return {
          certificateUrl: certificate.verificationUrl,
          issuedAt: certificate.issuedAt,
          learnerName: certificate.learnerName,
          learnerEmail: certificate.learnerEmail,
          courseTitle: certificate.courseTitle,
          credentialProvider: credential?.provider ?? null,
          credentialStatus: credential?.status ?? null,
          providerCredentialId: credential?.providerCredentialId ?? null,
          providerUrl: credential?.providerUrl ?? null,
          failureMessage: credential?.errorMessage ?? null,
        };
      });
    },
    async listPlatformAggregateRows() {
      const organizations = await client.organization.findMany({
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          memberships: { where: { status: "ACTIVE", roles: { has: "LEARNER" } }, select: { id: true } },
          courses: {
            select: {
              id: true,
              assignments: { select: { status: true } },
            },
          },
          certificates: { select: { id: true } },
        },
      });

      return buildPlatformAggregateReportRows(
        organizations.map((organization) => {
          const assignments = organization.courses.flatMap((course) => course.assignments);

          return {
            organizationId: organization.id,
            organizationName: organization.name,
            activeLearners: organization.memberships.length,
            courseCount: organization.courses.length,
            assignmentCount: assignments.length,
            completionCount: assignments.filter((assignment) => assignment.status === "COMPLETED").length,
            overdueCount: assignments.filter((assignment) => assignment.status === "OVERDUE").length,
            certificateCount: organization.certificates.length,
          };
        }),
      );
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

function scopedAssignmentWhere(organizationId: string, scope: ProgressReportScope): Prisma.CourseAssignmentWhereInput {
  return progressReportWhere(organizationId, scope) as Prisma.CourseAssignmentWhereInput;
}

function scopedKnowledgeAttemptWhere(
  organizationId: string,
  scope: ProgressReportScope,
): Prisma.KnowledgeCheckAttemptWhereInput {
  if (scope.kind === "admin") {
    return { organizationId };
  }

  return {
    organizationId,
    assignment: {
      membershipId: { in: scope.membershipIds },
    },
  };
}

function scopedFeedbackWhere(organizationId: string, scope: ProgressReportScope): Prisma.CourseFeedbackWhereInput {
  if (scope.kind === "admin") {
    return { organizationId };
  }

  return {
    organizationId,
    membershipId: { in: scope.membershipIds },
  };
}
