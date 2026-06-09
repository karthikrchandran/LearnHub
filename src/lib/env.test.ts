import { afterEach, describe, expect, it, vi } from "vitest";

import { env, getEnv } from "./env";

const localDatabaseUrl = "postgresql://learnhub:learnhub@localhost:5432/learnhub?schema=public";

describe("environment contract", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("provides safe local defaults outside production", () => {
    expect(getEnv({ NODE_ENV: "test" })).toMatchObject({
      DATABASE_URL: localDatabaseUrl,
      NEXTAUTH_SECRET: "learnhub-local-secret",
      NEXTAUTH_URL: "http://localhost:3000",
      APP_BASE_URL: "http://localhost:3000",
      EMAIL_PROVIDER: "console",
      SMTP_PORT: 587,
    });
  });

  it("requires real production values", () => {
    expect(() => getEnv({ NODE_ENV: "production" })).toThrow(/DATABASE_URL/);

    expect(() =>
      getEnv({
        NODE_ENV: "production",
        DATABASE_URL: localDatabaseUrl,
        NEXTAUTH_SECRET: "replace-with-a-local-secret",
        NEXTAUTH_URL: "https://learnhub.example.com",
        APP_BASE_URL: "https://learnhub.example.com",
      }),
    ).toThrow(/NEXTAUTH_SECRET/);
  });

  it("allows placeholder secrets outside production", () => {
    expect(getEnv({ NODE_ENV: "test", NEXTAUTH_SECRET: "replace-with-a-local-secret" }).NEXTAUTH_SECRET).toBe(
      "replace-with-a-local-secret",
    );
  });

  it("requires SMTP_HOST when the email provider is smtp", () => {
    expect(() => getEnv({ NODE_ENV: "test", EMAIL_PROVIDER: "smtp" })).toThrow(/SMTP_HOST/);
  });

  it("does not parse process.env until the lazy env object is read", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("NEXTAUTH_SECRET", "");
    vi.stubEnv("NEXTAUTH_URL", "");
    vi.stubEnv("APP_BASE_URL", "");

    await expect(import("./env")).resolves.toBeDefined();
    expect(() => env.DATABASE_URL).toThrow(/DATABASE_URL/);
  });
});
