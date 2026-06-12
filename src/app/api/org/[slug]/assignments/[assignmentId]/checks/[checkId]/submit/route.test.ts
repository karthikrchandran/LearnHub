import { beforeEach, describe, expect, it, vi } from "vitest";

import { requireOrganizationMemberBySlug } from "@/lib/auth/guards";
import { createPrismaKnowledgeCheckRepository } from "@/modules/assessments/prisma-repository";

import { POST, parseSelectedAnswerIds, submitKnowledgeCheckForLearner } from "./route";

const mocks = vi.hoisted(() => ({
  repository: {
    findAssignmentForSubmission: vi.fn(),
    findCheckForSubmission: vi.fn(),
    createAttempt: vi.fn(),
  },
}));

vi.mock("@/lib/auth/guards", () => ({
  requireOrganizationMemberBySlug: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {},
}));

vi.mock("@/modules/assessments/prisma-repository", () => ({
  createPrismaKnowledgeCheckRepository: vi.fn(() => mocks.repository),
}));

const actor = {
  userId: "user_1",
  isPlatformOwner: false,
  memberships: [
    {
      id: "membership_1",
      organizationId: "org_1",
      roles: ["LEARNER" as const],
      status: "ACTIVE" as const,
      managerMembershipId: null,
    },
  ],
};

const assignment = {
  id: "assignment_1",
  organizationId: "org_1",
  membershipId: "membership_1",
  courseId: "course_1",
  learner: {
    id: "membership_1",
    userId: "user_1",
    organizationId: "org_1",
    managerMembershipId: null,
  },
};

const check = {
  id: "check_1",
  questionType: "SINGLE_CHOICE" as const,
  explanation: "Open questions reveal blockers.",
  answers: [
    { id: "answer_1", correct: true, feedback: "Correct." },
    { id: "answer_2", correct: false, feedback: "Review the lesson." },
  ],
};

const routeContext = {
  params: Promise.resolve({ slug: "acme", assignmentId: "assignment_1", checkId: "check_1" }),
};

async function json(response: Response) {
  return response.json() as Promise<unknown>;
}

