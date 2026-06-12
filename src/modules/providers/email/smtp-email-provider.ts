import net from "node:net";
import tls from "node:tls";

import type { EmailMessage, EmailProvider, EmailSendResult } from "./email-provider";

export type SmtpSendInput = {
  host: string;
  port: number;
  secure?: boolean;
  auth?: {
    username: string;
    password: string;
  };
  from: string;
  to: string;
  subject: string;
  html: string;
  text: string;
  timeoutMs: number;
};

export interface SmtpClient {
  send(input: SmtpSendInput): Promise<EmailSendResult>;
}

export type SmtpEmailProviderConfig = {
  host: string;
  port: number;
  username?: string;
  password?: string;
  from: string;
  secure?: boolean;
  client?: SmtpClient;
  timeoutMs?: number;
};

export class SmtpEmailProvider implements EmailProvider {
  private readonly client: SmtpClient;
  private readonly timeoutMs: number;

  constructor(private readonly config: SmtpEmailProviderConfig) {
    this.client = config.client ?? new NodeSmtpClient();
    this.timeoutMs = config.timeoutMs ?? 10_000;
  }

  send(message: EmailMessage): Promise<EmailSendResult> {
    return withTimeout(
      this.client.send({
        host: this.config.host,
        port: this.config.port,
        secure: this.config.secure ?? false,
        auth:
          this.config.username && this.config.password
            ? {
                username: this.config.username,
                password: this.config.password,
              }
            : undefined,
        from: this.config.from,
        to: message.to,
        subject: message.subject,
        html: message.html,
        text: message.text,
        timeoutMs: this.timeoutMs,
      }),
      this.timeoutMs,
      "SMTP send",
    );
  }
}

class NodeSmtpClient implements SmtpClient {
  async send(input: SmtpSendInput): Promise<EmailSendResult> {
    const socket = await connect(input);
    const session = new SmtpSession(socket);

    try {
      await session.expect(220);
      await session.command("EHLO learnhub.local", 250);

      if (input.auth) {
        await session.command("AUTH LOGIN", 334);
        await session.command(Buffer.from(input.auth.username).toString("base64"), 334);
        await session.command(Buffer.from(input.auth.password).toString("base64"), 235);
      }

      await session.command(`MAIL FROM:<${addressOnly(input.from)}>`, 250);
      await session.command(`RCPT TO:<${addressOnly(input.to)}>`, [250, 251]);
      await session.command("DATA", 354);
      await session.writeData(buildMimeMessage(input));
      await session.expect(250);
      await session.command("QUIT", 221);

      return { providerMessageId: `smtp-${Date.now()}` };
    } finally {
      socket.end();
    }
  }
}

class SmtpSession {
  constructor(private readonly socket: net.Socket | tls.TLSSocket) {}

  async command(command: string, expected: number | number[]): Promise<string> {
    this.socket.write(`${command}\r\n`);

    return this.expect(expected);
  }

  async writeData(data: string): Promise<void> {
    this.socket.write(`${data.replace(/\r?\n\./g, "\r\n..")}\r\n.\r\n`);
  }

  async expect(expected: number | number[]): Promise<string> {
    const expectedCodes = Array.isArray(expected) ? expected : [expected];
    const response = await this.readResponse();
    const code = Number(response.slice(0, 3));

    if (!expectedCodes.includes(code)) {
      throw new Error(`SMTP command failed with response: ${response.trim()}`);
    }

    return response;
  }

  private readResponse(): Promise<string> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      const onData = (chunk: Buffer) => {
        chunks.push(chunk);
        const response = Buffer.concat(chunks).toString("utf8");

        if (/^\d{3} /m.test(response)) {
          cleanup();
          resolve(response);
        }
      };
      const onError = (error: Error) => {
        cleanup();
        reject(error);
      };
      const cleanup = () => {
        this.socket.off("data", onData);
        this.socket.off("error", onError);
      };

      this.socket.on("data", onData);
      this.socket.on("error", onError);
    });
  }
}

function connect(input: SmtpSendInput): Promise<net.Socket | tls.TLSSocket> {
  return new Promise((resolve, reject) => {
    const socket = input.secure
      ? tls.connect({ port: input.port, host: input.host }, () => resolve(socket))
      : net.connect(input.port, input.host, () => resolve(socket));

    socket.setTimeout(input.timeoutMs, () => {
      socket.destroy(new Error(`SMTP send timed out after ${input.timeoutMs}ms`));
    });
    socket.once("error", reject);
  });
}

function buildMimeMessage(input: SmtpSendInput): string {
  const boundary = `learnhub-${Date.now()}`;

  return [
    `From: ${input.from}`,
    `To: ${input.to}`,
    `Subject: ${input.subject}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    'Content-Type: text/plain; charset="utf-8"',
    "",
    input.text,
    `--${boundary}`,
    'Content-Type: text/html; charset="utf-8"',
    "",
    input.html,
    `--${boundary}--`,
  ].join("\r\n");
}

function addressOnly(value: string): string {
  const match = /<([^>]+)>/.exec(value);

  return match?.[1] ?? value;
}

function withTimeout<T>(operation: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;

  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => {
      reject(new Error(`${label} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  return Promise.race([operation, timeoutPromise]).finally(() => {
    if (timeout) {
      clearTimeout(timeout);
    }
  });
}
