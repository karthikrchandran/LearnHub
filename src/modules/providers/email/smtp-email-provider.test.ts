import { describe, expect, it, vi } from "vitest";

import { SmtpEmailProvider, type SmtpClient } from "./smtp-email-provider";

describe("SMTP email provider", () => {
  it("sends email through configured SMTP settings", async () => {
    const client: SmtpClient = {
      send: vi.fn(async () => ({ providerMessageId: "smtp-123" })),
    };
    const provider = new SmtpEmailProvider({
      host: "smtp.learnhub.test",
      port: 587,
      username: "smtp-user",
      password: "smtp-password",
      from: "LearnHub <no-reply@learnhub.test>",
      secure: false,
      client,
    });

    const result = await provider.send({
      to: "learner@example.com",
      subject: "Subject",
      html: "<p>Hello</p>",
      text: "Hello",
    });

    expect(result).toEqual({ providerMessageId: "smtp-123" });
    expect(client.send).toHaveBeenCalledWith({
      host: "smtp.learnhub.test",
      port: 587,
      secure: false,
      auth: {
        username: "smtp-user",
        password: "smtp-password",
      },
      from: "LearnHub <no-reply@learnhub.test>",
      to: "learner@example.com",
      subject: "Subject",
      html: "<p>Hello</p>",
      text: "Hello",
    });
  });

  it("omits SMTP auth when credentials are not configured", async () => {
    const client: SmtpClient = {
      send: vi.fn(async () => ({ providerMessageId: "smtp-123" })),
    };
    const provider = new SmtpEmailProvider({
      host: "smtp.learnhub.test",
      port: 25,
      from: "no-reply@learnhub.test",
      client,
    });

    await provider.send({
      to: "learner@example.com",
      subject: "Subject",
      html: "<p>Hello</p>",
      text: "Hello",
    });

    expect(client.send).toHaveBeenCalledWith(expect.objectContaining({ auth: undefined }));
  });
});
