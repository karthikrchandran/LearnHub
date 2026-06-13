import { notFound } from "next/navigation";

import { requireOrganizationMemberBySlug } from "@/lib/auth/guards";
import { CourseCard, EmptyActionState, LearnerAppShell, PrimaryButton } from "@/app/ui/learnhub-components";
import { createPrismaLearnerExperienceRepository } from "@/modules/learner-experience/prisma-repository";
import {
  buildCourseAction,
  groupLearnerCourses,
  type LearnerCourseCard,
  type LearnerCourseStatus,
} from "@/modules/learner-experience/read-model";

export const dynamic = "force-dynamic";

type MyCoursesPageProps = {
  params: Promise<{
    slug: string;
  }>;
};

type LearnerExperienceRepository = ReturnType<typeof createPrismaLearnerExperienceRepository>;
type LearnerAssignment = Awaited<ReturnType<LearnerExperienceRepository["listLearnerAssignments"]>>[number];
type AvailableCourse = Awaited<ReturnType<LearnerExperienceRepository["listAvailableCourses"]>>[number];

type LearnerCourseView = LearnerCourseCard & {
  title: string;
  slug: string;
  description: string;
  categorySlug: string | null;
  durationMinutes: number;
  estimatedBusinessDays: number;
  type: string;
  credentialProvider: string | null;
};

export default async function MyCoursesPage({ params }: MyCoursesPageProps) {
  const { slug } = await params;
  const { context, organizationId } = await requireOrganizationMemberBySlug(slug);
  const { prisma } = await import("@/lib/prisma");
  const repository = createPrismaLearnerExperienceRepository(prisma);
  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { name: true },
  });

  if (!organization) {
    notFound();
  }

  const learnerMembership = context.memberships.find(
    (membership) =>
      membership.organizationId === organizationId &&
      membership.status === "ACTIVE" &&
      membership.roles.includes("LEARNER"),
  );

  if (!learnerMembership) {
    return (
      <LearnerAppShell organizationName={organization.name} slug={slug} active="courses">
        <div className="lh-main-inner">
          <header className="lh-main-head">
            <div>
              <p className="lh-eyebrow">My Courses</p>
              <h1>Pick up where you left off.</h1>
            </div>
          </header>
          <EmptyActionState
            body="Sign in with an active learner membership to view assigned courses, progress, and recommendations."
            title="Learner access required"
          />
        </div>
      </LearnerAppShell>
    );
  }

  const assignedCourses = await repository.listLearnerAssignments({ organizationId, membershipId: learnerMembership.id });
  const assignedCourseIds = assignedCourses.map((assignment) => assignment.courseId);
  const availableCourses = await repository.listAvailableCourses({ organizationId, excludedCourseIds: assignedCourseIds });
  const courses = [
    ...assignedCourses.map(toAssignedCourseView),
    ...availableCourses.map(toAvailableCourseView),
  ];
  const grouped = groupLearnerCourses(courses) as {
    assigned: LearnerCourseView[];
    inProgress: LearnerCourseView[];
    completed: LearnerCourseView[];
    available: LearnerCourseView[];
  };
  const continueCourse = grouped.inProgress[0];
  const featuredCourses = [
    continueCourse,
    grouped.assigned[0],
    grouped.completed[0],
    grouped.available[0],
    ...courses,
  ].filter((course): course is LearnerCourseView => Boolean(course));
  const uniqueFeaturedCourses = Array.from(
    new Map(featuredCourses.map((course) => [`${course.status}-${course.id}`, course])).values(),
  ).slice(0, 3);

  return (
    <LearnerAppShell organizationName={organization.name} slug={slug} active="courses">
      <div className="lh-main-inner">
        <header className="lh-main-head">
          <div>
            <p className="lh-eyebrow">Welcome back</p>
            <h1>Pick up where you left off.</h1>
            <p>Assigned courses, active lessons, and certificates are ready when you are.</p>
          </div>
          <div className="lh-searchbar">Search my courses</div>
        </header>

        {continueCourse ? <ContinueLearningPanel course={continueCourse} slug={slug} /> : null}

        {uniqueFeaturedCourses.length > 0 ? (
          <div className="lh-grid-3">
            {uniqueFeaturedCourses.map((course) => (
              <CourseCard
                action={<CourseActionButton course={course} slug={slug} />}
                categorySlug={course.categorySlug}
                description={course.description || "Course details will appear as your organization updates this catalog item."}
                key={`${course.status}-${course.id}`}
                label={courseLabel(course)}
                meta={courseMeta(course)}
                progressPercent={course.assignmentId ? course.progressPercent : undefined}
                title={course.title}
              />
            ))}
          </div>
        ) : (
          <EmptyActionState
            action={
              <PrimaryButton href={`/org/${slug}/learn/catalog`} variant="light">
                Browse catalog
              </PrimaryButton>
            }
            body="Assigned and recommended courses will appear here as your organization publishes learning."
            title="No courses yet"
          />
        )}

      </div>
    </LearnerAppShell>
  );
}

