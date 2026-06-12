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
    const { prisma } = await import("@/lib/prisma");

    await validateUploadPurpose({ organizationId, body, prisma });

    const key = buildUploadKey(organizationId, body);
    const provider = createR2ObjectStorageProvider(requiredR2Config());
    const uploadUrl = await provider.getSignedWriteUrl({ key, contentType });

    return Response.json({ key, uploadUrl });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to create storage upload" }, { status: 400 });
  }
}

type StorageUploadPrisma = {
  course: {
    findFirst(input: {
      where: { id: string; organizationId: string; type: "SCORM_1_2" };
      select: { id: true };
    }): Promise<{ id: string } | null>;
  };
  videoLesson: {
    findFirst(input: {
      where: { id: string; organizationId: string; courseId: string };
      select: { id: true };
    }): Promise<{ id: string } | null>;
  };
  certificate: {
    findFirst(input: {
      where: { id: string; organizationId: string };
      select: { id: true };
    }): Promise<{ id: string } | null>;
  };
};

async function validateUploadPurpose(input: {
  organizationId: string;
  body: StorageUploadRequest;
  prisma: StorageUploadPrisma;
}): Promise<void> {
  switch (input.body.purpose) {
    case "organization_logo":
    case "csv_export":
      return;
    case "video_transcript":
      await validateVideoTranscriptUpload(input);
      return;
    case "certificate":
      await validateCertificateUpload(input);
      return;
    case "scorm_zip":
      await validateScormZipUpload(input);
      return;
    default:
      throw new Error("Unsupported storage upload purpose");
  }
}

async function validateVideoTranscriptUpload(input: {
  organizationId: string;
  body: StorageUploadRequest;
  prisma: StorageUploadPrisma;
}): Promise<void> {
  const courseId = required(input.body.courseId, "courseId is required");
  const lessonId = required(input.body.lessonId, "lessonId is required");
  const lesson = await input.prisma.videoLesson.findFirst({
    where: {
      id: lessonId,
      organizationId: input.organizationId,
      courseId,
    },
    select: { id: true },
  });

  if (!lesson) {
    throw new Error("Video lesson not found");
  }
}

async function validateCertificateUpload(input: {
  organizationId: string;
  body: StorageUploadRequest;
  prisma: StorageUploadPrisma;
}): Promise<void> {
  const certificateId = required(input.body.certificateId, "certificateId is required");
  const certificate = await input.prisma.certificate.findFirst({
    where: {
      id: certificateId,
      organizationId: input.organizationId,
    },
    select: { id: true },
  });

  if (!certificate) {
    throw new Error("Certificate not found");
  }
}

async function validateScormZipUpload(input: {
  organizationId: string;
  body: StorageUploadRequest;
  prisma: StorageUploadPrisma;
}): Promise<void> {
  const courseId = required(input.body.courseId, "courseId is required");
  const packageId = required(input.body.packageId, "packageId is required");

  if (packageId !== `pkg_${courseId}`) {
    throw new Error("packageId must match the SCORM course package id");
  }

  const course = await input.prisma.course.findFirst({
    where: {
      id: courseId,
      organizationId: input.organizationId,
      type: "SCORM_1_2",
    },
    select: { id: true },
  });

  if (!course) {
    throw new Error("SCORM course not found");
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
