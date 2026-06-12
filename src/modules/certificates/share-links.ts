export type CertificateShareInput = {
  verificationUrl: string;
  courseTitle: string;
  learnerName: string;
};

export type CertificateShareLinks = {
  linkedInUrl: string;
  emailUrl: string;
  copyUrl: string;
};

export function buildCertificateShareLinks(input: CertificateShareInput): CertificateShareLinks {
  const linkedInParams = new URLSearchParams({
    startTask: "CERTIFICATION_NAME",
    name: input.courseTitle,
    organizationName: "LearnHub",
    certUrl: input.verificationUrl,
  });
  const subject = `LearnHub certificate: ${input.courseTitle}`;
  const body = `${input.learnerName} earned a certificate for ${input.courseTitle}.\n\nVerify it at ${input.verificationUrl}`;

  return {
    linkedInUrl: `https://www.linkedin.com/profile/add?${linkedInParams.toString()}`,
    emailUrl: `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`,
    copyUrl: input.verificationUrl,
  };
}
