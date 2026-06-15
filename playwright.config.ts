import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3100";
const appUrl = new URL(baseURL);
const appHost = appUrl.hostname;
const appPort = appUrl.port || (appUrl.protocol === "https:" ? "443" : "80");
const webServerEnv = Object.fromEntries(
  Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
);

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  timeout: 90_000,
  expect: {
    timeout: 15_000,
  },
  use: {
    baseURL,
    screenshot: "only-on-failure",
    trace: "on-first-retry",
  },
  webServer: process.env.PLAYWRIGHT_SKIP_WEB_SERVER
    ? undefined
    : {
        command: `npm run dev -- --hostname ${appHost} --port ${appPort}`,
        env: {
          ...webServerEnv,
          APP_BASE_URL: baseURL,
          NEXTAUTH_SECRET: webServerEnv.NEXTAUTH_SECRET ?? "learnhub-local-e2e-secret",
          NEXTAUTH_URL: baseURL,
        },
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        url: baseURL,
      },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 1000 },
      },
    },
  ],
});
