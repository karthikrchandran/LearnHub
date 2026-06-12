import { describe, expect, it, vi } from "vitest";

import { ApiEmailProvider } from "./api-email-provider";

describe("API email provider", () => {
  it("posts transactional email payloads with a bearer token", async () => {
    const fetch = vi.fn(async () => Response.json({ messageId: "api-123" }));
    const provider = new ApiEmailProvider({
      endpoint: "https://email-api.learnhub.test/send",
      token: "secret-token",
      from: "no-reply@learnhub.test",
      fetch,
    });

    const result = await provider.send({
      to: "learner@example.com",
      subject: "Subject",
      html: "<p>Hello</p>",
      text: "Hello",
    });

    expect(result).toEqual({ providerMessageId: "api-123" });
    expect(fetch).toHaveBeenCalledWith("https://email-api.learnhub.test/send", {
      method: "POST",
      headers: {
        "Authorization": "Bearer secret-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "no-reply@learnhub.test",
        to: "learner@example.com",
        subject: "Subject",
        html: "<p>Hello</p>",
        text: "Hello",
      }),
    });
  });

  it("throws a clear error when the transactional endpoint fails", async () => {
    const fetch = vi.fn(async () => new Response("bad request", { status: 400 }));
    const provider = new ApiEmailProvider({
      endpoint: "https://email-api.learnhub.test/send",
      token: "secret-token",
      from: "no-reply@learnhub.test",
      fetch,
    });

    await expect(
      provider.send({
        to: "learner@example.com",
        subject: "Subject",
        html: "<p>Hello</p>",
        text: "Hello",
      }),
    ).rejects.toThrow("Email API request failed with status 400");
  });
});
