import { describe, expect, it } from "vitest";

import { buildCertificateShareLinks } from "./share-links";

describe("buildCertificateShareLinks", () => {
  it("builds LinkedIn, email, and copyable verification links", () => {
    const links = buildCertificateShareLinks({
      verificationUrl: "https://learnhub.test/certificates/ABC123",
      courseTitle: "Safety Basics",
      learnerName: "Asha Rao",
    });

    expect(links.copyUrl).toBe("https://learnhub.test/certificates/ABC123");
    expect(links.linkedInUrl).toContain("linkedin.com");
    expect(links.linkedInUrl).toContain("certUrl=https%3A%2F%2Flearnhub.test%2Fcertificates%2FABC123");
    expect(links.emailUrl).toBe(
      "mailto:?subject=LearnHub%20certificate%3A%20Safety%20Basics&body=Asha%20Rao%20earned%20a%20certificate%20for%20Safety%20Basics.%0A%0AVerify%20it%20at%20https%3A%2F%2Flearnhub.test%2Fcertificates%2FABC123",
    );
  });
});
