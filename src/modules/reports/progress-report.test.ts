import { describe, expect, it } from "vitest";

import type { MembershipAuthContext } from "../auth/permissions";
import {
  formatProgressReportCsv,
  progressReportWhere,
  resolveProgressReportScope,
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
        "Learner Name,Learner Email,Course Title,Course Type,Assignment Status,Progress Percent,Due Date,Completed,Certificate URL,Last Event Date",
        '"Ada, Lovelace",ada@example.com,"Safety ""Basics""",NATIVE_VIDEO,COMPLETED,100,2026-06-20T00:00:00.000Z,true,https://learnhub.test/certificates/ABC123,2026-06-12T12:00:00.000Z',
      ].join("\r\n"),
    );
  });
});
