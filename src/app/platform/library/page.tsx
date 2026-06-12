import { requirePlatformOwner } from "@/lib/auth/guards";
import { ensureGlobalLibraryOrganization } from "@/modules/library/prisma-repository";
import Link from "next/link";

import { createGlobalLibraryCourseFormAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function PlatformLibraryPage() {
  await requirePlatformOwner();
  const { prisma } = await import("@/lib/prisma");
  const globalLibraryOrganization = await ensureGlobalLibraryOrganization(prisma);
  const courses = await prisma.course.findMany({
    where: {
      organizationId: globalLibraryOrganization.id,
      isGlobalLibraryCourse: true,
    },
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
        orderBy: { tag: { name: "asc" } },
        select: {
          tag: {
            select: { name: true },
          },
        },
      },
      _count: {
        select: {
          videoLessons: true,
          scormPackages: true,
        },
      },
    },
  });
  const createAction = async (formData: FormData) => {
    "use server";

    await createGlobalLibraryCourseFormAction(formData);
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-6 px-6 py-10">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium uppercase tracking-wide text-slate-500">Platform Owner</p>
          <h1 className="text-3xl font-semibold text-slate-950">Global course library</h1>
        </div>
        <Link href="/platform" className="rounded-md border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700">
          Platform dashboard
        </Link>
      </header>

      <section className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="rounded-md border border-slate-200 p-4">
          <h2 className="text-lg font-semibold text-slate-950">Library courses</h2>
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead>
                <tr className="text-left text-slate-500">
                  <th className="px-3 py-2 font-medium">Course</th>
                  <th className="px-3 py-2 font-medium">Type</th>
                  <th className="px-3 py-2 font-medium">Lifecycle</th>
                  <th className="px-3 py-2 font-medium">Taxonomy</th>
                  <th className="px-3 py-2 font-medium">Metadata</th>
                  <th className="px-3 py-2 font-medium">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {courses.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-4 text-slate-500">
                      No global courses created yet.
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
                      <td className="px-3 py-3 text-slate-700">{course.status}</td>
                      <td className="px-3 py-3 text-slate-700">
                        {course.category?.name ?? "Uncategorized"} /{" "}
                        {course.tagLinks.map((link) => link.tag.name).join(", ") || "No tags"}
                      </td>
                      <td className="px-3 py-3 text-slate-700">
                        {course.expectedDurationMinutes}m / {course.estimatedCompletionBusinessDays} business days /{" "}
                        {course._count.videoLessons} videos / {course._count.scormPackages} SCORM
                      </td>
                      <td className="px-3 py-3">
                        <Link className="font-medium text-slate-950 underline" href={`/platform/library/${course.slug}`}>
                          Manage
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <form action={createAction} className="grid h-fit gap-3 rounded-md border border-slate-200 p-4">
          <h2 className="text-lg font-semibold text-slate-950">Create global course</h2>
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
      </section>
    </main>
  );
}
