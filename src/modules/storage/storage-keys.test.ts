import { describe, expect, it } from "vitest";

import {
  assertTenantScopedKey,
  certificateArtifactKey,
  csvExportKey,
  organizationLogoKey,
  scormExtractedFileKey,
  scormZipKey,
  videoTranscriptKey,
} from "./storage-keys";

describe("tenant storage keys", () => {
  it("builds tenant-scoped keys for production storage artifacts", () => {
    expect(organizationLogoKey({ organizationId: "org_1", fileName: "logo.png" })).toBe(
      "org/org_1/branding/logo/logo.png",
    );
    expect(
      videoTranscriptKey({
        organizationId: "org_1",
        courseId: "course_1",
        lessonId: "lesson_1",
        fileName: "coaching.vtt",
      }),
    ).toBe("org/org_1/courses/course_1/video/lesson_1/transcripts/coaching.vtt");
    expect(certificateArtifactKey({ organizationId: "org_1", certificateId: "cert_1", fileName: "certificate.pdf" })).toBe(
      "org/org_1/certificates/cert_1/certificate.pdf",
    );
    expect(scormZipKey({ organizationId: "org_1", courseId: "course_1", packageId: "pkg_1", fileName: "course.zip" })).toBe(
      "org/org_1/courses/course_1/scorm/pkg_1/source/course.zip",
    );
    expect(
      scormExtractedFileKey({
        organizationId: "org_1",
        courseId: "course_1",
        packageId: "pkg_1",
        relativePath: "shared/index.html",
      }),
    ).toBe("org/org_1/courses/course_1/scorm/pkg_1/content/shared/index.html");
    expect(csvExportKey({ organizationId: "org_1", reportName: "progress", exportId: "export_1", fileName: "progress.csv" })).toBe(
      "org/org_1/exports/progress/export_1/progress.csv",
    );
  });

  it("rejects unsafe segments and traversal paths before keys are created", () => {
    expect(() => organizationLogoKey({ organizationId: "../org_1", fileName: "logo.png" })).toThrow(
      "Storage key segment is invalid",
    );
    expect(() =>
      scormExtractedFileKey({
        organizationId: "org_1",
        courseId: "course_1",
        packageId: "pkg_1",
        relativePath: "../index.html",
      }),
    ).toThrow("Storage key path must be relative");
    expect(() =>
      scormExtractedFileKey({
        organizationId: "org_1",
        courseId: "course_1",
        packageId: "pkg_1",
        relativePath: "shared\\index.html",
      }),
    ).toThrow("Storage key path must use forward slashes");
  });

  it("asserts tenant scope for delete and read operations", () => {
    expect(assertTenantScopedKey("org/org_1/courses/course_1/file.txt", "org_1")).toBe(
      "org/org_1/courses/course_1/file.txt",
    );
    expect(() => assertTenantScopedKey("org/org_2/courses/course_1/file.txt", "org_1")).toThrow(
      "Storage key is not scoped to this tenant",
    );
    expect(() => assertTenantScopedKey("unscoped/file.txt", "org_1")).toThrow("Object key must be tenant-scoped");
  });
});
