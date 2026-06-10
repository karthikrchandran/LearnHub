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

  it("fails explicitly for configured providers that are not wired yet", async () => {
    const provider = createEmailProvider({ emailProvider: "smtp", nodeEnv: "production" });

    await expect(
      provider.send({
        to: "learner@acme.test",
        subject: "Reset",
        html: "html",
        text: "text",
      }),
    ).rejects.toThrow("SMTP email provider is not configured yet");
  });
});
