import { describe, expect, it } from "vitest";

import type { MembershipAuthContext } from "../auth/permissions";
import {
  formatProgressReportCsv,
  progressReportWhere,
  resolveProgressReportScope,
  summarizeRequiredCheckScores,
  type ProgressReportRow,
} from "./progress-report";

const learner: MembershipAuthContext = {
  userId: "learner-user",
  isPlatformOwner: false,
  memberships: [
    {
      id: "learner-membership",
      organizationId: "org_1",
      roles: ["LEARNER"],
      status: "ACTIVE",
      managerMembershipId: null,
    },
    {
      id: "cross-org-learner-membership",
      organizationId: "org_2",
      roles: ["LEARNER"],
      status: "ACTIVE",
      managerMembershipId: null,
    },
  ],
};

const manager: MembershipAuthContext = {
  userId: "manager-user",
  isPlatformOwner: false,
  memberships: [
    {
      id: "manager-membership",
      organizationId: "org_1",
      roles: ["MANAGER"],
      status: "ACTIVE",
      managerMembershipId: null,
    },
  ],
};

const admin: MembershipAuthContext = {
  userId: "admin-user",
  isPlatformOwner: false,
  memberships: [
    {
      id: "admin-membership",
      organizationId: "org_1",
      roles: ["ADMIN"],
      status: "ACTIVE",
      managerMembershipId: null,
    },
  ],
};

const rows: ProgressReportRow[] = [
  {
    assignmentId: "assignment_1",
    learnerName: "Ada, Lovelace",
    learnerEmail: "ada@example.com",
    courseTitle: 'Safety "Basics"',
    courseType: "NATIVE_VIDEO",
    assignmentStatus: "COMPLETED",
    progressPercent: 100,
    dueDate: new Date("2026-06-20T00:00:00.000Z"),
    lastEventAt: new Date("2026-06-12T12:00:00.000Z"),
    certificateUrl: "https://learnhub.test/certificates/ABC123",
    latestRequiredCheckAverageScore: 75,
    bestRequiredCheckAverageScore: 100,
  },
];

describe("progress report read model", () => {
  it("scopes learners to their own active membership ids in the organization", () => {
    const scope = resolveProgressReportScope(learner, "org_1");

    expect(scope).toEqual({ kind: "learner", membershipIds: ["learner-membership"] });
    expect(progressReportWhere("org_1", scope)).toEqual({
      organizationId: "org_1",
      membershipId: { in: ["learner-membership"] },
    });
  });

  it("scopes managers to same-organization direct-report membership ids", () => {
    const scope = resolveProgressReportScope(manager, "org_1", [
      { id: "direct-report-1", organizationId: "org_1" },
      { id: "cross-org-report", organizationId: "org_2" },
    ]);

    expect(scope).toEqual({ kind: "manager", membershipIds: ["direct-report-1"] });
    expect(progressReportWhere("org_1", scope)).toEqual({
      organizationId: "org_1",
      membershipId: { in: ["direct-report-1"] },
    });
  });

  it("lets admins see all organization assignments", () => {
    const scope = resolveProgressReportScope(admin, "org_1");

    expect(scope).toEqual({ kind: "admin" });
    expect(progressReportWhere("org_1", scope)).toEqual({ organizationId: "org_1" });
  });

  it("denies inactive and cross-organization memberships", () => {
    const scope = resolveProgressReportScope(
      {
        userId: "inactive-user",
        isPlatformOwner: false,
        memberships: [
          {
            id: "inactive-membership",
            organizationId: "org_1",
            roles: ["LEARNER"],
            status: "INACTIVE",
            managerMembershipId: null,
          },
          {
            id: "other-org-membership",
            organizationId: "org_2",
            roles: ["LEARNER"],
            status: "ACTIVE",
            managerMembershipId: null,
          },
        ],
      },
      "org_1",
    );

    expect(scope).toEqual({ kind: "learner", membershipIds: [] });
    expect(progressReportWhere("org_1", scope)).toEqual({
      organizationId: "org_1",
      membershipId: { in: [] },
    });
  });

  it("formats CSV with quoted values and report fields", () => {
    expect(formatProgressReportCsv(rows)).toBe(
      [
        "Learner Name,Learner Email,Course Title,Course Type,Assignment Status,Progress Percent,Latest Required Check Average Score,Best Required Check Average Score,Due Date,Completed,Certificate URL,Last Event Date",
        '"Ada, Lovelace",ada@example.com,"Safety ""Basics""",NATIVE_VIDEO,COMPLETED,100,75,100,2026-06-20T00:00:00.000Z,true,https://learnhub.test/certificates/ABC123,2026-06-12T12:00:00.000Z',
      ].join("\r\n"),
    );
  });

  it("calculates assignment-level latest and best required-check average scores", () => {
    expect(
      summarizeRequiredCheckScores({
        requiredActiveCheckIds: ["q1", "q2"],
        attempts: [
          { questionId: "q1", scorePercent: 0, submittedAt: new Date("2026-06-13T10:00:00.000Z") },
          { questionId: "q1", scorePercent: 100, submittedAt: new Date("2026-06-13T11:00:00.000Z") },
          { questionId: "q2", scorePercent: 50, submittedAt: new Date("2026-06-13T12:00:00.000Z") },
        ],
      }),
    ).toEqual({
      latestRequiredCheckAverageScore: 75,
      bestRequiredCheckAverageScore: 75,
    });
  });

  it("returns null assignment-level scores until a required active check is attempted", () => {
    expect(
      summarizeRequiredCheckScores({
        requiredActiveCheckIds: ["q1"],
        attempts: [
          { questionId: "optional_q", scorePercent: 100, submittedAt: new Date("2026-06-13T10:00:00.000Z") },
        ],
      }),
    ).toEqual({
      latestRequiredCheckAverageScore: null,
      bestRequiredCheckAverageScore: null,
    });
  });
});
