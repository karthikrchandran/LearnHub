export type PopularitySourceRow = {
  courseId: string;
  courseTitle: string;
  viewCount: number;
  enrollmentCount: number;
  completionCount: number;
  averageRating: number | null;
};

export type PopularityWinner = {
  courseId: string;
  courseTitle: string;
  value: number;
};

export type PopularityReportRows = {
  mostViewed: PopularityWinner | null;
  mostEnrolled: PopularityWinner | null;
  mostCompleted: PopularityWinner | null;
  highestRated: PopularityWinner | null;
};

export function buildPopularityReportRows(rows: PopularitySourceRow[]): PopularityReportRows {
  return {
    mostViewed: maxBy(rows, (row) => row.viewCount),
    mostEnrolled: maxBy(rows, (row) => row.enrollmentCount),
    mostCompleted: maxBy(rows, (row) => row.completionCount),
    highestRated: maxBy(rows.filter((row) => row.averageRating !== null), (row) => row.averageRating ?? 0),
  };
}

function maxBy(rows: PopularitySourceRow[], getValue: (row: PopularitySourceRow) => number): PopularityWinner | null {
  const winner = [...rows].sort((left, right) => getValue(right) - getValue(left))[0];

  if (!winner) {
    return null;
  }

  return {
    courseId: winner.courseId,
    courseTitle: winner.courseTitle,
    value: getValue(winner),
  };
}
