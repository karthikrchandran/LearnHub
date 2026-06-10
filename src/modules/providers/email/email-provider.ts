export type EmailMessage = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

export type EmailSendResult = {
  providerMessageId: string;
};

export interface EmailProvider {
  send(message: EmailMessage): Promise<EmailSendResult>;
}

export type EmailProviderName = "console" | "smtp" | "api-provider";

export class ConsoleEmailProvider implements EmailProvider {
  async send(message: EmailMessage): Promise<EmailSendResult> {
    console.info("Console email provider message", {
      to: message.to,
      subject: message.subject,
      html: "[redacted]",
      text: "[redacted]",
    });

    return {
      providerMessageId: `console-${Date.now()}`,
    };
  }
}

class UnconfiguredEmailProvider implements EmailProvider {
  constructor(private readonly message: string) {}

  async send(): Promise<EmailSendResult> {
    throw new Error(this.message);
  }
}

export function createEmailProvider(input: { emailProvider: EmailProviderName; nodeEnv?: string }): EmailProvider {
  if (input.emailProvider === "console") {
    if (input.nodeEnv === "production") {
      throw new Error("Console email provider cannot be used in production");
    }

    return new ConsoleEmailProvider();
  }

  if (input.emailProvider === "smtp") {
    return new UnconfiguredEmailProvider("SMTP email provider is not configured yet");
  }

  return new UnconfiguredEmailProvider("API email provider is not configured yet");
}
