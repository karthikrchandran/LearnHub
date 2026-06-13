import { describe, expect, it } from "vitest";

import { resolvePostLoginRedirect, type PostLoginRedirectContext } from "./redirects";

const platformOwner: PostLoginRedirectContext = {
  isPlatformOwner: true,
  memberships: [],
};

const orgAdmin: PostLoginRedirectContext = {
  isPlatformOwner: false,
  memberships: [
    {
      organizationSlug: "acme",
      status: "ACTIVE",
    },
  ],
};

const inactiveOrgMember: PostLoginRedirectContext = {
  isPlatformOwner: false,
  memberships: [
    {
      organizationSlug: "acme",
      status: "INACTIVE",
    },
  ],
};

const learnerOnly: PostLoginRedirectContext = {
  isPlatformOwner: false,
  memberships: [
    {
      organizationSlug: "acme",
      status: "ACTIVE",
      roles: ["LEARNER"],
    },
  ],
};

const learnerManager: PostLoginRedirectContext = {
  isPlatformOwner: false,
  memberships: [
    {
      organizationSlug: "acme",
      status: "ACTIVE",
      roles: ["LEARNER", "MANAGER"],
    },
  ],
};

const learnerAdmin: PostLoginRedirectContext = {
  isPlatformOwner: false,
  memberships: [
    {
      organizationSlug: "acme",
      status: "ACTIVE",
      roles: ["LEARNER", "ADMIN"],
    },
  ],
};

describe("post-login redirects", () => {
  it("sends signed-out users back to login", () => {
    expect(resolvePostLoginRedirect(null)).toBe("/login");
  });

  it("sends platform owners to the platform workspace", () => {
    expect(resolvePostLoginRedirect(platformOwner)).toBe("/platform");
  });

  it("sends organization users to their first active organization workspace", () => {
    expect(resolvePostLoginRedirect(orgAdmin)).toBe("/org/acme");
  });

  it("falls back to platform when the user has no active organization workspace", () => {
    expect(resolvePostLoginRedirect(inactiveOrgMember)).toBe("/platform");
  });

  it("sends learner-only users directly to My Courses", () => {
    expect(resolvePostLoginRedirect(learnerOnly)).toBe("/org/acme/learn");
  });

  it("sends learner managers to their organization workspace", () => {
    expect(resolvePostLoginRedirect(learnerManager)).toBe("/org/acme");
  });

  it("sends learner admins to their organization workspace", () => {
    expect(resolvePostLoginRedirect(learnerAdmin)).toBe("/org/acme");
  });
});
