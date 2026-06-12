import { describe, expect, it, vi } from "vitest";

import { ConsoleEmailProvider, createEmailProvider } from "./email-provider";

describe("email providers", () => {
  it("redacts token-bearing URLs when logging console email", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const provider = new ConsoleEmailProvider();

    try {
      await provider.send({
        to: "learner@acme.test",
        subject: "Reset your password",
        html: '<a href="http://localhost:3000/reset-password/raw-token">reset</a>',
        text: "Reset: http://localhost:3000/reset-password/raw-token",
      });

      expect(info).toHaveBeenCalledWith("Console email provider message", {
        to: "learner@acme.test",
        subject: "Reset your password",
        html: "[redacted]",
        text: "[redacted]",
      });
    } finally {
      info.mockRestore();
    }
  });

  it("does not allow console email in production", () => {
    expect(() => createEmailProvider({ emailProvider: "console", nodeEnv: "production" })).toThrow(
      "Console email provider cannot be used in production",
    );
  });

  it("allows SMTP email in production when configured", async () => {
    const client = {
      send: vi.fn(async () => ({ providerMessageId: "smtp-123" })),
    };
    const provider = createEmailProvider({
      emailProvider: "smtp",
      nodeEnv: "production",
      smtp: {
        host: "smtp.learnhub.test",
        port: 587,
        from: "no-reply@learnhub.test",
        client,
      },
    });

    await expect(
      provider.send({
        to: "learner@acme.test",
        subject: "Reset",
        html: "html",
        text: "text",
      }),
    ).resolves.toEqual({ providerMessageId: "smtp-123" });
  });

  it("allows API email in production when configured", async () => {
    const fetch = vi.fn(async () => Response.json({ providerMessageId: "api-123" }));
    const provider = createEmailProvider({
      emailProvider: "api-provider",
      nodeEnv: "production",
      api: {
        endpoint: "https://email-api.learnhub.test/send",
        token: "api-token",
        from: "no-reply@learnhub.test",
        fetch,
      },
    });

    await expect(
      provider.send({
        to: "learner@acme.test",
        subject: "Reset",
        html: "html",
        text: "text",
      }),
    ).resolves.toEqual({ providerMessageId: "api-123" });
  });

  it("fails clearly when configured providers are missing settings", () => {
    expect(() => createEmailProvider({ emailProvider: "smtp", nodeEnv: "production" })).toThrow(
      "SMTP email provider requires SMTP host and from address",
    );
    expect(() => createEmailProvider({ emailProvider: "api-provider", nodeEnv: "production" })).toThrow(
      "API email provider requires endpoint, token, and from address",
    );
  });
});
