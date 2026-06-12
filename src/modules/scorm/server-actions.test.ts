import { describe, expect, it, vi } from "vitest";

import { createScormPackageActions, type ScormPackageActionDependencies } from "./server-actions";
import type {
  ScormPackageCourse,
  ScormPackageRepository,
  UploadScormPackageData,
} from "./scorm-package-service";

const scormCourse: ScormPackageCourse = {
  id: "course_1",
  organizationId: "org_1",
  type: "SCORM_1_2",
};

function formData(entries: Record<string, string>): FormData {
  const data = new FormData();

  for (const [key, value] of Object.entries(entries)) {
    data.append(key, value);
  }

  return data;
}

function createRepository(): ScormPackageRepository & {
  packages: UploadScormPackageData[];
} {
  const packages: UploadScormPackageData[] = [];

  return {
    packages,
    runInTransaction: vi.fn(async (operation) => operation()),
    findCourse: vi.fn(async () => scormCourse),
    upsertPackage: vi.fn(async (data) => {
      packages.push(data);

      return { id: data.packageId, storageKey: data.storageKey };
    }),
    recordAuditLog: vi.fn(async () => {}),
  };
}

function createDependencies(): ScormPackageActionDependencies & {
  repository: ReturnType<typeof createRepository>;
} {
  return {
    repository: createRepository(),
    getContext: vi.fn(async (slug, courseSlug) => {
      expect(slug).toBe("acme");
      expect(courseSlug).toBe("policy");

      return {
        actorId: "actor_1",
        organizationId: "org_1",
        courseId: "course_1",
      };
    }),
  };
}

describe("SCORM package server actions", () => {
  it("parses upload metadata and creates package storage roots", async () => {
    const dependencies = createDependencies();
    const actions = createScormPackageActions(dependencies);

    await expect(
      actions.uploadPackage(
        "acme",
        "policy",
        formData({
          originalFileName: "policy.zip",
          contentType: "application/zip",
          byteSize: "1024",
          launchPath: "index.html",
          manifestTitle: "Policy",
        }),
      ),
    ).resolves.toEqual({ status: "success", message: "SCORM package metadata saved." });

    expect(dependencies.repository.upsertPackage).toHaveBeenCalledWith({
      packageId: "pkg_course_1",
      organizationId: "org_1",
      courseId: "course_1",
      originalFileName: "policy.zip",
      contentType: "application/zip",
      byteSize: 1024,
      storageKey: "org/org_1/courses/course_1/scorm/pkg_course_1/policy.zip",
      contentRootKey: "org/org_1/courses/course_1/scorm/pkg_course_1/content",
      launchPath: "index.html",
      manifestTitle: "Policy",
      uploadedByUserId: "actor_1",
    });
  });

  it("returns validation errors without throwing", async () => {
    const dependencies = createDependencies();
    const actions = createScormPackageActions(dependencies);

    await expect(
      actions.uploadPackage(
        "acme",
        "policy",
        formData({
          originalFileName: "policy.pdf",
          contentType: "application/pdf",
          byteSize: "1024",
          launchPath: "index.html",
          manifestTitle: "",
        }),
      ),
    ).resolves.toEqual({ status: "error", message: "SCORM package must be a zip file" });
  });
});
