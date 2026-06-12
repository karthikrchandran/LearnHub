export type PlatformAggregateSourceRow = {
  organizationId: string;
  organizationName: string;
  activeLearners: number;
  courseCount: number;
  assignmentCount: number;
  completionCount: number;
  overdueCount: number;
  certificateCount: number;
};

export type PlatformAggregateReportRow = PlatformAggregateSourceRow & {
  completionRate: number;
};

export function buildPlatformAggregateReportRows(
  rows: PlatformAggregateSourceRow[],
): PlatformAggregateReportRow[] {
  return rows.map((row) => ({
    ...row,
    completionRate: row.assignmentCount === 0 ? 0 : Math.round((row.completionCount / row.assignmentCount) * 100),
  }));
}
