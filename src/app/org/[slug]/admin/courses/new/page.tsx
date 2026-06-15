import { AdminAppShell } from "@/app/ui/learnhub-components";

import { getAdminWorkspace } from "../../admin-utils";
import { createAdminCourseFormAction } from "./actions";

export const dynamic = "force-dynamic";

type NewAdminCoursePageProps = {
  params: Promise<{
    slug: string;
  }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function NewAdminCoursePage({ params, searchParams }: NewAdminCoursePageProps) {
  const { slug } = await params;
  const resolvedSearchParams = (await searchParams) ?? {};
  const error = firstParam(resolvedSearchParams.error);
  const { organizationId, organizationName, prisma } = await getAdminWorkspace(slug);
  const [categories, tags] = await Promise.all([
    prisma.courseCategory.findMany({
      where: { organizationId },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.courseTag.findMany({
      where: { organizationId },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);
  const createCourseAction = async (formData: FormData) => {
    "use server";

    await createAdminCourseFormAction(slug, formData);
  };

  return (
    <AdminAppShell organizationName={organizationName} slug={slug} active="create-course">
      <div className="lh-main-inner">
        <header className="lh-main-head">
          <div>
            <p className="lh-eyebrow">Courses</p>
            <h1>Create Course</h1>
            <p>Create the course shell, then continue into video content or SCORM package import.</p>
          </div>
        </header>

        {error ? (
          <section className="rounded-md border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-800">
            {error}
          </section>
        ) : null}

        <form action={createCourseAction} className="grid gap-4 rounded-md border border-slate-200 bg-white p-5">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              Title
              <input name="title" className="rounded-md border border-slate-300 px-3 py-2" />
            </label>
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              Slug
              <input name="slug" className="rounded-md border border-slate-300 px-3 py-2" />
            </label>
          </div>
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Description
            <textarea name="description" className="min-h-24 rounded-md border border-slate-300 px-3 py-2" />
          </label>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              Type
              <select name="type" className="rounded-md border border-slate-300 px-3 py-2">
                <option value="NATIVE_VIDEO">Native video</option>
                <option value="SCORM_1_2">SCORM 1.2</option>
              </select>
            </label>
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              Lifecycle
              <select name="status" className="rounded-md border border-slate-300 px-3 py-2">
                <option value="DRAFT">Draft</option>
                <option value="PUBLISHED">Published</option>
              </select>
            </label>
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              Category
              <select name="categoryId" className="rounded-md border border-slate-300 px-3 py-2">
                <option value="">No category</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              Expected duration minutes
              <input name="expectedDurationMinutes" type="number" min="1" className="rounded-md border border-slate-300 px-3 py-2" />
            </label>
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              Estimated business days
              <input name="estimatedCompletionBusinessDays" type="number" min="0" className="rounded-md border border-slate-300 px-3 py-2" />
            </label>
          </div>
          <fieldset className="grid gap-2 text-sm font-medium text-slate-700">
            <legend>Tags</legend>
            {tags.length === 0 ? (
              <p className="text-sm font-normal text-slate-500">Create tags in Catalog Setup before linking them to courses.</p>
            ) : (
              tags.map((tag) => (
                <label key={tag.id} className="flex items-center gap-2 font-normal text-slate-700">
                  <input type="checkbox" name="tagIds" value={tag.id} className="h-4 w-4 rounded border-slate-300" />
                  {tag.name}
                </label>
              ))
            )}
          </fieldset>
          <button type="submit" className="w-fit rounded-md bg-slate-950 px-4 py-2 text-sm font-medium text-white">
            Create Course
          </button>
        </form>
      </div>
    </AdminAppShell>
  );
}
