import { redirect } from "next/navigation";

import { requireOrganizationMemberBySlug } from "@/lib/auth/guards";

type CourseOverviewCompatibilityPageProps = {
  params: Promise<{
    slug: string;
    courseSlug: string;
  }>;
};

export default async function CourseOverviewCompatibilityPage({ params }: CourseOverviewCompatibilityPageProps) {
  const { slug, courseSlug } = await params;
  const { context, organizationId } = await requireOrganizationMemberBySlug(slug);
  const learnerMembership = context.memberships.find(
    (membership) =>
      membership.organizationId === organizationId &&
      membership.status === "ACTIVE" &&
      membership.roles.includes("LEARNER"),
  );

  if (!learnerMembership) {
    redirect(`/org/${slug}/learn/catalog`);
  }

  const { prisma } = await import("@/lib/prisma");
  const assignment = await prisma.courseAssignment.findFirst({
    where: {
      organizationId,
      membershipId: learnerMembership.id,
      course: {
        slug: courseSlug,
      },
    },
    select: {
      course: {
        select: {
          type: true,
        },
      },
    },
  });

  if (!assignment) {
    redirect(`/org/${slug}/learn/catalog`);
  }

  if (assignment.course.type === "SCORM_1_2") {
    redirect(`/org/${slug}/learn/${courseSlug}/scorm`);
  }

  redirect(`/org/${slug}/learn/${courseSlug}`);
}
