import { formatCsv } from "./csv";

export type CertificateCredentialReportRow = {
  certificateUrl: string;
  issuedAt: Date;
  learnerName: string;
  learnerEmail: string;
  courseTitle: string;
  credentialProvider: string | null;
  credentialStatus: string | null;
  providerCredentialId: string | null;
  providerUrl: string | null;
  failureMessage: string | null;
};

export function formatCertificateCredentialReportCsv(rows: CertificateCredentialReportRow[]): string {
  return formatCsv([
    [
      "Learner Name",
      "Learner Email",
      "Course Title",
      "Certificate URL",
      "Issued At",
      "Credential Provider",
      "Credential Status",
      "Provider Credential ID",
      "Provider URL",
      "Failure Message",
    ],
    ...rows.map((row) => [
      row.learnerName,
      row.learnerEmail,
      row.courseTitle,
      row.certificateUrl,
      row.issuedAt.toISOString(),
      row.credentialProvider ?? "",
      row.credentialStatus ?? "",
      row.providerCredentialId ?? "",
      row.providerUrl ?? "",
      row.failureMessage ?? "",
    ]),
  ]);
}
