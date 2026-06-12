import { describe, expect, it } from "vitest";

import { createPassThroughMalwareScanner } from "./scorm-extraction";
import {
  processNextScormExtractionJob,
  type ScormPackageJobPackage,
  type ScormPackageJobRepository,
  type ScormPackageJobStorage,
} from "./scorm-package-jobs";

const manifestXml = `<?xml version="1.0"?>
<manifest>
  <organizations><organization><title>Policy Orientation</title></organization></organizations>
  <resources><resource identifier="res_1" href="index.html" /></resources>
</manifest>`;

class FakeRepository implements ScormPackageJobRepository {
  package: ScormPackageJobPackage | null = {
    id: "pkg_1",
    organizationId: "org_1",
    courseId: "course_1",
    storageKey: "org/org_1/courses/course_1/scorm/pkg_1/source/course.zip",
    contentRootKey: "org/org_1/courses/course_1/scorm/pkg_1/content",
  };
  transitions: string[] = [];

  async claimNextPendingPackage(): Promise<ScormPackageJobPackage | null> {
    const nextPackage = this.package;
    this.package = null;
    return nextPackage;
  }

  async markExtractionProcessing(packageId: string): Promise<void> {
    this.transitions.push(`processing:${packageId}`);
  }

  async markMalwareScanStatus(input: { packageId: string; status: "PENDING" | "PASSED" | "FAILED"; error: string | null }): Promise<void> {
    this.transitions.push(`malware:${input.status}:${input.error ?? ""}`);
  }

  async markExtractionReady(input: { packageId: string; manifestTitle: string | null; launchPath: string; extractedFileCount: number }): Promise<void> {
    this.transitions.push(`ready:${input.packageId}:${input.manifestTitle ?? ""}:${input.launchPath}:${input.extractedFileCount}`);
  }

  async markExtractionFailed(input: { packageId: string; error: string }): Promise<void> {
    this.transitions.push(`failed:${input.packageId}:${input.error}`);
  }
}

class FakeStorage implements ScormPackageJobStorage {
  objects: Array<{ key: string; contentType: string; body: Buffer | Uint8Array | string }> = [];

  async getObjectBytes(): Promise<Uint8Array> {
    return createStoredZip([
      ["imsmanifest.xml", manifestXml],
      ["index.html", "<html>Launch</html>"],
    ]);
  }

  async putObject(input: { key: string; contentType: string; body: Buffer | Uint8Array | string }): Promise<{ key: string; url: string }> {
    this.objects.push(input);
    return { key: input.key, url: `https://cdn.example/${input.key}` };
  }
}

describe("processNextScormExtractionJob", () => {
  it("stores processing, malware passed, and ready states", async () => {
    const repository = new FakeRepository();
    const storage = new FakeStorage();

    await expect(
      processNextScormExtractionJob({
        repository,
        storage,
        scanner: createPassThroughMalwareScanner("passed"),
      }),
    ).resolves.toEqual({ status: "processed", packageId: "pkg_1" });

    expect(repository.transitions).toEqual([
      "processing:pkg_1",
      "malware:PASSED:",
      "ready:pkg_1:Policy Orientation:index.html:2",
    ]);
    expect(storage.objects).toHaveLength(2);
  });

  it("stores malware failures and blocks extraction", async () => {
    const repository = new FakeRepository();
    const storage = new FakeStorage();

    await expect(
      processNextScormExtractionJob({
        repository,
        storage,
        scanner: createPassThroughMalwareScanner("failed", "blocked"),
      }),
    ).resolves.toEqual({ status: "blocked", packageId: "pkg_1" });

    expect(repository.transitions).toEqual([
      "processing:pkg_1",
      "malware:FAILED:blocked",
      "failed:pkg_1:blocked",
    ]);
    expect(storage.objects).toEqual([]);
  });

  it("stores extraction failures", async () => {
    const repository = new FakeRepository();
    const storage = new FakeStorage();
    storage.getObjectBytes = async () => createStoredZip([["../imsmanifest.xml", manifestXml]]);

    await expect(
      processNextScormExtractionJob({
        repository,
        storage,
        scanner: createPassThroughMalwareScanner("passed"),
      }),
    ).resolves.toEqual({ status: "failed", packageId: "pkg_1" });

    expect(repository.transitions).toEqual([
      "processing:pkg_1",
      "failed:pkg_1:ZIP entry path must be relative",
    ]);
  });

  it("skips work when no pending package exists", async () => {
    const repository = new FakeRepository();
    repository.package = null;

    await expect(
      processNextScormExtractionJob({
        repository,
        storage: new FakeStorage(),
        scanner: createPassThroughMalwareScanner("passed"),
      }),
    ).resolves.toEqual({ status: "skipped" });
  });
});

function createStoredZip(entries: Array<[string, string]>): Uint8Array {
  const chunks: Buffer[] = [];

  for (const [name, content] of entries) {
    const nameBuffer = Buffer.from(name);
    const contentBuffer = Buffer.from(content);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(0, 6);
    header.writeUInt16LE(0, 8);
    header.writeUInt32LE(0, 14);
    header.writeUInt32LE(contentBuffer.length, 18);
    header.writeUInt32LE(contentBuffer.length, 22);
    header.writeUInt16LE(nameBuffer.length, 26);
    header.writeUInt16LE(0, 28);
    chunks.push(header, nameBuffer, contentBuffer);
  }

  return Buffer.concat(chunks);
}
