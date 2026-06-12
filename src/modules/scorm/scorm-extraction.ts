import { inflateRawSync } from "node:zlib";

import { assertTenantScopedKey } from "../storage/storage-keys";
import {
  type ScormPackageEntry,
  validateScormPackageEntries,
} from "./scorm-manifest";

export type MalwareScanResult = {
  status: "PASSED" | "FAILED";
  error: string | null;
};

export type MalwareScanner = {
  scan(input: { bytes: Uint8Array; organizationId: string; packageId: string }): Promise<MalwareScanResult>;
};

export type ScormExtractionWriter = {
  putObject(input: { key: string; contentType: string; body: Buffer | Uint8Array | string }): Promise<{ key: string; url: string }>;
};

export type ExtractScormZipInput = {
  organizationId: string;
  courseId: string;
  packageId: string;
  contentRootKey: string;
  zipBytes: Uint8Array;
  scanner: MalwareScanner;
  writer: ScormExtractionWriter;
};

export type ExtractScormZipResult =
  | {
      status: "ready";
      manifestTitle: string | null;
      launchPath: string;
      malwareScanStatus: "PASSED";
      extractedKeys: string[];
    }
  | {
      status: "blocked";
      malwareScanStatus: "FAILED";
      malwareScanError: string;
      extractedKeys: [];
    };

export function createPassThroughMalwareScanner(status: "passed" | "failed", error = "Malware scan failed"): MalwareScanner {
  return {
    async scan() {
      return status === "passed"
        ? { status: "PASSED", error: null }
        : { status: "FAILED", error };
    },
  };
}

export async function extractScormZip(input: ExtractScormZipInput): Promise<ExtractScormZipResult> {
  const contentRootKey = assertTenantScopedKey(input.contentRootKey, input.organizationId);
  const scanResult = await input.scanner.scan({
    bytes: input.zipBytes,
    organizationId: input.organizationId,
    packageId: input.packageId,
  });

  if (scanResult.status === "FAILED") {
    return {
      status: "blocked",
      malwareScanStatus: "FAILED",
      malwareScanError: scanResult.error ?? "Malware scan failed",
      extractedKeys: [],
    };
  }

  const entries = parseZipEntries(input.zipBytes);
  const validation = validateScormPackageEntries({ entries });
  const extractedKeys: string[] = [];

  for (const entry of entries) {
    const key = `${contentRootKey}/${entry.path}`;

    await input.writer.putObject({
      key,
      contentType: contentTypeForPath(entry.path),
      body: entry.content,
    });
    extractedKeys.push(key);
  }

  return {
    status: "ready",
    manifestTitle: validation.manifestTitle,
    launchPath: validation.launchPath,
    malwareScanStatus: "PASSED",
    extractedKeys,
  };
}

export function parseZipEntries(bytes: Uint8Array): ScormPackageEntry[] {
  const buffer = Buffer.from(bytes);
  const entries: ScormPackageEntry[] = [];
  let offset = 0;

  while (offset + 4 <= buffer.length) {
    const signature = buffer.readUInt32LE(offset);

    if (signature !== 0x04034b50) {
      break;
    }

    if (offset + 30 > buffer.length) {
      throw new Error("ZIP entry header is truncated");
    }

    const compressionMethod = buffer.readUInt16LE(offset + 8);
    const compressedSize = buffer.readUInt32LE(offset + 18);
    const fileNameLength = buffer.readUInt16LE(offset + 26);
    const extraFieldLength = buffer.readUInt16LE(offset + 28);
    const fileNameStart = offset + 30;
    const fileNameEnd = fileNameStart + fileNameLength;
    const contentStart = fileNameEnd + extraFieldLength;
    const contentEnd = contentStart + compressedSize;

    if (contentEnd > buffer.length) {
      throw new Error("ZIP entry content is truncated");
    }

    const path = normalizeZipEntryPath(buffer.subarray(fileNameStart, fileNameEnd).toString("utf8"));

    if (!path.endsWith("/")) {
      const compressed = buffer.subarray(contentStart, contentEnd);
      const content = inflateEntry(compressed, compressionMethod);
      entries.push({ path, content });
    }

    offset = contentEnd;
  }

  if (entries.length === 0) {
    throw new Error("SCORM zip did not contain extractable files");
  }

  return entries;
}

function inflateEntry(content: Buffer, compressionMethod: number): Uint8Array {
  if (compressionMethod === 0) {
    return new Uint8Array(content);
  }

  if (compressionMethod === 8) {
    return new Uint8Array(inflateRawSync(content));
  }

  throw new Error("Unsupported ZIP compression method");
}

function normalizeZipEntryPath(path: string): string {
  const normalized = path.replace(/\\/g, "/");

  if (!normalized || normalized.startsWith("/") || /^[A-Za-z]:/.test(normalized)) {
    throw new Error("ZIP entry path must be relative");
  }

  const segments = normalized.split("/").filter((segment) => segment.length > 0);

  if (segments.some((segment) => segment === "." || segment === ".." || segment.includes("\0"))) {
    throw new Error("ZIP entry path must be relative");
  }

  return normalized.endsWith("/") ? `${segments.join("/")}/` : segments.join("/");
}

function contentTypeForPath(path: string): string {
  const lower = path.toLowerCase();

  if (lower.endsWith(".html") || lower.endsWith(".htm")) {
    return "text/html; charset=utf-8";
  }

  if (lower.endsWith(".js")) {
    return "text/javascript; charset=utf-8";
  }

  if (lower.endsWith(".css")) {
    return "text/css; charset=utf-8";
  }

  if (lower.endsWith(".json")) {
    return "application/json; charset=utf-8";
  }

  if (lower.endsWith(".png")) {
    return "image/png";
  }

  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) {
    return "image/jpeg";
  }

  if (lower.endsWith(".svg")) {
    return "image/svg+xml";
  }

  return "application/octet-stream";
}