describe("submitKnowledgeCheckForLearner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.repository.findAssignmentForSubmission.mockResolvedValue(assignment);
    mocks.repository.findCheckForSubmission.mockResolvedValue(check);
    mocks.repository.createAttempt.mockResolvedValue({ attemptNumber: 1 });
    vi.mocked(requireOrganizationMemberBySlug).mockResolvedValue({
      context: actor,
      organizationId: "org_1",
    });
  });

  it("scores and stores a learner attempt", async () => {
    await expect(
      submitKnowledgeCheckForLearner({
        context: actor,
        organizationId: "org_1",
        assignmentId: "assignment_1",
        checkId: "check_1",
        selectedAnswerIds: ["answer_1"],
        submittedAt: new Date("2026-06-13T03:00:00.000Z"),
        repository: mocks.repository as never,
      }),
    ).resolves.toEqual({
      correct: true,
      scorePercent: 100,
      attemptNumber: 1,
      selectedAnswerFeedback: ["Correct."],
      explanation: "Open questions reveal blockers.",
    });
    expect(mocks.repository.findCheckForSubmission).toHaveBeenCalledWith({
      organizationId: "org_1",
      courseId: "course_1",
      checkId: "check_1",
    });
    expect(mocks.repository.createAttempt).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org_1",
        assignmentId: "assignment_1",
        questionId: "check_1",
        selectedAnswerIds: ["answer_1"],
        score: expect.objectContaining({ correct: true, scorePercent: 100 }),
      }),
    );
  });

  it("does not allow a learner from another organization to submit", async () => {
    await expect(
      submitKnowledgeCheckForLearner({
        context: {
          ...actor,
          memberships: [{ ...actor.memberships[0], organizationId: "org_2" }],
        },
        organizationId: "org_1",
        assignmentId: "assignment_1",
        checkId: "check_1",
        selectedAnswerIds: ["answer_1"],
        submittedAt: new Date("2026-06-13T03:00:00.000Z"),
        repository: mocks.repository as never,
      }),
    ).rejects.toThrow("Assignment was not found");
    expect(mocks.repository.createAttempt).not.toHaveBeenCalled();
  });

  it("returns not found when the check is inactive or belongs to another course", async () => {
    mocks.repository.findCheckForSubmission.mockResolvedValueOnce(null);

    await expect(
      submitKnowledgeCheckForLearner({
        context: actor,
        organizationId: "org_1",
        assignmentId: "assignment_1",
        checkId: "check_1",
        selectedAnswerIds: ["answer_1"],
        submittedAt: new Date("2026-06-13T03:00:00.000Z"),
        repository: mocks.repository as never,
      }),
    ).rejects.toThrow("Knowledge check was not found");
    expect(mocks.repository.createAttempt).not.toHaveBeenCalled();
  });

  it("allows repeated attempts and returns repository attempt numbers", async () => {
    mocks.repository.createAttempt
      .mockResolvedValueOnce({ attemptNumber: 1 })
      .mockResolvedValueOnce({ attemptNumber: 2 });
    const input = {
      context: actor,
      organizationId: "org_1",
      assignmentId: "assignment_1",
      checkId: "check_1",
      selectedAnswerIds: ["answer_1"],
      submittedAt: new Date("2026-06-13T03:00:00.000Z"),
      repository: mocks.repository as never,
    };

    await expect(submitKnowledgeCheckForLearner(input)).resolves.toMatchObject({ attemptNumber: 1 });
    await expect(submitKnowledgeCheckForLearner(input)).resolves.toMatchObject({ attemptNumber: 2 });
  });

  it("rejects non-array selectedAnswerIds with a controlled validation error", () => {
    expect(() => parseSelectedAnswerIds({ selectedAnswerIds: "answer_1" })).toThrow(
      "selectedAnswerIds must be an array",
    );
  });
});

describe("POST", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.repository.findAssignmentForSubmission.mockResolvedValue(assignment);
    mocks.repository.findCheckForSubmission.mockResolvedValue(check);
    mocks.repository.createAttempt.mockResolvedValue({ attemptNumber: 1 });
    vi.mocked(requireOrganizationMemberBySlug).mockResolvedValue({
      context: actor,
      organizationId: "org_1",
    });
  });

  it("returns 401 when the organization guard redirects to login", async () => {
    vi.mocked(requireOrganizationMemberBySlug).mockRejectedValueOnce(
      Object.assign(new Error("NEXT_REDIRECT"), {
        digest: "NEXT_REDIRECT;replace;/login;307;",
      }),
    );

    const response = await POST(
      new Request("http://learnhub.test", {
        method: "POST",
        body: JSON.stringify({ selectedAnswerIds: ["answer_1"] }),
      }),
      routeContext,
    );

    expect(response.status).toBe(401);
    expect(await json(response)).toEqual({ message: "Authentication required" });
  });

  it("returns 400 when the JSON body is malformed", async () => {
    const response = await POST(
      { json: async () => { throw new SyntaxError("Unexpected token"); } } as never,
      routeContext,
    );

    expect(response.status).toBe(400);
    expect(await json(response)).toEqual({ message: "Knowledge check request body must be valid JSON" });
  });

  it("returns 400 when selectedAnswerIds is not an array", async () => {
    const response = await POST(
      new Request("http://learnhub.test", {
        method: "POST",
        body: JSON.stringify({ selectedAnswerIds: "answer_1" }),
      }),
      routeContext,
    );

    expect(response.status).toBe(400);
    expect(await json(response)).toEqual({ message: "selectedAnswerIds must be an array" });
    expect(createPrismaKnowledgeCheckRepository).not.toHaveBeenCalled();
    expect(mocks.repository.createAttempt).not.toHaveBeenCalled();
  });
});
