import { formatTimingReportCsv } from "@/modules/reports/timing-report";

import { csvResponse, loadScopedReportContext, reportExportErrorResponse } from "../report-export-utils";

type ReportRouteContext = { params: Promise<{ slug: string }> };

export async function GET(_request: Request, { params }: ReportRouteContext): Promise<Response> {
  try {
    const { slug } = await params;
    const { organizationId, scope, repository } = await loadScopedReportContext(slug);
    const rows = await repository.listTimingRows({ organizationId, scope });

    return csvResponse(formatTimingReportCsv(rows), "learnhub-timing.csv");
  } catch (error) {
    return reportExportErrorResponse(error);
  }
}
