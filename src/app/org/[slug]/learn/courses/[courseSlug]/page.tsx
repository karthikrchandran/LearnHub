import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { Badge, CourseCover, EmptyActionState, LearnerAppShell, PrimaryButton, ProgressBar } from "@/app/ui/learnhub-components";
import { requireOrganizationMemberBySlug } from "@/lib/auth/guards";
import { createPrismaLearnerExperienceRepository } from "@/modules/learner-experience/prisma-repository";

import { selfEnrollFormAction } from "../../actions";

export const dynamic = "force-dynamic";

type CourseOverviewPageProps = {
  params: Promise<{
    slug: string;
    courseSlug: string;
  }>;
};

type LearnerExperienceRepository = ReturnType<typeof createPrismaLearnerExperienceRepository>;
type CourseOverview = NonNullable<Awaited<ReturnType<LearnerExperienceRepository["findCourseOverview"]>>>;
type CourseAssignment = CourseOverview["assignments"][number];
type CourseLesson = CourseOverview["videoLessons"][number];
type CourseModule = CourseOverview["modules"][number];

export default async function CourseOverviewPage({ params }: CourseOverviewPageProps) {
  const { slug, courseSlug } = await params;
  const { context, organizationId } = await requireOrganizationMemberBySlug(slug);
  const { prisma } = await import("@/lib/prisma");
  const repository = createPrismaLearnerExperienceRepository(prisma);
  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { enrollmentPolicy: true, name: true },
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
              <p className="lh-eyebrow">Course details</p>
              <h1>Learner access required</h1>
            </div>
          </header>
          <EmptyActionState
            body="Sign in with an active learner membership to view course requirements, curriculum, and launch options."
            title="Learner access required"
          />
        </div>
      </LearnerAppShell>
    );
  }

  const course = await repository.findCourseOverview({ organizationId, courseSlug, membershipId: learnerMembership.id });

  if (!course) {
    notFound();
  }

  const isScormCourse = course.type === "SCORM_1_2";
  const assignment = course.assignments[0] ?? null;
  const currentLesson = assignment ? findCurrentLesson(course.videoLessons, assignment) : null;
  const progressPercent = assignment ? assignment.progress?.progressPercent ?? (assignment.status === "COMPLETED" ? 100 : 0) : 0;
  const assessmentCount = course.knowledgeCheckQuestions.length;
  const requiredAssessmentCount = course.knowledgeCheckQuestions.filter((check) => check.required).length;
  const canSelfEnroll = organization.enrollmentPolicy === "ASSIGNMENT_AND_SELF_ENROLLMENT";
  const scormRuntimeHref = `/org/${encodeURIComponent(slug)}/learn/${encodeURIComponent(courseSlug)}/scorm`;
  const today = new Date().toISOString().slice(0, 10);
  const enrollAction = async (formData: FormData) => {
    "use server";

    const result = await selfEnrollFormAction(slug, formData);

    if (result.status === "success") {
      redirect(`/org/${slug}/learn/courses/${courseSlug}`);
    }

    redirect(`/org/${slug}/learn/catalog?enrollmentError=${encodeURIComponent(result.message)}`);
  };

  return (
    <LearnerAppShell organizationName={organization.name} slug={slug} active="courses">
      <div className="lh-main-inner">
        <section className="lh-course-hero">
          <div className="lh-course-hero-copy">
            <div>
              <p className="lh-eyebrow">Course details</p>
              <h1 className="mt-2 min-w-0 break-words text-4xl font-black text-[var(--learnhub-ink)]">{course.title}</h1>
              <p className="lh-card-copy">
                {course.description || "Course details will appear as your organization updates this catalog item."}
              </p>
            </div>

            <div className="lh-meta">
              <Badge>{formatCourseType(course.type)}</Badge>
              <Badge>{formatMinutes(course.expectedDurationMinutes)}</Badge>
              <Badge>{formatBusinessDays(course.estimatedCompletionBusinessDays)}</Badge>
              {course.category ? <Badge>{course.category.name}</Badge> : null}
            </div>

            {assignment ? (
              <div className="grid gap-3 rounded-2xl bg-[var(--learnhub-app)] p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.14em] text-[var(--learnhub-muted-strong)]">
                      Progress
                    </p>
                    <p className="text-2xl font-black text-[var(--learnhub-ink)]">{progressPercent}% complete</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {course.type === "SCORM_1_2" ? (
                      <PrimaryButton href={scormRuntimeHref} variant="blue">
                        {assignment.status === "IN_PROGRESS" ? "Resume SCORM course" : "Launch SCORM course"}
                      </PrimaryButton>
                    ) : null}
                    {course.type !== "SCORM_1_2" && currentLesson ? (
                      <PrimaryButton
                        href={`/org/${encodeURIComponent(slug)}/learn/courses/${encodeURIComponent(courseSlug)}/lessons/${encodeURIComponent(currentLesson.slug)}`}
                        variant="blue"
                      >
                        {assignment.status === "IN_PROGRESS" ? "Resume lesson" : "Start lesson"}
                      </PrimaryButton>
                    ) : null}
                  </div>
                </div>
                <ProgressBar value={progressPercent} />
              </div>
            ) : canSelfEnroll ? (
              <EmptyActionState
                action={
                  <form action={enrollAction}>
                    <input name="courseId" type="hidden" value={course.id} />
                    <input name="learnerMembershipId" type="hidden" value={learnerMembership.id} />
                    <input name="startDate" type="hidden" value={today} />
                    <button className="lh-button lh-button-blue" type="submit">
                      Enroll in course
                    </button>
                  </form>
                }
                body="Enroll to add this course to My Courses and unlock the learner runtime when lessons are available."
                title="Assignment required"
              />
            ) : (
              <EmptyActionState
                body="An admin or manager must assign this course before you can launch it."
                title="Assignment required"
              />
            )}
          </div>
          <CourseCover categorySlug={course.category?.slug ?? null} label={course.category?.name ?? "Course"} title={course.title} />
        </section>

        <section className="grid gap-4 lg:grid-cols-3">
          <MetricCard label={isScormCourse ? "Runtime" : "Curriculum"} value={formatCurriculumValue(course.type, course.videoLessons.length)} />
          <MetricCard label="Assessments" value={`${assessmentCount} active`} detail={`${requiredAssessmentCount} required`} />
          <MetricCard label="Certificate eligibility" value={assignment?.certificate ? "Earned" : "Included"} detail="Issued on completion" />
        </section>

        <section className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)]">
          <div className="grid gap-4">
            <div>
              <p className="lh-eyebrow">{isScormCourse ? "SCORM package" : "Curriculum"}</p>
              <h2 className="mt-2 text-2xl font-black text-[var(--learnhub-ink)]">
                {isScormCourse ? "Launch the simulation" : "Lessons in this course"}
              </h2>
            </div>
            {isScormCourse ? (
              <ScormPackagePanel assignment={assignment} href={scormRuntimeHref} />
            ) : (
              <CurriculumList courseSlug={courseSlug} lessons={course.videoLessons} modules={course.modules} slug={slug} />
            )}
          </div>

          <aside className="grid content-start gap-4">
            <section className="lh-aside-card">
              <p className="lh-eyebrow">What you will earn</p>
              <h2 className="mt-2 text-2xl font-black text-[var(--learnhub-ink)]">
                {assignment?.certificate ? "Certificate earned" : "Certificate on completion"}
              </h2>
              <p className="mt-2 text-sm text-[var(--learnhub-muted)]">
                {isScormCourse
                  ? "Complete the SCORM package and any required assessments to generate a verifiable LearnHub certificate for this course."
                  : "Complete the required lessons and assessments to generate a verifiable LearnHub certificate for this course."}
              </p>
              {assignment?.certificate ? (
                <PrimaryButton href={`/org/${slug}/certificates`} variant="light">
                  View certificate
                </PrimaryButton>
              ) : null}
            </section>

            <section className="lh-aside-card">
              <p className="lh-eyebrow">Course details</p>
              <dl className="mt-4 grid gap-3 text-sm">
                <DetailRow label="Format" value={formatCourseType(course.type)} />
                <DetailRow label="Duration" value={formatMinutes(course.expectedDurationMinutes)} />
                <DetailRow label="Target completion" value={formatBusinessDays(course.estimatedCompletionBusinessDays)} />
                <DetailRow label="Status" value={assignment ? formatAssignmentStatus(assignment.status) : "Not assigned"} />
                {assignment?.dueDate ? <DetailRow label="Due date" value={formatDate(assignment.dueDate)} /> : null}
              </dl>
            </section>
          </aside>
        </section>
      </div>
    </LearnerAppShell>
  );
}

