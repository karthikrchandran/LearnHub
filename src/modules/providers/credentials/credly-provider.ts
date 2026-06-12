import type { CredentialProvider, IssueCredentialInput, IssueCredentialResult } from "./credential-provider";

export type CredlyCredentialProviderConfig = {
  baseUrl: string;
  apiToken: string;
  organizationId: string;
  fetch?: typeof fetch;
};

export type OptionalCredlyCredentialProviderConfig = {
  baseUrl?: string | null;
  apiToken?: string | null;
  organizationId?: string | null;
  fetch?: typeof fetch;
};

export class CredlyCredentialProvider implements CredentialProvider {
  private readonly fetcher: typeof fetch;

  constructor(private readonly config: CredlyCredentialProviderConfig) {
    this.fetcher = config.fetch ?? fetch;
  }

  async issueCredential(input: IssueCredentialInput): Promise<IssueCredentialResult> {
    const response = await this.fetcher(
      `${this.config.baseUrl.replace(/\/+$/, "")}/v1/organizations/${encodeURIComponent(this.config.organizationId)}/badges`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.config.apiToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          badge_template_id: input.providerTemplateId,
          recipient_email: input.learnerEmail,
          issued_to: input.learnerName,
          issued_at: input.issuedAt.toISOString(),
          evidence: [
            {
              type: "LearnHubCourse",
              organization_id: input.organizationId,
              course_id: input.courseId,
            },
          ],
        }),
      },
    );

    if (!response.ok) {
      throw new Error(`Credly credential request failed with status ${response.status}`);
    }

    return readCredentialResult(await response.json().catch(() => null));
  }
}

export function createConfiguredCredlyCredentialProvider(
  config: OptionalCredlyCredentialProviderConfig,
): CredlyCredentialProvider | null {
  if (!config.apiToken?.trim() || !config.organizationId?.trim()) {
    return null;
  }

  return new CredlyCredentialProvider({
    baseUrl: config.baseUrl?.trim() || "https://api.credly.com",
    apiToken: config.apiToken,
    organizationId: config.organizationId,
    fetch: config.fetch,
  });
}

function readCredentialResult(body: unknown): IssueCredentialResult {
  if (!isRecord(body)) {
    throw new Error("Credly credential response was invalid");
  }

  const providerCredentialId = firstString(body, ["id", "providerCredentialId", "badge_id"]);

  if (!providerCredentialId) {
    throw new Error("Credly credential response did not include an id");
  }

  return {
    providerCredentialId,
    providerUrl: firstString(body, ["badge_url", "providerUrl", "url"]),
  };
}

function firstString(body: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = body[key];

    if (typeof value === "string" && value.trim().length > 0) {
      return value;
    }
  }

  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
