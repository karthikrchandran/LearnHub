export type IssueCredentialInput = {
  organizationId: string;
  courseId: string;
  learnerEmail: string;
  learnerName: string;
  issuedAt: Date;
  providerTemplateId: string;
};

export type IssueCredentialResult = {
  providerCredentialId: string;
  providerUrl?: string;
};

export interface CredentialProvider {
  issueCredential(input: IssueCredentialInput): Promise<IssueCredentialResult>;
}
