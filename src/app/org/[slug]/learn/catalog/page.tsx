import { notFound, redirect } from "next/navigation";
import Link from "next/link";

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
  const query = firstSearchParam(resolvedSearchParams.query)?.trim() ?? "";
  const categoryFilter = firstSearchParam(resolvedSearchParams.category);
  const certificateOnly = firstSearchParam(resolvedSearchParams.certificate) === "1";
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
  const filteredAvailableCourses = filterAvailableCourses(availableCourses, {
    categoryFilter,
    certificateOnly,
    query,
  });
  const categoryFilters = Array.from(
    new Map(
      availableCourses
        .filter((course) => course.category)
        .map((course) => [course.category!.slug, course.category!]),
    ).values(),
  );
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
      <div className="lh-main-inner">
        <header className="lh-main-head">
          <div>
            <p className="lh-eyebrow">Course Catalog</p>
            <h1>Find the next course for your role.</h1>
            <p>Browse recommended compliance, leadership, security, and certificate-ready courses.</p>
          </div>
          <form className="lh-searchbar" method="get">
            {categoryFilter ? <input type="hidden" name="category" value={categoryFilter} /> : null}
            {certificateOnly ? <input type="hidden" name="certificate" value="1" /> : null}
            <input aria-label="Search catalog" defaultValue={query} name="query" placeholder="Search catalog" />
            <button type="submit">Search</button>
          </form>
        </header>

        <div className="lh-filters" aria-label="Catalog filters">
          <Link className={!categoryFilter && !certificateOnly ? "lh-filter active" : "lh-filter"} href={catalogFilterHref(slug, { query })}>
            All
          </Link>
          {categoryFilters.map((category) => (
            <Link
              className={categoryFilter === category.slug ? "lh-filter active" : "lh-filter"}
              href={catalogFilterHref(slug, { category: category.slug, query })}
              key={category.slug}
            >
              {category.name}
            </Link>
          ))}
          <Link
            className={certificateOnly ? "lh-filter active" : "lh-filter"}
            href={catalogFilterHref(slug, { certificate: true, query })}
          >
            Certificate eligible
          </Link>
        </div>

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
        ) : filteredAvailableCourses.length === 0 ? (
          <EmptyActionState
            body={availableCourses.length === 0 ? "Your assigned and completed courses are already on My Courses. New catalog options will appear here." : "No catalog courses matched the selected filters."}
            title={availableCourses.length === 0 ? "No catalog courses right now" : "No matching catalog courses"}
          />
        ) : (
          <div className="lh-grid-3">
            {filteredAvailableCourses.map((course) => (
              <CourseCard
                action={
                  <form action={selfEnrollAction}>
                    <input type="hidden" name="courseId" value={course.id} />
                    <input type="hidden" name="learnerMembershipId" value={learnerMembership.id} />
                    <input type="hidden" name="startDate" value={today} />
                    <button className="lh-button lh-button-light" type="submit">
                      Enroll
                    </button>
                  </form>
                }
                categorySlug={course.category?.slug ?? null}
                description={course.description || "Course details will appear as your organization updates this catalog item."}
                key={course.id}
                label="Available"
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

function filterAvailableCourses(
  courses: AvailableCourse[],
  filters: { categoryFilter: string | null; certificateOnly: boolean; query: string },
): AvailableCourse[] {
  const normalizedQuery = normalizeSearch(filters.query);

  return courses.filter((course) => {
    const matchesQuery = normalizedQuery
      ? [
          course.title,
          course.description,
          course.category?.name ?? "",
          course.category?.slug ?? "",
          course.type,
          ...course.tagLinks.map((link) => link.tag.name),
          ...course.tagLinks.map((link) => link.tag.slug),
        ].some((value) => normalizeSearch(value).includes(normalizedQuery))
      : true;
    const matchesCategory = filters.categoryFilter ? course.category?.slug === filters.categoryFilter : true;
    const matchesCertificate = filters.certificateOnly ? Boolean(course.credentialProvider) : true;

    return matchesQuery && matchesCategory && matchesCertificate;
  });
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

function catalogFilterHref(
  slug: string,
  input: { category?: string; certificate?: boolean; query?: string },
): string {
  const params = new URLSearchParams();

  if (input.query) {
    params.set("query", input.query);
  }

  if (input.category) {
    params.set("category", input.category);
  }

  if (input.certificate) {
    params.set("certificate", "1");
  }

  const queryString = params.toString();

  return `/org/${slug}/learn/catalog${queryString ? `?${queryString}` : ""}`;
}

function normalizeSearch(value: string): string {
  return value.trim().toLowerCase();
}
