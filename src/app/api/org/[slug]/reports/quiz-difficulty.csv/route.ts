import { formatQuizDifficultyReportCsv } from "@/modules/reports/quiz-difficulty-report";

import { csvResponse, loadScopedReportContext, reportExportErrorResponse } from "../report-export-utils";

type ReportRouteContext = { params: Promise<{ slug: string }> };

export async function GET(_request: Request, { params }: ReportRouteContext): Promise<Response> {
  try {
    const { slug } = await params;
    const { organizationId, scope, repository } = await loadScopedReportContext(slug);
    const rows = await repository.listQuizDifficultyRows({ organizationId, scope });

    return csvResponse(formatQuizDifficultyReportCsv(rows), "learnhub-quiz-difficulty.csv");
  } catch (error) {
    return reportExportErrorResponse(error);
  }
}