function ContinueLearningPanel({ course, slug }: { course: LearnerCourseView; slug: string }) {
  return (
    <section className="lh-feature-panel">
      <div className="min-w-0">
        <p className="lh-course-cover-label">In progress</p>
        <h2>{course.title}</h2>
        <p>Next lesson is ready. Complete the remaining lesson work and knowledge check to unlock your certificate.</p>
        <div className="lh-feature-actions">
          <CourseActionButton course={course} slug={slug} />
          <PrimaryButton href={`/org/${slug}/learn/assessments`} variant="light">
            View checks
          </PrimaryButton>
        </div>
      </div>
      <div className="lh-progress-ring">{course.progressPercent}%</div>
    </section>
  );
}

function courseLabel(course: LearnerCourseView): string {
  if (course.status === "IN_PROGRESS") {
    return "In progress";
  }

  if (course.status === "COMPLETED") {
    return "Completed";
  }

  if (course.status === "AVAILABLE") {
    return "Available";
  }

  return "Assigned";
}

function CourseActionButton({ course, slug }: { course: LearnerCourseView; slug: string }) {
  const action = buildCourseAction({
    slug,
    courseSlug: course.slug,
    assignmentId: course.assignmentId,
    status: course.status,
  });

  return (
    <PrimaryButton href={action.href} variant={action.variant}>
      {action.label}
    </PrimaryButton>
  );
}

function toAssignedCourseView(assignment: LearnerAssignment): LearnerCourseView {
  return {
    id: assignment.course.id,
    assignmentId: assignment.id,
    status: assignment.status as LearnerCourseStatus,
    progressPercent: assignment.progress?.progressPercent ?? (assignment.status === "COMPLETED" ? 100 : 0),
    certificateIssued: Boolean(assignment.certificate),
    title: assignment.course.title,
    slug: assignment.course.slug,
    description: assignment.course.description,
    categorySlug: assignment.course.category?.slug ?? null,
    durationMinutes: assignment.course.expectedDurationMinutes,
    estimatedBusinessDays: assignment.course.estimatedCompletionBusinessDays,
    type: assignment.course.type,
    credentialProvider: assignment.course.credentialProvider,
  };
}

function toAvailableCourseView(course: AvailableCourse): LearnerCourseView {
  return {
    id: course.id,
    assignmentId: null,
    status: "AVAILABLE",
    progressPercent: 0,
    certificateIssued: false,
    title: course.title,
    slug: course.slug,
    description: course.description,
    categorySlug: course.category?.slug ?? null,
    durationMinutes: course.expectedDurationMinutes,
    estimatedBusinessDays: course.estimatedCompletionBusinessDays,
    type: course.type,
    credentialProvider: course.credentialProvider,
  };
}

function courseMeta(course: LearnerCourseView): string[] {
  return [
    `${course.durationMinutes} min`,
    `${course.estimatedBusinessDays} business days`,
    formatCourseType(course.type),
    ...(course.certificateIssued ? ["Certificate earned"] : course.credentialProvider ? ["Certificate"] : []),
  ];
}

function formatCourseType(type: string): string {
  return type === "SCORM_1_2" ? "SCORM" : "Native video";
}
