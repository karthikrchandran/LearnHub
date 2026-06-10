import { describe, expect, it } from "vitest";

import { assertCourseAssignable, assertCourseSelfEnrollable, courseVisibleToLearner } from "./course-lifecycle";

describe("course lifecycle gates", () => {
  it("allows assignment and self-enrollment only for published courses", () => {
    expect(() => assertCourseAssignable({ status: "PUBLISHED" })).not.toThrow();
    expect(() => assertCourseSelfEnrollable({ status: "PUBLISHED" })).not.toThrow();
  });

  it("blocks draft, deprecated, and retired courses for new assignment", () => {
    expect(() => assertCourseAssignable({ status: "DRAFT" })).toThrow("Only published courses can be assigned");
    expect(() => assertCourseAssignable({ status: "DEPRECATED" })).toThrow(
      "Only published courses can be assigned",
    );
    expect(() => assertCourseAssignable({ status: "RETIRED" })).toThrow("Only published courses can be assigned");
  });

  it("blocks draft, deprecated, and retired courses for self-enrollment", () => {
    expect(() => assertCourseSelfEnrollable({ status: "DRAFT" })).toThrow(
      "Only published courses can be self-enrolled",
    );
    expect(() => assertCourseSelfEnrollable({ status: "DEPRECATED" })).toThrow(
      "Only published courses can be self-enrolled",
    );
    expect(() => assertCourseSelfEnrollable({ status: "RETIRED" })).toThrow(
      "Only published courses can be self-enrolled",
    );
  });

  it("shows deprecated assigned courses to learners but hides draft and retired courses", () => {
    expect(courseVisibleToLearner({ status: "PUBLISHED", alreadyAssigned: false })).toBe(true);
    expect(courseVisibleToLearner({ status: "PUBLISHED", alreadyAssigned: true })).toBe(true);
    expect(courseVisibleToLearner({ status: "DEPRECATED", alreadyAssigned: true })).toBe(true);
    expect(courseVisibleToLearner({ status: "DEPRECATED", alreadyAssigned: false })).toBe(false);
    expect(courseVisibleToLearner({ status: "DRAFT", alreadyAssigned: true })).toBe(false);
    expect(courseVisibleToLearner({ status: "RETIRED", alreadyAssigned: true })).toBe(false);
  });
});
