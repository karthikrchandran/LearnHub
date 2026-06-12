import { requireOrganizationUsersAdminBySlug } from "@/lib/auth/guards";

import {
  createCategoryFormAction,
  createCourseFormAction,
  createTagFormAction,
  updateCourseLifecycleFormAction,
} from "./actions";

export const dynamic = "force-dynamic";

type CatalogAdminPageProps = {
  params: Promise<{
    slug: string;
  }>;
};

const lifecycleLabels = ["Draft", "Published", "Deprecated", "Retired"];

export default async function CatalogAdminPage({ params }: CatalogAdminPageProps) {
  const { slug } = await params;
  const { organizationId } = await requireOrganizationUsersAdminBySlug(slug);
  const { prisma } = await import("@/lib/prisma");
  const catalog = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: {
      categories: {
        orderBy: { name: "asc" },
        select: { id: true, name: true, slug: true },
      },
      tags: {
        orderBy: { name: "asc" },
        select: { id: true, name: true, slug: true },
      },
      courses: {
        orderBy: { title: "asc" },
        select: {
          id: true,
          title: true,
          slug: true,
          type: true,
          status: true,
          expectedDurationMinutes: true,
          estimatedCompletionBusinessDays: true,
          category: {
            select: { name: true },
          },
          tagLinks: {
            select: {
              tag: {
                select: { name: true },
              },
            },
            orderBy: { tag: { name: "asc" } },
          },
        },
      },
    },
  });

  const categories = catalog?.categories ?? [];
  const tags = catalog?.tags ?? [];
  const courses = catalog?.courses ?? [];
  const createCategoryAction = async (formData: FormData) => {
    "use server";

    await createCategoryFormAction(slug, formData);
  };
  const createTagAction = async (formData: FormData) => {
    "use server";

    await createTagFormAction(slug, formData);
  };
  const createCourseAction = async (formData: FormData) => {
    "use server";

    await createCourseFormAction(slug, formData);
  };
  const updateLifecycleAction = async (formData: FormData) => {
    "use server";

    await updateCourseLifecycleFormAction(slug, formData);
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-6 px-6 py-10">
      <header>
        <p className="text-sm font-medium uppercase tracking-wide text-slate-500">Catalog Admin</p>
        <h1 className="text-3xl font-semibold text-slate-950">{slug} course catalog</h1>
      </header>

      <section className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-md border border-slate-200 p-4">
          <h2 className="text-lg font-semibold text-slate-950">Categories</h2>
          <ul className="mt-3 space-y-2 text-sm text-slate-700">
            {categories.length === 0 ? (
              <li className="text-slate-500">No categories yet.</li>
            ) : (
              categories.map((category) => (
                <li key={category.id} className="rounded-md bg-slate-50 px-3 py-2">
                  {category.name}
                  <span className="ml-2 text-slate-500">/{category.slug}</span>
                </li>
              ))
            )}
          </ul>
          <form action={createCategoryAction} className="mt-4 grid gap-3">
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              Name
              <input name="name" className="rounded-md border border-slate-300 px-3 py-2" />
            </label>
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              Slug
              <input name="slug" className="rounded-md border border-slate-300 px-3 py-2" />
            </label>
            <button type="submit" className="rounded-md bg-slate-950 px-3 py-2 text-sm font-medium text-white">
              Create category
            </button>
          </form>
        </div>

        <div className="rounded-md border border-slate-200 p-4">
          <h2 className="text-lg font-semibold text-slate-950">Tags</h2>
          <ul className="mt-3 space-y-2 text-sm text-slate-700">
            {tags.length === 0 ? (
              <li className="text-slate-500">No tags yet.</li>
            ) : (
              tags.map((tag) => (
                <li key={tag.id} className="rounded-md bg-slate-50 px-3 py-2">
                  {tag.name}
                  <span className="ml-2 text-slate-500">/{tag.slug}</span>
                </li>
              ))
            )}
          </ul>
          <form action={createTagAction} className="mt-4 grid gap-3">
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              Name
              <input name="name" className="rounded-md border border-slate-300 px-3 py-2" />
            </label>
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              Slug
              <input name="slug" className="rounded-md border border-slate-300 px-3 py-2" />
            </label>
            <button type="submit" className="rounded-md bg-slate-950 px-3 py-2 text-sm font-medium text-white">
              Create tag
            </button>
          </form>
        </div>

        <div className="rounded-md border border-slate-200 p-4">
          <h2 className="text-lg font-semibold text-slate-950">Courses</h2>
          <form action={createCourseAction} className="mt-4 grid gap-3">
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              Title
              <input name="title" className="rounded-md border border-slate-300 px-3 py-2" />
            </label>
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              Slug
              <input name="slug" className="rounded-md border border-slate-300 px-3 py-2" />
            </label>
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              Description
              <textarea name="description" className="min-h-20 rounded-md border border-slate-300 px-3 py-2" />
            </label>
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
            <fieldset className="grid gap-2 text-sm font-medium text-slate-700">
              <legend>Tags</legend>
              {tags.length === 0 ? (
                <p className="text-sm font-normal text-slate-500">Create tags before linking them to courses.</p>
              ) : (
                tags.map((tag) => (
                  <label key={tag.id} className="flex items-center gap-2 font-normal text-slate-700">
                    <input type="checkbox" name="tagIds" value={tag.id} className="h-4 w-4 rounded border-slate-300" />
                    {tag.name}
                  </label>
                ))
              )}
            </fieldset>
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              Expected duration minutes
              <input name="expectedDurationMinutes" type="number" min="1" className="rounded-md border border-slate-300 px-3 py-2" />
            </label>
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              Estimated business days
              <input name="estimatedCompletionBusinessDays" type="number" min="0" className="rounded-md border border-slate-300 px-3 py-2" />
            </label>
            <button type="submit" className="rounded-md bg-slate-950 px-3 py-2 text-sm font-medium text-white">
              Create course
            </button>
          </form>
        </div>
      </section>

      <section className="rounded-md border border-slate-200 p-4">
        <h2 className="text-lg font-semibold text-slate-950">Course lifecycle</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-4">
          {lifecycleLabels.map((label) => (
            <div key={label} className="rounded-md bg-slate-50 p-3 text-sm font-medium text-slate-700">
              {label}
            </div>
          ))}
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead>
              <tr className="text-left text-slate-500">
                <th className="px-3 py-2 font-medium">Course</th>
                <th className="px-3 py-2 font-medium">Type</th>
                <th className="px-3 py-2 font-medium">Category</th>
                <th className="px-3 py-2 font-medium">Tags</th>
                <th className="px-3 py-2 font-medium">Duration</th>
                <th className="px-3 py-2 font-medium">Lifecycle</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {courses.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-4 text-slate-500">
                    No courses yet.
                  </td>
                </tr>
              ) : (
                courses.map((course) => (
                  <tr key={course.id}>
                    <td className="px-3 py-3">
                      <div className="font-medium text-slate-950">{course.title}</div>
                      <div className="text-slate-500">/{course.slug}</div>
                    </td>
                    <td className="px-3 py-3 text-slate-700">{course.type}</td>
                    <td className="px-3 py-3 text-slate-700">{course.category?.name ?? "None"}</td>
                    <td className="px-3 py-3 text-slate-700">
                      {course.tagLinks.map((link) => link.tag.name).join(", ") || "None"}
                    </td>
                    <td className="px-3 py-3 text-slate-700">
                      {course.expectedDurationMinutes}m / {course.estimatedCompletionBusinessDays} business days
                    </td>
                    <td className="px-3 py-3">
                      <form action={updateLifecycleAction} className="flex flex-wrap gap-2">
                        <input type="hidden" name="courseId" value={course.id} />
                        {["DRAFT", "PUBLISHED", "DEPRECATED", "RETIRED"].map((status) => (
                          <button
                            key={status}
                            name="status"
                            value={status}
                            className="rounded-md border border-slate-200 px-2 py-1 text-xs font-medium text-slate-700"
                            type="submit"
                          >
                            {status === course.status ? `${status} current` : status}
                          </button>
                        ))}
                      </form>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
