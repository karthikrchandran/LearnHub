import { beforeEach, describe, expect, it, vi } from "vitest";

import { requireOrganizationMemberBySlug } from "@/lib/auth/guards";
import { createPrismaProgressReportRepository } from "@/modules/reports/prisma-repository";

import { GET } from "@/app/api/org/[slug]/reports/progress.csv/route";

const mocks = vi.hoisted(() => ({
  directReportsFindMany: vi.fn(),
  listProgressRows: vi.fn(),
}));

vi.mock("@/lib/auth/guards", () => ({
  requireOrganizationMemberBySlug: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    organizationMembership: {
      findMany: mocks.directReportsFindMany,
    },
    courseAssignment: {},
  },
}));

vi.mock("@/modules/reports/prisma-repository", () => ({
  createPrismaProgressReportRepository: vi.fn(() => ({
    listProgressRows: mocks.listProgressRows,
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
  dueDate: new Date("2026-06-20T00:00:00.000Z"),
  lastEventAt: new Date("2026-06-12T12:00:00.000Z"),
  certificateUrl: "https://learnhub.test/certificates/ABC123",
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
    mocks.listProgressRows.mockResolvedValue([row]);
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
      "Learner Name,Learner Email,Course Title,Course Type,Assignment Status,Progress Percent,Due Date,Completed,Certificate URL,Last Event Date",
    );
    expect(mocks.listProgressRows).toHaveBeenCalledWith({
      organizationId: "org_1",
      scope: { kind: "learner", membershipIds: [] },
    });
  });
});
