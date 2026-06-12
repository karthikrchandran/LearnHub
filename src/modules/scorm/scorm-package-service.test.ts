import { describe, expect, it } from "vitest";

import {
  uploadScormPackage,
  type ScormPackageCourse,
  type ScormPackageRepository,
  type UploadScormPackageData,
  type UploadScormPackageInput,
} from "./scorm-package-service";

const scormCourse: ScormPackageCourse = {
  id: "course_1",
  organizationId: "org_1",
  type: "SCORM_1_2",
};

const validInput: UploadScormPackageInput = {
  organizationId: "org_1",
  courseId: "course_1",
  actorId: "actor_1",
  originalFileName: "policy-orientation.zip",
  contentType: "application/zip",
  byteSize: 1024,
  launchPath: "index.html",
  manifestTitle: "Policy Orientation",
};

class FakeScormPackageRepository implements ScormPackageRepository {
  course: ScormPackageCourse | null = scormCourse;
  transactions = 0;
  packages: UploadScormPackageData[] = [];
  auditLogs: Array<Parameters<ScormPackageRepository["recordAuditLog"]>[0]> = [];

  async runInTransaction<T>(operation: () => Promise<T>): Promise<T> {
    this.transactions += 1;
    return operation();
  }

  async findCourse(): Promise<ScormPackageCourse | null> {
    return this.course;
  }

  async upsertPackage(data: UploadScormPackageData): Promise<{ id: string; storageKey: string }> {
    this.packages.push(data);
    return { id: data.packageId, storageKey: data.storageKey };
  }

  async recordAuditLog(input: Parameters<ScormPackageRepository["recordAuditLog"]>[0]): Promise<void> {
    this.auditLogs.push(input);
  }
}

function createRepository(overrides: Partial<FakeScormPackageRepository> = {}): FakeScormPackageRepository {
  return Object.assign(new FakeScormPackageRepository(), overrides);
}

describe("uploadScormPackage", () => {
  it("rejects non-SCORM courses", async () => {
    const repository = createRepository({
      course: { ...scormCourse, type: "NATIVE_VIDEO" },
    });

    await expect(uploadScormPackage(validInput, repository)).rejects.toThrow(
      "SCORM packages can only be added to SCORM 1.2 courses",
    );
  });

  it("rejects non-zip file names", async () => {
    await expect(
      uploadScormPackage({ ...validInput, originalFileName: "course.pdf" }, createRepository()),
    ).rejects.toThrow("SCORM package must be a zip file");
  });

  it("rejects unsafe launch paths", async () => {
    await expect(
      uploadScormPackage({ ...validInput, launchPath: "../index.html" }, createRepository()),
    ).rejects.toThrow("SCORM launch path must be relative");
  });

  it("creates a deterministic storage key and records upload audit", async () => {
    const repository = createRepository();

    const result = await uploadScormPackage(validInput, repository);

    expect(result).toEqual({
      id: "pkg_course_1",
      storageKey: "org/org_1/courses/course_1/scorm/pkg_course_1/policy-orientation.zip",
    });
    expect(repository.packages).toEqual([
      {
        packageId: "pkg_course_1",
        organizationId: "org_1",
        courseId: "course_1",
        originalFileName: "policy-orientation.zip",
        contentType: "application/zip",
        byteSize: 1024,
        storageKey: "org/org_1/courses/course_1/scorm/pkg_course_1/policy-orientation.zip",
        contentRootKey: "org/org_1/courses/course_1/scorm/pkg_course_1/content",
        launchPath: "index.html",
        manifestTitle: "Policy Orientation",
        uploadedByUserId: "actor_1",
        extractionStatus: "PENDING",
        malwareScanStatus: "PENDING",
      },
    ]);
    expect(repository.auditLogs).toEqual([
      {
        organizationId: "org_1",
        actorId: "actor_1",
        action: "scorm.package_uploaded",
        targetType: "course",
        targetId: "course_1",
      },
    ]);
    expect(repository.transactions).toBe(1);
  });
});
