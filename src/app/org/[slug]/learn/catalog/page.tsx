import { notFound, redirect } from "next/navigation";

import { requireOrganizationMemberBySlug } from "@/lib/auth/guards";
import { CourseCard, EmptyActionState, LearnerAppShell } from "@/app/ui/learnhub-components";
import { createPrismaLearnerExperienceRepository } from "@/modules/learner-experience/prisma-repository";

import { selfEnrollFormAction } from "../actions";

export const dynamic = "force-dynamic";

type CatalogPageProps = {
  params: Promise<{
    slug: string;
  }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type LearnerExperienceRepository = ReturnType<typeof createPrismaLearnerExperienceRepository>;
type AvailableCourse = Awaited<ReturnType<LearnerExperienceRepository["listAvailableCourses"]>>[number];

export default async function CatalogPage({ params, searchParams }: CatalogPageProps) {
  const { slug } = await params;
  const resolvedSearchParams = (await searchParams) ?? {};
  const enrollmentError = firstSearchParam(resolvedSearchParams.enrollmentError);
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
  const assignedCourses = learnerMembership
    ? await repository.listLearnerAssignments({ organizationId, membershipId: learnerMembership.id })
    : [];
  const assignedCourseIds = assignedCourses.map((assignment) => assignment.courseId);
  const availableCourses = learnerMembership
    ? await repository.listAvailableCourses({ organizationId, excludedCourseIds: assignedCourseIds })
    : [];
  const today = new Date().toISOString().slice(0, 10);
  const selfEnrollAction = async (formData: FormData) => {
    "use server";

    const result = await selfEnrollFormAction(slug, formData);

    if (result.status === "success") {
      redirect(`/org/${slug}/learn`);
    }

    redirect(`/org/${slug}/learn/catalog?enrollmentError=${encodeURIComponent(result.message)}`);
  };

  return (
    <LearnerAppShell organizationName={organization.name} slug={slug} active="catalog">
      <div className="mx-auto grid max-w-7xl gap-6">
        <header>
          <p>Course Catalog</p>
          <h1>Find the next course for your role.</h1>
        </header>

        {enrollmentError ? (
          <section className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-800" role="alert">
            {enrollmentError}
          </section>
        ) : null}

        {!learnerMembership ? (
          <EmptyActionState
            body="Sign in with an active learner membership to enroll from the catalog."
            title="Learner access required"
          />
        ) : availableCourses.length === 0 ? (
          <EmptyActionState
            body="Your assigned and completed courses are already on My Courses. New catalog options will appear here."
            title="No catalog courses right now"
          />
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {availableCourses.map((course) => (
              <CourseCard
                action={
                  <form action={selfEnrollAction}>
                    <input type="hidden" name="courseId" value={course.id} />
                    <input type="hidden" name="learnerMembershipId" value={learnerMembership.id} />
                    <input type="hidden" name="startDate" value={today} />
                    <button
                      className="inline-flex min-h-10 items-center rounded-full border border-[var(--learnhub-line)] bg-white px-4 text-sm font-bold text-[var(--learnhub-ink)]"
                      type="submit"
                    >
                      Enroll
                    </button>
                  </form>
                }
                categorySlug={course.category?.slug ?? null}
                description={course.description || "Course details will appear as your organization updates this catalog item."}
                key={course.id}
                meta={courseMeta(course)}
                title={course.title}
              />
            ))}
          </div>
        )}
      </div>
    </LearnerAppShell>
  );
}

function courseMeta(course: AvailableCourse): string[] {
  return [
    `${course.expectedDurationMinutes} min`,
    `${course.estimatedCompletionBusinessDays} business days`,
    formatCourseType(course.type),
    ...(course.credentialProvider ? ["Certificate"] : []),
  ];
}

function formatCourseType(type: string): string {
  return type === "SCORM_1_2" ? "SCORM" : "Native video";
}

function firstSearchParam(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}
