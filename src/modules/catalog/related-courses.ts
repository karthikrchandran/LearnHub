import type { CourseStatus } from "@prisma/client";

export type RelatedCourseCandidate = {
  id: string;
  title: string;
  status: CourseStatus;
  categoryId: string | null;
  tagIds: string[];
};

export function rankRelatedCourses(
  source: RelatedCourseCandidate,
  candidates: RelatedCourseCandidate[],
  limit = 5,
): RelatedCourseCandidate[] {
  return candidates
    .filter((candidate) => candidate.id !== source.id && candidate.status === "PUBLISHED")
    .map((candidate) => {
      const sameCategory = source.categoryId !== null && candidate.categoryId === source.categoryId;
      const sharedTagCount = candidate.tagIds.filter((tagId) => source.tagIds.includes(tagId)).length;

      return {
        candidate,
        sameCategory,
        sharedTagCount,
      };
    })
    .filter((entry) => entry.sameCategory || entry.sharedTagCount > 0)
    .sort((left, right) => {
      if (left.sameCategory !== right.sameCategory) {
        return left.sameCategory ? -1 : 1;
      }

      if (left.sharedTagCount !== right.sharedTagCount) {
        return right.sharedTagCount - left.sharedTagCount;
      }

      return left.candidate.title.localeCompare(right.candidate.title);
    })
    .slice(0, limit)
    .map((entry) => entry.candidate);
}
