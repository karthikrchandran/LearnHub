import Link from "next/link";
import { notFound } from "next/navigation";

import { KnowledgeCheckPanel } from "@/app/org/[slug]/learn/[courseSlug]/knowledge-check-panel";
import { VideoPlayer } from "@/app/org/[slug]/learn/[courseSlug]/video-player";
import { EmptyActionState, LearnerAppShell, PrimaryButton, ProgressBar } from "@/app/ui/learnhub-components";
import { requireOrganizationMemberBySlug } from "@/lib/auth/guards";
import { createPrismaLearnerExperienceRepository } from "@/modules/learner-experience/prisma-repository";

export const dynamic = "force-dynamic";

type LessonPageProps = {
  params: Promise<{
    slug: string;
    courseSlug: string;
    lessonSlug: string;
  }>;
};

type LearnerExperienceRepository = ReturnType<typeof createPrismaLearnerExperienceRepository>;
type LessonCourse = NonNullable<Awaited<ReturnType<LearnerExperienceRepository["findLesson"]>>>;
type CourseAssignment = LessonCourse["assignments"][number];
type CourseLesson = LessonCourse["videoLessons"][number];
type CourseModule = LessonCourse["modules"][number];

export default async function LessonPage({ params }: LessonPageProps) {
  const { slug, courseSlug, lessonSlug } = await params;
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
              <p className="lh-eyebrow">Lesson runtime</p>
              <h1>Learner access required</h1>
            </div>
          </header>
          <EmptyActionState
            body="Sign in with an active learner membership to launch lessons, save progress, and submit course feedback."
            title="Learner access required"
          />
        </div>
      </LearnerAppShell>
    );
  }

  const course = await repository.findLesson({
    organizationId,
    courseSlug,
    lessonSlug,
    membershipId: learnerMembership.id,
  });

  if (!course) {
    notFound();
  }

  const lesson = course.videoLessons.find((candidate) => candidate.slug === lessonSlug) ?? null;

  if (!lesson) {
    notFound();
  }

  const assignment = course.assignments[0] ?? null;

  if (!assignment) {
    return (
      <LearnerAppShell organizationName={organization.name} slug={slug} active="courses">
        <AssignmentRequiredState courseSlug={courseSlug} courseTitle={course.title} slug={slug} />
      </LearnerAppShell>
    );
  }

  const lessonChecks = course.knowledgeCheckQuestions.filter((check) => check.lessonId === lesson.id);
  const courseFallbackChecks = course.knowledgeCheckQuestions.filter((check) => check.lessonId === null);
  const checks = lessonChecks.length > 0 ? lessonChecks : courseFallbackChecks;
  const videoLaunchPath = `/api/org/${encodeURIComponent(slug)}/assignments/${encodeURIComponent(assignment.id)}/video/launch`;
  const videoProgressPath = `/api/org/${encodeURIComponent(slug)}/assignments/${encodeURIComponent(assignment.id)}/video/progress`;
  const feedbackEndpoint = `/api/org/${encodeURIComponent(slug)}/assignments/${encodeURIComponent(assignment.id)}/feedback`;
  const orderedLessons = [...course.videoLessons].sort((left, right) => left.sortOrder - right.sortOrder);
  const currentLessonIndex = orderedLessons.findIndex((candidate) => candidate.id === lesson.id);
  const nextLesson = currentLessonIndex >= 0 ? orderedLessons[currentLessonIndex + 1] ?? null : null;
  const lessonProgress = assignment.videoProgress.find((progress) => progress.lessonId === lesson.id) ?? null;
  const progressPercent = assignment.progress?.progressPercent ?? (assignment.status === "COMPLETED" ? 100 : 0);

  return (
    <LearnerAppShell organizationName={organization.name} slug={slug} active="courses">
      <div className="lh-main-inner lh-main-wide">
        <header className="lh-lesson-header">
          <Link
            className="text-xs font-black uppercase tracking-[0.14em] text-[var(--learnhub-teal)]"
            href={`/org/${encodeURIComponent(slug)}/learn/courses/${encodeURIComponent(courseSlug)}`}
          >
            Course details
          </Link>
          <h1 className="mt-3 min-w-0 break-words text-4xl font-black text-white">{lesson.title}</h1>
          <p className="mt-2 min-w-0 break-words text-sm font-bold text-slate-300">{course.title}</p>
          <div className="mt-5 grid gap-3 md:grid-cols-[minmax(0,1fr)_14rem] md:items-center">
            <ProgressBar value={progressPercent} />
            <p className="text-sm font-bold text-slate-300">
              {progressPercent}% complete / {formatAssignmentStatus(assignment.status)}
            </p>
          </div>
        </header>

        <div className="lh-lesson-layout">
          <LessonOutline
            courseSlug={courseSlug}
            currentLessonId={lesson.id}
            lessons={orderedLessons}
            modules={course.modules}
            slug={slug}
          />

          <main className="grid content-start gap-5">
            <section
              className="lh-video-box"
              data-video-launch-path={videoLaunchPath}
              data-video-progress-path={videoProgressPath}
            >
              <VideoPlayer
                launchPath={videoLaunchPath}
                progressPath={videoProgressPath}
                initialProgressPercent={progressPercent}
                initialLessonId={lesson.id}
              />
            </section>

            <section className="grid gap-4 lg:grid-cols-2">
              <LessonChapters chapters={lesson.chapters} />
              <LessonTranscript cues={lesson.transcriptCues} />
            </section>
          </main>

          <aside className="grid content-start gap-5">
            <KnowledgeCheckPanel
              slug={slug}
              assignmentId={assignment.id}
              checks={checks}
              feedbackEndpoint={feedbackEndpoint}
            />
            <NextUpPanel
              courseSlug={courseSlug}
              currentLesson={lesson}
              lessonProgress={lessonProgress}
              nextLesson={nextLesson}
              slug={slug}
            />
          </aside>
        </div>
      </div>
    </LearnerAppShell>
  );
}

