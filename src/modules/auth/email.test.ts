import { describe, expect, it } from "vitest";

import { emailDomainAllowed, getEmailDomain, normalizeEmail, requireAllowedOrganizationEmail } from "./email";

describe("email auth helpers", () => {
  it("normalizes emails for identity lookups", () => {
    expect(normalizeEmail("  Admin@Acme.TEST ")).toBe("admin@acme.test");
  });

  it("extracts the normalized email domain", () => {
    expect(getEmailDomain("  Admin@Acme.TEST ")).toBe("acme.test");
  });

  it("requires a valid email domain", () => {
    expect(() => getEmailDomain("not-an-email")).toThrow("Valid email is required");
  });

  it("requires a valid email shape before extracting the domain", () => {
    expect(() => getEmailDomain("@acme.test")).toThrow("Valid email is required");
    expect(() => getEmailDomain("bad@@acme.test")).toThrow("Valid email is required");
  });

  it("allows email domains configured for the organization", () => {
    expect(emailDomainAllowed("learner@acme.test", ["acme.test"])).toBe(true);
    expect(emailDomainAllowed("learner@other.test", ["acme.test"])).toBe(false);
  });

  it("normalizes allowed organization domains before matching", () => {
    expect(emailDomainAllowed("learner@acme.test", ["  ACME.TEST "])).toBe(true);
  });

  it("does not allow organization emails when no allowed domains are configured", () => {
    expect(emailDomainAllowed("learner@acme.test", [])).toBe(false);
  });

  it("rejects non-organization emails with a clear error", () => {
    expect(() => requireAllowedOrganizationEmail("person@gmail.com", ["acme.test"])).toThrow(
      "Email domain is not allowed for this organization",
    );
  });

  it("rejects malformed emails before organization domain validation", () => {
    expect(() => requireAllowedOrganizationEmail("@acme.test", ["acme.test"])).toThrow("Valid email is required");
    expect(() => requireAllowedOrganizationEmail("bad@@acme.test", ["acme.test"])).toThrow("Valid email is required");
    expect(() => requireAllowedOrganizationEmail("bad local@acme.test", ["acme.test"])).toThrow(
      "Valid email is required",
    );
  });

  it("rejects invalid local parts even when the organization domain is allowed", () => {
    for (const email of ["bad..local@acme.test", ".bad@acme.test", "bad.@acme.test", "bad()@acme.test"]) {
      expect(() => requireAllowedOrganizationEmail(email, ["acme.test"])).toThrow("Valid email is required");
    }
  });

  it("returns the normalized email for allowed organization emails", () => {
    expect(requireAllowedOrganizationEmail("  Learner@Acme.TEST ", ["acme.test"])).toBe("learner@acme.test");
  });
});
