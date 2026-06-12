-- Add course-level credential mapping.
ALTER TABLE "Course"
  ADD COLUMN "credentialProvider" "CredentialProviderName",
  ADD COLUMN "credentialTemplateId" TEXT;

-- Store issuer branding and generated artifact metadata on certificates so
-- public verification and downloads render from stable certificate data.
ALTER TABLE "Certificate"
  ADD COLUMN "issuerName" TEXT NOT NULL DEFAULT 'LearnHub',
  ADD COLUMN "issuerLogoUrl" TEXT,
  ADD COLUMN "issuerPrimaryColor" TEXT NOT NULL DEFAULT '#2563eb',
  ADD COLUMN "issuerAccentColor" TEXT NOT NULL DEFAULT '#14b8a6',
  ADD COLUMN "artifactStorageKey" TEXT,
  ADD COLUMN "artifactContentType" TEXT NOT NULL DEFAULT 'text/html';

-- Keep one operational credential state per tenant/certificate/provider.
ALTER TABLE "CredentialIssuance"
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE UNIQUE INDEX "CredentialIssuance_organizationId_certificateId_provider_key"
  ON "CredentialIssuance"("organizationId", "certificateId", "provider");
