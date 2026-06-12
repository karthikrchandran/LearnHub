import type { PrismaClient } from "@prisma/client";

import { requireCanActivateKnowledgeCheck, type KnowledgeCheckDraft } from "./knowledge-checks";
import type { KnowledgeCheckScore, ScoreableKnowledgeCheck } from "./scoring";

type PrismaKnowledgeCheckClient = Pick<
  PrismaClient,
  | "$transaction"
  | "course"
  | "courseAssignment"
  | "courseKnowledgeCheckQuestion"
  | "courseKnowledgeCheckAnswer"
  | "knowledgeCheckAttempt"
>;

export type KnowledgeCheckSubmissionAssignment = {
  id: string;
  organizationId: string;
  membershipId: string;
  courseId: string;
  learner: {
    id: string;
    userId: string;
    organizationId: string;
    managerMembershipId: string | null;
  };
};

type KnowledgeCheckSubmissionAssignmentRecord = Omit<KnowledgeCheckSubmissionAssignment, "learner"> & {
  membership: KnowledgeCheckSubmissionAssignment["learner"];
};

export type CreateAttemptInput = {
  organizationId: string;
  assignmentId: string;
  questionId: string;
  selectedAnswerIds: string[];
  score: KnowledgeCheckScore;
  submittedAt: Date;
};

export type KnowledgeCheckDifficultyRow = {
  organizationId: string;
  courseId: string;
  questionId: string;
  prompt: string;
  selectedAnswerIds: string[];
  correct: boolean;
};

export type KnowledgeCheckRepository = {
  listChecksForCourse(input: { organizationId: string; courseSlug: string }): Promise<unknown[]>;
  findAssignmentForSubmission(input: {
    organizationId: string;
    assignmentId: string;
  }): Promise<KnowledgeCheckSubmissionAssignment | null>;
  findCheckForSubmission(input: {
    organizationId: string;
    courseId: string;
    checkId: string;
  }): Promise<ScoreableKnowledgeCheck | null>;
  createAttempt(input: CreateAttemptInput): Promise<{ attemptNumber: number }>;
  createCheck(input: KnowledgeCheckDraft): Promise<{ id: string }>;
  replaceCheck(input: { id: string; draft: KnowledgeCheckDraft }): Promise<void>;
  reorderChecks(input: { organizationId: string; orderedIds: Array<{ id: string; sortOrder: number }> }): Promise<void>;
  setCheckActive(input: { organizationId: string; id: string; active: boolean }): Promise<void>;
  listDifficultyRows(input: { organizationId: string; courseId: string }): Promise<KnowledgeCheckDifficultyRow[]>;
};

