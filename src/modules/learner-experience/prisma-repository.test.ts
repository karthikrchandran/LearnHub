import { describe, expect, it, vi } from "vitest";

import { createPrismaLearnerExperienceRepository } from "./prisma-repository";

function createMockClient() {
  return {
    courseAssignment: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
    },
    course: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
    },
    organization: { findUnique: vi.fn() },
    organizationMembership: { findFirst: vi.fn() },
    certificate: { findMany: vi.fn().mockResolvedValue([]) },
    courseKnowledgeCheckQuestion: { findMany: vi.fn() },
    knowledgeCheckAttempt: { findMany: vi.fn() },
  };
}

function expectSafeAnswerSelect(answers: unknown) {
  expect(answers).toEqual({
    orderBy: { sortOrder: "asc" },
    select: { id: true, text: true },
  });
  expect(answers).not.toHaveProperty("select.correct");
  expect(answers).not.toHaveProperty("select.feedback");
}

describe("Prisma learner experience repository", () => {
  it("loads assigned learner course cards with compact course metadata", async () => {
    const client = createMockClient();
    const repository = createPrismaLearnerExperienceRepository(client);

    await repository.listLearnerAssignments({ organizationId: "org_1", membershipId: "mem_1" });

    const query = client.courseAssignment.findMany.mock.calls[0][0];

    expect(query).toEqual(expect.objectContaining({
      where: { organizationId: "org_1", membershipId: "mem_1" },
      select: expect.objectContaining({
        id: true,
        status: true,
        dueDate: true,
        progress: expect.any(Object),
        certificate: expect.any(Object),
        course: expect.objectContaining({
          select: expect.objectContaining({
            id: true,
            title: true,
            slug: true,
            description: true,
            expectedDurationMinutes: true,
            credentialProvider: true,
          }),
        }),
      }),
    }));
    expect(query.select.course.select).not.toHaveProperty("modules");
    expect(query.select.course.select).not.toHaveProperty("videoLessons");
    expect(query.select.course.select).not.toHaveProperty("knowledgeCheckQuestions");
  });

  it("loads available published course cards excluding assigned course ids", async () => {
    const client = createMockClient();
    const repository = createPrismaLearnerExperienceRepository(client);

    await repository.listAvailableCourses({
      organizationId: "org_1",
      excludedCourseIds: ["course_1"],
    });

    const query = client.course.findMany.mock.calls[0][0];

    expect(query).toEqual(expect.objectContaining({
      where: {
        organizationId: "org_1",
        status: "PUBLISHED",
        id: { notIn: ["course_1"] },
      },
      select: expect.objectContaining({
        id: true,
        title: true,
        slug: true,
        description: true,
        expectedDurationMinutes: true,
        credentialProvider: true,
      }),
    }));
    expect(query.select).not.toHaveProperty("modules");
    expect(query.select).not.toHaveProperty("videoLessons");
    expect(query.select).not.toHaveProperty("knowledgeCheckQuestions");
  });

  it("loads course overview details with assignment state and safe active checks", async () => {
    const client = createMockClient();
    const repository = createPrismaLearnerExperienceRepository(client);

    await repository.findCourseOverview({
      organizationId: "org_1",
      courseSlug: "security",
      membershipId: "mem_1",
    });

    const query = client.course.findFirst.mock.calls[0][0];
    const checkSelect = query.select.knowledgeCheckQuestions.select;

    expect(query).toEqual(expect.objectContaining({
      where: {
        organizationId: "org_1",
        slug: "security",
        status: "PUBLISHED",
      },
      select: expect.objectContaining({
        id: true,
        title: true,
        slug: true,
        description: true,
        expectedDurationMinutes: true,
        estimatedCompletionBusinessDays: true,
        modules: expect.any(Object),
        videoLessons: expect.objectContaining({
          select: expect.objectContaining({
            chapters: expect.any(Object),
            transcriptCues: expect.any(Object),
          }),
        }),
        knowledgeCheckQuestions: expect.objectContaining({
          where: { active: true },
          select: expect.objectContaining({
            id: true,
            lessonId: true,
            prompt: true,
            required: true,
            questionType: true,
            answers: expect.any(Object),
          }),
        }),
        assignments: expect.objectContaining({
          where: { organizationId: "org_1", membershipId: "mem_1" },
          take: 1,
        }),
      }),
    }));
    expectSafeAnswerSelect(checkSelect.answers);
  });

  it("loads lesson details only when the lesson exists and includes lesson plus course-level checks", async () => {
    const client = createMockClient();
    const repository = createPrismaLearnerExperienceRepository(client);

    await repository.findLesson({
      organizationId: "org_1",
      courseSlug: "security",
      lessonSlug: "spot-phishing",
      membershipId: "mem_1",
    });

    const query = client.course.findFirst.mock.calls[0][0];
    const checkArgs = query.select.knowledgeCheckQuestions;

    expect(query.where).toEqual({
      organizationId: "org_1",
      slug: "security",
      status: "PUBLISHED",
      videoLessons: { some: { slug: "spot-phishing" } },
    });
    expect(query.select.videoLessons).toEqual(expect.objectContaining({
      where: { slug: "spot-phishing" },
      take: 1,
      select: expect.objectContaining({
        chapters: expect.any(Object),
        transcriptCues: expect.any(Object),
      }),
    }));
    expect(checkArgs).toEqual(expect.objectContaining({
      where: {
        active: true,
        OR: [
          { lesson: { slug: "spot-phishing" } },
          { lessonId: null },
        ],
      },
      orderBy: [{ lessonId: "asc" }, { sortOrder: "asc" }],
      select: expect.objectContaining({
        lessonId: true,
        answers: expect.any(Object),
      }),
    }));
    expectSafeAnswerSelect(checkArgs.select.answers);
  });

  it("loads learner assessments with active checks and compact course context", async () => {
    const client = createMockClient();
    const repository = createPrismaLearnerExperienceRepository(client);

    await repository.listAssessments({ organizationId: "org_1", membershipId: "mem_1" });

    const query = client.courseAssignment.findMany.mock.calls[0][0];
    const courseSelect = query.select.course.select;
    const checkSelect = courseSelect.knowledgeCheckQuestions.select;

    expect(query).toEqual(expect.objectContaining({
      where: {
        organizationId: "org_1",
        membershipId: "mem_1",
        course: {
          knowledgeCheckQuestions: { some: { active: true } },
        },
      },
      select: expect.objectContaining({
        id: true,
        status: true,
        progress: expect.any(Object),
        knowledgeCheckAttempts: expect.any(Object),
        course: expect.objectContaining({
          select: expect.objectContaining({
            id: true,
            title: true,
            slug: true,
            expectedDurationMinutes: true,
            knowledgeCheckQuestions: expect.objectContaining({
              where: { active: true },
              select: expect.objectContaining({
                id: true,
                lessonId: true,
                prompt: true,
                required: true,
                questionType: true,
                answers: expect.any(Object),
              }),
            }),
          }),
        }),
      }),
    }));
    expect(courseSelect).not.toHaveProperty("modules");
    expect(courseSelect).not.toHaveProperty("videoLessons");
    expectSafeAnswerSelect(checkSelect.answers);
  });

  it("loads learner certificates with latest credential issuance state", async () => {
    const client = createMockClient();
    const repository = createPrismaLearnerExperienceRepository(client);

    await repository.listCertificates({ organizationId: "org_1", membershipId: "mem_1" });

    expect(client.certificate.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        organizationId: "org_1",
        membershipId: "mem_1",
      },
      orderBy: { issuedAt: "desc" },
      select: expect.objectContaining({
        id: true,
        assignmentId: true,
        courseId: true,
        learnerName: true,
        learnerEmail: true,
        courseTitle: true,
        verificationCode: true,
        verificationUrl: true,
        issuedAt: true,
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
      }),
    }));
  });
});
