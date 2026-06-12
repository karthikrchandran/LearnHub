import { describe, expect, it, vi } from "vitest";

import { CredlyCredentialProvider } from "./credly-provider";

describe("CredlyCredentialProvider", () => {
  it("issues a credential through the configured Credly endpoint", async () => {
    const fetcher = vi.fn(async () =>
      new Response(JSON.stringify({ id: "credly_badge_1", badge_url: "https://credly.test/badges/credly_badge_1" }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      }),
    ) as unknown as typeof fetch;
    const provider = new CredlyCredentialProvider({
      baseUrl: "https://api.credly.test",
      apiToken: "token_123",
      organizationId: "issuer_1",
      fetch: fetcher,
    });

    const result = await provider.issueCredential({
      organizationId: "org_1",
      courseId: "course_1",
      learnerEmail: "asha@example.com",
      learnerName: "Asha Rao",
      issuedAt: new Date("2026-06-12T12:00:00.000Z"),
      providerTemplateId: "template_1",
    });

    expect(fetcher).toHaveBeenCalledWith("https://api.credly.test/v1/organizations/issuer_1/badges", {
      method: "POST",
      headers: {
        Authorization: "Bearer token_123",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        badge_template_id: "template_1",
        recipient_email: "asha@example.com",
        issued_to: "Asha Rao",
        issued_at: "2026-06-12T12:00:00.000Z",
        evidence: [{ type: "LearnHubCourse", organization_id: "org_1", course_id: "course_1" }],
      }),
    });
    expect(result).toEqual({
      providerCredentialId: "credly_badge_1",
      providerUrl: "https://credly.test/badges/credly_badge_1",
    });
  });

  it("surfaces Credly provider failures with response status", async () => {
    const provider = new CredlyCredentialProvider({
      baseUrl: "https://api.credly.test",
      apiToken: "token_123",
      organizationId: "issuer_1",
      fetch: vi.fn(async () => new Response("bad template", { status: 422 })) as unknown as typeof fetch,
    });

    await expect(
      provider.issueCredential({
        organizationId: "org_1",
        courseId: "course_1",
        learnerEmail: "asha@example.com",
        learnerName: "Asha Rao",
        issuedAt: new Date("2026-06-12T12:00:00.000Z"),
        providerTemplateId: "template_1",
      }),
    ).rejects.toThrow("Credly credential request failed with status 422");
  });
});
