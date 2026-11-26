import { describe, expect, it } from "vitest";

import { validateApiBaseUrl } from "./api";

describe("validateApiBaseUrl", () => {
  it("normalizes a valid HTTPS production URL", () => {
    expect(validateApiBaseUrl("https://learnhub.example.com/" )).toBe("https://learnhub.example.com");
  });

  it("rejects cleartext URLs outside development", () => {
    expect(() => validateApiBaseUrl("http://localhost:3000")).toThrow("HTTPS");
  });

  it("allows a local URL in development", () => {
    expect(validateApiBaseUrl("http://localhost:3000/", true)).toBe("http://localhost:3000");
  });
});