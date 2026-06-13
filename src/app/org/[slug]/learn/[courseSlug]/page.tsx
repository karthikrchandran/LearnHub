import { redirect } from "next/navigation";

type CourseRuntimePageProps = {
  params: Promise<{
    slug: string;
    courseSlug: string;
  }>;
};

export default async function CourseRuntimePage({ params }: CourseRuntimePageProps) {
  const { slug, courseSlug } = await params;

  redirect(`/org/${slug}/learn/courses/${courseSlug}`);
}
