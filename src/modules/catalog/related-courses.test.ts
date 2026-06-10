import { describe, expect, it } from "vitest";

import { rankRelatedCourses, type RelatedCourseCandidate } from "./related-courses";

const source: RelatedCourseCandidate = {
  id: "source",
  title: "Source Course",
  status: "PUBLISHED",
  categoryId: "cat_1",
  tagIds: ["tag_1", "tag_2"],
};

describe("related course matching", () => {
  it("excludes the source course and returns only published related courses", () => {
    const matches = rankRelatedCourses(source, [
      source,
      { id: "draft", title: "Draft Match", status: "DRAFT", categoryId: "cat_1", tagIds: ["tag_1"] },
      { id: "published", title: "Published Match", status: "PUBLISHED", categoryId: "cat_1", tagIds: [] },
      { id: "unrelated", title: "Unrelated", status: "PUBLISHED", categoryId: "cat_2", tagIds: ["tag_3"] },
    ]);

    expect(matches.map((course) => course.id)).toEqual(["published"]);
  });

  it("ranks same-category courses above tag-only overlap", () => {
    const matches = rankRelatedCourses(source, [
      { id: "tag-only", title: "Tag Only", status: "PUBLISHED", categoryId: "cat_2", tagIds: ["tag_1", "tag_2"] },
      { id: "same-category", title: "Same Category", status: "PUBLISHED", categoryId: "cat_1", tagIds: [] },
    ]);

    expect(matches.map((course) => course.id)).toEqual(["same-category", "tag-only"]);
  });

  it("ranks more shared tags higher within the same category rank", () => {
    const matches = rankRelatedCourses(source, [
      { id: "one-tag", title: "One Tag", status: "PUBLISHED", categoryId: "cat_1", tagIds: ["tag_1"] },
      { id: "two-tags", title: "Two Tags", status: "PUBLISHED", categoryId: "cat_1", tagIds: ["tag_1", "tag_2"] },
      { id: "tag-only-one", title: "Tag Only One", status: "PUBLISHED", categoryId: "cat_2", tagIds: ["tag_1"] },
      { id: "tag-only-two", title: "Tag Only Two", status: "PUBLISHED", categoryId: "cat_2", tagIds: ["tag_1", "tag_2"] },
    ]);

    expect(matches.map((course) => course.id)).toEqual(["two-tags", "one-tag", "tag-only-two", "tag-only-one"]);
  });

  it("uses title as a stable tie-breaker and respects the limit", () => {
    const matches = rankRelatedCourses(
      source,
      [
        { id: "bravo", title: "Bravo", status: "PUBLISHED", categoryId: "cat_1", tagIds: ["tag_1"] },
        { id: "alpha", title: "Alpha", status: "PUBLISHED", categoryId: "cat_1", tagIds: ["tag_1"] },
      ],
      1,
    );

    expect(matches.map((course) => course.id)).toEqual(["alpha"]);
  });
});
