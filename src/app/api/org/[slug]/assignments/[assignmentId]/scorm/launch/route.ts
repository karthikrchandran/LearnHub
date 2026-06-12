import { requireOrganizationMemberBySlug } from "@/lib/auth/guards";
import { getEnv } from "@/lib/env";
import { createPrismaRuntimeRouteRepository } from "@/modules/runtime/prisma-repository";
import {
  RuntimeRouteError,
  requireLearnerLaunchAssignment,
} from "@/modules/runtime/runtime-route-service";
import { appendScormContentAccessToken } from "@/modules/scorm/scorm-content-access";
import { createPrismaScormRepository } from "@/modules/scorm/prisma-repository";
import { launchScormRegistration } from "@/modules/scorm/scorm-runtime";

type ScormLaunchRouteContext = {
  params: Promise<{
    slug: string;
    assignmentId: string;
  }>;
};

export async function GET(_request: Request, { params }: ScormLaunchRouteContext): Promise<Response> {
  try {
    const { slug, assignmentId } = await params;
    const { context, organizationId } = await requireOrganizationMemberBySlug(slug);
    const { prisma } = await import("@/lib/prisma");
    const occurredAt = new Date();

    await requireLearnerLaunchAssignment({
      organizationId,
      assignmentId,
      expectedCourseType: "SCORM_1_2",
      actor: context,
      repository: createPrismaRuntimeRouteRepository(prisma),
    });

    const launch = await launchScormRegistration(
      {
        organizationId,
        assignmentId,
        occurredAt,
      },
      createPrismaScormRepository(prisma),
    );

    return Response.json({
      ...launch,
      launchUrl: appendScormContentAccessToken({
        launchUrl: launch.launchUrl,
        secret: getEnv().NEXTAUTH_SECRET,
        now: occurredAt,
      }),
    });
  } catch (error) {
    return scormRuntimeErrorResponse(error);
  }
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
