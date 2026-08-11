import {
  formatProgressReportCsv,
} from "@/modules/reports/progress-report";

import { csvResponse, loadScopedReportContext, reportExportErrorResponse } from "../report-export-utils";

type ProgressCsvRouteContext = {
  params: Promise<{
    slug: string;
  }>;
};

export async function GET(_request: Request, { params }: ProgressCsvRouteContext): Promise<Response> {
  try {
    const { slug } = await params;
    const { organizationId, scope, repository } = await loadScopedReportContext(slug);
    const rows = await repository.listProgressRows({ organizationId, scope });

    return csvResponse(formatProgressReportCsv(rows), "learnhub-progress.csv");
  } catch (error) {
    return reportExportErrorResponse(error);
  }
}
