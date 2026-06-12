import { requireOrganizationUsersAdminBySlug } from "@/lib/auth/guards";
import { createPrismaKnowledgeCheckRepository } from "@/modules/assessments/prisma-repository";

import {
  activateCheckFormAction,
  createCheckFormAction,
  deactivateCheckFormAction,
  reorderChecksFormAction,
  updateCheckFormAction,
} from "./actions";

export const dynamic = "force-dynamic";

type CourseChecksAdminPageProps = {
  params: Promise<{
    slug: string;
    courseSlug: string;
  }>;
};

type CheckRow = {
  id: string;
  lessonId: string | null;
  prompt: string;
  questionType: "SINGLE_CHOICE" | "MULTIPLE_CHOICE" | "TRUE_FALSE";
  required: boolean;
  active: boolean;
  explanation: string | null;
  answers: Array<{
    id: string;
    text: string;
    correct: boolean;
    feedback: string | null;
    sortOrder: number;
  }>;
};

const defaultAnswers = [
  { text: "First answer", correct: true, feedback: "Correct." },
  { text: "Second answer", correct: false, feedback: "Review the lesson." },
];

export default async function CourseChecksAdminPage({ params }: CourseChecksAdminPageProps) {
  const { slug, courseSlug } = await params;
  const { organizationId } = await requireOrganizationUsersAdminBySlug(slug);
  const { prisma } = await import("@/lib/prisma");
  const course = await prisma.course.findFirst({
    where: {
      organizationId,
      slug: courseSlug,
      type: "NATIVE_VIDEO",
    },
    select: {
      id: true,
      title: true,
      videoLessons: {
        orderBy: { sortOrder: "asc" },
        select: { id: true, title: true, slug: true, sortOrder: true },
      },
    },
  });

  if (!course) {
    return (
      <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-4 px-6 py-10">
        <header>
          <p className="text-sm font-medium uppercase tracking-wide text-slate-500">Knowledge checks</p>
          <h1 className="text-3xl font-semibold text-slate-950">
            {slug} / {courseSlug}
          </h1>
        </header>
        <section className="rounded-md border border-slate-200 p-4">
          <h2 className="text-lg font-semibold text-slate-950">Native video course not found</h2>
          <p className="mt-2 text-sm text-slate-600">Create or select a native video course before editing checks.</p>
        </section>
      </main>
    );
  }

  const repository = createPrismaKnowledgeCheckRepository(prisma);
  const checks = await repository.listChecksForCourse({ organizationId, courseSlug }) as CheckRow[];
  const createCheckAction = async (formData: FormData) => {
    "use server";

    await createCheckFormAction(slug, courseSlug, formData);
  };
  const reorderChecksAction = async (formData: FormData) => {
    "use server";

    await reorderChecksFormAction(slug, courseSlug, formData);
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-6 px-6 py-10">
      <header>
        <p className="text-sm font-medium uppercase tracking-wide text-slate-500">Knowledge checks</p>
        <h1 className="text-3xl font-semibold text-slate-950">{course.title}</h1>
        <p className="mt-2 text-sm text-slate-600">
          {slug} / {courseSlug}
        </p>
      </header>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="rounded-md border border-slate-200 p-4">
          <h2 className="text-lg font-semibold text-slate-950">Create check</h2>
          <form action={createCheckAction} className="mt-4 grid gap-3 md:grid-cols-2">
            <label className="grid gap-1 text-sm font-medium text-slate-700 md:col-span-2">
              Prompt
              <input name="prompt" className="rounded-md border border-slate-300 px-3 py-2" />
            </label>
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              Lesson
              <select name="lessonId" className="rounded-md border border-slate-300 px-3 py-2">
                <option value="">Course-level</option>
                {course.videoLessons.map((lesson) => (
                  <option key={lesson.id} value={lesson.id}>
                    {lesson.title}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              Question type
              <select name="questionType" className="rounded-md border border-slate-300 px-3 py-2">
                <option value="SINGLE_CHOICE">Single answer</option>
                <option value="MULTIPLE_CHOICE">Multiple answer</option>
                <option value="TRUE_FALSE">True/false</option>
              </select>
            </label>
            <label className="grid gap-1 text-sm font-medium text-slate-700 md:col-span-2">
              Explanation
              <textarea name="explanation" className="min-h-24 rounded-md border border-slate-300 px-3 py-2" />
            </label>
            <label className="grid gap-1 text-sm font-medium text-slate-700 md:col-span-2">
              Answers and Answer feedback
              <textarea
                name="answers"
                defaultValue={JSON.stringify(defaultAnswers, null, 2)}
                className="min-h-40 rounded-md border border-slate-300 px-3 py-2 font-mono text-sm"
              />
            </label>
            <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
              <input name="required" type="checkbox" defaultChecked className="h-4 w-4 rounded border-slate-300" />
              Required
            </label>
            <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
              <input name="active" type="checkbox" defaultChecked className="h-4 w-4 rounded border-slate-300" />
              Active
            </label>
            <button type="submit" className="rounded-md bg-slate-950 px-4 py-2 text-sm font-medium text-white md:col-span-2">
              Save check
            </button>
          </form>
        </div>

        <aside className="rounded-md border border-slate-200 p-4">
          <h2 className="text-lg font-semibold text-slate-950">Reorder</h2>
          <form action={reorderChecksAction} className="mt-4 grid gap-3">
            <input type="hidden" name="ids" value={JSON.stringify(checks.map((check) => check.id))} />
            <ol className="space-y-2 text-sm text-slate-700">
              {checks.map((check, index) => (
                <li key={check.id} className="rounded-md bg-slate-50 px-3 py-2">
                  {index + 1}. {check.prompt}
                </li>
              ))}
            </ol>
            <button type="submit" className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700">
              Reorder
            </button>
          </form>
        </aside>
      </section>

      <section className="rounded-md border border-slate-200 p-4">
        <h2 className="text-lg font-semibold text-slate-950">Current checks</h2>
        <div className="mt-4 divide-y divide-slate-100">
          {checks.length === 0 ? (
            <p className="py-4 text-sm text-slate-500">No knowledge checks yet.</p>
          ) : (
            checks.map((check) => (
              <CheckEditor
                key={check.id}
                check={check}
                lessons={course.videoLessons}
                slug={slug}
                courseSlug={courseSlug}
              />
            ))
          )}
        </div>
      </section>
    </main>
  );
}

function CheckEditor({
  check,
  lessons,
  slug,
  courseSlug,
}: {
  check: CheckRow;
  lessons: Array<{ id: string; title: string }>;
  slug: string;
  courseSlug: string;
}) {
  const updateAction = async (formData: FormData) => {
    "use server";

    await updateCheckFormAction(slug, courseSlug, check.id, formData);
  };
  const activateAction = async () => {
    "use server";

    await activateCheckFormAction(slug, courseSlug, check.id);
  };
  const deactivateAction = async () => {
    "use server";

    await deactivateCheckFormAction(slug, courseSlug, check.id);
  };

  return (
    <article className="grid gap-4 py-5 lg:grid-cols-[minmax(0,1fr)_12rem]">
      <form action={updateAction} className="grid gap-3 md:grid-cols-2">
        <label className="grid gap-1 text-sm font-medium text-slate-700 md:col-span-2">
          Prompt
          <input name="prompt" defaultValue={check.prompt} className="rounded-md border border-slate-300 px-3 py-2" />
        </label>
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Lesson
          <select name="lessonId" defaultValue={check.lessonId ?? ""} className="rounded-md border border-slate-300 px-3 py-2">
            <option value="">Course-level</option>
            {lessons.map((lesson) => (
              <option key={lesson.id} value={lesson.id}>
                {lesson.title}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Question type
          <select name="questionType" defaultValue={check.questionType} className="rounded-md border border-slate-300 px-3 py-2">
            <option value="SINGLE_CHOICE">Single answer</option>
            <option value="MULTIPLE_CHOICE">Multiple answer</option>
            <option value="TRUE_FALSE">True/false</option>
          </select>
        </label>
        <label className="grid gap-1 text-sm font-medium text-slate-700 md:col-span-2">
          Explanation
          <textarea name="explanation" defaultValue={check.explanation ?? ""} className="min-h-24 rounded-md border border-slate-300 px-3 py-2" />
        </label>
        <label className="grid gap-1 text-sm font-medium text-slate-700 md:col-span-2">
          Answers and Answer feedback
          <textarea
            name="answers"
            defaultValue={JSON.stringify(check.answers.map((answer) => ({
              text: answer.text,
              correct: answer.correct,
              feedback: answer.feedback,
            })), null, 2)}
            className="min-h-40 rounded-md border border-slate-300 px-3 py-2 font-mono text-sm"
          />
        </label>
        <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
          <input name="required" type="checkbox" defaultChecked={check.required} className="h-4 w-4 rounded border-slate-300" />
          Required
        </label>
        <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
          <input name="active" type="checkbox" defaultChecked={check.active} className="h-4 w-4 rounded border-slate-300" />
          Active
        </label>
        <button type="submit" className="rounded-md bg-slate-950 px-4 py-2 text-sm font-medium text-white md:col-span-2">
          Update check
        </button>
      </form>
      <div className="flex flex-col gap-2 text-sm">
        <p className="font-medium text-slate-950">{check.active ? "Active" : "Inactive"}</p>
        <form action={activateAction}>
          <button type="submit" className="w-full rounded-md border border-slate-300 px-3 py-2 font-medium text-slate-700">
            Activate
          </button>
        </form>
        <form action={deactivateAction}>
          <button type="submit" className="w-full rounded-md border border-slate-300 px-3 py-2 font-medium text-slate-700">
            Deactivate
          </button>
        </form>
      </div>
    </article>
  );
}
