import {
  requireOrganizationMemberBySlug,
  type GuardAuthContext,
} from "@/lib/auth/guards";
import { createPrismaProgressReportRepository } from "@/modules/reports/prisma-repository";
import {
  canExportTenantReports,
  resolveReportViewerRole,
} from "@/modules/reports/report-access";
import {
  resolveProgressReportScope,
  type ProgressReportTargetMembership,
} from "@/modules/reports/progress-report";

class ReportExportAccessError extends Error {}

export async function loadScopedReportContext(slug: string) {
  const { context, organizationId } = await requireOrganizationMemberBySlug(slug);
  const { prisma } = await import("@/lib/prisma");
  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: {
      allowManagerReports: true,
      allowUserReports: true,
      allowCsvExports: true,
    },
  });

  if (!organization) {
    throw new ReportExportAccessError("Organization not found");
  }

  const role = resolveReportViewerRole(context, organizationId);

  if (!canExportTenantReports(role, organization)) {
    throw new ReportExportAccessError("Report export disabled");
  }

  const directReports = await loadDirectReportTargets(context, organizationId, prisma);
  const scope = resolveProgressReportScope(context, organizationId, directReports);

  return {
    organizationId,
    scope,
    repository: createPrismaProgressReportRepository(prisma),
  };
}

export function csvResponse(body: string, filename: string): Response {
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

export function reportExportErrorResponse(error: unknown): Response {
  if (isLoginRedirect(error)) {
    return Response.json({ error: "Authentication required" }, { status: 401 });
  }

  if (error instanceof ReportExportAccessError) {
    return Response.json({ error: "Not allowed to export this report" }, { status: 403 });
  }

  if (isRedirect(error)) {
    return Response.json({ error: "Not allowed to export this report" }, { status: 403 });
  }

  return Response.json({ error: "Unable to export report" }, { status: 500 });
}

async function loadDirectReportTargets(
  context: GuardAuthContext,
  organizationId: string,
  prisma: Awaited<typeof import("@/lib/prisma")>["prisma"],
): Promise<ProgressReportTargetMembership[]> {
  const activeManagerMembership = context.memberships.find(
    (membership) =>
      membership.organizationId === organizationId &&
      membership.status === "ACTIVE" &&
      membership.roles.includes("MANAGER") &&
      !membership.roles.includes("ADMIN"),
  );

  if (!activeManagerMembership || context.isPlatformOwner) {
    return [];
  }

  return prisma.organizationMembership.findMany({
    where: {
      organizationId,
      status: "ACTIVE",
      managerMembershipId: activeManagerMembership.id,
    },
    select: {
      id: true,
      organizationId: true,
    },
  });
}

function isRedirect(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    typeof error.digest === "string" &&
    error.digest.startsWith("NEXT_REDIRECT")
  );
}

function isLoginRedirect(error: unknown): boolean {
  return isRedirect(error) && (error as { digest: string }).digest.includes("/login");
}
