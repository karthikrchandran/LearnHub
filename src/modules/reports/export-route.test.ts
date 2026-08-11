import { beforeEach, describe, expect, it, vi } from "vitest";

import { requireOrganizationMemberBySlug } from "@/lib/auth/guards";
import { createPrismaProgressReportRepository } from "@/modules/reports/prisma-repository";

import { GET } from "@/app/api/org/[slug]/reports/progress.csv/route";
import { GET as GET_CERTIFICATES } from "@/app/api/org/[slug]/reports/certificates.csv/route";
import { GET as GET_COMPLETIONS } from "@/app/api/org/[slug]/reports/completions.csv/route";
import { GET as GET_QUIZ_DIFFICULTY } from "@/app/api/org/[slug]/reports/quiz-difficulty.csv/route";
import { GET as GET_SATISFACTION } from "@/app/api/org/[slug]/reports/satisfaction.csv/route";
import { GET as GET_SCORING } from "@/app/api/org/[slug]/reports/scoring.csv/route";
import { GET as GET_TIMING } from "@/app/api/org/[slug]/reports/timing.csv/route";

const mocks = vi.hoisted(() => ({
  directReportsFindMany: vi.fn(),
  organizationFindUnique: vi.fn(),
  listCertificateCredentialRows: vi.fn(),
  listCourseCompletionRows: vi.fn(),
  listQuizDifficultyRows: vi.fn(),
  listProgressRows: vi.fn(),
  listSatisfactionRows: vi.fn(),
  listScoringRows: vi.fn(),
  listTimingRows: vi.fn(),
}));

vi.mock("@/lib/auth/guards", () => ({
  requireOrganizationMemberBySlug: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    organizationMembership: {
      findMany: mocks.directReportsFindMany,
    },
    organization: {
      findUnique: mocks.organizationFindUnique,
    },
    courseAssignment: {},
  },
}));

vi.mock("@/modules/reports/prisma-repository", () => ({
  createPrismaProgressReportRepository: vi.fn(() => ({
    listCertificateCredentialRows: mocks.listCertificateCredentialRows,
    listCourseCompletionRows: mocks.listCourseCompletionRows,
    listQuizDifficultyRows: mocks.listQuizDifficultyRows,
    listProgressRows: mocks.listProgressRows,
    listSatisfactionRows: mocks.listSatisfactionRows,
    listScoringRows: mocks.listScoringRows,
    listTimingRows: mocks.listTimingRows,
  })),
}));

const row = {
  assignmentId: "assignment_1",
  learnerName: "Ada Lovelace",
  learnerEmail: "ada@example.com",
  courseTitle: "Course One",
  courseType: "NATIVE_VIDEO" as const,
  assignmentStatus: "IN_PROGRESS" as const,
  progressPercent: 40,
  latestRequiredCheckAverageScore: null,
  bestRequiredCheckAverageScore: null,
  dueDate: new Date("2026-06-20T00:00:00.000Z"),
  lastEventAt: new Date("2026-06-12T12:00:00.000Z"),
  certificateUrl: "https://learnhub.test/certificates/ABC123",
};

const completionRow = {
  courseId: "course_1",
  courseTitle: "Course One",
  assignedCount: 2,
  startedCount: 1,
  completedCount: 1,
  overdueCount: 0,
  completionRate: 50,
};

const scoringRow = {
  organizationId: "org_1",
  courseId: "course_1",
  courseTitle: "Course One",
  attemptCount: 1,
  averageScore: 80,
  bestScore: 80,
  latestScore: 80,
  passRate: 100,
};

const timingRow = {
  courseId: "course_1",
  courseTitle: "Course One",
  learnerCount: 1,
  averageTimeSeconds: 90,
  totalTimeSeconds: 90,
  lastActivityAt: new Date("2026-06-12T12:00:00.000Z"),
};

const satisfactionRow = {
  courseId: "course_1",
  courseTitle: "Course One",
  responseCount: 1,
  averageStars: 4,
  latestFeedbackText: "Useful",
  latestFeedbackAt: new Date("2026-06-12T12:00:00.000Z"),
};

const quizDifficultyRow = {
  courseId: "course_1",
  courseTitle: "Course One",
  questionId: "question_1",
  prompt: "What is required?",
  attempts: 2,
  correctRate: 50,
};

const certificateRow = {
  certificateUrl: "https://learnhub.test/certificates/ABC123",
  issuedAt: new Date("2026-06-12T12:00:00.000Z"),
  learnerName: "Ada Lovelace",
  learnerEmail: "ada@example.com",
  courseTitle: "Course One",
  credentialProvider: "CREDLY",
  credentialStatus: "SUCCEEDED",
  providerCredentialId: "cred_1",
  providerUrl: "https://credly.test/cred_1",
  failureMessage: null,
};

const routeContext = {
  params: Promise.resolve({ slug: "acme" }),
};

function contextFor(role: "ADMIN" | "MANAGER" | "LEARNER", organizationId = "org_1") {
  return {
    userId: `${role.toLowerCase()}-user`,
    isPlatformOwner: false,
    memberships: [
      {
        id: `${role.toLowerCase()}-membership`,
        organizationId,
        roles: [role],
        status: "ACTIVE" as const,
        managerMembershipId: null,
      },
    ],
  };
}

