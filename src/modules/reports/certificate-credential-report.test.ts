import { describe, expect, it } from "vitest";

import { formatCertificateCredentialReportCsv } from "./certificate-credential-report";

describe("certificate credential report", () => {
  it("formats certificate and credential status rows as CSV", () => {
    expect(
      formatCertificateCredentialReportCsv([
        {
          certificateUrl: "https://learnhub.test/certificates/ABC123",
          issuedAt: new Date("2026-06-12T10:00:00.000Z"),
          learnerName: "Asha Rao",
          learnerEmail: "asha@example.com",
          courseTitle: "Safety",
          credentialProvider: "CREDLY",
          credentialStatus: "FAILED",
          providerCredentialId: null,
          providerUrl: null,
          failureMessage: "Credly unavailable",
        },
      ]),
    ).toContain("Asha Rao,asha@example.com,Safety,https://learnhub.test/certificates/ABC123,2026-06-12T10:00:00.000Z,CREDLY,FAILED,,,Credly unavailable");
  });
});