export function createPrismaKnowledgeCheckRepository(
  client: PrismaKnowledgeCheckClient,
): KnowledgeCheckRepository {
  return {
    async listChecksForCourse(input) {
      return client.courseKnowledgeCheckQuestion.findMany({
        where: {
          organizationId: input.organizationId,
          course: { slug: input.courseSlug },
        },
        orderBy: [{ lessonId: "asc" }, { sortOrder: "asc" }],
        include: { answers: { orderBy: { sortOrder: "asc" } } },
      });
    },
    async findAssignmentForSubmission(input) {
      const assignment = await client.courseAssignment.findFirst({
        where: {
          id: input.assignmentId,
          organizationId: input.organizationId,
        },
        select: {
          id: true,
          organizationId: true,
          membershipId: true,
          courseId: true,
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

      return assignment ? mapSubmissionAssignment(assignment) : null;
    },
    async findCheckForSubmission(input) {
      const question = await client.courseKnowledgeCheckQuestion.findFirst({
        where: {
          id: input.checkId,
          organizationId: input.organizationId,
          courseId: input.courseId,
          active: true,
        },
        select: {
          id: true,
          questionType: true,
          explanation: true,
          answers: {
            orderBy: { sortOrder: "asc" },
            select: { id: true, correct: true, feedback: true },
          },
        },
      });

      return question as ScoreableKnowledgeCheck | null;
    },
    async createAttempt(input) {
      return createAttemptWithUniqueRetry(() =>
        client.$transaction(async (transaction) => {
          const latest = await transaction.knowledgeCheckAttempt.findFirst({
            where: {
              organizationId: input.organizationId,
              assignmentId: input.assignmentId,
              questionId: input.questionId,
            },
            orderBy: { attemptNumber: "desc" },
            select: { attemptNumber: true },
          });
          const attemptNumber = (latest?.attemptNumber ?? 0) + 1;

          await transaction.knowledgeCheckAttempt.create({
            data: {
              organizationId: input.organizationId,
              assignmentId: input.assignmentId,
              questionId: input.questionId,
              attemptNumber,
              selectedAnswerIds: input.selectedAnswerIds,
              correct: input.score.correct,
              scorePercent: input.score.scorePercent,
              submittedAt: input.submittedAt,
            },
          });

          return { attemptNumber };
        }),
      );
    },
    async createCheck(input) {
      return client.courseKnowledgeCheckQuestion.create({
        data: {
          organizationId: input.organizationId,
          courseId: input.courseId,
          lessonId: input.lessonId,
          prompt: input.prompt,
          questionType: input.questionType,
          required: input.required,
          active: input.active,
          explanation: input.explanation,
          answers: {
            create: input.answers.map((answer) => ({
              organizationId: input.organizationId,
              text: answer.text,
              correct: answer.correct,
              feedback: answer.feedback,
              sortOrder: answer.sortOrder,
            })),
          },
        },
        select: { id: true },
      });
    },
    async replaceCheck(input) {
      await client.$transaction(async (transaction) => {
        const existing = await transaction.courseKnowledgeCheckQuestion.findFirst({
          where: {
            id: input.id,
            organizationId: input.draft.organizationId,
          },
          select: { id: true },
        });

        if (!existing) {
          throw new Error("Knowledge check was not found");
        }

        await transaction.courseKnowledgeCheckAnswer.deleteMany({
          where: {
            organizationId: input.draft.organizationId,
            questionId: input.id,
          },
        });
        await transaction.courseKnowledgeCheckQuestion.update({
          where: {
            organizationId_id: {
              organizationId: input.draft.organizationId,
              id: input.id,
            },
          },
          data: {
            prompt: input.draft.prompt,
            lessonId: input.draft.lessonId,
            questionType: input.draft.questionType,
            required: input.draft.required,
            active: input.draft.active,
            explanation: input.draft.explanation,
            answers: {
              create: input.draft.answers.map((answer) => ({
                organizationId: input.draft.organizationId,
                text: answer.text,
                correct: answer.correct,
                feedback: answer.feedback,
                sortOrder: answer.sortOrder,
              })),
            },
          },
        });
      });
    },
    async reorderChecks(input) {
      await client.$transaction(
        input.orderedIds.map((item) =>
          client.courseKnowledgeCheckQuestion.update({
            where: { organizationId_id: { organizationId: input.organizationId, id: item.id } },
            data: { sortOrder: item.sortOrder },
          }),
        ),
      );
    },
    async setCheckActive(input) {
      if (input.active) {
        const check = await client.courseKnowledgeCheckQuestion.findFirst({
          where: {
            id: input.id,
            organizationId: input.organizationId,
          },
          select: {
            organizationId: true,
            courseId: true,
            lessonId: true,
            prompt: true,
            questionType: true,
            required: true,
            active: true,
            explanation: true,
            answers: {
              where: { organizationId: input.organizationId },
              orderBy: { sortOrder: "asc" },
              select: {
                text: true,
                correct: true,
                feedback: true,
                sortOrder: true,
              },
            },
          },
        });

        if (!check) {
          throw new Error("Knowledge check was not found");
        }

        requireCanActivateKnowledgeCheck(check);
      }

      await client.courseKnowledgeCheckQuestion.update({
        where: { organizationId_id: { organizationId: input.organizationId, id: input.id } },
        data: { active: input.active },
      });
    },
    async listDifficultyRows(input) {
      const attempts = await client.knowledgeCheckAttempt.findMany({
        where: {
          organizationId: input.organizationId,
          question: {
            courseId: input.courseId,
          },
        },
        select: {
          organizationId: true,
          selectedAnswerIds: true,
          correct: true,
          question: {
            select: {
              id: true,
              courseId: true,
              prompt: true,
            },
          },
        },
      });

      return attempts.map((attempt) => ({
        organizationId: attempt.organizationId,
        courseId: attempt.question.courseId,
        questionId: attempt.question.id,
        prompt: attempt.question.prompt,
        selectedAnswerIds: attempt.selectedAnswerIds,
        correct: attempt.correct,
      }));
    },
  };
}

function mapSubmissionAssignment(
  assignment: KnowledgeCheckSubmissionAssignmentRecord,
): KnowledgeCheckSubmissionAssignment {
  return {
    id: assignment.id,
    organizationId: assignment.organizationId,
    membershipId: assignment.membershipId,
    courseId: assignment.courseId,
    learner: assignment.membership,
  };
}

async function createAttemptWithUniqueRetry(
  operation: () => Promise<{ attemptNumber: number }>,
): Promise<{ attemptNumber: number }> {
  try {
    return await operation();
  } catch (error) {
    if (!isUniqueConstraintError(error)) {
      throw error;
    }

    return operation();
  }
}

function isUniqueConstraintError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}
