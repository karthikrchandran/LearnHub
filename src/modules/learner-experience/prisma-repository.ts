import type { Prisma, PrismaClient } from "@prisma/client";

type LearnerExperiencePrismaClient = {
  organization: Pick<PrismaClient["organization"], "findUnique">;
  organizationMembership: Pick<PrismaClient["organizationMembership"], "findFirst">;
  courseAssignment: Pick<PrismaClient["courseAssignment"], "findMany" | "findFirst">;
  course: Pick<PrismaClient["course"], "findMany" | "findFirst">;
  certificate: Pick<PrismaClient["certificate"], "findMany">;
  courseKnowledgeCheckQuestion: Pick<PrismaClient["courseKnowledgeCheckQuestion"], "findMany">;
  knowledgeCheckAttempt: Pick<PrismaClient["knowledgeCheckAttempt"], "findMany">;
};

const categorySelect = {
  select: { name: true, slug: true },
} satisfies Prisma.CourseCategoryDefaultArgs;

const tagLinksSelect = {
  select: { tag: { select: { name: true, slug: true } } },
  orderBy: { tag: { name: "asc" } },
} satisfies Prisma.CourseTagLinkFindManyArgs;

const courseCardSelect = {
  id: true,
  title: true,
  slug: true,
  description: true,
  type: true,
  expectedDurationMinutes: true,
  estimatedCompletionBusinessDays: true,
  credentialProvider: true,
  category: categorySelect,
  tagLinks: tagLinksSelect,
} satisfies Prisma.CourseSelect;

const modulesSelect = {
  orderBy: { sortOrder: "asc" },
  select: { id: true, title: true, slug: true, sortOrder: true },
} satisfies Prisma.CourseModuleFindManyArgs;

const lessonDetailSelect = {
  id: true,
  moduleId: true,
  title: true,
  slug: true,
  sortOrder: true,
  durationSeconds: true,
  required: true,
  chapters: {
    orderBy: { sortOrder: "asc" },
    select: { title: true, startSecond: true, endSecond: true },
  },
  transcriptCues: {
    orderBy: { startSecond: "asc" },
    take: 5,
    select: { startSecond: true, endSecond: true, text: true },
  },
} satisfies Prisma.VideoLessonSelect;

const safeAnswerChoicesSelect = {
  orderBy: { sortOrder: "asc" },
  select: { id: true, text: true },
} satisfies Prisma.CourseKnowledgeCheckAnswerFindManyArgs;

const learnerKnowledgeCheckSelect = {
  id: true,
  lessonId: true,
  prompt: true,
  required: true,
  questionType: true,
  answers: safeAnswerChoicesSelect,
} satisfies Prisma.CourseKnowledgeCheckQuestionSelect;

const activeCourseChecksSelect = {
  where: { active: true },
  orderBy: [{ lessonId: "asc" }, { sortOrder: "asc" }],
  select: learnerKnowledgeCheckSelect,
} satisfies Prisma.CourseKnowledgeCheckQuestionFindManyArgs;

const courseOverviewSelect = {
  ...courseCardSelect,
  modules: modulesSelect,
  videoLessons: {
    orderBy: { sortOrder: "asc" },
    select: lessonDetailSelect,
  },
  knowledgeCheckQuestions: activeCourseChecksSelect,
} satisfies Prisma.CourseSelect;

const assessmentCourseSelect = {
  ...courseCardSelect,
  knowledgeCheckQuestions: activeCourseChecksSelect,
} satisfies Prisma.CourseSelect;

const assignmentProgressSelect = {
  select: {
    progressPercent: true,
    lastEventAt: true,
  },
} satisfies Prisma.AssignmentProgressDefaultArgs;

const certificateStateSelect = {
  select: {
    id: true,
    verificationCode: true,
    verificationUrl: true,
    issuedAt: true,
  },
} satisfies Prisma.CertificateDefaultArgs;

const knowledgeCheckAttemptSelect = {
  orderBy: [{ questionId: "asc" }, { submittedAt: "desc" }],
  select: {
    questionId: true,
    selectedAnswerIds: true,
    correct: true,
    scorePercent: true,
    submittedAt: true,
  },
} satisfies Prisma.KnowledgeCheckAttemptFindManyArgs;

const videoProgressSelect = {
  select: {
    lessonId: true,
    lastPositionSecond: true,
    maxWatchedSecond: true,
    completed: true,
    lastWatchedAt: true,
  },
} satisfies Prisma.VideoLessonProgressFindManyArgs;

const scormRegistrationSelect = {
  select: {
    lessonStatus: true,
    scoreRaw: true,
    totalTimeSeconds: true,
    launchCount: true,
    lastLaunchedAt: true,
    lastCommittedAt: true,
  },
} satisfies Prisma.ScormRegistrationDefaultArgs;

