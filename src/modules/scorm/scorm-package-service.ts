import {
  normalizeScormLaunchPath,
  validateScormUploadMetadata,
} from "./scorm-manifest";
import { assertTenantScopedKey, scormZipKey } from "../storage/storage-keys";

export type ScormPackageCourse = {
  id: string;
  organizationId: string;
  type: "NATIVE_VIDEO" | "SCORM_1_2";
};

export type UploadScormPackageInput = {
  organizationId: string;
  courseId: string;
  actorId: string;
  originalFileName: string;
  contentType: string;
  byteSize: number;
  storageKey?: string | null;
  launchPath: string;
  manifestTitle?: string | null;
};

export type UploadScormPackageData = {
  packageId: string;
  organizationId: string;
  courseId: string;
  originalFileName: string;
  contentType: string;
  byteSize: number;
  storageKey: string;
  contentRootKey: string;
  launchPath: string;
  manifestTitle: string | null;
  uploadedByUserId: string;
  extractionStatus: "PENDING" | "PROCESSING" | "READY" | "FAILED";
  malwareScanStatus: "PENDING" | "PASSED" | "FAILED";
};

export type ScormPackageRepository = {
  runInTransaction<T>(operation: () => Promise<T>): Promise<T>;
  findCourse(input: { organizationId: string; courseId: string }): Promise<ScormPackageCourse | null>;
  upsertPackage(data: UploadScormPackageData): Promise<{ id: string; storageKey: string }>;
  recordAuditLog(input: {
    organizationId: string;
    actorId: string;
    action: string;
    targetType: string;
    targetId: string;
  }): Promise<void>;
};

export async function uploadScormPackage(
  input: UploadScormPackageInput,
  repository: ScormPackageRepository,
): Promise<{ id: string; storageKey: string }> {
  const organizationId = requireValue(input.organizationId, "Organization id is required");
  const courseId = requireValue(input.courseId, "Course id is required");
  const actorId = requireValue(input.actorId, "Actor id is required");
  const { originalFileName, contentType, byteSize } = validateScormUploadMetadata({
    originalFileName: input.originalFileName,
    contentType: input.contentType,
    byteSize: input.byteSize,
  });
  const launchPath = normalizeScormLaunchPath(input.launchPath);
  const course = await repository.findCourse({ organizationId, courseId });

  if (!course) {
    throw new Error("Course not found");
  }

  if (course.type !== "SCORM_1_2") {
    throw new Error("SCORM packages can only be added to SCORM 1.2 courses");
  }

  const packageId = `pkg_${courseId}`;
  const packageRootKey = `org/${organizationId}/courses/${courseId}/scorm/${packageId}`;
  const expectedStorageKey = scormZipKey({ organizationId, courseId, packageId, fileName: originalFileName });
  const storageKey = resolveStorageKey({
    organizationId,
    providedStorageKey: input.storageKey,
    expectedStorageKey,
  });
  const contentRootKey = `${packageRootKey}/content`;

  return repository.runInTransaction(async () => {
    const scormPackage = await repository.upsertPackage({
      packageId,
      organizationId,
      courseId,
      originalFileName,
      contentType,
      byteSize,
      storageKey,
      contentRootKey,
      launchPath,
      manifestTitle: normalizeNullable(input.manifestTitle),
      uploadedByUserId: actorId,
      extractionStatus: "PENDING",
      malwareScanStatus: "PENDING",
    });

    await repository.recordAuditLog({
      organizationId,
      actorId,
      action: "scorm.package_uploaded",
      targetType: "course",
      targetId: courseId,
    });

    return scormPackage;
  });
}

function resolveStorageKey(input: {
  organizationId: string;
  providedStorageKey: string | null | undefined;
  expectedStorageKey: string;
}): string {
  if (!input.providedStorageKey?.trim()) {
    throw new Error("SCORM signed upload storage key is required");
  }

  const normalized = assertTenantScopedKey(input.providedStorageKey, input.organizationId);

  if (normalized !== input.expectedStorageKey) {
    throw new Error("SCORM storage key must match the signed upload key");
  }

  return normalized;
}

function normalizeNullable(value: string | null | undefined): string | null {
  const normalized = value?.trim() ?? "";

  return normalized || null;
}

function requireValue(value: string, message: string): string {
  const normalized = value.trim();

  if (!normalized) {
    throw new Error(message);
  }

  return normalized;
}
