import type { EmailMessage, EmailProvider, EmailSendResult } from "./email-provider";

export type ApiEmailProviderConfig = {
  endpoint: string;
  token: string;
  from: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
};

export class ApiEmailProvider implements EmailProvider {
  private readonly fetcher: typeof fetch;

  constructor(private readonly config: ApiEmailProviderConfig) {
    this.fetcher = config.fetch ?? fetch;
  }

  async send(message: EmailMessage): Promise<EmailSendResult> {
    const timeoutMs = this.config.timeoutMs ?? 10_000;
    const controller = new AbortController();
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
    let response: Response;

    try {
      response = await this.fetcher(this.config.endpoint, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${this.config.token}`,
          "Content-Type": "application/json",
        },
        signal: controller.signal,
        body: JSON.stringify({
          from: this.config.from,
          to: message.to,
          subject: message.subject,
          html: message.html,
          text: message.text,
        }),
      });
    } catch (error) {
      if (timedOut || isAbortError(error)) {
        throw new Error(`Email API request timed out after ${timeoutMs}ms`);
      }

      throw error;
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      throw new Error(`Email API request failed with status ${response.status}`);
    }

    return {
      providerMessageId: await readProviderMessageId(response),
    };
  }
}

async function readProviderMessageId(response: Response): Promise<string> {
  const body = await response.json().catch(() => null);

  if (isRecord(body)) {
    for (const key of ["providerMessageId", "messageId", "id"]) {
      const value = body[key];

      if (typeof value === "string" && value.trim().length > 0) {
        return value;
      }
    }
  }

  return response.headers.get("x-message-id") ?? `api-${Date.now()}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}
