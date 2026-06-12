import { requireOrganizationUsersAdminBySlug } from "@/lib/auth/guards";
import { getEnv } from "@/lib/env";
import { createR2ObjectStorageProvider } from "@/modules/providers/storage/r2-object-storage-provider";
import {
  certificateArtifactKey,
  csvExportKey,
  organizationLogoKey,
  scormZipKey,
  videoTranscriptKey,
} from "@/modules/storage/storage-keys";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type StorageUploadRouteContext = {
  params: Promise<{
    slug: string;
  }>;
};

type StorageUploadRequest = {
  purpose?: string;
  fileName?: string;
  contentType?: string;
  courseId?: string;
  lessonId?: string;
  packageId?: string;
  certificateId?: string;
  reportName?: string;
  exportId?: string;
};

export async function POST(request: Request, { params }: StorageUploadRouteContext): Promise<Response> {
  try {
    const { slug } = await params;
    const { organizationId } = await requireOrganizationUsersAdminBySlug(slug);
    const body = (await request.json()) as StorageUploadRequest;
    const contentType = required(body.contentType, "contentType is required");
    const key = buildUploadKey(organizationId, body);
    const provider = createR2ObjectStorageProvider(requiredR2Config());
    const uploadUrl = await provider.getSignedWriteUrl({ key, contentType });

    return Response.json({ key, uploadUrl });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to create storage upload" }, { status: 400 });
  }
}

function buildUploadKey(organizationId: string, body: StorageUploadRequest): string {
  const fileName = required(body.fileName, "fileName is required");

  switch (body.purpose) {
    case "organization_logo":
      return organizationLogoKey({ organizationId, fileName });
    case "video_transcript":
      return videoTranscriptKey({
        organizationId,
        courseId: required(body.courseId, "courseId is required"),
        lessonId: required(body.lessonId, "lessonId is required"),
        fileName,
      });
    case "certificate":
      return certificateArtifactKey({
        organizationId,
        certificateId: required(body.certificateId, "certificateId is required"),
        fileName,
      });
    case "scorm_zip":
      return scormZipKey({
        organizationId,
        courseId: required(body.courseId, "courseId is required"),
        packageId: required(body.packageId, "packageId is required"),
        fileName,
      });
    case "csv_export":
      return csvExportKey({
        organizationId,
        reportName: required(body.reportName, "reportName is required"),
        exportId: required(body.exportId, "exportId is required"),
        fileName,
      });
    default:
      throw new Error("Unsupported storage upload purpose");
  }
}

function required(value: string | undefined, message: string): string {
  if (!value?.trim()) {
    throw new Error(message);
  }

  return value.trim();
}

function requiredR2Config() {
  const env = getEnv();

  return {
    accountId: required(env.R2_ACCOUNT_ID, "R2_ACCOUNT_ID is required"),
    accessKeyId: required(env.R2_ACCESS_KEY_ID, "R2_ACCESS_KEY_ID is required"),
    secretAccessKey: required(env.R2_SECRET_ACCESS_KEY, "R2_SECRET_ACCESS_KEY is required"),
    bucketName: required(env.R2_BUCKET_NAME, "R2_BUCKET_NAME is required"),
  };
}
