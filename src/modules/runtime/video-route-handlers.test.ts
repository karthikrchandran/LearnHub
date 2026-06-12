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
import { createPrismaVideoRepository } from "@/modules/video/prisma-repository";
import {
  launchVideoRuntime,
  recordVideoProgress,
} from "@/modules/video/video-runtime";

import { GET as launchVideo } from "@/app/api/org/[slug]/assignments/[assignmentId]/video/launch/route";
import { POST as commitVideoProgress } from "@/app/api/org/[slug]/assignments/[assignmentId]/video/progress/route";

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

vi.mock("@/modules/video/prisma-repository", () => ({
  createPrismaVideoRepository: vi.fn(() => ({ kind: "video-repository" })),
}));

vi.mock("@/modules/video/video-runtime", () => ({
  launchVideoRuntime: vi.fn(),
  recordVideoProgress: vi.fn(),
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
    type: "NATIVE_VIDEO" as const,
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

describe("native video runtime route handlers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireOrganizationMemberBySlug).mockResolvedValue({
      context: actor,
      organizationId: "org_1",
    });
    vi.mocked(requireLearnerLaunchAssignment).mockResolvedValue(assignment);
    vi.mocked(launchVideoRuntime).mockResolvedValue({
      assignmentId: "assignment_1",
      courseId: "course_1",
      courseTitle: "Course One",
      modules: [],
      lessons: [
        {
          id: "lesson_1",
          moduleId: null,
          title: "Lesson One",
          slug: "lesson-one",
          sortOrder: 0,
          durationSeconds: 120,
          required: true,
          playbackUrl: "https://cdn.example/video.mp4",
          providerAssetId: null,
          chapters: [],
          transcriptCues: [],
          progress: {
            lessonId: "lesson_1",
            lastPositionSecond: 12,
            maxWatchedSecond: 24,
            completed: false,
            lastWatchedAt: null,
          },
        },
      ],
      currentLesson: {
        id: "lesson_1",
        moduleId: null,
        title: "Lesson One",
        slug: "lesson-one",
        sortOrder: 0,
        durationSeconds: 120,
        required: true,
        playbackUrl: "https://cdn.example/video.mp4",
        providerAssetId: null,
        chapters: [],
        transcriptCues: [],
        progress: {
          lessonId: "lesson_1",
          lastPositionSecond: 12,
          maxWatchedSecond: 24,
          completed: false,
          lastWatchedAt: null,
        },
      },
      courseProgressPercent: 25,
    });
    vi.mocked(recordVideoProgress).mockResolvedValue({
      lessonProgress: {
        lessonId: "lesson_1",
        lastPositionSecond: 20,
        maxWatchedSecond: 30,
        completed: false,
        lastWatchedAt: new Date("2026-06-12T12:00:00.000Z"),
      },
      courseProgressPercent: 25,
      completed: false,
    });
  });

  it("launches native video assignments for the owning learner", async () => {
    const response = await launchVideo(new Request("http://learnhub.test"), routeContext);

    expect(response.status).toBe(200);
    expect(await json(response)).toMatchObject({
      assignmentId: "assignment_1",
      courseTitle: "Course One",
      currentLesson: { id: "lesson_1" },
      courseProgressPercent: 25,
    });
    expect(requireOrganizationMemberBySlug).toHaveBeenCalledWith("acme");
    expect(createPrismaRuntimeRouteRepository).toHaveBeenCalledTimes(1);
    expect(requireLearnerLaunchAssignment).toHaveBeenCalledWith({
      organizationId: "org_1",
      assignmentId: "assignment_1",
      expectedCourseType: "NATIVE_VIDEO",
      actor,
      repository: { kind: "runtime-route-repository" },
    });
    expect(createPrismaVideoRepository).toHaveBeenCalledTimes(1);
    expect(launchVideoRuntime).toHaveBeenCalledWith(
      {
        organizationId: "org_1",
        assignmentId: "assignment_1",
      },
      { kind: "video-repository" },
    );
  });

  it("rejects video progress without a lesson id", async () => {
    const response = await commitVideoProgress(
      new Request("http://learnhub.test", {
        method: "POST",
        body: JSON.stringify({ positionSecond: 1, watchedSecond: 1 }),
      }),
      routeContext,
    );

    expect(response.status).toBe(400);
    expect(await json(response)).toEqual({ error: "lessonId is required" });
    expect(recordVideoProgress).not.toHaveBeenCalled();
  });

  it("maps video progress validation errors to bad requests", async () => {
    vi.mocked(recordVideoProgress).mockRejectedValueOnce(new Error("Position must be non-negative"));

    const response = await commitVideoProgress(
      new Request("http://learnhub.test", {
        method: "POST",
        body: JSON.stringify({ lessonId: "lesson_1", positionSecond: -1, watchedSecond: 1 }),
      }),
      routeContext,
    );

    expect(response.status).toBe(400);
    expect(await json(response)).toEqual({ error: "Position must be non-negative" });
  });

  it("issues a certificate and enqueues certificate notification when video completion is recorded", async () => {
    vi.mocked(recordVideoProgress).mockResolvedValueOnce({
      lessonProgress: {
        lessonId: "lesson_1",
        lastPositionSecond: 120,
        maxWatchedSecond: 120,
        completed: true,
        lastWatchedAt: new Date("2026-06-12T12:00:00.000Z"),
      },
      courseProgressPercent: 100,
      completed: true,
    });

    const response = await commitVideoProgress(
      new Request("http://learnhub.test", {
        method: "POST",
        body: JSON.stringify({ lessonId: "lesson_1", positionSecond: 120, watchedSecond: 120 }),
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

  it("returns forbidden for unauthorized launches", async () => {
    vi.mocked(requireLearnerLaunchAssignment).mockRejectedValueOnce(
      new RuntimeRouteError("Not allowed to launch this assignment", 403),
    );

    const response = await launchVideo(new Request("http://learnhub.test"), routeContext);

    expect(response.status).toBe(403);
    expect(await json(response)).toEqual({ error: "Not allowed to launch this assignment" });
  });

  it("returns not found for missing assignments", async () => {
    vi.mocked(requireLearnerLaunchAssignment).mockRejectedValueOnce(
      new RuntimeRouteError("Assignment was not found", 404),
    );

    const response = await launchVideo(new Request("http://learnhub.test"), routeContext);

    expect(response.status).toBe(404);
    expect(await json(response)).toEqual({ error: "Assignment was not found" });
  });
});
