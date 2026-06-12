CREATE TYPE "OrganizationStatus" AS ENUM ('ACTIVE', 'INACTIVE');

ALTER TABLE "Organization"
ADD COLUMN "status" "OrganizationStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN "allowAdminBranding" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "Organization_status_idx" ON "Organization"("status");