function CurriculumList({
  slug,
  courseSlug,
  modules,
  lessons,
}: {
  slug: string;
  courseSlug: string;
  modules: CourseModule[];
  lessons: CourseLesson[];
}) {
  const ungroupedLessons = lessons.filter((lesson) => !lesson.moduleId);

  if (lessons.length === 0) {
    return (
      <EmptyActionState
        body="Lessons will appear here after your organization publishes the course curriculum."
        title="No lessons published"
      />
    );
  }

  return (
    <div className="lh-curriculum">
      {modules.map((courseModule) => {
        const moduleLessons = lessons.filter((lesson) => lesson.moduleId === courseModule.id);

        return (
          <section className="lh-curriculum-card" key={courseModule.id}>
            <h3 className="min-w-0 break-words text-lg font-black text-[var(--learnhub-ink)]">{courseModule.title}</h3>
            {moduleLessons.length === 0 ? (
              <p className="mt-2 text-sm text-[var(--learnhub-muted)]">Lessons are being prepared for this module.</p>
            ) : (
              <LessonRows courseSlug={courseSlug} lessons={moduleLessons} slug={slug} />
            )}
          </section>
        );
      })}

      {ungroupedLessons.length > 0 ? (
        <section className="lh-curriculum-card">
          <h3 className="text-lg font-black text-[var(--learnhub-ink)]">Additional lessons</h3>
          <LessonRows courseSlug={courseSlug} lessons={ungroupedLessons} slug={slug} />
        </section>
      ) : null}
    </div>
  );
}

