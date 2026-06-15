import { describe, expect, it, vi } from "vitest";

import { createPrismaCatalogRepository } from "./prisma-repository";
import type { CreateCourseData } from "./course-service";

type ReadinessCourseRecord = {
  type: "NATIVE_VIDEO" | "SCORM_1_2";
  videoLessons: Array<{
    playbackUrl: string | null;
    providerPlaybackId: string | null;
    providerStatus: "READY" | "PROCESSING" | "FAILED";
    providerError: string | null;
  }>;
  scormPackages: Array<{
    launchPath: string | null;
    extractionStatus: "READY" | "PENDING" | "FAILED";
    malwareScanStatus: "PASSED" | "PENDING" | "FAILED";
  }>;
};

function createCatalogClient() {
  return {
    $transaction: vi.fn(async (operation) => operation(createCatalogClient())),
    courseCategory: {
      create: vi.fn(async ({ data }) => ({ id: "category_1", slug: data.slug })),
      findFirst: vi.fn(async () => ({ id: "category_1" })),
    },
    courseTag: {
      create: vi.fn(async ({ data }) => ({ id: "tag_1", slug: data.slug })),
      findMany: vi.fn(async () => [{ id: "tag_1" }]),
    },
    course: {
      create: vi.fn(async ({ data }) => ({ id: "course_1", slug: data.slug })),
      findFirst: vi.fn(async (): Promise<ReadinessCourseRecord> => ({
        type: "NATIVE_VIDEO",
        videoLessons: [
          {
            playbackUrl: "https://video.test/lesson.mp4",
            providerPlaybackId: null,
            providerStatus: "READY",
            providerError: null,
          },
        ],
        scormPackages: [],
      })),
      update: vi.fn(async () => ({})),
    },
    courseTagLink: {
      deleteMany: vi.fn(async () => ({ count: 1 })),
      createMany: vi.fn(async () => ({ count: 2 })),
    },
    auditLog: {
      create: vi.fn(async () => ({})),
    },
  };
}

const courseData: CreateCourseData = {
  organizationId: "org_1",
  title: "Manager Coaching",
  slug: "manager-coaching",
  description: "",
  type: "NATIVE_VIDEO",
  status: "DRAFT",
  categoryId: "category_1",
  estimatedCompletionBusinessDays: 3,
  expectedDurationMinutes: 45,
};

describe("createPrismaCatalogRepository", () => {
  it("creates categories and tags with organization scope", async () => {
    const client = createCatalogClient();
    const repository = createPrismaCatalogRepository(
      client as unknown as Parameters<typeof createPrismaCatalogRepository>[0],
    );

    await repository.createCategory({ organizationId: "org_1", name: "Safety", slug: "safety" });
    await repository.createTag({ organizationId: "org_1", name: "Leadership", slug: "leadership" });

    expect(client.courseCategory.create).toHaveBeenCalledWith({
      data: {
        organizationId: "org_1",
        name: "Safety",
        slug: "safety",
      },
      select: { id: true, slug: true },
    });
    expect(client.courseTag.create).toHaveBeenCalledWith({
      data: {
        organizationId: "org_1",
        name: "Leadership",
        slug: "leadership",
      },
      select: { id: true, slug: true },
    });
  });

  it("writes service-provided course data without adding page concerns", async () => {
    const client = createCatalogClient();
    const repository = createPrismaCatalogRepository(
      client as unknown as Parameters<typeof createPrismaCatalogRepository>[0],
    );

    await repository.createCourse(courseData);

    expect(client.course.create).toHaveBeenCalledWith({
      data: courseData,
      select: { id: true, slug: true },
    });
  });

  it("replaces course tags inside the organization and course scope", async () => {
    const client = createCatalogClient();
    const repository = createPrismaCatalogRepository(
      client as unknown as Parameters<typeof createPrismaCatalogRepository>[0],
    );

    await repository.replaceCourseTags({
      organizationId: "org_1",
      courseId: "course_1",
      tagIds: ["tag_1", "tag_2"],
    });

    expect(client.courseTagLink.deleteMany).toHaveBeenCalledWith({
      where: {
        organizationId: "org_1",
        courseId: "course_1",
      },
    });
    expect(client.courseTagLink.createMany).toHaveBeenCalledWith({
      data: [
        { organizationId: "org_1", courseId: "course_1", tagId: "tag_1" },
        { organizationId: "org_1", courseId: "course_1", tagId: "tag_2" },
      ],
    });
  });

  it("uses the active transaction client for nested writes", async () => {
    const rootClient = createCatalogClient();
    const transactionClient = createCatalogClient();
    rootClient.$transaction.mockImplementationOnce(async (operation) => operation(transactionClient));
    const repository = createPrismaCatalogRepository(
      rootClient as unknown as Parameters<typeof createPrismaCatalogRepository>[0],
    );

    await repository.runInTransaction(async () => {
      await repository.createCategory({ organizationId: "org_1", name: "Safety", slug: "safety" });
      await repository.recordAuditLog({
        organizationId: "org_1",
        actorId: "actor_1",
        action: "catalog.category_created",
        targetType: "course_category",
        targetId: "category_1",
      });
    });

    expect(rootClient.courseCategory.create).not.toHaveBeenCalled();
    expect(rootClient.auditLog.create).not.toHaveBeenCalled();
    expect(transactionClient.courseCategory.create).toHaveBeenCalledTimes(1);
    expect(transactionClient.auditLog.create).toHaveBeenCalledTimes(1);
  });

  it("reports native video publish readiness from playable lessons", async () => {
    const client = createCatalogClient();
    const repository = createPrismaCatalogRepository(
      client as unknown as Parameters<typeof createPrismaCatalogRepository>[0],
    );

    await expect(
      repository.findCoursePublishReadiness({
        organizationId: "org_1",
        courseId: "course_1",
      }),
    ).resolves.toEqual({
      type: "NATIVE_VIDEO",
      ready: true,
      blockers: [],
    });
    expect(client.course.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "course_1",
          organizationId: "org_1",
        },
      }),
    );
  });

  it("reports SCORM publish readiness only for extracted clean active packages", async () => {
    const client = createCatalogClient();
    client.course.findFirst.mockResolvedValueOnce({
      type: "SCORM_1_2",
      videoLessons: [],
      scormPackages: [
        {
          launchPath: "/scorm/org/org_1/courses/course_1/scorm/pkg_1/content/index.html",
          extractionStatus: "READY",
          malwareScanStatus: "PASSED",
        },
      ],
    });
    const repository = createPrismaCatalogRepository(
      client as unknown as Parameters<typeof createPrismaCatalogRepository>[0],
    );

    await expect(
      repository.findCoursePublishReadiness({
        organizationId: "org_1",
        courseId: "course_1",
      }),
    ).resolves.toEqual({
      type: "SCORM_1_2",
      ready: true,
      blockers: [],
    });
  });

  it("returns publish blockers for missing course content", async () => {
    const client = createCatalogClient();
    client.course.findFirst.mockResolvedValueOnce({
      type: "NATIVE_VIDEO",
      videoLessons: [],
      scormPackages: [],
    });
    const repository = createPrismaCatalogRepository(
      client as unknown as Parameters<typeof createPrismaCatalogRepository>[0],
    );

    await expect(
      repository.findCoursePublishReadiness({
        organizationId: "org_1",
        courseId: "course_1",
      }),
    ).resolves.toEqual({
      type: "NATIVE_VIDEO",
      ready: false,
      blockers: ["Add at least one ready video lesson."],
    });
  });
});
