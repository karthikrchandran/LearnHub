import { describe, expect, it } from "vitest";

import {
  createPassThroughMalwareScanner,
  extractScormZip,
} from "./scorm-extraction";

const manifestXml = `<?xml version="1.0"?>
<manifest>
  <organizations><organization><title>Policy Orientation</title></organization></organizations>
  <resources><resource identifier="res_1" href="index.html" /></resources>
</manifest>`;

type WrittenObject = {
  key: string;
  contentType: string;
  body: Buffer | Uint8Array | string;
};

class FakeWriter {
  objects: WrittenObject[] = [];

  async putObject(input: WrittenObject): Promise<{ key: string; url: string }> {
    this.objects.push(input);
    return { key: input.key, url: `https://cdn.example/${input.key}` };
  }
}

describe("extractScormZip", () => {
  it("validates and extracts SCORM zip files under the content root key", async () => {
    const writer = new FakeWriter();

    const result = await extractScormZip({
      organizationId: "org_1",
      courseId: "course_1",
      packageId: "pkg_1",
      contentRootKey: "org/org_1/courses/course_1/scorm/pkg_1/content",
      zipBytes: createStoredZip([
        ["imsmanifest.xml", manifestXml],
        ["index.html", "<html>Launch</html>"],
        ["assets/app.js", "console.log('launch')"],
      ]),
      scanner: createPassThroughMalwareScanner("passed"),
      writer,
    });

    expect(result).toEqual({
      status: "ready",
      manifestTitle: "Policy Orientation",
      launchPath: "index.html",
      malwareScanStatus: "PASSED",
      extractedKeys: [
        "org/org_1/courses/course_1/scorm/pkg_1/content/imsmanifest.xml",
        "org/org_1/courses/course_1/scorm/pkg_1/content/index.html",
        "org/org_1/courses/course_1/scorm/pkg_1/content/assets/app.js",
      ],
    });
    expect(writer.objects.map((object) => object.key)).toEqual(result.extractedKeys);
  });

  it("rejects traversal entries before writing extracted files", async () => {
    const writer = new FakeWriter();

    await expect(
      extractScormZip({
        organizationId: "org_1",
        courseId: "course_1",
        packageId: "pkg_1",
        contentRootKey: "org/org_1/courses/course_1/scorm/pkg_1/content",
        zipBytes: createStoredZip([
          ["imsmanifest.xml", manifestXml],
          ["../index.html", "<html>Launch</html>"],
        ]),
        scanner: createPassThroughMalwareScanner("passed"),
        writer,
      }),
    ).rejects.toThrow("ZIP entry path must be relative");

    expect(writer.objects).toEqual([]);
  });

  it("rejects SCORM zip files that exceed the compressed-size limit before writing files", async () => {
    const writer = new FakeWriter();

    await expect(
      extractScormZip({
        organizationId: "org_1",
        courseId: "course_1",
        packageId: "pkg_1",
        contentRootKey: "org/org_1/courses/course_1/scorm/pkg_1/content",
        zipBytes: createStoredZip([
          ["imsmanifest.xml", manifestXml],
          ["index.html", "<html>Launch</html>"],
        ]),
        scanner: createPassThroughMalwareScanner("passed"),
        writer,
        limits: {
          maxZipBytes: 64,
          maxEntries: 10,
          maxEntryBytes: 1024,
          maxTotalUncompressedBytes: 2048,
          maxPathDepth: 8,
        },
      }),
    ).rejects.toThrow("SCORM zip exceeds the maximum compressed size");

    expect(writer.objects).toEqual([]);
  });

  it("rejects packages with too many extracted entries before writing files", async () => {
    const writer = new FakeWriter();

    await expect(
      extractScormZip({
        organizationId: "org_1",
        courseId: "course_1",
        packageId: "pkg_1",
        contentRootKey: "org/org_1/courses/course_1/scorm/pkg_1/content",
        zipBytes: createStoredZip([
          ["imsmanifest.xml", manifestXml],
          ["index.html", "<html>Launch</html>"],
          ["assets/app.js", "console.log('launch')"],
        ]),
        scanner: createPassThroughMalwareScanner("passed"),
        writer,
        limits: {
          maxZipBytes: 4096,
          maxEntries: 2,
          maxEntryBytes: 1024,
          maxTotalUncompressedBytes: 2048,
          maxPathDepth: 8,
        },
      }),
    ).rejects.toThrow("SCORM zip contains too many entries");

    expect(writer.objects).toEqual([]);
  });

  it("rejects oversized extracted entries before writing files", async () => {
    const writer = new FakeWriter();

    await expect(
      extractScormZip({
        organizationId: "org_1",
        courseId: "course_1",
        packageId: "pkg_1",
        contentRootKey: "org/org_1/courses/course_1/scorm/pkg_1/content",
        zipBytes: createStoredZip([
          ["imsmanifest.xml", manifestXml],
          ["index.html", "<html>Launch</html>".repeat(20)],
        ]),
        scanner: createPassThroughMalwareScanner("passed"),
        writer,
        limits: {
          maxZipBytes: 4096,
          maxEntries: 10,
          maxEntryBytes: 64,
          maxTotalUncompressedBytes: 2048,
          maxPathDepth: 8,
        },
      }),
    ).rejects.toThrow("SCORM zip entry exceeds the maximum extracted size");

    expect(writer.objects).toEqual([]);
  });

  it("rejects ZIP entries that require data descriptors", async () => {
    const writer = new FakeWriter();

    await expect(
      extractScormZip({
        organizationId: "org_1",
        courseId: "course_1",
        packageId: "pkg_1",
        contentRootKey: "org/org_1/courses/course_1/scorm/pkg_1/content",
        zipBytes: createStoredZip(
          [
            ["imsmanifest.xml", manifestXml],
            ["index.html", "<html>Launch</html>"],
          ],
          { dataDescriptor: true },
        ),
        scanner: createPassThroughMalwareScanner("passed"),
        writer,
      }),
    ).rejects.toThrow("ZIP entries with data descriptors are not supported");

    expect(writer.objects).toEqual([]);
  });

  it("stores malware scan failures without extracting content", async () => {
    const writer = new FakeWriter();

    const result = await extractScormZip({
      organizationId: "org_1",
      courseId: "course_1",
      packageId: "pkg_1",
      contentRootKey: "org/org_1/courses/course_1/scorm/pkg_1/content",
      zipBytes: createStoredZip([
        ["imsmanifest.xml", manifestXml],
        ["index.html", "<html>Launch</html>"],
      ]),
      scanner: createPassThroughMalwareScanner("failed", "scanner blocked package"),
      writer,
    });

    expect(result).toMatchObject({
      status: "blocked",
      malwareScanStatus: "FAILED",
      malwareScanError: "scanner blocked package",
      extractedKeys: [],
    });
    expect(writer.objects).toEqual([]);
  });
});

function createStoredZip(
  entries: Array<[string, string]>,
  options: { dataDescriptor?: boolean } = {},
): Uint8Array {
  const chunks: Buffer[] = [];

  for (const [name, content] of entries) {
    const nameBuffer = Buffer.from(name);
    const contentBuffer = Buffer.from(content);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(options.dataDescriptor ? 0x08 : 0, 6);
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
