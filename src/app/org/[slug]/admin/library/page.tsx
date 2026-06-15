import { AdminAppShell } from "@/app/ui/learnhub-components";
import { ensureGlobalLibraryOrganization } from "@/modules/library/prisma-repository";

import { getAdminWorkspace } from "../admin-utils";
import { copyGlobalLibraryCourseFormAction } from "./actions";

export const dynamic = "force-dynamic";

type TenantLibraryPageProps = {
  params: Promise<{
    slug: string;
  }>;
};

export default async function TenantLibraryPage({ params }: TenantLibraryPageProps) {
  const { slug } = await params;
  const { organizationId, organizationName, prisma } = await getAdminWorkspace(slug);
  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: {
      globalLibraryEnabled: true,
    },
  });
  const globalLibraryOrganization = organization?.globalLibraryEnabled
    ? await ensureGlobalLibraryOrganization(prisma)
    : null;
  const globalCourses = organization?.globalLibraryEnabled
    ? await prisma.course.findMany({
        where: {
          organizationId: globalLibraryOrganization!.id,
          isGlobalLibraryCourse: true,
          status: "PUBLISHED",
        },
        orderBy: { title: "asc" },
        select: {
          id: true,
          title: true,
          slug: true,
          description: true,
          type: true,
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
      })
    : [];
  const existingCopies = globalCourses.length
    ? await prisma.course.findMany({
        where: {
          organizationId,
          globalLibrarySourceCourseId: { in: globalCourses.map((course) => course.id) },
        },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          title: true,
          slug: true,
          status: true,
          globalLibrarySourceCourseId: true,
        },
      })
    : [];
  const copyBySourceId = new Map(
    existingCopies
      .filter((course) => course.globalLibrarySourceCourseId !== null)
      .map((course) => [course.globalLibrarySourceCourseId!, course]),
  );
  const copyAction = async (formData: FormData) => {
    "use server";

    await copyGlobalLibraryCourseFormAction(slug, formData);
  };

  return (
    <AdminAppShell organizationName={organizationName} slug={slug} active="library">
      <div className="lh-main-inner lh-main-wide">
      <header className="lh-main-head">
        <div>
          <p className="lh-eyebrow">Catalog Admin</p>
          <h1>{organizationName} global library</h1>
        </div>
      </header>

      {!organization?.globalLibraryEnabled ? (
        <section className="rounded-md border border-slate-200 p-5">
          <h2 className="text-lg font-semibold text-slate-950">Access disabled</h2>
          <p className="mt-2 text-sm text-slate-600">
            A platform owner must enable global library access before this organization can copy shared courses.
          </p>
        </section>
      ) : (
        <section className="grid gap-4">
          {globalCourses.length === 0 ? (
            <div className="rounded-md border border-slate-200 p-5 text-sm text-slate-500">
              No published global library courses are available.
            </div>
          ) : (
            globalCourses.map((course) => {
              const existingCopy = copyBySourceId.get(course.id);

              return (
                <article key={course.id} className="rounded-md border border-slate-200 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <h2 className="text-lg font-semibold text-slate-950">{course.title}</h2>
                      <p className="mt-1 max-w-3xl text-sm text-slate-600">{course.description || "No description yet."}</p>
                      <p className="mt-2 text-sm text-slate-500">
                        {course.type} / {course.expectedDurationMinutes}m / {course.estimatedCompletionBusinessDays} business days /{" "}
                        {course._count.videoLessons} videos / {course._count.scormPackages} SCORM
                      </p>
                      <p className="mt-2 text-sm text-slate-500">
                        {course.category?.name ?? "Uncategorized"} /{" "}
                        {course.tagLinks.map((link) => link.tag.name).join(", ") || "No tags"}
                      </p>
                    </div>
                    {existingCopy ? (
                      <div className="min-w-64 rounded-md bg-slate-50 p-3 text-sm text-slate-700">
                        <p className="font-medium text-slate-950">Already copied</p>
                        <p>
                          {existingCopy.title} / {existingCopy.status}
                        </p>
                        <p className="text-slate-500">/{existingCopy.slug}</p>
                      </div>
                    ) : null}
                  </div>

                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    {!existingCopy ? (
                      <form action={copyAction} className="flex flex-wrap items-end gap-3">
                        <input type="hidden" name="globalCourseId" value={course.id} />
                        <input type="hidden" name="duplicateAction" value="BLOCK" />
                        <input type="hidden" name="targetTitle" value={course.title} />
                        <input type="hidden" name="targetSlug" value={course.slug} />
                        <button type="submit" className="rounded-md bg-slate-950 px-3 py-2 text-sm font-medium text-white">
                          Copy to catalog
                        </button>
                      </form>
                    ) : (
                      <form action={copyAction} className="grid gap-3 rounded-md border border-slate-200 p-3">
                        <input type="hidden" name="globalCourseId" value={course.id} />
                        <input type="hidden" name="duplicateAction" value="CREATE_DUPLICATE" />
                        <label className="grid gap-1 text-sm font-medium text-slate-700">
                          Duplicate title
                          <input
                            name="targetTitle"
                            defaultValue={`${course.title} Copy`}
                            className="rounded-md border border-slate-300 px-3 py-2"
                          />
                        </label>
                        <label className="grid gap-1 text-sm font-medium text-slate-700">
                          Duplicate slug
                          <input
                            name="targetSlug"
                            defaultValue={`${course.slug}-copy`}
                            className="rounded-md border border-slate-300 px-3 py-2"
                          />
                        </label>
                        <button type="submit" className="w-fit rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700">
                          Create duplicate copy
                        </button>
                      </form>
                    )}
                  </div>
                </article>
              );
            })
          )}
        </section>
      )}
      </div>
    </AdminAppShell>
  );
}
