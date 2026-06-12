import { beforeEach, describe, expect, it, vi } from "vitest";

import { requireOrganizationMemberBySlug } from "@/lib/auth/guards";
import { issueCertificateForCompletedAssignment } from "@/modules/certificates/certificates";
import { createPrismaCertificateRepository } from "@/modules/certificates/prisma-repository";
import { scheduleCertificateNotification } from "@/modules/notifications/notification-jobs";
import { createPrismaNotificationRepository } from "@/modules/notifications/prisma-repository";
import { createPrismaRuntimeRouteRepository } from "@/modules/runtime/prisma-repository";
import {
  RuntimeRouteError,
  requireLearnerLaunchAssignment,
} from "@/modules/runtime/runtime-route-service";
import { createPrismaScormRepository } from "@/modules/scorm/prisma-repository";
import {
  commitScormRuntime,
  launchScormRegistration,
} from "@/modules/scorm/scorm-runtime";

import { POST as commitScorm } from "@/app/api/org/[slug]/assignments/[assignmentId]/scorm/commit/route";
import { GET as launchScorm } from "@/app/api/org/[slug]/assignments/[assignmentId]/scorm/launch/route";

vi.mock("@/lib/auth/guards", () => ({
  requireOrganizationMemberBySlug: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: { courseAssignment: {} },
}));

vi.mock("@/lib/env", () => ({
  env: {
    APP_BASE_URL: "https://learnhub.test",
  },
}));

vi.mock("@/modules/certificates/certificates", () => ({
  issueCertificateForCompletedAssignment: vi.fn(async (_input, _repository, notifications) => {
    await notifications.scheduleCertificateNotification({
      organizationId: "org_1",
      assignmentId: "assignment_1",
      certificateId: "certificate_1",
      learnerEmail: "learner@example.com",
      learnerName: "Learner One",
      courseTitle: "Course One",
      certificateUrl: "https://learnhub.test/certificates/ABC123",
      now: new Date("2026-06-12T12:00:00.000Z"),
    });

    return {
      id: "certificate_1",
      verificationCode: "ABC123",
      verificationUrl: "https://learnhub.test/certificates/ABC123",
      issuedAt: new Date("2026-06-12T12:00:00.000Z"),
    };
  }),
}));

vi.mock("@/modules/certificates/prisma-repository", () => ({
  createPrismaCertificateRepository: vi.fn(() => ({ kind: "certificate-repository" })),
}));

vi.mock("@/modules/notifications/notification-jobs", () => ({
  scheduleCertificateNotification: vi.fn(),
}));

vi.mock("@/modules/notifications/prisma-repository", () => ({
  createPrismaNotificationRepository: vi.fn(() => ({ kind: "notification-repository" })),
}));

vi.mock("@/modules/runtime/prisma-repository", () => ({
  createPrismaRuntimeRouteRepository: vi.fn(() => ({ kind: "runtime-route-repository" })),
}));

vi.mock("@/modules/runtime/runtime-route-service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/modules/runtime/runtime-route-service")>();

  return {
    ...actual,
    requireLearnerLaunchAssignment: vi.fn(),
  };
});

vi.mock("@/modules/scorm/prisma-repository", () => ({
  createPrismaScormRepository: vi.fn(() => ({ kind: "scorm-repository" })),
}));

vi.mock("@/modules/scorm/scorm-runtime", () => ({
  commitScormRuntime: vi.fn(),
  launchScormRegistration: vi.fn(),
}));

