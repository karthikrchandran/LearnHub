const allowedZipContentTypes = new Set([
  "application/zip",
  "application/x-zip-compressed",
  "application/octet-stream",
]);
const maxPackageSizeBytes = 512 * 1024 * 1024;

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
  launchPath: string;
  manifestTitle: string | null;
  uploadedByUserId: string;
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
  const originalFileName = normalizeFileName(input.originalFileName);
  const contentType = normalizeContentType(input.contentType);
  const launchPath = normalizeLaunchPath(input.launchPath);
  const byteSize = normalizeByteSize(input.byteSize);
  const course = await repository.findCourse({ organizationId, courseId });

  if (!course) {
    throw new Error("Course not found");
  }

  if (course.type !== "SCORM_1_2") {
    throw new Error("SCORM packages can only be added to SCORM 1.2 courses");
  }

  const packageId = `pkg_${courseId}`;
  const storageKey = `org/${organizationId}/courses/${courseId}/scorm/${packageId}/${originalFileName}`;

  return repository.runInTransaction(async () => {
    const scormPackage = await repository.upsertPackage({
      packageId,
      organizationId,
      courseId,
      originalFileName,
      contentType,
      byteSize,
      storageKey,
      launchPath,
      manifestTitle: normalizeNullable(input.manifestTitle),
      uploadedByUserId: actorId,
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

function normalizeFileName(value: string): string {
  const fileName = requireValue(value, "SCORM package file name is required");

  if (!fileName.toLowerCase().endsWith(".zip")) {
    throw new Error("SCORM package must be a zip file");
  }

  return fileName.replace(/[\\/]/g, "");
}

function normalizeContentType(value: string): string {
  const contentType = requireValue(value, "SCORM package content type is required").toLowerCase();

  if (!allowedZipContentTypes.has(contentType)) {
    throw new Error("SCORM package content type must be zip-compatible");
  }

  return contentType;
}

function normalizeByteSize(value: number): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error("SCORM package size must be positive");
  }

  if (value > maxPackageSizeBytes) {
    throw new Error("SCORM package exceeds the maximum size");
  }

  return value;
}

function normalizeLaunchPath(value: string): string {
  const launchPath = requireValue(value, "SCORM launch path is required").replace(/\\/g, "/");

  if (launchPath.startsWith("/") || launchPath.includes("..")) {
    throw new Error("SCORM launch path must be relative");
  }

  return launchPath;
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
