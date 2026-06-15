import { describe, expect, it } from "vitest";

import { getMediaProviderReadiness } from "./media-provider-readiness";

describe("media provider readiness", () => {
  it("reports Mux, R2, and SCORM extraction as ready when required env values exist", () => {
    const readiness = getMediaProviderReadiness({
      MUX_TOKEN_ID: "token",
      MUX_TOKEN_SECRET: "secret",
      MUX_WEBHOOK_SECRET: "webhook",
      R2_ACCOUNT_ID: "account",
      R2_ACCESS_KEY_ID: "access",
      R2_SECRET_ACCESS_KEY: "secret",
      R2_BUCKET_NAME: "bucket",
      SCORM_EXTRACTION_JOB_SECRET: "job",
    });

    expect(readiness.mux.configured).toBe(true);
    expect(readiness.r2.configured).toBe(true);
    expect(readiness.scormExtraction.configured).toBe(true);
  });

  it("lists missing env values without exposing configured secrets", () => {
    const readiness = getMediaProviderReadiness({
      MUX_TOKEN_ID: "token",
      MUX_TOKEN_SECRET: "",
      MUX_WEBHOOK_SECRET: undefined,
      R2_ACCOUNT_ID: "account",
      R2_ACCESS_KEY_ID: "",
      R2_SECRET_ACCESS_KEY: undefined,
      R2_BUCKET_NAME: "bucket",
      SCORM_EXTRACTION_JOB_SECRET: "",
    });

    expect(readiness.mux).toEqual({
      configured: false,
      missing: ["MUX_TOKEN_SECRET", "MUX_WEBHOOK_SECRET"],
    });
    expect(readiness.r2).toEqual({
      configured: false,
      missing: ["R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY"],
    });
    expect(readiness.scormExtraction).toEqual({
      configured: false,
      missing: ["SCORM_EXTRACTION_JOB_SECRET"],
    });
  });
});
