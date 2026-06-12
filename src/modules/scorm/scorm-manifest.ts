const allowedZipContentTypes = new Set([
  "application/zip",
  "application/x-zip-compressed",
  "application/octet-stream",
]);
const maxPackageSizeBytes = 512 * 1024 * 1024;

export type ScormUploadMetadataInput = {
  originalFileName: string;
  contentType: string;
  byteSize: number;
};

export type ValidatedScormUploadMetadata = {
  originalFileName: string;
  contentType: string;
  byteSize: number;
};

export type ScormPackageEntry = {
  path: string;
  content: string | Uint8Array;
};

export type ParsedScormManifest = {
  title: string | null;
  launchPath: string;
};

export function validateScormUploadMetadata(input: ScormUploadMetadataInput): ValidatedScormUploadMetadata {
  const originalFileName = normalizeFileName(input.originalFileName);
  const contentType = normalizeContentType(input.contentType);
  const byteSize = normalizeByteSize(input.byteSize);

  return { originalFileName, contentType, byteSize };
}

export function validateScormPackageEntries(input: {
  entries: ScormPackageEntry[];
  declaredLaunchPath?: string | null;
}): { manifestTitle: string | null; launchPath: string } {
  const normalizedEntries = input.entries.map((entry) => ({
    path: normalizeRelativePath(entry.path, "ZIP entry path must be relative"),
    content: entry.content,
  }));
  const manifest = normalizedEntries.find((entry) => entry.path.toLowerCase() === "imsmanifest.xml");

  if (!manifest) {
    throw new Error("SCORM package must include imsmanifest.xml");
  }

  const parsedManifest = parseScormManifest(contentToString(manifest.content));
  const launchPath = normalizeRelativePath(input.declaredLaunchPath?.trim() || parsedManifest.launchPath, "SCORM launch path must be relative");

  if (!normalizedEntries.some((entry) => entry.path === launchPath)) {
    throw new Error("SCORM launch file was not found");
  }

  return {
    manifestTitle: parsedManifest.title,
    launchPath,
  };
}

export function parseScormManifest(manifestXml: string): ParsedScormManifest {
  const title = firstMatch(manifestXml, /<title[^>]*>([\s\S]*?)<\/title>/i);
  const resourceHref = firstMatch(manifestXml, /<resource\b[^>]*\bhref=["']([^"']+)["']/i);

  if (!resourceHref) {
    throw new Error("SCORM manifest must include a launch resource");
  }

  return {
    title: title ? decodeXml(title.trim()) : null,
    launchPath: normalizeRelativePath(decodeXml(resourceHref.trim()), "SCORM launch path must be relative"),
  };
}

export function normalizeScormLaunchPath(value: string): string {
  return normalizeRelativePath(value, "SCORM launch path must be relative");
}

function normalizeFileName(value: string): string {
  const fileName = requireValue(value, "SCORM package file name is required").replace(/[\\/]/g, "");

  if (!fileName.toLowerCase().endsWith(".zip")) {
    throw new Error("SCORM package must be a zip file");
  }

  return fileName;
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

function normalizeRelativePath(value: string, message: string): string {
  const normalized = requireValue(value, message).replace(/\\/g, "/");

  if (normalized.startsWith("/") || /^[A-Za-z]:/.test(normalized)) {
    throw new Error(message);
  }

  const segments = normalized.split("/");

  if (segments.some((segment) => segment === "" || segment === "." || segment === ".." || segment.includes("\0"))) {
    throw new Error(message);
  }

  return segments.join("/");
}

function requireValue(value: string, message: string): string {
  const normalized = value.trim();

  if (!normalized) {
    throw new Error(message);
  }

  return normalized;
}

function contentToString(content: string | Uint8Array): string {
  return typeof content === "string" ? content : new TextDecoder().decode(content);
}

function firstMatch(value: string, pattern: RegExp): string | null {
  return pattern.exec(value)?.[1] ?? null;
}

function decodeXml(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}
