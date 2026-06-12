import type { CredentialProvider } from "../providers/credentials/credential-provider";
import type { CertificateNotificationScheduleInput, NotificationEnqueueFailureInput } from "../notifications/notification-jobs";

export type CertificateAssignment = {
  id: string;
  organizationId: string;
  courseId: string;
  membershipId: string;
  userId: string;
  learnerName: string;
  learnerEmail: string;
  courseTitle: string;
  issuerName: string;
  issuerLogoUrl: string | null;
  issuerPrimaryColor: string;
  issuerAccentColor: string;
  credentialProvider: "CREDLY" | null;
  credentialTemplateId: string | null;
  status: "ASSIGNED" | "IN_PROGRESS" | "COMPLETED" | "OVERDUE";
};

export type CertificateRecord = {
  id: string;
  verificationCode: string;
  verificationUrl: string;
  issuedAt: Date;
};

export type CreateCertificateInput = {
  organizationId: string;
  assignmentId: string;
  courseId: string;
  membershipId: string;
  userId: string;
  learnerName: string;
  learnerEmail: string;
  courseTitle: string;
  issuerName: string;
  issuerLogoUrl: string | null;
  issuerPrimaryColor: string;
  issuerAccentColor: string;
  verificationCode: string;
  verificationUrl: string;
  issuedAt: Date;
};

export interface CertificateRepository {
  findAssignmentForCertificate(input: {
    organizationId: string;
    assignmentId: string;
  }): Promise<CertificateAssignment | null>;
  findCertificateByAssignment(input: {
    organizationId: string;
    assignmentId: string;
  }): Promise<CertificateRecord | null>;
  createCertificate(input: CreateCertificateInput): Promise<CertificateRecord>;
  recordCredentialIssuance?(input: {
    organizationId: string;
    certificateId: string;
    provider: "CREDLY";
    status: "SUCCEEDED" | "FAILED";
    providerCredentialId?: string;
    providerUrl?: string;
    errorMessage?: string;
    attemptedAt?: Date;
  }): Promise<void>;
  recordNotificationEnqueueFailure?(input: NotificationEnqueueFailureInput): Promise<void>;
}

export type IssueCertificateInput = {
  organizationId: string;
  assignmentId: string;
  appBaseUrl: string;
  now: Date;
  credentialProvider?: CredentialProvider;
  credentialProviderTemplateId?: string;
};

export type CertificateNotificationScheduler = {
  scheduleCertificateNotification(input: CertificateNotificationScheduleInput): Promise<void> | void;
};

const VERIFICATION_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function createVerificationCode(): string {
  return Array.from({ length: 16 }, () => {
    const index = Math.floor(Math.random() * VERIFICATION_ALPHABET.length);
    return VERIFICATION_ALPHABET[index];
  }).join("");
}

function buildVerificationUrl(appBaseUrl: string, verificationCode: string): string {
  return `${appBaseUrl.replace(/\/+$/, "")}/certificates/${verificationCode}`;
}

export async function issueCertificateForCompletedAssignment(
  input: IssueCertificateInput,
  repository: CertificateRepository,
  notifications?: CertificateNotificationScheduler,
): Promise<CertificateRecord> {
  const assignment = await repository.findAssignmentForCertificate({
    organizationId: input.organizationId,
    assignmentId: input.assignmentId,
  });

  if (!assignment) {
    throw new Error("Assignment was not found");
  }

  if (assignment.status !== "COMPLETED") {
    throw new Error("Assignment is not completed");
  }

  const existingCertificate = await repository.findCertificateByAssignment({
    organizationId: input.organizationId,
    assignmentId: input.assignmentId,
  });

  if (existingCertificate) {
    return existingCertificate;
  }

  const verificationCode = createVerificationCode();
  const certificate = await repository.createCertificate({
    organizationId: assignment.organizationId,
    assignmentId: assignment.id,
    courseId: assignment.courseId,
    membershipId: assignment.membershipId,
    userId: assignment.userId,
    learnerName: assignment.learnerName,
    learnerEmail: assignment.learnerEmail,
    courseTitle: assignment.courseTitle,
    issuerName: assignment.issuerName,
    issuerLogoUrl: assignment.issuerLogoUrl,
    issuerPrimaryColor: assignment.issuerPrimaryColor,
    issuerAccentColor: assignment.issuerAccentColor,
    verificationCode,
    verificationUrl: buildVerificationUrl(input.appBaseUrl, verificationCode),
    issuedAt: input.now,
  });

  if (notifications) {
    const notificationInput = {
      organizationId: assignment.organizationId,
      assignmentId: assignment.id,
      certificateId: certificate.id,
      learnerEmail: assignment.learnerEmail,
      learnerName: assignment.learnerName,
      courseTitle: assignment.courseTitle,
      certificateUrl: certificate.verificationUrl,
      now: input.now,
    };

    try {
      await notifications.scheduleCertificateNotification(notificationInput);
    } catch (error) {
      await recordNotificationEnqueueFailure(repository, {
        organizationId: assignment.organizationId,
        assignmentId: assignment.id,
        certificateId: certificate.id,
        operation: "CERTIFICATE_NOTIFICATION",
        payload: notificationInput,
        lastError: error instanceof Error ? error.message : "Notification enqueue failed",
        failedAt: input.now,
        retryAt: addMinutes(input.now, 5),
      });
      console.error("Notification enqueue failed after certificate commit", {
        organizationId: assignment.organizationId,
        assignmentId: assignment.id,
        certificateId: certificate.id,
        error: error instanceof Error ? error.message : "Notification enqueue failed",
      });
    }
  }

  const credentialProviderTemplateId = input.credentialProviderTemplateId ?? assignment.credentialTemplateId ?? undefined;

  if (
    input.credentialProvider &&
    assignment.credentialProvider === "CREDLY" &&
    credentialProviderTemplateId &&
    repository.recordCredentialIssuance
  ) {
    try {
      const result = await input.credentialProvider.issueCredential({
        organizationId: assignment.organizationId,
        courseId: assignment.courseId,
        learnerEmail: assignment.learnerEmail,
        learnerName: assignment.learnerName,
        issuedAt: input.now,
        providerTemplateId: credentialProviderTemplateId,
      });

      await repository.recordCredentialIssuance({
        organizationId: assignment.organizationId,
        certificateId: certificate.id,
        provider: "CREDLY",
        status: "SUCCEEDED",
        providerCredentialId: result.providerCredentialId,
        providerUrl: result.providerUrl,
        attemptedAt: input.now,
      });
    } catch (error) {
      await repository.recordCredentialIssuance({
        organizationId: assignment.organizationId,
        certificateId: certificate.id,
        provider: "CREDLY",
        status: "FAILED",
        errorMessage: error instanceof Error ? error.message : "Credential provider failed",
        attemptedAt: input.now,
      });
    }
  }

  return certificate;
}

async function recordNotificationEnqueueFailure(
  repository: CertificateRepository,
  failure: NotificationEnqueueFailureInput,
): Promise<void> {
  if (!repository.recordNotificationEnqueueFailure) {
    return;
  }

  try {
    await repository.recordNotificationEnqueueFailure(failure);
  } catch (error) {
    console.error("Notification enqueue failure persistence failed", {
      organizationId: failure.organizationId,
      assignmentId: failure.assignmentId,
      certificateId: failure.certificateId ?? null,
      error: error instanceof Error ? error.message : "Notification enqueue failure persistence failed",
    });
  }
}

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}