function AssignmentRequiredState({ slug, courseSlug, courseTitle }: { slug: string; courseSlug: string; courseTitle: string }) {
  return (
    <div className="lh-main-inner">
      <header className="lh-main-head">
        <div>
          <p className="lh-eyebrow">Lesson runtime</p>
          <h1>{courseTitle}</h1>
        </div>
      </header>
      <EmptyActionState
        action={
          <div className="flex flex-wrap gap-3">
            <PrimaryButton
              href={`/org/${encodeURIComponent(slug)}/learn/courses/${encodeURIComponent(courseSlug)}`}
              variant="blue"
            >
              Back to overview
            </PrimaryButton>
            <PrimaryButton href={`/org/${encodeURIComponent(slug)}/learn/catalog`} variant="light">
              Open catalog
            </PrimaryButton>
          </div>
        }
        body="An admin or manager must assign this course before you can launch the lesson runtime."
        title="Assignment required"
      />
    </div>
  );
}

function LessonOutline({
  slug,
  courseSlug,
  modules,
  lessons,
  currentLessonId,
}: {
  slug: string;
  courseSlug: string;
  modules: CourseModule[];
  lessons: CourseLesson[];
  currentLessonId: string;
}) {
  const ungroupedLessons = lessons.filter((lesson) => !lesson.moduleId);

  return (
    <aside className="lh-lesson-outline">
      <div>
        <p className="text-xs font-black uppercase tracking-[0.14em] text-[var(--learnhub-teal)]">Course outline</p>
        <h2 className="mt-2 text-xl font-black text-white">Lessons</h2>
      </div>

      {modules.map((courseModule) => {
        const moduleLessons = lessons.filter((lesson) => lesson.moduleId === courseModule.id);

        return (
          <section className="grid gap-2" key={courseModule.id}>
            <h3 className="min-w-0 break-words text-sm font-black text-slate-300">{courseModule.title}</h3>
            {moduleLessons.length === 0 ? (
              <p className="text-xs text-slate-500">Lessons are being prepared.</p>
            ) : (
              <LessonOutlineLinks
                courseSlug={courseSlug}
                currentLessonId={currentLessonId}
                lessons={moduleLessons}
                slug={slug}
              />
            )}
          </section>
        );
      })}

      {ungroupedLessons.length > 0 ? (
        <section className="grid gap-2">
          <h3 className="text-sm font-black text-slate-300">Additional lessons</h3>
          <LessonOutlineLinks
            courseSlug={courseSlug}
            currentLessonId={currentLessonId}
            lessons={ungroupedLessons}
            slug={slug}
          />
        </section>
      ) : null}
    </aside>
  );
}

function LessonOutlineLinks({
  slug,
  courseSlug,
  lessons,
  currentLessonId,
}: {
  slug: string;
  courseSlug: string;
  lessons: CourseLesson[];
  currentLessonId: string;
}) {
  return (
    <div className="grid gap-2">
      {lessons.map((lesson) => (
        <Link
          aria-current={lesson.id === currentLessonId ? "page" : undefined}
          className={
            lesson.id === currentLessonId
              ? "rounded-xl bg-white px-3 py-2 text-sm font-black text-[var(--learnhub-ink)]"
              : "rounded-xl px-3 py-2 text-sm font-bold text-slate-300 hover:bg-white/10"
          }
          href={`/org/${encodeURIComponent(slug)}/learn/courses/${encodeURIComponent(courseSlug)}/lessons/${encodeURIComponent(lesson.slug)}`}
          key={lesson.id}
        >
          <span className="block min-w-0 break-words">{lesson.title}</span>
          <span className={lesson.id === currentLessonId ? "text-xs text-[var(--learnhub-muted)]" : "text-xs text-slate-500"}>
            {lesson.required ? "Required" : "Optional"} / {formatSeconds(lesson.durationSeconds)}
          </span>
        </Link>
      ))}
    </div>
  );
}

