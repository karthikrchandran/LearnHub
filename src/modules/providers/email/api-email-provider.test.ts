import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiEmailProvider } from "./api-email-provider";

describe("API email provider", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

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
      signal: expect.any(AbortSignal),
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

  it("aborts API email requests after the configured timeout", async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    const fetch = vi.fn((_url: string | URL | Request, init?: RequestInit) => {
      signal = init?.signal ?? undefined;

      return new Promise<Response>((_resolve, reject) => {
        signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
      });
    });
    const provider = new ApiEmailProvider({
      endpoint: "https://email-api.learnhub.test/send",
      token: "secret-token",
      from: "no-reply@learnhub.test",
      timeoutMs: 1_000,
      fetch,
    });

    const send = provider.send({
      to: "learner@example.com",
      subject: "Subject",
      html: "<p>Hello</p>",
      text: "Hello",
    });
    const expectation = expect(send).rejects.toThrow("Email API request timed out after 1000ms");

    expect(signal).toBeInstanceOf(AbortSignal);
    await vi.advanceTimersByTimeAsync(1_000);
    await expectation;
  });
});
