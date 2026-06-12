export type OrganizationLogoKeyInput = {
  organizationId: string;
  fileName: string;
};

export type VideoTranscriptKeyInput = {
  organizationId: string;
  courseId: string;
  lessonId: string;
  fileName: string;
};

export type CertificateArtifactKeyInput = {
  organizationId: string;
  certificateId: string;
  fileName: string;
};

export type ScormPackageKeyInput = {
  organizationId: string;
  courseId: string;
  packageId: string;
  fileName: string;
};

export type ScormExtractedFileKeyInput = {
  organizationId: string;
  courseId: string;
  packageId: string;
  relativePath: string;
};

export type CsvExportKeyInput = {
  organizationId: string;
  reportName: string;
  exportId: string;
  fileName: string;
};

export function organizationLogoKey(input: OrganizationLogoKeyInput): string {
  return joinKey("org", segment(input.organizationId), "branding", "logo", segment(input.fileName));
}

export function videoTranscriptKey(input: VideoTranscriptKeyInput): string {
  return joinKey(
    "org",
    segment(input.organizationId),
    "courses",
    segment(input.courseId),
    "video",
    segment(input.lessonId),
    "transcripts",
    segment(input.fileName),
  );
}

export function certificateArtifactKey(input: CertificateArtifactKeyInput): string {
  return joinKey("org", segment(input.organizationId), "certificates", segment(input.certificateId), segment(input.fileName));
}

export function scormZipKey(input: ScormPackageKeyInput): string {
  return joinKey(
    "org",
    segment(input.organizationId),
    "courses",
    segment(input.courseId),
    "scorm",
    segment(input.packageId),
    "source",
    segment(input.fileName),
  );
}

export function scormExtractedFileKey(input: ScormExtractedFileKeyInput): string {
  return joinKey(
    "org",
    segment(input.organizationId),
    "courses",
    segment(input.courseId),
    "scorm",
    segment(input.packageId),
    "content",
    ...relativePathSegments(input.relativePath),
  );
}

export function csvExportKey(input: CsvExportKeyInput): string {
  return joinKey(
    "org",
    segment(input.organizationId),
    "exports",
    segment(input.reportName),
    segment(input.exportId),
    segment(input.fileName),
  );
}

export function assertTenantScopedKey(key: string, organizationId: string): string {
  const normalized = normalizeObjectKey(key);

  if (!normalized.startsWith("org/")) {
    throw new Error("Object key must be tenant-scoped");
  }

  const expectedPrefix = `org/${segment(organizationId)}/`;

  if (!normalized.startsWith(expectedPrefix)) {
    throw new Error("Storage key is not scoped to this tenant");
  }

  return normalized;
}

export function normalizeObjectKey(key: string): string {
  const normalized = key.trim();

  if (!normalized.startsWith("org/")) {
    throw new Error("Object key must be tenant-scoped");
  }

  if (normalized.includes("\\") || normalized.includes("\0")) {
    throw new Error("Object key contains invalid characters");
  }

  const segments = normalized.split("/");

  if (segments.some((candidate) => candidate === "" || candidate === "." || candidate === "..")) {
    throw new Error("Object key must not contain traversal");
  }

  return normalized;
}

function joinKey(...segments: string[]): string {
  return segments.join("/");
}

function segment(value: string): string {
  const normalized = value.trim();

  if (
    normalized.length === 0 ||
    normalized === "." ||
    normalized === ".." ||
    normalized.includes("/") ||
    normalized.includes("\\") ||
    normalized.includes("\0")
  ) {
    throw new Error("Storage key segment is invalid");
  }

  return normalized;
}

function relativePathSegments(path: string): string[] {
  const normalized = path.trim();

  if (normalized.includes("\\")) {
    throw new Error("Storage key path must use forward slashes");
  }

  if (normalized.length === 0 || normalized.startsWith("/") || /^[A-Za-z]:/.test(normalized)) {
    throw new Error("Storage key path must be relative");
  }

  const segments = normalized.split("/");

  if (segments.some((candidate) => candidate === "" || candidate === "." || candidate === ".." || candidate.includes("\0"))) {
    throw new Error("Storage key path must be relative");
  }

  return segments;
}
