import { describe, expect, it } from "vitest";

import {
  parseScormManifest,
  validateScormPackageEntries,
  validateScormUploadMetadata,
} from "./scorm-manifest";

const manifestXml = `<?xml version="1.0"?>
<manifest identifier="policy">
  <organizations default="org_1">
    <organization identifier="org_1">
      <title>Policy Orientation</title>
      <item identifier="item_1" identifierref="resource_1" />
    </organization>
  </organizations>
  <resources>
    <resource identifier="resource_1" type="webcontent" adlcp:scormtype="sco" href="index.html">
      <file href="index.html" />
    </resource>
  </resources>
</manifest>`;

describe("SCORM manifest validation", () => {
  it("parses the manifest title and launch path", () => {
    expect(parseScormManifest(manifestXml)).toEqual({
      title: "Policy Orientation",
      launchPath: "index.html",
    });
  });

  it("validates upload metadata before package persistence", () => {
    expect(
      validateScormUploadMetadata({
        originalFileName: "policy.zip",
        contentType: "application/zip",
        byteSize: 1024,
      }),
    ).toEqual({
      originalFileName: "policy.zip",
      contentType: "application/zip",
      byteSize: 1024,
    });
    expect(() =>
      validateScormUploadMetadata({
        originalFileName: "policy.pdf",
        contentType: "application/pdf",
        byteSize: 1024,
      }),
    ).toThrow("SCORM package must be a zip file");
    expect(() =>
      validateScormUploadMetadata({
        originalFileName: "policy.zip",
        contentType: "application/pdf",
        byteSize: 1024,
      }),
    ).toThrow("SCORM package content type must be zip-compatible");
  });

  it("requires imsmanifest.xml and the launch file in package entries", () => {
    const validation = validateScormPackageEntries({
      entries: [
        { path: "imsmanifest.xml", content: manifestXml },
        { path: "index.html", content: "<html></html>" },
      ],
    });

    expect(validation).toEqual({
      manifestTitle: "Policy Orientation",
      launchPath: "index.html",
    });
    expect(() => validateScormPackageEntries({ entries: [{ path: "index.html", content: "<html></html>" }] })).toThrow(
      "SCORM package must include imsmanifest.xml",
    );
    expect(() =>
      validateScormPackageEntries({
        entries: [{ path: "imsmanifest.xml", content: manifestXml }],
      }),
    ).toThrow("SCORM launch file was not found");
  });

  it("rejects traversal entries and unsafe launch paths", () => {
    expect(() =>
      validateScormPackageEntries({
        entries: [
          { path: "imsmanifest.xml", content: manifestXml },
          { path: "../index.html", content: "<html></html>" },
        ],
      }),
    ).toThrow("ZIP entry path must be relative");
    expect(() =>
      validateScormPackageEntries({
        entries: [
          {
            path: "imsmanifest.xml",
            content: manifestXml.replace('href="index.html"', 'href="../index.html"'),
          },
          { path: "index.html", content: "<html></html>" },
        ],
      }),
    ).toThrow("SCORM launch path must be relative");
  });
});
