import { redirect } from "next/navigation";

type CourseOverviewCompatibilityPageProps = {
  params: Promise<{
    slug: string;
    courseSlug: string;
  }>;
};

export default async function CourseOverviewCompatibilityPage({ params }: CourseOverviewCompatibilityPageProps) {
  const { slug, courseSlug } = await params;

  redirect(`/org/${slug}/learn/${courseSlug}`);
}
