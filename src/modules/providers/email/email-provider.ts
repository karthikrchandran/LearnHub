import { ApiEmailProvider, type ApiEmailProviderConfig } from "./api-email-provider";
import { SmtpEmailProvider, type SmtpEmailProviderConfig } from "./smtp-email-provider";

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

export type EmailProviderEnv = {
  EMAIL_PROVIDER: EmailProviderName;
  EMAIL_FROM?: string;
  SMTP_HOST?: string;
  SMTP_PORT?: number;
  SMTP_USER?: string;
  SMTP_PASSWORD?: string;
  SMTP_SECURE?: boolean;
  EMAIL_API_ENDPOINT?: string;
  EMAIL_API_TOKEN?: string;
};

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

export function createEmailProvider(input: {
  emailProvider: EmailProviderName;
  nodeEnv?: string;
  smtp?: SmtpEmailProviderConfig;
  api?: ApiEmailProviderConfig;
}): EmailProvider {
  if (input.emailProvider === "console") {
    if (input.nodeEnv === "production") {
      throw new Error("Console email provider cannot be used in production");
    }

    return new ConsoleEmailProvider();
  }

  if (input.emailProvider === "smtp") {
    if (!input.smtp?.host || !input.smtp.from) {
      throw new Error("SMTP email provider requires SMTP host and from address");
    }

    return new SmtpEmailProvider(input.smtp);
  }

  if (!input.api?.endpoint || !input.api.token || !input.api.from) {
    throw new Error("API email provider requires endpoint, token, and from address");
  }

  return new ApiEmailProvider(input.api);
}

export function createEmailProviderFromEnv(env: EmailProviderEnv, nodeEnv?: string): EmailProvider {
  return createEmailProvider({
    emailProvider: env.EMAIL_PROVIDER,
    nodeEnv,
    smtp: {
      host: env.SMTP_HOST ?? "",
      port: env.SMTP_PORT ?? 587,
      username: env.SMTP_USER,
      password: env.SMTP_PASSWORD,
      secure: env.SMTP_SECURE,
      from: env.EMAIL_FROM ?? "",
    },
    api: {
      endpoint: env.EMAIL_API_ENDPOINT ?? "",
      token: env.EMAIL_API_TOKEN ?? "",
      from: env.EMAIL_FROM ?? "",
    },
  });
}