function LessonRows({ slug, courseSlug, lessons }: { slug: string; courseSlug: string; lessons: CourseLesson[] }) {
  return (
    <div className="mt-3">
      {lessons.map((lesson) => (
        <Link
          className="lh-lesson-row"
          href={`/org/${encodeURIComponent(slug)}/learn/courses/${encodeURIComponent(courseSlug)}/lessons/${encodeURIComponent(lesson.slug)}`}
          key={lesson.id}
        >
          <span className="min-w-0">
            <span className="block min-w-0 break-words font-bold text-[var(--learnhub-ink)]">{lesson.title}</span>
            <span className="mt-1 block text-[var(--learnhub-muted)]">
              {lesson.required ? "Required" : "Optional"} lesson
            </span>
          </span>
          <span className="font-bold text-[var(--learnhub-blue)]">{formatSeconds(lesson.durationSeconds)}</span>
        </Link>
      ))}
    </div>
  );
}

function ScormPackagePanel({ assignment, href }: { assignment: CourseAssignment | null; href: string }) {
  return (
    <section className="lh-curriculum-card">
      <h3 className="min-w-0 break-words text-lg font-black text-[var(--learnhub-ink)]">SCORM package</h3>
      <p className="mt-2 text-sm text-[var(--learnhub-muted)]">
        Launch the interactive package in the LearnHub SCORM player. Progress, score, and completion are saved back to this course.
      </p>
      {assignment ? (
        <div className="mt-4">
          <PrimaryButton href={href} variant="blue">
            {assignment.status === "IN_PROGRESS" ? "Resume SCORM course" : "Launch SCORM course"}
          </PrimaryButton>
        </div>
      ) : (
        <p className="mt-4 text-sm font-bold text-[var(--learnhub-muted-strong)]">Enroll or receive an assignment to launch this package.</p>
      )}
    </section>
  );
}

function MetricCard({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <section className="lh-metric-card">
      <p className="text-xs font-black uppercase tracking-[0.14em] text-[var(--learnhub-muted-strong)]">{label}</p>
      <p className="mt-2 text-2xl font-black text-[var(--learnhub-ink)]">{value}</p>
      {detail ? <p className="mt-1 text-sm text-[var(--learnhub-muted)]">{detail}</p> : null}
    </section>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[8rem_minmax(0,1fr)] gap-3">
      <dt className="font-bold text-[var(--learnhub-muted-strong)]">{label}</dt>
      <dd className="min-w-0 break-words text-[var(--learnhub-ink)]">{value}</dd>
    </div>
  );
}

function findCurrentLesson(lessons: CourseLesson[], assignment: CourseAssignment): CourseLesson | null {
  if (lessons.length === 0) {
    return null;
  }

  const progressByLesson = new Map(assignment.videoProgress.map((progress) => [progress.lessonId, progress.completed]));

  return lessons.find((lesson) => lesson.required && !progressByLesson.get(lesson.id)) ?? lessons.find((lesson) => !progressByLesson.get(lesson.id)) ?? lessons[0];
}

function formatCourseType(type: string): string {
  return type === "SCORM_1_2" ? "SCORM" : "Native video";
}

function formatAssignmentStatus(status: string): string {
  return status
    .split("_")
    .map((part) => part.slice(0, 1) + part.slice(1).toLowerCase())
    .join(" ");
}

function formatBusinessDays(days: number): string {
  return `${days} ${days === 1 ? "business day" : "business days"}`;
}

function formatCurriculumValue(type: string, lessonCount: number): string {
  return type === "SCORM_1_2" ? "SCORM package" : formatLessonCount(lessonCount);
}

function formatLessonCount(count: number): string {
  return `${count} ${count === 1 ? "lesson" : "lessons"}`;
}

function formatMinutes(minutes: number): string {
  return `${minutes} min`;
}

function formatSeconds(seconds: number): string {
  const minutes = Math.max(1, Math.ceil(seconds / 60));

  return formatMinutes(minutes);
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