const courseCardAssignmentSelect = {
  id: true,
  courseId: true,
  membershipId: true,
  status: true,
  startDate: true,
  dueDate: true,
  progress: assignmentProgressSelect,
  certificate: certificateStateSelect,
  course: { select: courseCardSelect },
} satisfies Prisma.CourseAssignmentSelect;

const courseEnrollmentSelect = {
  id: true,
  courseId: true,
  membershipId: true,
  status: true,
  startDate: true,
  dueDate: true,
  progress: assignmentProgressSelect,
  certificate: certificateStateSelect,
  videoProgress: videoProgressSelect,
  scormRegistration: scormRegistrationSelect,
  knowledgeCheckAttempts: knowledgeCheckAttemptSelect,
} satisfies Prisma.CourseAssignmentSelect;

const assessmentAssignmentSelect = {
  id: true,
  courseId: true,
  membershipId: true,
  status: true,
  startDate: true,
  dueDate: true,
  progress: assignmentProgressSelect,
  knowledgeCheckAttempts: knowledgeCheckAttemptSelect,
  course: { select: assessmentCourseSelect },
} satisfies Prisma.CourseAssignmentSelect;

function lessonCourseSelect(lessonSlug: string) {
  return {
    ...courseOverviewSelect,
    videoLessons: {
      orderBy: { sortOrder: "asc" },
      select: lessonDetailSelect,
    },
    knowledgeCheckQuestions: {
      where: {
        active: true,
        OR: [
          { lesson: { slug: lessonSlug } },
          { lessonId: null },
        ],
      },
      orderBy: [{ lessonId: "asc" }, { sortOrder: "asc" }],
      select: learnerKnowledgeCheckSelect,
    },
  } satisfies Prisma.CourseSelect;
}

export function createPrismaLearnerExperienceRepository(client: LearnerExperiencePrismaClient) {
  return {
    listLearnerAssignments(input: { organizationId: string; membershipId: string }) {
      return client.courseAssignment.findMany({
        where: { organizationId: input.organizationId, membershipId: input.membershipId },
        orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
        select: courseCardAssignmentSelect,
      });
    },
    listAvailableCourses(input: { organizationId: string; excludedCourseIds: string[] }) {
      return client.course.findMany({
        where: {
          organizationId: input.organizationId,
          status: "PUBLISHED",
          id: { notIn: input.excludedCourseIds },
        },
        orderBy: { title: "asc" },
        select: courseCardSelect,
      });
    },
    findCourseOverview(input: { organizationId: string; courseSlug: string; membershipId: string }) {
      return client.course.findFirst({
        where: {
          organizationId: input.organizationId,
          slug: input.courseSlug,
          status: "PUBLISHED",
        },
        select: {
          ...courseOverviewSelect,
          assignments: {
            where: { organizationId: input.organizationId, membershipId: input.membershipId },
            take: 1,
            select: courseEnrollmentSelect,
          },
        },
      });
    },
    findLesson(input: { organizationId: string; courseSlug: string; lessonSlug: string; membershipId: string }) {
      const select = lessonCourseSelect(input.lessonSlug);

      return client.course.findFirst({
        where: {
          organizationId: input.organizationId,
          slug: input.courseSlug,
          status: "PUBLISHED",
          type: "NATIVE_VIDEO",
          videoLessons: { some: { slug: input.lessonSlug } },
        },
        select: {
          ...select,
          assignments: {
            where: { organizationId: input.organizationId, membershipId: input.membershipId },
            take: 1,
            select: courseEnrollmentSelect,
          },
        },
      });
    },
    listAssessments(input: { organizationId: string; membershipId: string }) {
      return client.courseAssignment.findMany({
        where: {
          organizationId: input.organizationId,
          membershipId: input.membershipId,
          course: {
            knowledgeCheckQuestions: { some: { active: true } },
          },
        },
        orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
        select: assessmentAssignmentSelect,
      });
    },
    listCertificates(input: { organizationId: string; membershipId: string }) {
      return client.certificate.findMany({
        where: {
          organizationId: input.organizationId,
          membershipId: input.membershipId,
        },
        orderBy: { issuedAt: "desc" },
        select: {
          id: true,
          assignmentId: true,
          courseId: true,
          learnerName: true,
          learnerEmail: true,
          courseTitle: true,
          verificationCode: true,
          verificationUrl: true,
          issuedAt: true,
          artifactStorageKey: true,
          credentialIssuances: {
            orderBy: { attemptedAt: "desc" },
            take: 1,
            select: {
              provider: true,
              status: true,
              providerCredentialId: true,
              providerUrl: true,
              errorMessage: true,
              attemptedAt: true,
            },
          },
          course: {
            select: {
              slug: true,
              credentialProvider: true,
              credentialTemplateId: true,
            },
          },
        },
      });
    },
  };
}
