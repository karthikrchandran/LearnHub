import { requireOrganizationMemberBySlug } from "@/lib/auth/guards";
import { env } from "@/lib/env";
import { issueCertificateForCompletedAssignment } from "@/modules/certificates/certificates";
import { createPrismaCertificateRepository } from "@/modules/certificates/prisma-repository";
import { scheduleCertificateNotification } from "@/modules/notifications/notification-jobs";
import { createPrismaNotificationRepository } from "@/modules/notifications/prisma-repository";
import { createConfiguredCredlyCredentialProvider } from "@/modules/providers/credentials/credly-provider";
import { createPrismaRuntimeRouteRepository } from "@/modules/runtime/prisma-repository";
import {
  RuntimeRouteError,
  requireLearnerLaunchAssignment,
} from "@/modules/runtime/runtime-route-service";
import { createPrismaScormRepository } from "@/modules/scorm/prisma-repository";
import { commitScormRuntime } from "@/modules/scorm/scorm-runtime";

type ScormCommitRouteContext = {
  params: Promise<{
    slug: string;
    assignmentId: string;
  }>;
};

export async function POST(request: Request, { params }: ScormCommitRouteContext): Promise<Response> {
  try {
    const { slug, assignmentId } = await params;
    const { context, organizationId } = await requireOrganizationMemberBySlug(slug);
    const { prisma } = await import("@/lib/prisma");

    await requireLearnerLaunchAssignment({
      organizationId,
      assignmentId,
      expectedCourseType: "SCORM_1_2",
      actor: context,
      repository: createPrismaRuntimeRouteRepository(prisma),
    });

    const cmiData = await readCmiData(request);
    const occurredAt = new Date();
    const result = await commitScormRuntime(
      {
        organizationId,
        assignmentId,
        cmiData,
        occurredAt,
      },
      createPrismaScormRepository(prisma),
    );

    if (result.completed) {
      const notificationRepository = createPrismaNotificationRepository(prisma);
      const credentialProvider = createConfiguredCredlyCredentialProvider({
        baseUrl: env.CREDLY_BASE_URL,
        apiToken: env.CREDLY_API_TOKEN,
        organizationId: env.CREDLY_ORGANIZATION_ID,
      });

      await issueCertificateForCompletedAssignment(
        {
          organizationId,
          assignmentId,
          appBaseUrl: env.APP_BASE_URL,
          now: occurredAt,
          ...(credentialProvider ? { credentialProvider } : {}),
        },
        createPrismaCertificateRepository(prisma),
        {
          scheduleCertificateNotification: (input) => scheduleCertificateNotification(input, notificationRepository),
        },
      );
    }

    return Response.json(result);
  } catch (error) {
    return scormRuntimeErrorResponse(error);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function readCmiData(request: Request): Promise<Record<string, string>> {
  try {
    const body = await request.json();

    if (isRecord(body) && Object.values(body).every((value) => typeof value === "string")) {
      return body as Record<string, string>;
    }
  } catch {
    // handled below
  }

  throw new Error("Request body must be a JSON object of CMI string values");
}

function scormRuntimeErrorResponse(error: unknown): Response {
  if (error instanceof RuntimeRouteError) {
    return Response.json({ error: error.message }, { status: error.status });
  }

  if (error instanceof Error) {
    return Response.json({ error: error.message }, { status: 400 });
  }

  return Response.json({ error: "Unexpected runtime error" }, { status: 500 });
}
