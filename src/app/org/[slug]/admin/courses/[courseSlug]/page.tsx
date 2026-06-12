import { requireOrganizationUsersAdminBySlug } from "@/lib/auth/guards";
import { revalidatePath } from "next/cache";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

type CourseDetailAdminPageProps = {
  params: Promise<{
    slug: string;
    courseSlug: string;
  }>;
};

export default async function CourseDetailAdminPage({ params }: CourseDetailAdminPageProps) {
  const { slug, courseSlug } = await params;
  const { organizationId } = await requireOrganizationUsersAdminBySlug(slug);
  const { prisma } = await import("@/lib/prisma");
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
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-6 px-6 py-10">
      <header>
        <p className="text-sm font-medium uppercase tracking-wide text-slate-500">Course detail</p>
        <h1 className="text-3xl font-semibold text-slate-950">
          {slug} / {courseSlug}
        </h1>
      </header>

      <section className="grid gap-4 md:grid-cols-2">
        {fields.map(([label, value]) => (
          <div key={label} className="rounded-md border border-slate-200 p-4">
            <p className="text-sm font-medium text-slate-500">{label}</p>
            <p className="mt-2 text-base text-slate-950">{value}</p>
          </div>
        ))}
      </section>

      <section className="flex flex-wrap gap-3">
        {["Publish", "Deprecate", "Retire"].map((label) => (
          <button key={label} type="button" disabled className="rounded-md border border-slate-200 px-4 py-2 text-sm text-slate-500">
            {label}
          </button>
        ))}
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
    </main>
  );
}

function readFormString(formData: FormData, key: string): string {
  const value = formData.get(key);

  return typeof value === "string" ? value : "";
}
