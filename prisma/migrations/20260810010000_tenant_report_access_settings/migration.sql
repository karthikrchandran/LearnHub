-- Add tenant-level report access controls.
ALTER TABLE "Organization"
  ADD COLUMN "allowManagerReports" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "allowUserReports" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "allowCsvExports" BOOLEAN NOT NULL DEFAULT true;
