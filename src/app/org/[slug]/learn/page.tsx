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
  const assignedCourses = learnerMembership
    ? await repository.listLearnerAssignments({ organizationId, membershipId: learnerMembership.id })
    : [];
  const assignedCourseIds = assignedCourses.map((assignment) => assignment.courseId);
  const availableCourses = learnerMembership
    ? await repository.listAvailableCourses({ organizationId, excludedCourseIds: assignedCourseIds })
    : [];
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

  return (
    <LearnerAppShell organizationName={organization.name} slug={slug} active="courses">
      <div className="mx-auto grid max-w-7xl gap-6">
        <header>
          <p className="text-xs font-black uppercase tracking-[0.14em] text-[var(--learnhub-blue)]">My Courses</p>
          <h1 className="mt-2 text-4xl font-black text-[var(--learnhub-ink)]">Keep your learning moving.</h1>
          <p className="mt-3 max-w-3xl text-base text-[var(--learnhub-muted-strong)]">
            Track assigned work, resume active courses, and find recommended courses from your organization catalog.
          </p>
        </header>

        {continueCourse ? <ContinueLearningPanel course={continueCourse} slug={slug} /> : null}

        <CourseSection
          courses={grouped.assigned}
          emptyActionHref={`/org/${slug}/learn/catalog`}
          emptyActionLabel="Browse catalog"
          emptyBody="New assignments from your manager or admin will appear here."
          emptyTitle="No assigned courses"
          slug={slug}
          title="Assigned"
        />
        <CourseSection
          courses={grouped.inProgress}
          emptyActionHref={`/org/${slug}/learn/catalog`}
          emptyActionLabel="Find another course"
          emptyBody="Start an assigned or recommended course to see active progress here."
          emptyTitle="No courses in progress"
          slug={slug}
          title="In Progress"
        />
        <CourseSection
          courses={grouped.completed}
          emptyActionHref={`/org/${slug}/certificates`}
          emptyActionLabel="View certificates"
          emptyBody="Completed courses and earned credentials will collect here."
          emptyTitle="No completed courses"
          slug={slug}
          title="Completed"
        />
        <CourseSection
          courses={grouped.available}
          emptyActionHref={`/org/${slug}/learn/catalog`}
          emptyActionLabel="Open catalog"
          emptyBody="When published courses are available for your role, they will appear here."
          emptyTitle="No recommended courses"
          slug={slug}
          title="Recommended"
        />
      </div>
    </LearnerAppShell>
  );
}

function ContinueLearningPanel({ course, slug }: { course: LearnerCourseView; slug: string }) {
  return (
    <section className="grid gap-5 rounded-2xl bg-[var(--learnhub-ink)] p-6 text-white shadow-[0_20px_50px_rgba(17,24,39,0.18)] lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
      <div className="min-w-0">
        <p className="text-xs font-black uppercase tracking-[0.14em] text-[var(--learnhub-teal)]">Resume next</p>
        <h2 className="text-3xl font-black text-white">Continue learning</h2>
        <p className="mt-2 min-w-0 break-words text-lg font-bold">{course.title}</p>
        <p className="mt-2 max-w-3xl text-sm text-slate-300">{course.progressPercent}% complete</p>
      </div>
      <CourseActionButton course={course} slug={slug} />
    </section>
  );
}

function CourseSection({
  title,
  courses,
  slug,
  emptyTitle,
  emptyBody,
  emptyActionHref,
  emptyActionLabel,
}: {
  title: string;
  courses: LearnerCourseView[];
  slug: string;
  emptyTitle: string;
  emptyBody: string;
  emptyActionHref: string;
  emptyActionLabel: string;
}) {
  return (
    <section>
      <div className="mb-4 flex min-w-0 items-center justify-between gap-3">
        <h2 className="text-2xl font-black text-[var(--learnhub-ink)]">{title}</h2>
        <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-[var(--learnhub-muted-strong)]">
          {courses.length}
        </span>
      </div>
      {courses.length === 0 ? (
        <EmptyActionState
          action={
            <PrimaryButton href={emptyActionHref} variant="light">
              {emptyActionLabel}
            </PrimaryButton>
          }
          body={emptyBody}
          title={emptyTitle}
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {courses.map((course) => (
            <CourseCard
              action={<CourseActionButton course={course} slug={slug} />}
              categorySlug={course.categorySlug}
              description={course.description || "Course details will appear as your organization updates this catalog item."}
              key={`${course.status}-${course.id}`}
              meta={courseMeta(course)}
              progressPercent={course.assignmentId ? course.progressPercent : undefined}
              title={course.title}
            />
          ))}
        </div>
      )}
    </section>
  );
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
