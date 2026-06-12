import { getEnv } from "@/lib/env";
import { createR2ObjectStorageProvider } from "@/modules/providers/storage/r2-object-storage-provider";
import { createPassThroughMalwareScanner } from "@/modules/scorm/scorm-extraction";
import {
  processNextScormExtractionJob,
  type ScormPackageJobStorage,
} from "@/modules/scorm/scorm-package-jobs";
import { createPrismaScormRepository } from "@/modules/scorm/prisma-repository";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  const env = getEnv();

  if (env.SCORM_EXTRACTION_JOB_SECRET && request.headers.get("x-learnhub-job-secret") !== env.SCORM_EXTRACTION_JOB_SECRET) {
    return Response.json({ error: "Not allowed to run SCORM extraction jobs" }, { status: 403 });
  }

  try {
    const { prisma } = await import("@/lib/prisma");
    const repository = createPrismaScormRepository(prisma);
    const storage = createJobStorage(requiredR2Config(env));
    const scanner = createPassThroughMalwareScanner("passed");
    const limit = boundedLimit(new URL(request.url).searchParams.get("limit"));
    const summary = {
      processed: 0,
      blocked: 0,
      failed: 0,
      skipped: 0,
    };

    for (let index = 0; index < limit; index += 1) {
      const result = await processNextScormExtractionJob({ repository, storage, scanner });
      summary[result.status] += 1;

      if (result.status === "skipped") {
        break;
      }
    }

    return Response.json(summary);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "SCORM extraction job failed" }, { status: 500 });
  }
}

function createJobStorage(config: ReturnType<typeof requiredR2Config>): ScormPackageJobStorage {
  const provider = createR2ObjectStorageProvider(config);

  return {
    async getObjectBytes(key) {
      const response = await fetch(await provider.getSignedReadUrl(key));

      if (!response.ok) {
        throw new Error(`SCORM package read failed with status ${response.status}`);
      }

      return new Uint8Array(await response.arrayBuffer());
    },
    putObject(input) {
      return provider.putObject(input);
    },
  };
}

function requiredR2Config(env: ReturnType<typeof getEnv>) {
  return {
    accountId: required(env.R2_ACCOUNT_ID, "R2_ACCOUNT_ID is required"),
    accessKeyId: required(env.R2_ACCESS_KEY_ID, "R2_ACCESS_KEY_ID is required"),
    secretAccessKey: required(env.R2_SECRET_ACCESS_KEY, "R2_SECRET_ACCESS_KEY is required"),
    bucketName: required(env.R2_BUCKET_NAME, "R2_BUCKET_NAME is required"),
  };
}

function required(value: string | undefined, message: string): string {
  if (!value?.trim()) {
    throw new Error(message);
  }

  return value.trim();
}

function boundedLimit(value: string | null): number {
  const parsed = Number(value ?? 5);

  if (!Number.isInteger(parsed) || parsed < 1) {
    return 5;
  }

  return Math.min(parsed, 10);
}
