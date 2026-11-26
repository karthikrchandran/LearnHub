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
        EMAIL_PROVIDER: "console",
      }),
    ).toThrow(/NEXTAUTH_SECRET/);
  });

  it("requires EMAIL_PROVIDER in production", () => {
    expect(() =>
      getEnv({
        NODE_ENV: "production",
        DATABASE_URL: localDatabaseUrl,
        NEXTAUTH_SECRET: "production-secret-with-at-least-thirty-two-characters",
        NEXTAUTH_URL: "https://learnhub.example.com",
        APP_BASE_URL: "https://learnhub.example.com",
      }),
    ).toThrow(/EMAIL_PROVIDER/);
  });

  it("rejects the console email provider in production", () => {
    expect(() =>
      getEnv({
        NODE_ENV: "production",
        DATABASE_URL: localDatabaseUrl,
        NEXTAUTH_SECRET: "production-secret-with-at-least-thirty-two-characters",
        NEXTAUTH_URL: "https://learnhub.example.com",
        APP_BASE_URL: "https://learnhub.example.com",
        EMAIL_PROVIDER: "console",
        NOTIFICATION_JOBS_SECRET: "jobs-secret",
      }),
    ).toThrow(/Console email provider cannot be used in production/);
  });

  it("allows placeholder secrets outside production", () => {
    expect(getEnv({ NODE_ENV: "test", NEXTAUTH_SECRET: "replace-with-a-local-secret" }).NEXTAUTH_SECRET).toBe(
      "replace-with-a-local-secret",
    );
  });

  it("requires a 32-character secret and HTTPS URLs in production", () => {
    const validProduction = {
      NODE_ENV: "production" as const,
      DATABASE_URL: localDatabaseUrl,
      NEXTAUTH_SECRET: "production-secret-with-at-least-thirty-two-characters",
      NEXTAUTH_URL: "https://learnhub.example.com",
      APP_BASE_URL: "https://learnhub.example.com",
      EMAIL_PROVIDER: "smtp" as const,
      EMAIL_FROM: "no-reply@learnhub.example.com",
      SMTP_HOST: "smtp.learnhub.example.com",
      NOTIFICATION_JOBS_SECRET: "jobs-secret",
    };

    expect(() => getEnv({ ...validProduction, NEXTAUTH_SECRET: "short-secret" })).toThrow(/32 characters/);
    expect(() => getEnv({ ...validProduction, NEXTAUTH_URL: "http://learnhub.example.com" })).toThrow(/HTTPS/);
  });

  it("rejects partial production Mux credentials", () => {
    expect(() => getEnv({
      NODE_ENV: "production",
      DATABASE_URL: localDatabaseUrl,
      NEXTAUTH_SECRET: "production-secret-with-at-least-thirty-two-characters",
      NEXTAUTH_URL: "https://learnhub.example.com",
      APP_BASE_URL: "https://learnhub.example.com",
      EMAIL_PROVIDER: "smtp",
      EMAIL_FROM: "no-reply@learnhub.example.com",
      SMTP_HOST: "smtp.learnhub.example.com",
      NOTIFICATION_JOBS_SECRET: "jobs-secret",
      MUX_TOKEN_ID: "mux-token-id",
    })).toThrow(/Mux production setup requires/);
  });

  it("requires SMTP_HOST when the email provider is smtp", () => {
    expect(() => getEnv({ NODE_ENV: "test", EMAIL_PROVIDER: "smtp" })).toThrow(/SMTP_HOST/);
  });

  it("requires SMTP production settings when the email provider is smtp", () => {
    const productionBase = {
      NODE_ENV: "production" as const,
      DATABASE_URL: localDatabaseUrl,
      NEXTAUTH_SECRET: "production-secret-with-at-least-thirty-two-characters",
      NEXTAUTH_URL: "https://learnhub.example.com",
      APP_BASE_URL: "https://learnhub.example.com",
      NOTIFICATION_JOBS_SECRET: "jobs-secret",
    };

    expect(() =>
      getEnv({
        ...productionBase,
        EMAIL_PROVIDER: "smtp",
        SMTP_HOST: "smtp.learnhub.test",
      }),
    ).toThrow(/EMAIL_FROM/);
    expect(
      getEnv({
        ...productionBase,
        EMAIL_PROVIDER: "smtp",
        SMTP_HOST: "smtp.learnhub.test",
        EMAIL_FROM: "no-reply@learnhub.test",
      }).EMAIL_FROM,
    ).toBe("no-reply@learnhub.test");
  });

  it("requires API production settings when the email provider is api-provider", () => {
    const productionBase = {
      NODE_ENV: "production" as const,
      DATABASE_URL: localDatabaseUrl,
      NEXTAUTH_SECRET: "production-secret-with-at-least-thirty-two-characters",
      NEXTAUTH_URL: "https://learnhub.example.com",
      APP_BASE_URL: "https://learnhub.example.com",
      EMAIL_PROVIDER: "api-provider" as const,
      NOTIFICATION_JOBS_SECRET: "jobs-secret",
    };

    expect(() =>
      getEnv({
        ...productionBase,
        EMAIL_API_ENDPOINT: "https://email-api.learnhub.test/send",
        EMAIL_FROM: "no-reply@learnhub.test",
      }),
    ).toThrow(/EMAIL_API_TOKEN/);
    expect(
      getEnv({
        ...productionBase,
        EMAIL_API_ENDPOINT: "https://email-api.learnhub.test/send",
        EMAIL_API_TOKEN: "api-token",
        EMAIL_FROM: "no-reply@learnhub.test",
      }).EMAIL_API_ENDPOINT,
    ).toBe("https://email-api.learnhub.test/send");
  });

  it("requires the notification jobs shared secret in production", () => {
    expect(() =>
      getEnv({
        NODE_ENV: "production",
        DATABASE_URL: localDatabaseUrl,
        NEXTAUTH_SECRET: "production-secret-with-at-least-thirty-two-characters",
        NEXTAUTH_URL: "https://learnhub.example.com",
        APP_BASE_URL: "https://learnhub.example.com",
        EMAIL_PROVIDER: "console",
      }),
    ).toThrow(/NOTIFICATION_JOBS_SECRET/);
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
