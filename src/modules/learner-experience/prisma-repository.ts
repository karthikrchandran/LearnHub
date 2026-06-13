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

const learnerCourseSelect = {
  id: true,
  title: true,
  slug: true,
  description: true,
  type: true,
  expectedDurationMinutes: true,
  estimatedCompletionBusinessDays: true,
  credentialProvider: true,
  category: { select: { name: true, slug: true } },
  tagLinks: {
    select: { tag: { select: { name: true, slug: true } } },
    orderBy: { tag: { name: "asc" } },
  },
  modules: {
    orderBy: { sortOrder: "asc" },
    select: { id: true, title: true, slug: true, sortOrder: true },
  },
  videoLessons: {
    orderBy: { sortOrder: "asc" },
    select: {
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
    },
  },
  knowledgeCheckQuestions: {
    where: { active: true },
    orderBy: [{ lessonId: "asc" }, { sortOrder: "asc" }],
    select: { id: true, lessonId: true, prompt: true, required: true, questionType: true },
  },
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

const learnerAssignmentSelect = {
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
  course: { select: learnerCourseSelect },
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

export function createPrismaLearnerExperienceRepository(client: LearnerExperiencePrismaClient) {
  return {
    listLearnerAssignments(input: { organizationId: string; membershipId: string }) {
      return client.courseAssignment.findMany({
        where: { organizationId: input.organizationId, membershipId: input.membershipId },
        orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
        select: learnerAssignmentSelect,
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
        select: learnerCourseSelect,
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
          ...learnerCourseSelect,
          assignments: {
            where: { organizationId: input.organizationId, membershipId: input.membershipId },
            take: 1,
            select: courseEnrollmentSelect,
          },
        },
      });
    },
    findLesson(input: { organizationId: string; courseSlug: string; lessonSlug: string; membershipId: string }) {
      return client.course.findFirst({
        where: {
          organizationId: input.organizationId,
          slug: input.courseSlug,
          status: "PUBLISHED",
        },
        select: {
          ...learnerCourseSelect,
          assignments: {
            where: { organizationId: input.organizationId, membershipId: input.membershipId },
            take: 1,
            select: courseEnrollmentSelect,
          },
          videoLessons: {
            where: { slug: input.lessonSlug },
            take: 1,
            select: learnerCourseSelect.videoLessons.select,
          },
          knowledgeCheckQuestions: {
            where: {
              active: true,
              lesson: { slug: input.lessonSlug },
            },
            orderBy: [{ lessonId: "asc" }, { sortOrder: "asc" }],
            select: learnerCourseSelect.knowledgeCheckQuestions.select,
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
        select: learnerAssignmentSelect,
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