const actor = {
  userId: "learner-user",
  isPlatformOwner: false,
  memberships: [
    {
      id: "learner-membership",
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
  membershipId: "learner-membership",
  learner: {
    id: "learner-membership",
    userId: "learner-user",
    organizationId: "org_1",
    managerMembershipId: null,
  },
  course: {
    id: "course_1",
    slug: "course-one",
    type: "SCORM_1_2" as const,
  },
};

const routeContext = {
  params: Promise.resolve({
    slug: "acme",
    assignmentId: "assignment_1",
  }),
};

async function json(response: Response) {
  return response.json() as Promise<unknown>;
}

describe("SCORM runtime route handlers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireOrganizationMemberBySlug).mockResolvedValue({
      context: actor,
      organizationId: "org_1",
    });
    vi.mocked(requireLearnerLaunchAssignment).mockResolvedValue(assignment);
    vi.mocked(launchScormRegistration).mockResolvedValue({
      assignmentId: "assignment_1",
      packageId: "package_1",
      launchUrl: "/scorm/org/org_1/courses/course_1/scorm/package_1/content/index.html",
      cmiData: {
        "cmi.core.lesson_status": "incomplete",
      },
      launchCount: 2,
    });
    vi.mocked(commitScormRuntime).mockResolvedValue({
      progressPercent: 50,
      completed: false,
      registration: {
        id: "registration_1",
        packageId: "package_1",
        cmiData: {
          "cmi.core.lesson_status": "incomplete",
          "cmi.core.session_time": "00:05:00",
        },
        lessonStatus: "incomplete",
        scoreRaw: null,
        sessionTimeSeconds: 300,
        totalTimeSeconds: 300,
        launchCount: 2,
        lastLaunchedAt: new Date("2026-06-12T12:00:00.000Z"),
        lastCommittedAt: new Date("2026-06-12T12:05:00.000Z"),
      },
    });
  });

  it("launches SCORM assignments for the owning learner", async () => {
    const response = await launchScorm(new Request("http://learnhub.test"), routeContext);

    expect(response.status).toBe(200);
    expect(await json(response)).toMatchObject({
      assignmentId: "assignment_1",
      packageId: "package_1",
      launchUrl: "/scorm/org/org_1/courses/course_1/scorm/package_1/content/index.html",
      cmiData: { "cmi.core.lesson_status": "incomplete" },
      launchCount: 2,
    });
    expect(requireLearnerLaunchAssignment).toHaveBeenCalledWith({
      organizationId: "org_1",
      assignmentId: "assignment_1",
      expectedCourseType: "SCORM_1_2",
      actor,
      repository: { kind: "runtime-route-repository" },
    });
    expect(createPrismaRuntimeRouteRepository).toHaveBeenCalledTimes(1);
    expect(createPrismaScormRepository).toHaveBeenCalledTimes(1);
  });

  it("commits CMI string values and leaves total time handling to the SCORM service", async () => {
    const cmiData = {
      "cmi.core.lesson_status": "incomplete",
      "cmi.core.session_time": "00:05:00",
      "cmi.core.total_time": "99:00:00",
    };
    const response = await commitScorm(
      new Request("http://learnhub.test", {
        method: "POST",
        body: JSON.stringify(cmiData),
      }),
      routeContext,
    );

    expect(response.status).toBe(200);
    expect(await json(response)).toMatchObject({
      progressPercent: 50,
      completed: false,
      registration: {
        cmiData: {
          "cmi.core.session_time": "00:05:00",
        },
      },
    });
    expect(commitScormRuntime).toHaveBeenCalledWith(
      {
        organizationId: "org_1",
        assignmentId: "assignment_1",
        cmiData,
        occurredAt: expect.any(Date),
      },
      { kind: "scorm-repository" },
    );
  });

  it("issues a certificate and enqueues certificate notification when SCORM completion is recorded", async () => {
    vi.mocked(commitScormRuntime).mockResolvedValueOnce({
      progressPercent: 100,
      completed: true,
      registration: {
        id: "registration_1",
        packageId: "package_1",
        cmiData: {
          "cmi.core.lesson_status": "completed",
        },
        lessonStatus: "completed",
        scoreRaw: null,
        sessionTimeSeconds: 300,
        totalTimeSeconds: 300,
        launchCount: 2,
        lastLaunchedAt: new Date("2026-06-12T12:00:00.000Z"),
        lastCommittedAt: new Date("2026-06-12T12:05:00.000Z"),
      },
    });

    const response = await commitScorm(
      new Request("http://learnhub.test", {
        method: "POST",
        body: JSON.stringify({ "cmi.core.lesson_status": "completed" }),
      }),
      routeContext,
    );

    expect(response.status).toBe(200);
    expect(issueCertificateForCompletedAssignment).toHaveBeenCalledWith(
      {
        organizationId: "org_1",
        assignmentId: "assignment_1",
        appBaseUrl: "https://learnhub.test",
        now: expect.any(Date),
      },
      { kind: "certificate-repository" },
      { scheduleCertificateNotification: expect.any(Function) },
    );
    expect(createPrismaCertificateRepository).toHaveBeenCalledTimes(1);
    expect(createPrismaNotificationRepository).toHaveBeenCalledTimes(1);
    expect(scheduleCertificateNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        certificateId: "certificate_1",
        assignmentId: "assignment_1",
      }),
      { kind: "notification-repository" },
    );
  });

  it("rejects malformed commit JSON", async () => {
    const response = await commitScorm(
      new Request("http://learnhub.test", {
        method: "POST",
        body: "{",
      }),
      routeContext,
    );

    expect(response.status).toBe(400);
    expect(await json(response)).toEqual({ error: "Request body must be a JSON object of CMI string values" });
    expect(commitScormRuntime).not.toHaveBeenCalled();
  });

  it("returns forbidden for unauthorized launch and commit requests", async () => {
    vi.mocked(requireLearnerLaunchAssignment).mockRejectedValue(
      new RuntimeRouteError("Not allowed to launch this assignment", 403),
    );

    const launchResponse = await launchScorm(new Request("http://learnhub.test"), routeContext);
    const commitResponse = await commitScorm(
      new Request("http://learnhub.test", {
        method: "POST",
        body: JSON.stringify({ "cmi.core.lesson_status": "completed" }),
      }),
      routeContext,
    );

    expect(launchResponse.status).toBe(403);
    expect(commitResponse.status).toBe(403);
    expect(await json(launchResponse)).toEqual({ error: "Not allowed to launch this assignment" });
    expect(await json(commitResponse)).toEqual({ error: "Not allowed to launch this assignment" });
  });
});
