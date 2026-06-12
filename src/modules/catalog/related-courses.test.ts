import { describe, expect, it } from "vitest";

import { rankRelatedCourses, type RelatedCourseCandidate } from "./related-courses";

const source: RelatedCourseCandidate = {
  organizationId: "org_1",
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
      { organizationId: "org_1", id: "draft", title: "Draft Match", status: "DRAFT", categoryId: "cat_1", tagIds: ["tag_1"] },
      { organizationId: "org_1", id: "published", title: "Published Match", status: "PUBLISHED", categoryId: "cat_1", tagIds: [] },
      { organizationId: "org_1", id: "unrelated", title: "Unrelated", status: "PUBLISHED", categoryId: "cat_2", tagIds: ["tag_3"] },
    ]);

    expect(matches.map((course) => course.id)).toEqual(["published"]);
  });

  it("ranks same-category courses above tag-only overlap", () => {
    const matches = rankRelatedCourses(source, [
      { organizationId: "org_1", id: "tag-only", title: "Tag Only", status: "PUBLISHED", categoryId: "cat_2", tagIds: ["tag_1", "tag_2"] },
      { organizationId: "org_1", id: "same-category", title: "Same Category", status: "PUBLISHED", categoryId: "cat_1", tagIds: [] },
    ]);

    expect(matches.map((course) => course.id)).toEqual(["same-category", "tag-only"]);
  });

  it("ranks more shared tags higher within the same category rank", () => {
    const matches = rankRelatedCourses(source, [
      { organizationId: "org_1", id: "one-tag", title: "One Tag", status: "PUBLISHED", categoryId: "cat_1", tagIds: ["tag_1"] },
      { organizationId: "org_1", id: "two-tags", title: "Two Tags", status: "PUBLISHED", categoryId: "cat_1", tagIds: ["tag_1", "tag_2"] },
      { organizationId: "org_1", id: "tag-only-one", title: "Tag Only One", status: "PUBLISHED", categoryId: "cat_2", tagIds: ["tag_1"] },
      { organizationId: "org_1", id: "tag-only-two", title: "Tag Only Two", status: "PUBLISHED", categoryId: "cat_2", tagIds: ["tag_1", "tag_2"] },
    ]);

    expect(matches.map((course) => course.id)).toEqual(["two-tags", "one-tag", "tag-only-two", "tag-only-one"]);
  });

  it("uses title as a stable tie-breaker and respects the limit", () => {
    const matches = rankRelatedCourses(
      source,
      [
        { organizationId: "org_1", id: "bravo", title: "Bravo", status: "PUBLISHED", categoryId: "cat_1", tagIds: ["tag_1"] },
        { organizationId: "org_1", id: "alpha", title: "Alpha", status: "PUBLISHED", categoryId: "cat_1", tagIds: ["tag_1"] },
      ],
      1,
    );

    expect(matches.map((course) => course.id)).toEqual(["alpha"]);
  });

  it("excludes candidates from other organizations even when taxonomy matches", () => {
    const matches = rankRelatedCourses(source, [
      {
        organizationId: "org_2",
        id: "other-tenant",
        title: "Other Tenant",
        status: "PUBLISHED",
        categoryId: "cat_1",
        tagIds: ["tag_1", "tag_2"],
      },
      {
        organizationId: "org_1",
        id: "same-tenant",
        title: "Same Tenant",
        status: "PUBLISHED",
        categoryId: "cat_1",
        tagIds: ["tag_1"],
      },
    ]);

    expect(matches.map((course) => course.id)).toEqual(["same-tenant"]);
  });

  it("excludes global-library-only records from learner recommendations", () => {
    const matches = rankRelatedCourses(source, [
      {
        organizationId: "org_1",
        id: "global-only",
        title: "Global Only",
        status: "PUBLISHED",
        categoryId: "cat_1",
        tagIds: ["tag_1"],
        isGlobalLibraryCourse: true,
      },
      {
        organizationId: "org_1",
        id: "tenant-copy",
        title: "Tenant Copy",
        status: "PUBLISHED",
        categoryId: "cat_1",
        tagIds: ["tag_1"],
      },
    ]);

    expect(matches.map((course) => course.id)).toEqual(["tenant-copy"]);
  });
});