describe("progress report CSV export route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.directReportsFindMany.mockResolvedValue([]);
    mocks.organizationFindUnique.mockResolvedValue({
      allowManagerReports: true,
      allowUserReports: true,
      allowCsvExports: true,
    });
    mocks.listCertificateCredentialRows.mockResolvedValue([certificateRow]);
    mocks.listCourseCompletionRows.mockResolvedValue([completionRow]);
    mocks.listQuizDifficultyRows.mockResolvedValue([quizDifficultyRow]);
    mocks.listProgressRows.mockResolvedValue([row]);
    mocks.listSatisfactionRows.mockResolvedValue([satisfactionRow]);
    mocks.listScoringRows.mockResolvedValue([scoringRow]);
    mocks.listTimingRows.mockResolvedValue([timingRow]);
    vi.mocked(requireOrganizationMemberBySlug).mockResolvedValue({
      context: contextFor("LEARNER"),
      organizationId: "org_1",
    });
  });

  it("exports learner CSV rows for the actor membership", async () => {
    const response = await GET(new Request("http://learnhub.test"), routeContext);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/csv; charset=utf-8");
    expect(response.headers.get("content-disposition")).toBe('attachment; filename="learnhub-progress.csv"');
    expect(await response.text()).toContain("ada@example.com,Course One,NATIVE_VIDEO,IN_PROGRESS,40");
    expect(mocks.listProgressRows).toHaveBeenCalledWith({
      organizationId: "org_1",
      scope: { kind: "learner", membershipIds: ["learner-membership"] },
    });
  });

  it("exports manager CSV rows for direct reports", async () => {
    vi.mocked(requireOrganizationMemberBySlug).mockResolvedValueOnce({
      context: contextFor("MANAGER"),
      organizationId: "org_1",
    });
    mocks.directReportsFindMany.mockResolvedValueOnce([{ id: "direct-report", organizationId: "org_1" }]);

    const response = await GET(new Request("http://learnhub.test"), routeContext);

    expect(response.status).toBe(200);
    expect(mocks.directReportsFindMany).toHaveBeenCalledWith({
      where: {
        organizationId: "org_1",
        status: "ACTIVE",
        managerMembershipId: "manager-membership",
      },
      select: {
        id: true,
        organizationId: true,
      },
    });
    expect(mocks.listProgressRows).toHaveBeenCalledWith({
      organizationId: "org_1",
      scope: { kind: "manager", membershipIds: ["direct-report"] },
    });
  });

  it.each([
    ["completions", GET_COMPLETIONS, mocks.listCourseCompletionRows],
    ["scoring", GET_SCORING, mocks.listScoringRows],
    ["timing", GET_TIMING, mocks.listTimingRows],
    ["satisfaction", GET_SATISFACTION, mocks.listSatisfactionRows],
    ["quiz difficulty", GET_QUIZ_DIFFICULTY, mocks.listQuizDifficultyRows],
    ["certificates", GET_CERTIFICATES, mocks.listCertificateCredentialRows],
  ])("exports manager-scoped %s CSV rows for direct reports", async (_label, route, repositoryMethod) => {
    vi.mocked(requireOrganizationMemberBySlug).mockResolvedValueOnce({
      context: contextFor("MANAGER"),
      organizationId: "org_1",
    });
    mocks.directReportsFindMany.mockResolvedValueOnce([{ id: "direct-report", organizationId: "org_1" }]);

    const response = await route(new Request("http://learnhub.test"), routeContext);

    expect(response.status).toBe(200);
    expect(mocks.directReportsFindMany).toHaveBeenCalledWith({
      where: {
        organizationId: "org_1",
        status: "ACTIVE",
        managerMembershipId: "manager-membership",
      },
      select: {
        id: true,
        organizationId: true,
      },
    });
    expect(repositoryMethod).toHaveBeenCalledWith({
      organizationId: "org_1",
      scope: { kind: "manager", membershipIds: ["direct-report"] },
    });
  });

  it("exports admin CSV rows for the organization", async () => {
    vi.mocked(requireOrganizationMemberBySlug).mockResolvedValueOnce({
      context: contextFor("ADMIN"),
      organizationId: "org_1",
    });

    const response = await GET(new Request("http://learnhub.test"), routeContext);

    expect(response.status).toBe(200);
    expect(createPrismaProgressReportRepository).toHaveBeenCalledTimes(1);
    expect(mocks.listProgressRows).toHaveBeenCalledWith({
      organizationId: "org_1",
      scope: { kind: "admin" },
    });
  });

  it("returns unauthorized when the organization guard redirects to login", async () => {
    vi.mocked(requireOrganizationMemberBySlug).mockRejectedValueOnce(
      Object.assign(new Error("NEXT_REDIRECT"), {
        digest: "NEXT_REDIRECT;replace;/login;307;",
      }),
    );

    const response = await GET(new Request("http://learnhub.test"), routeContext);

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Authentication required" });
  });

  it("returns only headers when the actor has no same-organization report scope", async () => {
    vi.mocked(requireOrganizationMemberBySlug).mockResolvedValueOnce({
      context: contextFor("LEARNER", "org_2"),
      organizationId: "org_1",
    });
    mocks.listProgressRows.mockResolvedValueOnce([]);

    const response = await GET(new Request("http://learnhub.test"), routeContext);

    expect(response.status).toBe(200);
    expect(await response.text()).toBe(
      "Learner Name,Learner Email,Course Title,Course Type,Assignment Status,Progress Percent,Latest Required Check Average Score,Best Required Check Average Score,Due Date,Completed,Certificate URL,Last Event Date",
    );
    expect(mocks.listProgressRows).toHaveBeenCalledWith({
      organizationId: "org_1",
      scope: { kind: "learner", membershipIds: [] },
    });
  });
});
