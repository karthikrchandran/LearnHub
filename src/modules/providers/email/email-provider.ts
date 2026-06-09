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

export class ConsoleEmailProvider implements EmailProvider {
  async send(message: EmailMessage): Promise<EmailSendResult> {
    console.info("Console email provider message", message);

    return {
      providerMessageId: `console-${Date.now()}`,
    };
  }
}
