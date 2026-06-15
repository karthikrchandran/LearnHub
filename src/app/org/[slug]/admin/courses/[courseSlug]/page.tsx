import { AdminAppShell } from "@/app/ui/learnhub-components";
import { requireOrganizationUsersAdminBySlug } from "@/lib/auth/guards";
import type { CatalogActionResult } from "@/modules/catalog/server-actions";
import { revalidatePath } from "next/cache";
import { notFound } from "next/navigation";

import { getAdminWorkspace } from "../../admin-utils";
import { updateCourseLifecycleFormAction } from "../../catalog/actions";
import { CourseLifecycleActionForm } from "./course-lifecycle-action-form";

export const dynamic = "force-dynamic";

type CourseDetailAdminPageProps = {
  params: Promise<{
    slug: string;
    courseSlug: string;
  }>;
};

export default async function CourseDetailAdminPage({ params }: CourseDetailAdminPageProps) {
  const { slug, courseSlug } = await params;
  const { organizationId, organizationName, prisma } = await getAdminWorkspace(slug);
  const course = await prisma.course.findFirst({
    where: {
      organizationId,
      slug: courseSlug,
    },
    select: {
      id: true,
      title: true,
      type: true,
      status: true,
      category: { select: { name: true } },
      expectedDurationMinutes: true,
      estimatedCompletionBusinessDays: true,
      credentialProvider: true,
      credentialTemplateId: true,
      tagLinks: {
        orderBy: { tag: { name: "asc" } },
        select: {
          tag: { select: { name: true } },
        },
      },
    },
  });

  if (!course) {
    notFound();
  }

  const updateCredentialMappingAction = async (formData: FormData) => {
    "use server";

    const { organizationId: actionOrganizationId } = await requireOrganizationUsersAdminBySlug(slug);
    const { prisma: actionPrisma } = await import("@/lib/prisma");
    const credentialTemplateId = readFormString(formData, "credentialTemplateId").trim();

    await actionPrisma.course.update({
      where: {
        organizationId_id: {
          organizationId: actionOrganizationId,
          id: readFormString(formData, "courseId"),
        },
      },
      data: {
        credentialProvider: credentialTemplateId ? "CREDLY" : null,
        credentialTemplateId: credentialTemplateId || null,
      },
    });

    revalidatePath(`/org/${slug}/admin/courses/${courseSlug}`);
  };
  const updateLifecycleAction = async (_previousState: CatalogActionResult, formData: FormData) => {
    "use server";

    const result = await updateCourseLifecycleFormAction(slug, formData);

    if (result.status === "success") {
      revalidatePath(`/org/${slug}/admin/courses`);
      revalidatePath(`/org/${slug}/admin/courses/${courseSlug}`);
    }

    return result;
  };
  const fields = [
    ["Title", course.title],
    ["Type", course.type],
    ["Lifecycle", course.status],
    ["Category", course.category?.name ?? "No category"],
    ["Tags", course.tagLinks.map((link) => link.tag.name).join(", ") || "No tags"],
    ["Duration", `${course.expectedDurationMinutes} minutes`],
    ["Estimated business days", `${course.estimatedCompletionBusinessDays}`],
  ];

  return (
    <AdminAppShell organizationName={organizationName} slug={slug} active="courses">
      <div className="lh-main-inner">
        <header className="lh-main-head">
          <div>
            <p className="lh-eyebrow">Course detail</p>
            <h1>
              {slug} / {courseSlug}
            </h1>
          </div>
        </header>

      <section className="grid gap-4 md:grid-cols-2">
        {fields.map(([label, value]) => (
          <div key={label} className="rounded-md border border-slate-200 p-4">
            <p className="text-sm font-medium text-slate-500">{label}</p>
            <p className="mt-2 text-base text-slate-950">{value}</p>
          </div>
        ))}
      </section>

      <section className="rounded-md border border-slate-200 p-4">
        <h2 className="text-lg font-semibold text-slate-950">Course lifecycle</h2>
        <p className="mt-1 text-sm text-slate-600">Move this course between published, deprecated, and retired states.</p>
        <div className="mt-4">
          <CourseLifecycleActionForm action={updateLifecycleAction}>
            <input type="hidden" name="courseId" value={course.id} />
            <button type="submit" name="status" value="PUBLISHED" className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-800">
              Publish
            </button>
            <button type="submit" name="status" value="DEPRECATED" className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-800">
              Deprecate
            </button>
            <button type="submit" name="status" value="RETIRED" className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-800">
              Retire
            </button>
          </CourseLifecycleActionForm>
        </div>
      </section>

      <section className="rounded-md border border-slate-200 p-4">
        <h2 className="text-lg font-semibold text-slate-950">Credential mapping</h2>
        <form action={updateCredentialMappingAction} className="mt-4 grid max-w-xl gap-3">
          <input type="hidden" name="courseId" value={course.id} />
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Credly template id
            <input
              name="credentialTemplateId"
              defaultValue={course.credentialProvider === "CREDLY" ? course.credentialTemplateId ?? "" : ""}
              className="rounded-md border border-slate-300 px-3 py-2"
            />
          </label>
          <button type="submit" className="w-fit rounded-md bg-slate-950 px-4 py-2 text-sm font-medium text-white">
            Save credential mapping
          </button>
        </form>
      </section>
      </div>
    </AdminAppShell>
  );
}

function readFormString(formData: FormData, key: string): string {
  const value = formData.get(key);

  return typeof value === "string" ? value : "";
}
