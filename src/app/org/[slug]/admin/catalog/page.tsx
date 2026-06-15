import { AdminAppShell } from "@/app/ui/learnhub-components";

import { getAdminWorkspace } from "../admin-utils";
import { createCategoryFormAction, createTagFormAction } from "./actions";

export const dynamic = "force-dynamic";

type CatalogAdminPageProps = {
  params: Promise<{
    slug: string;
  }>;
};

export default async function CatalogAdminPage({ params }: CatalogAdminPageProps) {
  const { slug } = await params;
  const { organizationId, organizationName, prisma } = await getAdminWorkspace(slug);
  const [categories, tags] = await Promise.all([
    prisma.courseCategory.findMany({
      where: { organizationId },
      orderBy: { name: "asc" },
      select: { id: true, name: true, slug: true },
    }),
    prisma.courseTag.findMany({
      where: { organizationId },
      orderBy: { name: "asc" },
      select: { id: true, name: true, slug: true },
    }),
  ]);
  const createCategoryAction = async (formData: FormData) => {
    "use server";

    await createCategoryFormAction(slug, formData);
  };
  const createTagAction = async (formData: FormData) => {
    "use server";

    await createTagFormAction(slug, formData);
  };

  return (
    <AdminAppShell organizationName={organizationName} slug={slug} active="catalog">
      <div className="lh-main-inner lh-main-wide">
        <header className="lh-main-head">
          <div>
            <p className="lh-eyebrow">Catalog</p>
            <h1>Catalog setup</h1>
            <p>Manage categories and tags used by course creation, learner catalog filters, and reports.</p>
          </div>
        </header>

        <section className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-md border border-slate-200 bg-white p-4">
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
              <button type="submit" className="w-fit rounded-md bg-slate-950 px-4 py-2 text-sm font-medium text-white">
                Create category
              </button>
            </form>
          </div>

          <div className="rounded-md border border-slate-200 bg-white p-4">
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
              <button type="submit" className="w-fit rounded-md bg-slate-950 px-4 py-2 text-sm font-medium text-white">
                Create tag
              </button>
            </form>
          </div>
        </section>
      </div>
    </AdminAppShell>
  );
}
