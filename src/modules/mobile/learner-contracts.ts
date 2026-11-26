export type MobileCourseSummary = {
  id: string;
  title: string;
  slug: string;
  description: string;
  type: string;
  durationMinutes: number;
  credentialProvider: string | null;
};

export type MobileLearnerAssignment = {
  id: string;
  status: string;
  startDate: string | null;
  dueDate: string | null;
  progressPercent: number;
  certificateIssued: boolean;
  course: MobileCourseSummary;
};

export type MobileLearnerAssignmentsResponse = {
  organizationId: string;
  assignments: MobileLearnerAssignment[];
};

type LearnerAssignmentRecord = {
  id: string;
  status: string;
  startDate: Date | null;
  dueDate: Date | null;
  progress: { progressPercent: number } | null;
  certificate: { id: string } | null;
  course: {
    id: string;
    title: string;
    slug: string;
    description: string;
    type: string;
    expectedDurationMinutes: number;
    credentialProvider: string | null;
  };
};

export function toMobileLearnerAssignmentsResponse(
  organizationId: string,
  records: LearnerAssignmentRecord[],
): MobileLearnerAssignmentsResponse {
  return {
    organizationId,
    assignments: records.map((record) => ({
      id: record.id,
      status: record.status,
      startDate: record.startDate?.toISOString() ?? null,
      dueDate: record.dueDate?.toISOString() ?? null,
      progressPercent: record.progress?.progressPercent ?? 0,
      certificateIssued: Boolean(record.certificate),
      course: {
        id: record.course.id,
        title: record.course.title,
        slug: record.course.slug,
        description: record.course.description,
        type: record.course.type,
        durationMinutes: record.course.expectedDurationMinutes,
        credentialProvider: record.course.credentialProvider,
      },
    })),
  };
}