function LessonChapters({ chapters }: { chapters: CourseLesson["chapters"] }) {
  return (
    <section className="lh-aside-card">
      <p className="lh-eyebrow">Chapters</p>
      <h2 className="mt-2 text-2xl font-black text-[var(--learnhub-ink)]">Chapters</h2>
      <div className="mt-4 grid gap-3">
        {chapters.length === 0 ? (
          <p className="text-sm text-[var(--learnhub-muted)]">No chapters recorded for this lesson.</p>
        ) : (
          chapters.map((chapter, index) => (
            <div className="grid gap-1 rounded-xl bg-[var(--learnhub-app)] p-3" key={`${chapter.startSecond}-${index}`}>
              <p className="min-w-0 break-words text-sm font-black text-[var(--learnhub-ink)]">{chapter.title}</p>
              <p className="text-xs font-bold text-[var(--learnhub-muted)]">
                {formatSeconds(chapter.startSecond)}
                {chapter.endSecond ? ` - ${formatSeconds(chapter.endSecond)}` : ""}
              </p>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

function LessonTranscript({ cues }: { cues: CourseLesson["transcriptCues"] }) {
  return (
    <section className="lh-aside-card">
      <p className="lh-eyebrow">Transcript</p>
      <h2 className="mt-2 text-2xl font-black text-[var(--learnhub-ink)]">Transcript</h2>
      <div className="mt-4 grid gap-3">
        {cues.length === 0 ? (
          <p className="text-sm text-[var(--learnhub-muted)]">No transcript cues recorded for this lesson.</p>
        ) : (
          cues.map((cue, index) => (
            <div className="grid gap-1 rounded-xl bg-[var(--learnhub-app)] p-3" key={`${cue.startSecond}-${index}`}>
              <p className="text-xs font-black text-[var(--learnhub-muted-strong)]">{formatSeconds(cue.startSecond)}</p>
              <p className="min-w-0 break-words text-sm text-[var(--learnhub-ink)]">{cue.text}</p>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

function NextUpPanel({
  slug,
  courseSlug,
  currentLesson,
  nextLesson,
  lessonProgress,
}: {
  slug: string;
  courseSlug: string;
  currentLesson: CourseLesson;
  nextLesson: CourseLesson | null;
  lessonProgress: CourseAssignment["videoProgress"][number] | null;
}) {
  return (
    <section className="lh-aside-card">
      <p className="lh-eyebrow">Next up</p>
      {nextLesson ? (
        <>
          <h2 className="mt-2 min-w-0 break-words text-2xl font-black text-[var(--learnhub-ink)]">{nextLesson.title}</h2>
          <p className="mt-2 text-sm text-[var(--learnhub-muted)]">
            Continue with the next {nextLesson.required ? "required" : "optional"} lesson after this one.
          </p>
          <div className="mt-4">
            <PrimaryButton
              href={`/org/${encodeURIComponent(slug)}/learn/courses/${encodeURIComponent(courseSlug)}/lessons/${encodeURIComponent(nextLesson.slug)}`}
              variant="light"
            >
              Open next lesson
            </PrimaryButton>
          </div>
        </>
      ) : (
        <>
          <h2 className="mt-2 text-2xl font-black text-[var(--learnhub-ink)]">Finish this lesson</h2>
          <p className="mt-2 text-sm text-[var(--learnhub-muted)]">
            Save progress, complete any checks, and return to the course overview when you are ready.
          </p>
          <div className="mt-4">
            <PrimaryButton
              href={`/org/${encodeURIComponent(slug)}/learn/courses/${encodeURIComponent(courseSlug)}`}
              variant="light"
            >
              Back to overview
            </PrimaryButton>
          </div>
        </>
      )}
      <dl className="mt-5 grid gap-3 border-t border-[var(--learnhub-line)] pt-4 text-sm">
        <DetailRow label="Current" value={currentLesson.title} />
        <DetailRow label="Duration" value={formatSeconds(currentLesson.durationSeconds)} />
        <DetailRow label="Last watched" value={lessonProgress ? formatSeconds(lessonProgress.lastPositionSecond) : "Not started"} />
      </dl>
    </section>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1">
      <dt className="text-xs font-black uppercase tracking-[0.12em] text-[var(--learnhub-muted-strong)]">{label}</dt>
      <dd className="min-w-0 break-words font-bold text-[var(--learnhub-ink)]">{value}</dd>
    </div>
  );
}

function formatAssignmentStatus(status: string): string {
  return status
    .split("_")
    .map((part) => part.slice(0, 1) + part.slice(1).toLowerCase())
    .join(" ");
}

function formatSeconds(seconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(totalSeconds / 60);
  const remainingSeconds = totalSeconds % 60;

  return `${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
}
