import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { CertificateRenderer, renderCertificateArtifact, type CertificateViewModel } from "./certificate-renderer";

const certificate: CertificateViewModel = {
  verificationCode: "ABC123DEF456GHI7",
  verificationUrl: "https://learnhub.test/certificates/ABC123DEF456GHI7",
  learnerName: "Asha Rao",
  courseTitle: "Safety Basics",
  issuedAt: new Date("2026-06-12T12:00:00.000Z"),
  issuerName: "Acme Learning",
  issuerLogoUrl: "https://cdn.test/logo.png",
  issuerPrimaryColor: "#0f766e",
  issuerAccentColor: "#f59e0b",
};

describe("CertificateRenderer", () => {
  it("renders a branded print-ready certificate without private ids", () => {
    const markup = renderToStaticMarkup(<CertificateRenderer certificate={certificate} />);

    expect(markup).toContain("Acme Learning");
    expect(markup).toContain("Safety Basics");
    expect(markup).toContain("Asha Rao");
    expect(markup).toContain("ABC123DEF456GHI7");
    expect(markup).toContain("#0f766e");
    expect(markup).toContain("#f59e0b");
    expect(markup).toContain("@media print");
    expect(markup).not.toContain("assignment_");
    expect(markup).not.toContain("membership_");
  });

  it("generates a stable downloadable html artifact from stored certificate data", () => {
    const artifact = renderCertificateArtifact(certificate);

    expect(artifact).toContain("<!doctype html>");
    expect(artifact).toContain("Safety Basics");
    expect(artifact).toContain("https://learnhub.test/certificates/ABC123DEF456GHI7");
    expect(artifact).toContain("ABC123DEF456GHI7");
  });
});
