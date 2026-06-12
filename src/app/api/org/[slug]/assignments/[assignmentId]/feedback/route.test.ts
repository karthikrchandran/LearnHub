import { beforeEach, describe, expect, it, vi } from "vitest";

import { requireOrganizationMemberBySlug } from "@/lib/auth/guards";
import { createPrismaCourseFeedbackRepository } from "@/modules/feedback/prisma-repository";

import { POST, parseCourseFeedbackBody, submitCourseFeedbackForLearner } from "./route";

const mocks = vi.hoisted(() => ({
  repository: {
    findAssignmentForFeedback: vi.fn(),
    upsertCourseFeedback: vi.fn(),
  },
}));

vi.mock("@/lib/auth/guards", () => ({
  requireOrganizationMemberBySlug: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {},
}));

vi.mock("@/modules/feedback/prisma-repository", () => ({
  createPrismaCourseFeedbackRepository: vi.fn(() => mocks.repository),
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
  courseId: "course_1",
  courseType: "NATIVE_VIDEO" as const,
  membershipId: "membership_1",
  learner: {
    id: "membership_1",
    userId: "user_1",
    organizationId: "org_1",
    managerMembershipId: null,
  },
};

const routeContext = {
  params: Promise.resolve({ slug: "acme", assignmentId: "assignment_1" }),
};

async function json(response: Response) {
  return response.json() as Promise<unknown>;
}

describe("submitCourseFeedbackForLearner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.repository.findAssignmentForFeedback.mockResolvedValue(assignment);
    mocks.repository.upsertCourseFeedback.mockResolvedValue({ id: "feedback_1" });
    vi.mocked(requireOrganizationMemberBySlug).mockResolvedValue({
      context: actor,
      organizationId: "org_1",
    });
  });

  it("validates, scopes, and persists learner feedback", async () => {
    await expect(
      submitCourseFeedbackForLearner({
        context: actor,
        organizationId: "org_1",
        assignmentId: "assignment_1",
        stars: 5,
        text: "  Useful course.  ",
        submittedAt: new Date("2026-06-13T04:00:00.000Z"),
        repository: mocks.repository as never,
      }),
    ).resolves.toEqual({ ok: true, id: "feedback_1" });

    expect(mocks.repository.upsertCourseFeedback).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org_1",
        assignmentId: "assignment_1",
        courseId: "course_1",
        membershipId: "membership_1",
        stars: 5,
        text: "Useful course.",
      }),
    );
  });

  it("trims blank feedback text to null before persisting", async () => {
    await submitCourseFeedbackForLearner({
      context: actor,
      organizationId: "org_1",
      assignmentId: "assignment_1",
      stars: 4,
      text: "   ",
      submittedAt: new Date("2026-06-13T04:00:00.000Z"),
      repository: mocks.repository as never,
    });

    expect(mocks.repository.upsertCourseFeedback).toHaveBeenCalledWith(
      expect.objectContaining({ text: null }),
    );
  });

  it("rejects feedback for non-native-video assignments", async () => {
    mocks.repository.findAssignmentForFeedback.mockResolvedValueOnce({
      ...assignment,
      courseType: "SCORM_1_2",
    });

    await expect(
      submitCourseFeedbackForLearner({
        context: actor,
        organizationId: "org_1",
        assignmentId: "assignment_1",
        stars: 4,
        text: null,
        submittedAt: new Date("2026-06-13T04:00:00.000Z"),
        repository: mocks.repository as never,
      }),
    ).rejects.toThrow("Course feedback is only supported for native video assignments");
  });

  it("does not allow learners from another organization to persist feedback", async () => {
    await expect(
      submitCourseFeedbackForLearner({
        context: {
          ...actor,
          memberships: [{ ...actor.memberships[0], organizationId: "org_2" }],
        },
        organizationId: "org_1",
        assignmentId: "assignment_1",
        stars: 4,
        text: null,
        submittedAt: new Date("2026-06-13T04:00:00.000Z"),
        repository: mocks.repository as never,
      }),
    ).rejects.toThrow("Assignment was not found");
    expect(mocks.repository.upsertCourseFeedback).not.toHaveBeenCalled();
  });

  it("rejects invalid stars", async () => {
    await expect(
      submitCourseFeedbackForLearner({
        context: actor,
        organizationId: "org_1",
        assignmentId: "assignment_1",
        stars: 6,
        text: null,
        submittedAt: new Date("2026-06-13T04:00:00.000Z"),
        repository: mocks.repository as never,
      }),
    ).rejects.toThrow("Course rating must be between 1 and 5 stars");
  });

  it("rejects feedback bodies without numeric stars", () => {
    expect(() => parseCourseFeedbackBody({ stars: "5", text: null })).toThrow(
      "stars must be a number",
    );
  });
});

describe("POST", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.repository.findAssignmentForFeedback.mockResolvedValue(assignment);
    mocks.repository.upsertCourseFeedback.mockResolvedValue({ id: "feedback_1" });
    vi.mocked(requireOrganizationMemberBySlug).mockResolvedValue({
      context: actor,
      organizationId: "org_1",
    });
  });

  it("returns 400 when the feedback JSON body is malformed", async () => {
    const response = await POST(
      { json: async () => { throw new SyntaxError("Unexpected token"); } } as never,
      routeContext,
    );

    expect(response.status).toBe(400);
    expect(await json(response)).toEqual({ message: "Course feedback request body must be valid JSON" });
  });

  it("returns 400 when stars is missing", async () => {
    const response = await POST(
      new Request("http://learnhub.test", {
        method: "POST",
        body: JSON.stringify({ text: "Helpful." }),
      }),
      routeContext,
    );

    expect(response.status).toBe(400);
    expect(await json(response)).toEqual({ message: "stars must be a number" });
    expect(createPrismaCourseFeedbackRepository).not.toHaveBeenCalled();
  });
});
