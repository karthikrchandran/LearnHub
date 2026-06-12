export type CourseFeedbackInput = {
  stars: number;
  text: string | null;
};

export type CourseFeedbackRow = {
  organizationId: string;
  courseId: string;
  assignmentId?: string;
  membershipId?: string;
  stars: number;
  text: string | null;
};

export function normalizeCourseFeedback(input: CourseFeedbackInput): CourseFeedbackInput {
  if (!Number.isInteger(input.stars) || input.stars < 1 || input.stars > 5) {
    throw new Error("Course rating must be between 1 and 5 stars");
  }

  return {
    stars: input.stars,
    text: input.text?.trim() || null,
  };
}

export function aggregateCourseSatisfaction(rows: CourseFeedbackRow[], organizationId: string) {
  const grouped = new Map<string, CourseFeedbackRow[]>();

  for (const row of rows.filter((candidate) => candidate.organizationId === organizationId)) {
    grouped.set(row.courseId, [...(grouped.get(row.courseId) ?? []), row]);
  }

  return [...grouped.entries()].map(([courseId, courseRows]) => ({
    organizationId,
    courseId,
    ratingCount: courseRows.length,
    averageStars: Math.round((courseRows.reduce((sum, row) => sum + row.stars, 0) / courseRows.length) * 10) / 10,
    feedback: courseRows.map((row) => row.text).filter((text): text is string => Boolean(text)),
  }));
}
