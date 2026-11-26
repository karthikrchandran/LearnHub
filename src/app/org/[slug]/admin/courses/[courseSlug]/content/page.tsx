import { AdminAppShell } from "@/app/ui/learnhub-components";
import { getEnv } from "@/lib/env";
import {
  getMediaProviderReadiness,
  readinessText,
} from "@/modules/providers/media-provider-readiness";

import { getAdminWorkspace } from "../../../admin-utils";
import {
  createLessonFormAction,
  replaceChaptersFormAction,
  replaceTranscriptFormAction,
} from "./actions";
import { MuxVideoUploadForm } from "./mux-video-upload-form";
import { LessonAuthoringWizard } from "./lesson-authoring-wizard";

export const dynamic = "force-dynamic";

type CourseContentAdminPageProps = {
  params: Promise<{
    slug: string;
    courseSlug: string;
  }>;
};

export default async function CourseContentAdminPage({ params }: CourseContentAdminPageProps) {
  const { slug, courseSlug } = await params;
  const { organizationId, organizationName, prisma } = await getAdminWorkspace(slug);
  const env = getEnv();
  const readiness = getMediaProviderReadiness(env);
  const course = await prisma.course.findFirst({
    where: {
      organizationId,
      slug: courseSlug,
      type: "NATIVE_VIDEO",
    },
    select: {
      id: true,
      title: true,
      modules: {
        orderBy: { sortOrder: "asc" },
        select: { id: true, title: true, slug: true, sortOrder: true },
      },
      videoLessons: {
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          title: true,
          slug: true,
          sortOrder: true,
          durationSeconds: true,
          required: true,
          playbackUrl: true,
          providerAssetId: true,
          providerUploadId: true,
          providerPlaybackId: true,
          providerStatus: true,
          providerError: true,
          authoringPrompt: true,
          narrationScript: true,
          videoGenerationPrompt: true,
          chapters: {
            orderBy: { sortOrder: "asc" },
            select: { title: true, startSecond: true, endSecond: true },
          },
          transcriptCues: {
            orderBy: { startSecond: "asc" },
            select: { startSecond: true, text: true },
          },
        },
      },
    },
  });
  const createLessonAction = async (formData: FormData) => {
    "use server";

    return createLessonFormAction(slug, courseSlug, formData);
  };
  const replaceChaptersAction = async (formData: FormData) => {
    "use server";

    await replaceChaptersFormAction(slug, courseSlug, formData);
  };
  const replaceTranscriptAction = async (formData: FormData) => {
    "use server";

    await replaceTranscriptFormAction(slug, courseSlug, formData);
  };

  if (!course) {
    return (
      <AdminAppShell organizationName={organizationName} slug={slug} active="video-content">
        <div className="lh-main-inner">
          <header className="lh-main-head">
            <div>
              <p className="lh-eyebrow">Course content</p>
              <h1>{slug} / {courseSlug}</h1>
            </div>
          </header>
          <section className="rounded-md border border-slate-200 bg-white p-4">
            <h2 className="text-lg font-semibold text-slate-950">Native video course not found</h2>
            <p className="mt-2 text-sm text-slate-600">Create or select a native video course before editing content.</p>
          </section>
        </div>
      </AdminAppShell>
    );
  }

  return (
    <AdminAppShell organizationName={organizationName} slug={slug} active="video-content">
      <div className="lh-main-inner lh-main-wide">
        <header className="lh-main-head">
          <div>
            <p className="lh-eyebrow">Course content</p>
            <h1>{course.title}</h1>
            <p>
              {slug} / {courseSlug}
            </p>
          </div>
          <a
            href={`/org/${encodeURIComponent(slug)}/admin/courses/${encodeURIComponent(courseSlug)}/checks`}
            className="rounded-md border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700"
          >
            Manage knowledge checks
          </a>
        </header>

      <section className="rounded-md border border-slate-200 p-4">
        <h2 className="text-lg font-semibold text-slate-950">Mux upload readiness</h2>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <div className="rounded-md bg-slate-50 p-3">
            <dt className="font-medium text-slate-500">Mux Video</dt>
            <dd className="mt-1 text-slate-950">{readinessText(readiness.mux)}</dd>
          </div>
          <div className="rounded-md bg-slate-50 p-3">
            <dt className="font-medium text-slate-500">Webhook status</dt>
            <dd className="mt-1 text-slate-950">
              {readiness.mux.configured ? "Ready for asset callbacks" : readinessText(readiness.mux)}
            </dd>
          </div>
        </dl>
      </section>

      <section className="grid gap-4">
        <LessonAuthoringWizard
          action={createLessonAction}
          aiDraftUrl={`/api/org/${encodeURIComponent(slug)}/courses/${encodeURIComponent(courseSlug)}/video/ai-draft`}
          aiConfigured={Boolean(env.OPENAI_API_KEY?.trim())}
          modules={course.modules}
          nextSortOrder={course.videoLessons.length}
        />
        <aside className="rounded-md border border-slate-200 p-4">
          <h2 className="text-lg font-semibold text-slate-950">Modules</h2>
          <div className="mt-4 space-y-2 text-sm text-slate-700">
            {course.modules.length === 0 ? (
              <p className="text-slate-500">No modules yet.</p>
            ) : (
              course.modules.map((module) => (
                <div key={module.id} className="rounded-md bg-slate-50 px-3 py-2">
                  {module.title}
                  <span className="ml-2 text-slate-500">/{module.slug}</span>
                </div>
              ))
            )}
          </div>
        </aside>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-md border border-slate-200 p-4">
          <h2 className="text-lg font-semibold text-slate-950">Chapters</h2>
          <form action={replaceChaptersAction} className="mt-4 grid gap-3">
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              Lesson
              <select name="lessonId" className="rounded-md border border-slate-300 px-3 py-2">
                {course.videoLessons.map((lesson) => (
                  <option key={lesson.id} value={lesson.id}>
                    {lesson.title}
                  </option>
                ))}
              </select>
            </label>
            {[0, 1, 2].map((row) => (
              <div key={row} className="grid gap-2 rounded-md bg-slate-50 p-3 sm:grid-cols-3">
                <input name="chapterTitle" placeholder="Chapter title" className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
                <input name="chapterStartSecond" type="number" min="0" placeholder="Start second" className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
                <input name="chapterEndSecond" type="number" min="0" placeholder="End second" className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
              </div>
            ))}
            <button type="submit" className="rounded-md bg-slate-950 px-4 py-2 text-sm font-medium text-white">
              Replace chapters
            </button>
          </form>
        </div>

        <div className="rounded-md border border-slate-200 p-4">
          <h2 className="text-lg font-semibold text-slate-950">Transcript</h2>
          <form action={replaceTranscriptAction} className="mt-4 grid gap-3">
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              Lesson
              <select name="lessonId" className="rounded-md border border-slate-300 px-3 py-2">
                {course.videoLessons.map((lesson) => (
                  <option key={lesson.id} value={lesson.id}>
                    {lesson.title}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              Timestamped transcript
              <textarea
                name="transcriptText"
                className="min-h-44 rounded-md border border-slate-300 px-3 py-2 font-mono text-sm"
                placeholder="[00:00] Welcome and learning goals"
              />
            </label>
            <button type="submit" className="rounded-md bg-slate-950 px-4 py-2 text-sm font-medium text-white">
              Replace transcript
            </button>
          </form>
        </div>
      </section>

      <section className="rounded-md border border-slate-200 p-4">
        <h2 className="text-lg font-semibold text-slate-950">Current lessons</h2>
        <div className="mt-4 divide-y divide-slate-100">
          {course.videoLessons.length === 0 ? (
            <p className="py-4 text-sm text-slate-500">No video lessons yet.</p>
          ) : (
            course.videoLessons.map((lesson) => (
              <article key={lesson.id} className="grid gap-3 py-4 md:grid-cols-[minmax(0,1fr)_14rem]">
                <div>
                  <h3 className="font-medium text-slate-950">{lesson.title}</h3>
                  <p className="mt-1 text-sm text-slate-600">
                    /{lesson.slug} / {lesson.durationSeconds}s / {lesson.required ? "required" : "optional"}
                  </p>
                  <p className="mt-1 text-sm text-slate-500">
                    {lesson.playbackUrl ?? lesson.providerAssetId ?? "No media source recorded"}
                  </p>
                  {lesson.videoGenerationPrompt ? (
                    <details className="mt-2 rounded-md bg-teal-50 p-3 text-sm">
                      <summary className="cursor-pointer font-medium text-teal-900">AI video prompt and script</summary>
                      <p className="mt-2 whitespace-pre-wrap text-slate-700">{lesson.videoGenerationPrompt}</p>
                      {lesson.narrationScript ? <pre className="mt-3 whitespace-pre-wrap font-sans text-slate-700">{lesson.narrationScript}</pre> : null}
                    </details>
                  ) : null}
                  <MuxVideoUploadForm
                    uploadAction={`/api/org/${encodeURIComponent(slug)}/courses/${encodeURIComponent(courseSlug)}/video/lessons/${encodeURIComponent(lesson.id)}/mux-upload`}
                    disabled={!readiness.mux.configured}
                    disabledMessage={readinessText(readiness.mux)}
                  />
                </div>
                <dl className="grid grid-cols-2 gap-2 text-sm">
                  <div className="rounded-md bg-slate-50 p-3">
                    <dt className="font-medium text-slate-500">Provider status</dt>
                    <dd className="mt-1 text-slate-950">{lesson.providerStatus === "DRAFT" ? "Draft · video needed" : lesson.providerStatus}</dd>
                    {lesson.providerError ? <dd className="mt-1 text-xs text-red-700">{lesson.providerError}</dd> : null}
                  </div>
                  <div className="rounded-md bg-slate-50 p-3">
                    <dt className="font-medium text-slate-500">Chapters</dt>
                    <dd className="mt-1 text-slate-950">{lesson.chapters.length}</dd>
                  </div>
                  <div className="rounded-md bg-slate-50 p-3">
                    <dt className="font-medium text-slate-500">Transcript cues</dt>
                    <dd className="mt-1 text-slate-950">{lesson.transcriptCues.length}</dd>
                  </div>
                </dl>
              </article>
            ))
          )}
        </div>
      </section>
      </div>
    </AdminAppShell>
  );
}
