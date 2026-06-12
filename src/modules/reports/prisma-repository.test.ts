import { describe, expect, it, vi } from "vitest";

import { createPrismaProgressReportRepository } from "./prisma-repository";

function createProgressReportClient() {
  return {
    courseAssignment: {
      findMany: vi.fn(async () => [
        {
          id: "assignment_1",
          status: "IN_PROGRESS",
          dueDate: new Date("2026-06-20T00:00:00.000Z"),
          course: {
            title: "Course One",
            type: "NATIVE_VIDEO",
            knowledgeCheckQuestions: [{ id: "check_1" }],
          },
          knowledgeCheckAttempts: [
            { questionId: "check_1", scorePercent: 100, submittedAt: new Date("2026-06-12T12:04:00.000Z") },
          ],
          membership: {
            user: {
              firstName: "Ada",
              lastName: "Lovelace",
              email: "ada@example.com",
            },
          },
          progress: {
            progressPercent: 40,
            lastEventAt: new Date("2026-06-12T12:00:00.000Z"),
          },
          learningEvents: [
            {
              occurredAt: new Date("2026-06-12T12:05:00.000Z"),
            },
          ],
          certificate: {
            verificationUrl: "https://learnhub.test/certificates/ABC123",
          },
        },
      ]),
    },
  };
}

describe("createPrismaProgressReportRepository", () => {
  it("filters learner and manager reports by organization and membership ids", async () => {
    const client = createProgressReportClient();
    const repository = createPrismaProgressReportRepository(
      client as unknown as Parameters<typeof createPrismaProgressReportRepository>[0],
    );

    await repository.listProgressRows({
      organizationId: "org_1",
      scope: { kind: "learner", membershipIds: ["learner-membership"] },
    });

    expect(client.courseAssignment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organizationId: "org_1",
          membershipId: { in: ["learner-membership"] },
        },
      }),
    );

    await repository.listProgressRows({
      organizationId: "org_1",
      scope: { kind: "manager", membershipIds: ["direct-report"] },
    });

    expect(client.courseAssignment.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: {
          organizationId: "org_1",
          membershipId: { in: ["direct-report"] },
        },
      }),
    );
  });

  it("omits membership filters for admin reports", async () => {
    const client = createProgressReportClient();
    const repository = createPrismaProgressReportRepository(
      client as unknown as Parameters<typeof createPrismaProgressReportRepository>[0],
    );

    await repository.listProgressRows({
      organizationId: "org_1",
      scope: { kind: "admin" },
    });

    expect(client.courseAssignment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organizationId: "org_1",
        },
      }),
    );
  });

  it("selects reporting fields and maps rows", async () => {
    const client = createProgressReportClient();
    const repository = createPrismaProgressReportRepository(
      client as unknown as Parameters<typeof createPrismaProgressReportRepository>[0],
    );

    const rows = await repository.listProgressRows({
      organizationId: "org_1",
      scope: { kind: "admin" },
    });

    expect(client.courseAssignment.findMany).toHaveBeenCalledWith({
      where: { organizationId: "org_1" },
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
    expect(rows).toEqual([
      {
        assignmentId: "assignment_1",
        learnerName: "Ada Lovelace",
        learnerEmail: "ada@example.com",
        courseTitle: "Course One",
        courseType: "NATIVE_VIDEO",
        assignmentStatus: "IN_PROGRESS",
        progressPercent: 40,
        dueDate: new Date("2026-06-20T00:00:00.000Z"),
        lastEventAt: new Date("2026-06-12T12:05:00.000Z"),
        certificateUrl: "https://learnhub.test/certificates/ABC123",
        latestRequiredCheckAverageScore: 100,
        bestRequiredCheckAverageScore: 100,
      },
    ]);
  });

  it("maps missing progress, events, and certificates to empty report values", async () => {
    const client = createProgressReportClient();
    client.courseAssignment.findMany.mockResolvedValueOnce([
      {
        id: "assignment_2",
        status: "ASSIGNED",
        dueDate: new Date("2026-06-25T00:00:00.000Z"),
        course: { title: "Course Two", type: "SCORM_1_2", knowledgeCheckQuestions: [] },
        knowledgeCheckAttempts: [],
        membership: {
          user: {
            firstName: "Grace",
            lastName: "Hopper",
            email: "grace@example.com",
          },
        },
        progress: null as never,
        learningEvents: [],
        certificate: null as never,
      },
    ]);
    const repository = createPrismaProgressReportRepository(
      client as unknown as Parameters<typeof createPrismaProgressReportRepository>[0],
    );

    await expect(
      repository.listProgressRows({
        organizationId: "org_1",
        scope: { kind: "admin" },
      }),
    ).resolves.toMatchObject([
      {
        assignmentId: "assignment_2",
        progressPercent: 0,
        lastEventAt: null,
        certificateUrl: null,
        latestRequiredCheckAverageScore: null,
        bestRequiredCheckAverageScore: null,
      },
    ]);
  });
});
