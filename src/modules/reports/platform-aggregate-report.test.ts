import { describe, expect, it } from "vitest";

import { buildPlatformAggregateReportRows } from "./platform-aggregate-report";

describe("platform aggregate report", () => {
  it("aggregates platform metrics by organization without learner-level data", () => {
    expect(
      buildPlatformAggregateReportRows([
        {
          organizationId: "org_1",
          organizationName: "Acme",
          activeLearners: 10,
          courseCount: 5,
          assignmentCount: 20,
          completionCount: 15,
          overdueCount: 2,
          certificateCount: 8,
        },
      ]),
    ).toEqual([
      {
        organizationId: "org_1",
        organizationName: "Acme",
        activeLearners: 10,
        courseCount: 5,
        assignmentCount: 20,
        completionCount: 15,
        overdueCount: 2,
        certificateCount: 8,
        completionRate: 75,
      },
    ]);
  });
});
