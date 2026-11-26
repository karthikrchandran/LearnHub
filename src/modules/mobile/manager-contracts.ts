export type MobileManagerAssignment = {
  id: string;
  status: string;
  progressPercent: number;
  startDate: string | null;
  dueDate: string | null;
  course: {
    title: string;
    slug: string;
    type: string;
    durationMinutes: number;
  };
  certificateIssued: boolean;
};

export type MobileManagerDirectReport = {
  id: string;
  employeeId: string | null;
  department: string | null;
  title: string | null;
  firstName: string;
  lastName: string;
  email: string;
  assignments: MobileManagerAssignment[];
  certificateCount: number;
  progressPercent: number;
};

export type MobileManagerDirectReportsResponse = {
  organizationId: string;
  reports: MobileManagerDirectReport[];
};

type ManagerDirectReportRecord = {
  id: string;
  employeeId: string | null;
  department: string | null;
  title: string | null;
  user: {
    email: string;
    firstName: string;
    lastName: string;
  };
  learningAssignments: Array<{
    id: string;
    status: string;
    startDate?: Date | null;
    dueDate?: Date | null;
    progress: { progressPercent: number } | null;
    course?: {
      title: string;
      slug: string;
      type: string;
      expectedDurationMinutes: number;
    };
    certificate?: { id: string } | null;
  }>;
  certificates: Array<{ id: string }>;
};

export function toMobileManagerDirectReportsResponse(
  organizationId: string,
  records: ManagerDirectReportRecord[],
): MobileManagerDirectReportsResponse {
  return {
    organizationId,
    reports: records.map((record) => {
      const assignments = record.learningAssignments.flatMap((assignment) =>
        assignment.course
          ? [{
              id: assignment.id,
              status: assignment.status,
              progressPercent: assignment.progress?.progressPercent ?? 0,
              startDate: assignment.startDate?.toISOString() ?? null,
              dueDate: assignment.dueDate?.toISOString() ?? null,
              course: {
                title: assignment.course.title,
                slug: assignment.course.slug,
                type: assignment.course.type,
                durationMinutes: assignment.course.expectedDurationMinutes,
              },
              certificateIssued: Boolean(assignment.certificate),
            }]
          : [],
      );

      return {
        id: record.id,
        employeeId: record.employeeId,
        department: record.department,
        title: record.title,
        firstName: record.user.firstName,
        lastName: record.user.lastName,
        email: record.user.email,
        assignments,
        certificateCount: record.certificates.length,
        progressPercent: averageProgress(assignments.map((assignment) => assignment.progressPercent)),
      };
    }),
  };
}

function averageProgress(progressValues: number[]): number {
  if (progressValues.length === 0) {
    return 0;
  }

  return Math.round(progressValues.reduce((sum, progress) => sum + progress, 0) / progressValues.length);
}