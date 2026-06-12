# Deployment, Security, End-To-End Smoke, and Release Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the deployment, security, end-to-end smoke, and release evidence layer required to ship the June 2026 LearnHub MVP as a commercial multi-tenant LMS.

**Architecture:** Keep the application as a Next.js modular monolith deployed on Vercel with Neon Postgres, Mux video, Cloudflare R2 object storage, Upstash Redis, SMTP or API email, Credly credentials, and secret-protected cron routes. The work adds production environment validation, release automation, executable smoke coverage, operational runbooks, security checklists, release notes, and a traceability matrix without adding billing, custom domains, or SSO.

**Tech Stack:** Next.js 16 App Router, TypeScript, Prisma 7, Vitest, ESLint, Playwright, PowerShell, Vercel, Neon, Mux, Cloudflare R2, Upstash Redis, SMTP/API email provider, Credly.

---

## Scope Boundaries

- This plan is for implementation only. It does not create app code in this planning task.
- Keep LearnHub as a commercial multi-tenant LMS with `/org/{slug}` routing, invited or imported users, organization email domains, platform owner provisioning, tenant admins, managers, and learners.
- Do not add billing, custom domains, or SSO.
- Do not change product scope outside deployment readiness, security documentation, release gates, environment validation, and the MVP smoke path.
- Use small TDD loops. Each task writes a failing test or check first, runs it, implements the smallest passing change, reruns focused commands, then makes a commit checkpoint.

## File Responsibility Map

| Path | Action | Responsibility |
| --- | --- | --- |
| `.env.example` | Create or replace | Document every required local and production environment variable with non-secret sample values and provider grouping. |
| `src/lib/env.release-readiness.test.ts` | Create | Lock final production rejection rules for local development secrets, missing provider configuration, and invalid production URLs without taking ownership of Task 4's notification tests. |
| `src/lib/env.ts` | Modify after Task 4 | Extend the existing Task 4 environment parser with final release provider checks. Preserve Task 4 names: `SMTP_FROM_EMAIL`, `EMAIL_API_ENDPOINT`, `EMAIL_API_TOKEN`, `EMAIL_FROM_EMAIL`, and `NOTIFICATION_CRON_SECRET`. |
| `package.json` | Modify | Add Playwright and release scripts: `typecheck`, `e2e`, `e2e:smoke`, and `release:check`; add `@playwright/test` through `npm install -D @playwright/test`. |
| `playwright.config.ts` | Create | Configure Chromium smoke execution, local web server startup, trace/video/screenshot retention, and release output folders. |
| `e2e/learnhub-mvp-smoke.spec.ts` | Create | Run the MVP smoke path through platform owner login, org provision, admin user import, course creation, assignment, native video launch/progress routes, SCORM launch/commit routes, certificate verification, manager report, and CSV export. |
| `tooling/learnhub-release-check.ps1` | Create | Run tests, lint, Prisma validation, Prisma generate, TypeScript, build, and Playwright smoke in the required order with evidence logging. |
| `docs/runbooks/local-development.md` | Create | Give local setup, env, Prisma, seed, dev server, test, and smoke instructions. |
| `docs/runbooks/production-environment.md` | Create | Give Vercel and Neon production setup, env validation, migration order, deployment, and health verification. |
| `docs/runbooks/provider-setup.md` | Create | Give Mux, R2, Upstash, SMTP/API email, Credly, and cron route secret setup steps. |
| `docs/runbooks/release-checklist.md` | Create | Give the release decision workflow, gate commands, evidence paths, approvers, and post-release checks. |
| `docs/runbooks/rollback.md` | Create | Give rollback decision steps, database migration stance, provider webhook disablement, Vercel rollback, and user communication steps. |
| `docs/security/tenant-isolation-checklist.md` | Create | Map every organization-scoped module to scoping rules, tests, and release evidence. |
| `docs/security/provider-secret-handling.md` | Create | Document secret ownership, storage, rotation, exposure prevention, and incident response for provider credentials. |
| `docs/release/2026-06-learnhub-mvp-release-notes.md` | Create | Document June 2026 MVP release scope, operational requirements, verification evidence, and constraints. |
| `docs/superpowers/traceability/2026-06-learnhub-mvp-traceability-matrix.md` | Create | Map MVP requirements to spec, implementation module, test file, and release evidence. |

## Environment Contract

Use these variable names across `.env.example`, `src/lib/env.ts`, `src/lib/env.release-readiness.test.ts`, the runbooks, and Vercel production settings. Task 4 owns the initial notification/email env wiring; this release task consolidates the final production contract and must not rename Task 4 variables.

| Variable | Local value | Production rule |
| --- | --- | --- |
| `NODE_ENV` | `development` or `test` | Must be `production` on Vercel runtime. |
| `DATABASE_URL` | `postgresql://learnhub:learnhub@localhost:5432/learnhub?schema=public` | Required. Must not contain `localhost`, `127.0.0.1`, `learnhub:learnhub`, or `.local`. |
| `NEXTAUTH_SECRET` | `learnhub-local-secret` | Required. Minimum 32 characters. Must not equal `learnhub-local-secret` or `replace-with-a-local-secret`. |
| `NEXTAUTH_URL` | `http://localhost:3000` | Required. Must be HTTPS and must not use `localhost`, `127.0.0.1`, or `.local`. |
| `APP_BASE_URL` | `http://localhost:3000` | Required. Must be HTTPS and same origin as `NEXTAUTH_URL`. |
| `EMAIL_PROVIDER` | `console` | Required. Must be `smtp` or `api-provider` in production. |
| `SMTP_HOST` | empty | Required when `EMAIL_PROVIDER=smtp`. |
| `SMTP_PORT` | `587` | Required when `EMAIL_PROVIDER=smtp`; valid integer 1 through 65535. |
| `SMTP_USER` | empty | Required when `EMAIL_PROVIDER=smtp`. |
| `SMTP_PASSWORD` | empty | Required when `EMAIL_PROVIDER=smtp`; must not equal `local`, `test`, `example`, or `changeme`. |
| `SMTP_FROM_EMAIL` | `LearnHub <no-reply@learnhub.local>` | Required when `EMAIL_PROVIDER=smtp`. Must be a real sender address approved in the SMTP provider. |
| `EMAIL_API_ENDPOINT` | empty | Required when `EMAIL_PROVIDER=api-provider`; must be HTTPS. |
| `EMAIL_API_TOKEN` | empty | Required when `EMAIL_PROVIDER=api-provider`; must not equal `local`, `test`, `example`, or `changeme`. |
| `EMAIL_FROM_EMAIL` | empty | Required when `EMAIL_PROVIDER=api-provider`. Must be a real sender address approved in the API provider. |
| `MUX_TOKEN_ID` | empty | Required in production. |
| `MUX_TOKEN_SECRET` | empty | Required in production; must not equal `local`, `test`, `example`, or `changeme`. |
| `MUX_WEBHOOK_SECRET` | empty | Required in production; minimum 32 characters. |
| `R2_ACCOUNT_ID` | empty | Required in production. |
| `R2_ACCESS_KEY_ID` | empty | Required in production. |
| `R2_SECRET_ACCESS_KEY` | empty | Required in production; must not equal `local`, `test`, `example`, or `changeme`. |
| `R2_BUCKET_NAME` | `learnhub-local` | Required in production. Must not be `learnhub-local`. |
| `R2_PUBLIC_BASE_URL` | `http://localhost:3000/local-r2` | Required in production. Must be HTTPS. |
| `UPSTASH_REDIS_REST_URL` | empty | Required in production. Must be HTTPS. |
| `UPSTASH_REDIS_REST_TOKEN` | empty | Required in production; must not equal `local`, `test`, `example`, or `changeme`. |
| `NOTIFICATION_CRON_SECRET` | `learnhub-local-cron-secret` | Required in production. Minimum 32 characters. Must not equal `learnhub-local-cron-secret`. |
| `CREDLY_ORGANIZATION_ID` | empty | Required in production for certificate provider setup. |
| `CREDLY_API_TOKEN` | empty | Required in production; must not equal `local`, `test`, `example`, or `changeme`. |
| `CREDLY_TEMPLATE_ID` | empty | Required in production for MVP completion credentials. |

Production rejection rules:

- Reject local database URLs, local auth URLs, and local base URLs.
- Reject default development secrets and short secrets.
- Reject `EMAIL_PROVIDER=console` in production.
- Reject SMTP production config unless `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, and `SMTP_FROM_EMAIL` are set.
- Reject API email production config unless `EMAIL_API_ENDPOINT`, `EMAIL_API_TOKEN`, and `EMAIL_FROM_EMAIL` are set.
- Reject production without Mux, R2, Upstash, Credly, and cron route configuration.
- Reject sample secret strings: `local`, `test`, `example`, and `changeme`.

## Release Evidence Paths

The release script must create this folder on every run:

```text
artifacts/release/2026-06-learnhub-mvp/
```

Required files and folders produced by the gate:

```text
artifacts/release/2026-06-learnhub-mvp/learnhub-release-check.log
artifacts/release/2026-06-learnhub-mvp/summary.json
artifacts/release/2026-06-learnhub-mvp/playwright-report/
artifacts/release/2026-06-learnhub-mvp/test-results/
```

The traceability matrix must reference the `learnhub-release-check.log` and Playwright report path for final release evidence.

---

### Task 1: Environment Contract, `.env.example`, and Production Validation

**Files:**
- Create or replace: `.env.example`
- Create: `src/lib/env.release-readiness.test.ts`
- Modify: `src/lib/env.ts`

- [ ] **Step 1: Write failing environment tests**

Create `src/lib/env.release-readiness.test.ts` with tests for the expanded production contract. Keep existing Task 4 tests in `src/lib/env.test.ts` unchanged unless a failure proves they must be updated to preserve the same variable names.

```ts
import { afterEach, describe, expect, it, vi } from "vitest";

import { env, getEnv } from "./env";

const localDatabaseUrl = "postgresql://learnhub:learnhub@localhost:5432/learnhub?schema=public";
// Test-only non-secret values. Do not copy these into provider dashboards.
const productionEnv = {
  NODE_ENV: "production",
  DATABASE_URL: "postgresql://learnhub_owner:release_test_password@ep-release-test.neon.tech/learnhub?sslmode=require",
  NEXTAUTH_SECRET: "lh_release_test_nextauth_secret_32_chars",
  NEXTAUTH_URL: "https://release-test.learnhub.example",
  APP_BASE_URL: "https://release-test.learnhub.example",
  EMAIL_PROVIDER: "smtp",
  SMTP_FROM_EMAIL: "LearnHub <no-reply@learnhub.example>",
  SMTP_HOST: "smtp.example.com",
  SMTP_PORT: "587",
  SMTP_USER: "learnhub-smtp",
  SMTP_PASSWORD: "lh_release_test_smtp_password_32",
  MUX_TOKEN_ID: "mux-token-id",
  MUX_TOKEN_SECRET: "lh_release_test_mux_token_secret_32",
  MUX_WEBHOOK_SECRET: "lh_release_test_mux_webhook_secret_32",
  R2_ACCOUNT_ID: "r2-account-id",
  R2_ACCESS_KEY_ID: "r2-access-key",
  R2_SECRET_ACCESS_KEY: "lh_release_test_r2_secret_32",
  R2_BUCKET_NAME: "learnhub-release-test",
  R2_PUBLIC_BASE_URL: "https://assets.release-test.learnhub.example",
  UPSTASH_REDIS_REST_URL: "https://learnhub-upstash.upstash.io",
  UPSTASH_REDIS_REST_TOKEN: "lh_release_test_upstash_token_32",
  NOTIFICATION_CRON_SECRET: "lh_release_test_notification_cron_secret_32",
  CREDLY_ORGANIZATION_ID: "credly-org-id",
  CREDLY_API_TOKEN: "lh_release_test_credly_token_32",
  CREDLY_TEMPLATE_ID: "credly-template-id",
} satisfies NodeJS.ProcessEnv;
const apiProductionEnv = {
  ...productionEnv,
  EMAIL_PROVIDER: "api-provider",
  SMTP_HOST: "",
  SMTP_USER: "",
  SMTP_PASSWORD: "",
  SMTP_FROM_EMAIL: "",
  EMAIL_API_ENDPOINT: "https://email-api.learnhub.example/send",
  EMAIL_API_TOKEN: "lh_release_test_email_api_token_32",
  EMAIL_FROM_EMAIL: "LearnHub <no-reply@learnhub.example>",
} satisfies NodeJS.ProcessEnv;

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
      SMTP_FROM_EMAIL: "LearnHub <no-reply@learnhub.local>",
      SMTP_PORT: 587,
      R2_BUCKET_NAME: "learnhub-local",
      R2_PUBLIC_BASE_URL: "http://localhost:3000/local-r2",
      NOTIFICATION_CRON_SECRET: "learnhub-local-cron-secret",
    });
  });

  it("accepts complete production configuration", () => {
    expect(getEnv(productionEnv)).toMatchObject({
      DATABASE_URL: productionEnv.DATABASE_URL,
      NEXTAUTH_URL: productionEnv.NEXTAUTH_URL,
      APP_BASE_URL: productionEnv.APP_BASE_URL,
      EMAIL_PROVIDER: "smtp",
      SMTP_PORT: 587,
      MUX_TOKEN_ID: "mux-token-id",
      R2_BUCKET_NAME: "learnhub-release-test",
      UPSTASH_REDIS_REST_URL: "https://learnhub-upstash.upstash.io",
      CREDLY_TEMPLATE_ID: "credly-template-id",
    });
  });

  it.each([
    ["DATABASE_URL", { DATABASE_URL: localDatabaseUrl }, /DATABASE_URL must not use a local development database/],
    ["NEXTAUTH_SECRET", { NEXTAUTH_SECRET: "learnhub-local-secret" }, /NEXTAUTH_SECRET must be changed for production/],
    ["NEXTAUTH_URL", { NEXTAUTH_URL: "http://localhost:3000" }, /NEXTAUTH_URL must be an HTTPS production URL/],
    ["APP_BASE_URL", { APP_BASE_URL: "http://localhost:3000" }, /APP_BASE_URL must be an HTTPS production URL/],
    ["EMAIL_PROVIDER", { EMAIL_PROVIDER: "console" }, /EMAIL_PROVIDER cannot be console in production/],
    ["R2_BUCKET_NAME", { R2_BUCKET_NAME: "learnhub-local" }, /R2_BUCKET_NAME must be changed for production/],
    ["NOTIFICATION_CRON_SECRET", { NOTIFICATION_CRON_SECRET: "learnhub-local-cron-secret" }, /NOTIFICATION_CRON_SECRET must be changed for production/],
  ])("rejects production default for %s", (_name, override, message) => {
    expect(() => getEnv({ ...productionEnv, ...override })).toThrow(message);
  });

  it.each([
    ["smtp", productionEnv, { SMTP_HOST: "" }, /SMTP_HOST is required when EMAIL_PROVIDER is smtp/],
    ["smtp", productionEnv, { SMTP_PASSWORD: "" }, /SMTP_PASSWORD is required when EMAIL_PROVIDER is smtp/],
    ["api", apiProductionEnv, { EMAIL_API_ENDPOINT: "" }, /EMAIL_API_ENDPOINT is required when EMAIL_PROVIDER is api-provider/],
    ["api", apiProductionEnv, { EMAIL_API_TOKEN: "" }, /EMAIL_API_TOKEN is required when EMAIL_PROVIDER is api-provider/],
    ["api", apiProductionEnv, { EMAIL_FROM_EMAIL: "" }, /EMAIL_FROM_EMAIL is required when EMAIL_PROVIDER is api-provider/],
  ])("rejects missing production email configuration for %s", (_name, baseline, override, message) => {
    expect(() => getEnv({ ...baseline, ...override })).toThrow(message);
  });

  it.each([
    ["MUX_TOKEN_ID"],
    ["MUX_TOKEN_SECRET"],
    ["MUX_WEBHOOK_SECRET"],
    ["R2_ACCOUNT_ID"],
    ["R2_ACCESS_KEY_ID"],
    ["R2_SECRET_ACCESS_KEY"],
    ["R2_BUCKET_NAME"],
    ["R2_PUBLIC_BASE_URL"],
    ["UPSTASH_REDIS_REST_URL"],
    ["UPSTASH_REDIS_REST_TOKEN"],
    ["CREDLY_ORGANIZATION_ID"],
    ["CREDLY_API_TOKEN"],
    ["CREDLY_TEMPLATE_ID"],
  ])("requires %s in production", (key) => {
    expect(() => getEnv({ ...productionEnv, [key]: "" })).toThrow(new RegExp(`${key} is required in production`));
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
```

- [ ] **Step 2: Run the targeted test and verify failure**

Run:

```powershell
npx vitest run src/lib/env.release-readiness.test.ts
```

Expected: FAIL because `src/lib/env.ts` does not yet define the new environment variables or production rejection rules.

- [ ] **Step 3: Implement the environment parser**

Update `src/lib/env.ts` with the variables in the Environment Contract table. Keep lazy parsing through the existing `env` proxy.

Implementation requirements:

- Use `z.object` with `superRefine`.
- Preserve local defaults only when `NODE_ENV !== "production"`.
- Use `valueOrUndefined` to normalize empty strings.
- Add helpers `isProductionUrl`, `isLocalDatabaseUrl`, `isWeakSampleSecret`, `requireProductionValue`, `requireHttpsProductionUrl`, and `requireNonSampleSecret`.
- Keep `EMAIL_PROVIDER` as `z.enum(["console", "smtp", "api-provider"])`.
- Use `z.coerce.number().int().min(1).max(65535).default(587)` for `SMTP_PORT`.
- Add a same-origin check for `APP_BASE_URL` and `NEXTAUTH_URL` in production.
- Throw clear messages matching the tests.

Use this validation logic in `superRefine`:

```ts
const sampleSecretValues = new Set(["local", "test", "example", "changeme"]);
const localAuthSecret = "learnhub-local-secret";
const sampleAuthSecret = "replace-with-a-local-secret";
const localCronSecret = "learnhub-local-cron-secret";

function isProduction(source: NodeJS.ProcessEnv): boolean {
  return source.NODE_ENV === "production";
}

function isLocalUrl(url: string): boolean {
  return url.includes("localhost") || url.includes("127.0.0.1") || url.includes(".local");
}

function isLocalDatabaseUrl(url: string): boolean {
  return isLocalUrl(url) || url.includes("learnhub:learnhub");
}

function isHttpsUrl(url: string): boolean {
  try {
    return new URL(url).protocol === "https:";
  } catch {
    return false;
  }
}

function isProductionUrl(url: string): boolean {
  return isHttpsUrl(url) && !isLocalUrl(url);
}

function isWeakSampleSecret(value: string): boolean {
  return sampleSecretValues.has(value.trim().toLowerCase());
}

function requireProductionValue(ctx: z.RefinementCtx, value: string | undefined, key: string): void {
  if (!value?.trim()) {
    ctx.addIssue({ code: "custom", path: [key], message: `${key} is required in production` });
  }
}

function requireHttpsProductionUrl(ctx: z.RefinementCtx, value: string | undefined, key: string): void {
  requireProductionValue(ctx, value, key);
  if (value && !isProductionUrl(value)) {
    ctx.addIssue({ code: "custom", path: [key], message: `${key} must be an HTTPS production URL` });
  }
}

function requireNonSampleSecret(ctx: z.RefinementCtx, value: string | undefined, key: string): void {
  requireProductionValue(ctx, value, key);
  if (value && (isWeakSampleSecret(value) || value.length < 16)) {
    ctx.addIssue({ code: "custom", path: [key], message: `${key} must be changed for production` });
  }
}
```

- [ ] **Step 4: Replace `.env.example` with the full documented example**

Create or replace `.env.example` with this complete content:

```dotenv
# LearnHub local defaults
NODE_ENV="development"
DATABASE_URL="postgresql://learnhub:learnhub@localhost:5432/learnhub?schema=public"
NEXTAUTH_SECRET="replace-with-a-local-secret"
NEXTAUTH_URL="http://localhost:3000"
APP_BASE_URL="http://localhost:3000"

# Email: local uses console. Production uses smtp or api-provider.
EMAIL_PROVIDER="console"
SMTP_HOST=""
SMTP_PORT="587"
SMTP_USER=""
SMTP_PASSWORD=""
SMTP_FROM_EMAIL="LearnHub <no-reply@learnhub.local>"
EMAIL_API_ENDPOINT=""
EMAIL_API_TOKEN=""
EMAIL_FROM_EMAIL=""

# Mux video provider
MUX_TOKEN_ID=""
MUX_TOKEN_SECRET=""
MUX_WEBHOOK_SECRET=""

# Cloudflare R2 object storage
R2_ACCOUNT_ID=""
R2_ACCESS_KEY_ID=""
R2_SECRET_ACCESS_KEY=""
R2_BUCKET_NAME="learnhub-local"
R2_PUBLIC_BASE_URL="http://localhost:3000/local-r2"

# Upstash Redis for jobs, rate limits, and cron coordination
UPSTASH_REDIS_REST_URL=""
UPSTASH_REDIS_REST_TOKEN=""

# Cron routes
NOTIFICATION_CRON_SECRET="learnhub-local-cron-secret"

# Credly certificate provider
CREDLY_ORGANIZATION_ID=""
CREDLY_API_TOKEN=""
CREDLY_TEMPLATE_ID=""
```

- [ ] **Step 5: Run focused verification**

Run:

```powershell
npx vitest run src/lib/env.release-readiness.test.ts
```

Expected: PASS.

Run:

```powershell
npx tsc --noEmit --incremental false
```

Expected: PASS.

- [ ] **Step 6: Commit checkpoint**

```powershell
git add .env.example src/lib/env.ts src/lib/env.release-readiness.test.ts
git commit -m "feat: harden LearnHub production env contract"
```

---

### Task 2: Release Script, Package Scripts, and Playwright Configuration

**Files:**
- Modify: `package.json`
- Create: `playwright.config.ts`
- Create: `tooling/learnhub-release-check.ps1`

- [ ] **Step 1: Write failing release script checks**

Run:

```powershell
if (Test-Path .\tooling\learnhub-release-check.ps1) { throw "release script already exists" } else { Write-Output "missing release script as expected" }
npm pkg get scripts.release:check
npm pkg get scripts.e2e:smoke
```

Expected: first command prints `missing release script as expected`; package script checks do not return usable script values.

- [ ] **Step 2: Install Playwright test package**

Run:

```powershell
npm install -D @playwright/test
```

Expected: `package.json` and `package-lock.json` gain the npm-selected `@playwright/test` version.

- [ ] **Step 3: Add package scripts**

Modify `package.json` scripts to include:

```json
{
  "typecheck": "tsc --noEmit --incremental false",
  "e2e": "playwright test",
  "e2e:smoke": "playwright test e2e/learnhub-mvp-smoke.spec.ts --project=chromium",
  "release:check": "powershell -NoProfile -ExecutionPolicy Bypass -File tooling/learnhub-release-check.ps1"
}
```

Keep the existing `dev`, `build`, `lint`, `test`, `prisma:generate`, `prisma:migrate`, and `prisma:seed` scripts.
Remove `pretest` and `prebuild` so `prisma generate` runs only in the explicit `04 prisma generate` release step. This preserves the documented gate order and prevents `npm run test` or `npm run build` from running hidden generation before validation.

- [ ] **Step 4: Create `playwright.config.ts`**

Create `playwright.config.ts`:

```ts
import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
const releaseOutputDir = "artifacts/release/2026-06-learnhub-mvp";

export default defineConfig({
  testDir: "./e2e",
  timeout: 90_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [
    ["list"],
    ["html", { outputFolder: `${releaseOutputDir}/playwright-report`, open: "never" }],
    ["json", { outputFile: `${releaseOutputDir}/playwright-results.json` }],
  ],
  outputDir: `${releaseOutputDir}/test-results`,
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  webServer: {
    command: "npm run dev",
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
```

- [ ] **Step 5: Create the release script in the required order**

Create `tooling/learnhub-release-check.ps1`:

```powershell
$ErrorActionPreference = "Stop"

$releaseRoot = Join-Path (Get-Location) "artifacts\release\2026-06-learnhub-mvp"
$logPath = Join-Path $releaseRoot "learnhub-release-check.log"
$summaryPath = Join-Path $releaseRoot "summary.json"

New-Item -ItemType Directory -Force -Path $releaseRoot | Out-Null

if (Test-Path $logPath) {
  Remove-Item -LiteralPath $logPath -Force
}

$results = New-Object System.Collections.Generic.List[object]

function Invoke-Native {
  param(
    [Parameter(Mandatory = $true)][string]$FilePath,
    [Parameter(ValueFromRemainingArguments = $true)][string[]]$Arguments
  )

  & $FilePath @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "$FilePath $($Arguments -join ' ') failed with exit code $LASTEXITCODE"
  }
}

function Invoke-ReleaseStep {
  param(
    [Parameter(Mandatory = $true)][string]$Name,
    [Parameter(Mandatory = $true)][scriptblock]$Command
  )

  $startedAt = Get-Date
  "[$($startedAt.ToString("o"))] START $Name" | Tee-Object -FilePath $logPath -Append

  try {
    & $Command 2>&1 | Tee-Object -FilePath $logPath -Append
    $finishedAt = Get-Date
    "[$($finishedAt.ToString("o"))] PASS $Name" | Tee-Object -FilePath $logPath -Append
    $script:results.Add([pscustomobject]@{
      name = $Name
      status = "pass"
      startedAt = $startedAt.ToString("o")
      finishedAt = $finishedAt.ToString("o")
    })
  } catch {
    $finishedAt = Get-Date
    "[$($finishedAt.ToString("o"))] FAIL $Name" | Tee-Object -FilePath $logPath -Append
    $_ | Out-String | Tee-Object -FilePath $logPath -Append
    $script:results.Add([pscustomobject]@{
      name = $Name
      status = "fail"
      startedAt = $startedAt.ToString("o")
      finishedAt = $finishedAt.ToString("o")
    })
    $script:results | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $summaryPath
    throw
  }
}

Invoke-ReleaseStep "01 tests" { Invoke-Native npm run test }
Invoke-ReleaseStep "02 lint" { Invoke-Native npm run lint }
Invoke-ReleaseStep "03 prisma validate" { Invoke-Native npx prisma validate }
Invoke-ReleaseStep "04 prisma generate" { Invoke-Native npx prisma generate }
Invoke-ReleaseStep "05 typescript" { Invoke-Native npm run typecheck }
Invoke-ReleaseStep "06 build" { Invoke-Native npm run build }
Invoke-ReleaseStep "07 playwright smoke" {
  Invoke-Native npm run prisma:seed
  Invoke-Native npx playwright test e2e/learnhub-mvp-smoke.spec.ts --project=chromium
}

$results | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $summaryPath
"Release evidence written to $releaseRoot" | Tee-Object -FilePath $logPath -Append
```

Required order is locked as:

1. `npm run test`
2. `npm run lint`
3. `npx prisma validate`
4. `npx prisma generate`
5. `npm run typecheck`
6. `npm run build`
7. `npx playwright test e2e/learnhub-mvp-smoke.spec.ts --project=chromium`

The `npm run prisma:seed` command is part of the Playwright smoke step so the smoke data is ready without changing the required gate order.

- [ ] **Step 6: Run targeted script checks**

Run:

```powershell
npm pkg get scripts.release:check
npm pkg get scripts.e2e:smoke
npm pkg get scripts.pretest
npm pkg get scripts.prebuild
npx playwright --version
```

Expected: `release:check` and `e2e:smoke` scripts are present; `pretest` and `prebuild` return `{}` or no script value; Playwright prints an installed version.

Run:

```powershell
Select-String -LiteralPath .\tooling\learnhub-release-check.ps1 -Pattern "01 tests","02 lint","03 prisma validate","04 prisma generate","05 typescript","06 build","07 playwright smoke"
```

Expected: all seven ordered labels are present.

- [ ] **Step 7: Commit checkpoint**

```powershell
git add package.json package-lock.json playwright.config.ts tooling/learnhub-release-check.ps1
git commit -m "feat: add LearnHub release verification gate"
```

---

### Task 3: MVP End-To-End Smoke Test

**Files:**
- Create: `e2e/learnhub-mvp-smoke.spec.ts`

**Smoke data assumptions:**

- The release script runs `npm run prisma:seed` inside the Playwright smoke step.
- Seeded platform owner login is `owner@learnhub.local` with password `LearnHubDemo123!`.
- The smoke creates a unique organization with slug `smoke-${runId}` and allowed domain `example.com`.
- Imported users use `+${runId}` email aliases under `example.com`:
  - Admin: `smoke.admin+${runId}@example.com`
  - Manager: `smoke.manager+${runId}@example.com`
  - Learner: `smoke.learner+${runId}@example.com`
- The smoke sets passwords for imported users through Prisma after validating that the import flow created the users and memberships. This keeps login setup deterministic while still covering the admin user import surface.
- The smoke creates a native video course through the UI, then creates one required video lesson through Prisma so the existing runtime API can accept a progress commit.

- [ ] **Step 1: Write the failing smoke spec**

Create `e2e/learnhub-mvp-smoke.spec.ts` with one serial test named `LearnHub MVP release smoke`.

Use this structure:

```ts
import { expect, test, type Page } from "@playwright/test";

import { hashPassword } from "../src/lib/auth/password";
import { createPrismaClient } from "../src/lib/prisma";
import { issueCertificateForCompletedAssignment } from "../src/modules/certificates/certificates";
import { createPrismaCertificateRepository } from "../src/modules/certificates/prisma-repository";

const prisma = createPrismaClient();
const password = "LearnHubDemo123!";
const appBaseUrl = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";

test.describe.configure({ mode: "serial" });

test.afterAll(async () => {
  await prisma.$disconnect();
});

test("LearnHub MVP release smoke", async ({ page }) => {
  const runId = process.env.LEARNHUB_SMOKE_RUN_ID ?? Date.now().toString();
  const slug = `smoke-${runId}`;
  const orgName = `Smoke Organization ${runId}`;
  const adminEmail = `smoke.admin+${runId}@example.com`;
  const managerEmail = `smoke.manager+${runId}@example.com`;
  const learnerEmail = `smoke.learner+${runId}@example.com`;
  const courseTitle = `Smoke Course ${runId}`;
  const courseSlug = `smoke-course-${runId}`;
  const scormCourseTitle = `Smoke SCORM ${runId}`;
  const scormCourseSlug = `smoke-scorm-${runId}`;

  await login(page, "owner@learnhub.local", password);
  await expect(page).toHaveURL(/\/org/);

  await page.goto("/platform/organizations/new");
  await page.getByLabel("Organization name").fill(orgName);
  await page.getByLabel("Slug").fill(slug);
  await page.getByLabel("Allowed domains").fill("example.com");
  await page.getByLabel("Primary color").fill("#2563eb");
  await page.getByLabel("Accent color").fill("#14b8a6");
  await page.getByLabel("Enrollment policy").selectOption("ASSIGNMENT_ONLY");
  await page.getByRole("button", { name: "Create organization" }).click();
  await expect(page.getByRole("status")).toContainText("Organization created");

  await page.goto(`/org/${slug}/admin/users`);
  await page.getByLabel("CSV import").fill([
    "email,firstName,lastName,role,managerEmail,employeeId,department,title,status",
    `${adminEmail},Asha,Admin,ADMIN,,SMOKE-A-1,Learning,LMS Admin,ACTIVE`,
    `${managerEmail},Mohan,Manager,MANAGER,,SMOKE-M-1,Operations,Operations Manager,ACTIVE`,
    `${learnerEmail},Leela,Learner,LEARNER,${managerEmail},SMOKE-L-1,Operations,Operations Specialist,ACTIVE`,
  ].join("\n"));
  await page.getByRole("button", { name: "Validate CSV" }).click();
  await expect(page.getByRole("status")).toContainText("valid");
  await page.getByRole("button", { name: "Import users" }).click();
  await expect(page.getByRole("status")).toContainText("Imported 3 users");

  await setImportedUserPasswords([adminEmail, managerEmail, learnerEmail]);

  await login(page, adminEmail, password);
  await page.goto(`/org/${slug}/admin/catalog`);
  const coursesSection = page.getByRole("heading", { name: "Courses" }).locator("..");
  await coursesSection.scrollIntoViewIfNeeded();
  await coursesSection.getByLabel("Title").fill(courseTitle);
  await coursesSection.getByLabel("Slug").fill(courseSlug);
  await coursesSection.getByLabel("Description").fill("Smoke course used for June 2026 MVP release verification.");
  await coursesSection.getByLabel("Type").selectOption("NATIVE_VIDEO");
  await coursesSection.getByLabel("Lifecycle").selectOption("PUBLISHED");
  await coursesSection.getByLabel("Expected duration minutes").fill("5");
  await coursesSection.getByLabel("Estimated business days").fill("1");
  await coursesSection.getByRole("button", { name: "Create course" }).click();
  await expect(page.getByText(courseTitle)).toBeVisible();

  const fixture = await createRequiredVideoLesson(slug, courseSlug);
  const scormFixture = await createScormCompletionFixture(slug, scormCourseTitle, scormCourseSlug, learnerEmail);

  await page.goto(`/org/${slug}/admin/assignments`);
  await page.getByLabel("Course selector").selectOption({ label: `${courseTitle} (NATIVE_VIDEO)` });
  await page.getByLabel("Learner or direct report").selectOption({ label: `Leela Learner (${learnerEmail})` });
  await page.getByLabel("Start date").fill("2026-06-15");
  await page.getByRole("button", { name: "Assign course" }).click();
  await expect(async () => {
    await findAssignment(slug, courseSlug, learnerEmail);
  }).toPass();

  const assignment = await findAssignment(slug, courseSlug, learnerEmail);

  await login(page, learnerEmail, password);
  await page.goto(`/org/${slug}/learn/${courseSlug}`);
  await expect(page.getByRole("heading", { name: courseTitle })).toBeVisible();

  const launchResponse = await page.request.get(`/api/org/${slug}/assignments/${assignment.id}/video/launch`);
  expect(launchResponse.ok()).toBe(true);
  await expect(launchResponse.json()).resolves.toMatchObject({ assignmentId: assignment.id, courseTitle });

  const progressResponse = await page.request.post(`/api/org/${slug}/assignments/${assignment.id}/video/progress`, {
    data: {
      lessonId: fixture.lessonId,
      positionSecond: fixture.durationSeconds,
      watchedSecond: fixture.durationSeconds,
    },
  });
  expect(progressResponse.ok()).toBe(true);
  await expect(progressResponse.json()).resolves.toMatchObject({
    courseProgressPercent: 100,
    completed: true,
  });

  const certificate = await issueCertificateForCompletedAssignment(
    {
      organizationId: fixture.organizationId,
      assignmentId: assignment.id,
      appBaseUrl,
      now: new Date("2026-06-15T12:00:00.000Z"),
    },
    createPrismaCertificateRepository(prisma),
  );

  await page.goto(`/certificates/${certificate.verificationCode}`);
  await expect(page.getByText("Verified certificate")).toBeVisible();
  await expect(page.getByText("Leela Learner")).toBeVisible();
  await expect(page.getByText(courseTitle)).toBeVisible();

  await page.goto(`/org/${slug}/learn/${scormCourseSlug}/scorm`);
  await expect(page.getByRole("heading", { name: scormCourseTitle })).toBeVisible();
  const scormLaunchResponse = await page.request.get(`/api/org/${slug}/assignments/${scormFixture.assignmentId}/scorm/launch`);
  expect(scormLaunchResponse.ok()).toBe(true);
  await expect(scormLaunchResponse.json()).resolves.toMatchObject({ assignmentId: scormFixture.assignmentId });
  const scormCommitResponse = await page.request.post(`/api/org/${slug}/assignments/${scormFixture.assignmentId}/scorm/commit`, {
    data: {
      "cmi.core.lesson_status": "passed",
      "cmi.core.score.raw": "95",
      "cmi.core.session_time": "0000:05:00.00",
    },
  });
  expect(scormCommitResponse.ok()).toBe(true);
  await expect(scormCommitResponse.json()).resolves.toMatchObject({ progressPercent: 100, completed: true });

  await login(page, managerEmail, password);
  await page.goto(`/org/${slug}/reports`);
  await expect(page.getByRole("heading", { name: `${slug} learning progress` })).toBeVisible();
  await expect(page.getByText(learnerEmail)).toBeVisible();
  await expect(page.getByText("100%")).toBeVisible();
  await expect(page.getByText(scormCourseTitle)).toBeVisible();

  const csvResponse = await page.request.get(`/api/org/${slug}/reports/progress.csv`);
  expect(csvResponse.ok()).toBe(true);
  const csv = await csvResponse.text();
  expect(csv).toContain("Learner Email");
  expect(csv).toContain(learnerEmail);
  expect(csv).toContain(courseTitle);
  expect(csv).toContain(scormCourseTitle);
});

async function login(page: Page, email: string, loginPassword: string): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(loginPassword);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/org|\/platform/);
}

async function setImportedUserPasswords(emails: string[]): Promise<void> {
  const passwordHash = await hashPassword(password);
  const result = await prisma.user.updateMany({
    where: { email: { in: emails } },
    data: { passwordHash, status: "ACTIVE" },
  });

  expect(result.count).toBe(emails.length);
}

async function requireOrganization(slug: string): Promise<{ id: string }> {
  const organization = await prisma.organization.findUnique({
    where: { slug },
    select: { id: true },
  });

  if (!organization) {
    throw new Error(`Smoke organization was not found: ${slug}`);
  }

  return organization;
}

async function requireCourse(organizationId: string, courseSlug: string): Promise<{ id: string }> {
  const course = await prisma.course.findUnique({
    where: {
      organizationId_slug: {
        organizationId,
        slug: courseSlug,
      },
    },
    select: { id: true },
  });

  if (!course) {
    throw new Error(`Smoke course was not found: ${courseSlug}`);
  }

  return course;
}

async function createRequiredVideoLesson(
  slug: string,
  courseSlug: string,
): Promise<{ organizationId: string; courseId: string; lessonId: string; durationSeconds: number }> {
  const organization = await requireOrganization(slug);
  const course = await requireCourse(organization.id, courseSlug);
  const durationSeconds = 300;
  const module = await prisma.courseModule.upsert({
    where: {
      organizationId_courseId_slug: {
        organizationId: organization.id,
        courseId: course.id,
        slug: "smoke-module",
      },
    },
    create: {
      organizationId: organization.id,
      courseId: course.id,
      title: "Smoke Module",
      slug: "smoke-module",
      sortOrder: 1,
    },
    update: { title: "Smoke Module", sortOrder: 1 },
    select: { id: true },
  });
  const lesson = await prisma.videoLesson.upsert({
    where: {
      organizationId_courseId_slug: {
        organizationId: organization.id,
        courseId: course.id,
        slug: "smoke-lesson",
      },
    },
    create: {
      organizationId: organization.id,
      courseId: course.id,
      moduleId: module.id,
      title: "Smoke Lesson",
      slug: "smoke-lesson",
      sortOrder: 1,
      durationSeconds,
      required: true,
      playbackUrl: "https://cdn.learnhub.example/smoke.mp4",
    },
    update: {
      moduleId: module.id,
      durationSeconds,
      required: true,
      playbackUrl: "https://cdn.learnhub.example/smoke.mp4",
    },
    select: { id: true },
  });

  return { organizationId: organization.id, courseId: course.id, lessonId: lesson.id, durationSeconds };
}

async function createScormCompletionFixture(
  slug: string,
  courseTitle: string,
  courseSlug: string,
  learnerEmail: string,
): Promise<{ organizationId: string; courseId: string; assignmentId: string }> {
  const organization = await requireOrganization(slug);
  const learner = await prisma.organizationMembership.findFirst({
    where: { organizationId: organization.id, user: { email: learnerEmail } },
    select: { id: true },
  });

  if (!learner) {
    throw new Error(`Smoke learner membership was not found for ${learnerEmail}`);
  }

  const course = await prisma.course.upsert({
    where: {
      organizationId_slug: {
        organizationId: organization.id,
        slug: courseSlug,
      },
    },
    create: {
      organizationId: organization.id,
      title: courseTitle,
      slug: courseSlug,
      description: "Smoke SCORM course used for June 2026 MVP release verification.",
      status: "PUBLISHED",
      type: "SCORM_1_2",
      expectedDurationMinutes: 5,
      estimatedCompletionBusinessDays: 1,
    },
    update: { title: courseTitle, status: "PUBLISHED", type: "SCORM_1_2" },
    select: { id: true },
  });
  await prisma.scormPackage.upsert({
    where: {
      organizationId_courseId: {
        organizationId: organization.id,
        courseId: course.id,
      },
    },
    create: {
      organizationId: organization.id,
      courseId: course.id,
      originalFileName: "smoke-scorm.zip",
      contentType: "application/zip",
      byteSize: 1024,
      storageKey: `org/${organization.id}/courses/${course.id}/scorm/smoke/package.zip`,
      contentRootKey: `org/${organization.id}/courses/${course.id}/scorm/smoke/content/`,
      launchPath: "index.html",
      manifestTitle: courseTitle,
      active: true,
    },
    update: {
      launchPath: "index.html",
      manifestTitle: courseTitle,
      active: true,
    },
  });
  const assignment = await prisma.courseAssignment.upsert({
    where: {
      organizationId_courseId_membershipId: {
        organizationId: organization.id,
        courseId: course.id,
        membershipId: learner.id,
      },
    },
    create: {
      organizationId: organization.id,
      courseId: course.id,
      membershipId: learner.id,
      assignedByMembershipId: null,
      startDate: new Date("2026-06-15T00:00:00.000Z"),
      dueDate: new Date("2026-06-16T00:00:00.000Z"),
      status: "ASSIGNED",
    },
    update: { status: "ASSIGNED" },
    select: { id: true },
  });

  return { organizationId: organization.id, courseId: course.id, assignmentId: assignment.id };
}

async function findAssignment(
  slug: string,
  courseSlug: string,
  learnerEmail: string,
): Promise<{ id: string; membershipId: string; userId: string }> {
  const organization = await requireOrganization(slug);
  const course = await requireCourse(organization.id, courseSlug);
  const assignment = await prisma.courseAssignment.findFirst({
    where: {
      organizationId: organization.id,
      courseId: course.id,
      membership: { user: { email: learnerEmail } },
    },
    select: {
      id: true,
      membershipId: true,
      membership: { select: { userId: true } },
    },
  });

  if (!assignment) {
    throw new Error(`Smoke assignment was not found for ${learnerEmail}`);
  }

  return { id: assignment.id, membershipId: assignment.membershipId, userId: assignment.membership.userId };
}
```

- [ ] **Step 2: Run the smoke and verify the initial failure**

Run:

```powershell
npx playwright test e2e/learnhub-mvp-smoke.spec.ts --project=chromium
```

Expected before creating the file: FAIL because `e2e/learnhub-mvp-smoke.spec.ts` does not exist. After creating the spec, failures must be limited to real app behavior or objectively wrong selectors for current UI labels; do not leave stubbed helper functions.

- [ ] **Step 3: Review helper implementation**

Confirm the helper functions in the smoke spec use Prisma queries scoped by `organizationId` and tenant composite keys where the schema provides them:

```ts
await prisma.course.findUnique({
  where: {
    organizationId_slug: {
      organizationId: organization.id,
      slug: courseSlug,
    },
  },
});
```

The fixture creation must attach every created row to the smoke organization:

- `CourseModule.organizationId`
- `CourseModule.courseId`
- `VideoLesson.organizationId`
- `VideoLesson.courseId`
- `ScormPackage.organizationId`
- `ScormPackage.courseId`
- `CourseAssignment.organizationId`
- `CourseAssignment.courseId`

- [ ] **Step 4: Run focused smoke verification**

Run:

```powershell
npm run prisma:seed
npx playwright test e2e/learnhub-mvp-smoke.spec.ts --project=chromium --trace=retain-on-failure
```

Expected: PASS. Evidence written under `artifacts/release/2026-06-learnhub-mvp/`.

- [ ] **Step 5: Commit checkpoint**

```powershell
git add e2e/learnhub-mvp-smoke.spec.ts
git commit -m "test: add LearnHub MVP smoke coverage"
```

---

### Task 4: Runbooks

**Files:**
- Create: `docs/runbooks/local-development.md`
- Create: `docs/runbooks/production-environment.md`
- Create: `docs/runbooks/provider-setup.md`
- Create: `docs/runbooks/release-checklist.md`
- Create: `docs/runbooks/rollback.md`

- [ ] **Step 1: Write failing runbook coverage check**

Run:

```powershell
$paths = @(
  "docs/runbooks/local-development.md",
  "docs/runbooks/production-environment.md",
  "docs/runbooks/provider-setup.md",
  "docs/runbooks/release-checklist.md",
  "docs/runbooks/rollback.md"
)
foreach ($path in $paths) {
  if (-not (Test-Path $path)) { Write-Output "MISSING $path" }
}
```

Expected: all five runbooks are missing.

- [ ] **Step 2: Create local development runbook**

Create `docs/runbooks/local-development.md` with these sections:

```markdown
# LearnHub Local Development Runbook

## Purpose

Run LearnHub locally as a commercial multi-tenant LMS using seeded organizations, imported users, course assignments, native video runtime, SCORM 1.2 runtime, progress reporting, and certificate verification.

## Prerequisites

- Node.js compatible with the Next.js version in `package.json`.
- npm.
- PostgreSQL reachable through `DATABASE_URL`.
- PowerShell for release script execution on Windows.

## Setup

1. Run `npm install`.
2. Copy `.env.example` to `.env.local`.
3. Keep `EMAIL_PROVIDER=console` for local email output.
4. Use `DATABASE_URL=postgresql://learnhub:learnhub@localhost:5432/learnhub?schema=public`.
5. Run `npx prisma validate`.
6. Run `npx prisma generate`.
7. Run `npm run prisma:migrate`.
8. Run `npm run prisma:seed`.
9. Run `npm run dev`.

## Seeded Accounts

| Role | Email | Password |
| --- | --- | --- |
| Platform owner | `owner@learnhub.local` | `LearnHubDemo123!` |
| Tenant admin | `admin@example.com` | `LearnHubDemo123!` |
| Manager | `manager@acme.test` | `LearnHubDemo123!` |
| Learner | `learner@acme.test` | `LearnHubDemo123!` |

## Verification Commands

Run focused checks:

```powershell
npx vitest run src/lib/env.release-readiness.test.ts
npx prisma validate
npx prisma generate
npm run typecheck
npm run build
```

Run the full release gate:

```powershell
npm run release:check
```
```

- [ ] **Step 3: Create production environment runbook**

Create `docs/runbooks/production-environment.md` with these sections:

```markdown
# LearnHub Production Environment Runbook

## Platform

- Vercel hosts the Next.js application.
- Neon hosts PostgreSQL.
- Mux hosts native video uploads and playback.
- Cloudflare R2 stores SCORM packages and generated learning assets.
- Upstash Redis supports jobs, rate limits, and cron coordination.
- SMTP or API email sends invitations and operational mail.
- Credly issues completion credentials.

## Vercel Setup

1. Create a Vercel project from the GitHub repository.
2. Set framework preset to Next.js.
3. Set install command to `npm ci`.
4. Set build command to `npm run build`.
5. Add the production environment variables from `.env.example`.
6. Keep preview and production values separate.
7. Confirm `NEXTAUTH_URL` and `APP_BASE_URL` are the production HTTPS origin.

## Neon Setup

1. Create a production Neon project.
2. Create the `learnhub` database.
3. Add the pooled connection string to Vercel as `DATABASE_URL`.
4. Take a Neon branch or backup before every release migration.
5. Run migrations from a release workstation or CI runner with production credentials.

## Migration Order

1. `npm ci`
2. `npx prisma validate`
3. `npx prisma generate`
4. `npx prisma migrate deploy`
5. `npm run build`
6. Deploy the Vercel build
7. Run `npm run release:check` against the deployment smoke environment

## Production Validation

Production startup must reject:

- Local `DATABASE_URL`.
- Local `NEXTAUTH_SECRET`.
- Local `NEXTAUTH_URL`.
- Local `APP_BASE_URL`.
- `EMAIL_PROVIDER=console`.
- Missing Mux, R2, Upstash, Credly, or cron route secrets.
```

- [ ] **Step 4: Create provider setup runbook**

Create `docs/runbooks/provider-setup.md` with provider-specific steps:

```markdown
# LearnHub Provider Setup Runbook

## Mux

1. Create a Mux access token for production.
2. Store `MUX_TOKEN_ID` and `MUX_TOKEN_SECRET` in Vercel production env.
3. Create a webhook signing secret and store it as `MUX_WEBHOOK_SECRET`.
4. Configure webhook delivery only for the production LearnHub origin.
5. Verify video upload and playback through the MVP smoke or provider-specific test evidence.

## Cloudflare R2

1. Create the production bucket named by `R2_BUCKET_NAME`.
2. Create least-privilege R2 access keys for object read/write/delete.
3. Store `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, and `R2_PUBLIC_BASE_URL` in Vercel.
4. Configure CORS for LearnHub production HTTPS origin.
5. Confirm SCORM package upload, signed read, and delete paths in release evidence.

## Upstash Redis

1. Create a production Upstash Redis database.
2. Store `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` in Vercel.
3. Use the token only from server-side routes and jobs.
4. Rotate the token after a suspected exposure.

## SMTP Email

1. Set `EMAIL_PROVIDER=smtp`.
2. Store `SMTP_FROM_EMAIL`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, and `SMTP_PASSWORD`.
3. Verify the sender domain in the SMTP provider.
4. Send an invitation email in a production smoke tenant before broad user import.

## API Email

1. Set `EMAIL_PROVIDER=api-provider`.
2. Store `EMAIL_API_ENDPOINT`, `EMAIL_API_TOKEN`, and `EMAIL_FROM_EMAIL`.
3. Confirm the API endpoint uses HTTPS.
4. Send an invitation email in a production smoke tenant before broad user import.

## Credly

1. Create the LearnHub production organization in Credly.
2. Store `CREDLY_ORGANIZATION_ID`, `CREDLY_API_TOKEN`, and `CREDLY_TEMPLATE_ID`.
3. Confirm the template name matches the LearnHub completion credential.
4. Verify one credential issuance in the smoke tenant before opening the release.

## Cron Route Secrets

1. Generate a production `NOTIFICATION_CRON_SECRET` with at least 32 characters.
2. Store it in Vercel production env.
3. Configure Vercel cron routes to send the secret in the expected authorization header.
4. Rotate the secret if a cron route log exposes it.
```

- [ ] **Step 5: Create release checklist runbook**

Create `docs/runbooks/release-checklist.md`:

```markdown
# LearnHub Release Checklist

## Pre-Release

1. Confirm Git working tree contains only intended release changes.
2. Confirm `.env.example` matches `src/lib/env.ts`.
3. Confirm Vercel production variables satisfy the production runbook.
4. Confirm Neon backup or branch exists before migration.
5. Confirm provider dashboards show production Mux, R2, Upstash, email, Credly, and cron configuration.

## Gate Commands

Run:

```powershell
npm run release:check
```

The release gate runs in this order:

1. `npm run test`
2. `npm run lint`
3. `npx prisma validate`
4. `npx prisma generate`
5. `npm run typecheck`
6. `npm run build`
7. `npx playwright test e2e/learnhub-mvp-smoke.spec.ts --project=chromium`

## Evidence

Attach these paths to the release decision:

- `artifacts/release/2026-06-learnhub-mvp/learnhub-release-check.log`
- `artifacts/release/2026-06-learnhub-mvp/summary.json`
- `artifacts/release/2026-06-learnhub-mvp/playwright-report/`
- `docs/superpowers/traceability/2026-06-learnhub-mvp-traceability-matrix.md`

## Release Decision

Ship only when all gates pass, provider configuration is confirmed, tenant isolation checklist is complete, and rollback owner is assigned.
```

- [ ] **Step 6: Create rollback runbook**

Create `docs/runbooks/rollback.md`:

```markdown
# LearnHub Rollback Runbook

## Decision Triggers

- Login failure for platform owner or tenant admins.
- Cross-tenant data exposure.
- Failed production migration.
- Provider outage that blocks learner launch, progress commit, certificates, or user invitation.
- Release gate failure after deployment.

## Vercel Rollback

1. Open Vercel deployments for the production project.
2. Promote the last known-good deployment.
3. Confirm `NEXTAUTH_URL`, `APP_BASE_URL`, and provider env values still target production.
4. Run login smoke with `owner@learnhub.local` only in a private production smoke tenant.

## Database Migration Rollback Stance

Prisma migrations are treated as forward-only in production.

1. Do not run manual destructive SQL against production.
2. If migration fails before traffic cutover, restore the pre-release Neon branch or backup.
3. If migration succeeds and the app fails, prefer Vercel deployment rollback first.
4. If data shape must be corrected after a shipped migration, create a forward corrective migration and run `npx prisma migrate deploy`.
5. Preserve audit logs and release evidence before restoration.

## Provider Webhook Disablement

1. Disable Mux webhook delivery for the production endpoint if duplicate or malformed events affect runtime state.
2. Disable Credly credential issuance webhook delivery if credential callbacks are failing.
3. Pause email provider campaigns or invitation sends if user import produces bad mail.
4. Rotate exposed provider secrets and update Vercel env before re-enabling.

## User Communication

1. Notify internal release owner and support owner within 15 minutes.
2. Post a status update with impact, start time, affected tenant actions, and next update time.
3. Send tenant admin communication for learner-impacting incidents.
4. Send recovery communication after verification confirms login, assignments, learner launch, progress, certificates, reports, and CSV export.
```

- [ ] **Step 7: Run runbook coverage check**

Run:

```powershell
Select-String -Path docs/runbooks/*.md -Pattern "Vercel","Neon","Mux","R2","Upstash","SMTP","API email","Credly","cron","migration","rollback"
```

Expected: every term appears in the runbook set, with provider terms in `provider-setup.md`, migration terms in `production-environment.md`, and rollback terms in `rollback.md`.

- [ ] **Step 8: Commit checkpoint**

```powershell
git add docs/runbooks/local-development.md docs/runbooks/production-environment.md docs/runbooks/provider-setup.md docs/runbooks/release-checklist.md docs/runbooks/rollback.md
git commit -m "docs: add LearnHub deployment runbooks"
```

---

### Task 5: Security Documentation

**Files:**
- Create: `docs/security/tenant-isolation-checklist.md`
- Create: `docs/security/provider-secret-handling.md`

- [ ] **Step 1: Write failing security doc checks**

Run:

```powershell
if (-not (Test-Path .\docs\security\tenant-isolation-checklist.md)) { Write-Output "missing tenant isolation checklist" }
if (-not (Test-Path .\docs\security\provider-secret-handling.md)) { Write-Output "missing provider secret handling doc" }
```

Expected: both files are missing.

- [ ] **Step 2: Create tenant isolation checklist**

Create `docs/security/tenant-isolation-checklist.md` with this table:

```markdown
# LearnHub Tenant Isolation Checklist

## Rule

Every organization-scoped read, write, export, runtime launch, runtime commit, report, certificate, and provider operation must resolve `organizationId` from trusted route/session context and include `organizationId` in repository filters or composite keys.

## Module Coverage

| Module | Scoping rule | Scoping tests | Release evidence |
| --- | --- | --- | --- |
| Tenant scope | Resolve org by slug and keep `organizationId` required for downstream calls. | `src/modules/tenants/tenant-scope.test.ts` | `npm run test` in release log |
| Auth and guards | Session memberships must match target organization before access. | `src/lib/auth/guards.test.ts`, `src/modules/auth/permissions.test.ts`, `src/lib/auth/redirects.test.ts` | `npm run test` in release log |
| Organization provisioning | Platform owner creates org; tenant admin access stays inside assigned org. | `src/modules/organizations/provisioning.test.ts`, `src/modules/organizations/server-actions.test.ts` | Playwright smoke org provision |
| User import | CSV import validates allowed domains and writes memberships for one org. | `src/modules/users/csv-import.test.ts`, `src/modules/users/user-import.test.ts`, `src/modules/users/prisma-repository.test.ts`, `src/modules/users/server-actions.test.ts` | Playwright smoke admin user import |
| Catalog | Categories, tags, courses, lifecycle, and read models require org-scoped keys. | `src/modules/catalog/catalog-validation.test.ts`, `src/modules/catalog/category-tag-service.test.ts`, `src/modules/catalog/course-service.test.ts`, `src/modules/catalog/course-lifecycle.test.ts`, `src/modules/catalog/catalog-read-models.test.ts`, `src/modules/catalog/prisma-repository.test.ts`, `src/modules/catalog/server-actions.test.ts` | Playwright smoke course creation |
| Assignments | Assignments require org-scoped course and learner memberships. | `src/modules/assignments/assignment-service.test.ts`, `src/modules/assignments/prisma-repository.test.ts`, `src/modules/assignments/server-actions.test.ts` | Playwright smoke assignment |
| Native video | Lessons, transcript cues, chapters, launch, progress, and content repository queries carry organization scope. | `src/modules/video/video-runtime.test.ts`, `src/modules/video/video-content-service.test.ts`, `src/modules/video/prisma-repository.test.ts`, `src/modules/runtime/video-route-handlers.test.ts` | Playwright smoke learner launch and progress commit |
| SCORM 1.2 | Packages, registrations, launch, and commit use organization-scoped package and assignment keys. | `src/modules/scorm/scorm-runtime.test.ts`, `src/modules/scorm/scorm-package-service.test.ts`, `src/modules/scorm/prisma-repository.test.ts`, `src/modules/runtime/scorm-route-handlers.test.ts` | Release log unit tests |
| Runtime routes | Assignment launch and progress checks reject mismatched tenant context. | `src/modules/runtime/runtime-route-service.test.ts`, `src/modules/runtime/prisma-repository.test.ts` | Playwright smoke learner launch and progress commit |
| Progress | Learning events and assignment progress updates require organization-scoped assignment lookup. | `src/modules/progress/progress.test.ts`, `src/modules/progress/prisma-repository.ts` covered through runtime route tests | Playwright smoke progress commit |
| Reports and CSV export | Report rows and CSV export are filtered by admin, manager, or learner scope inside one org. | `src/modules/reports/progress-report.test.ts`, `src/modules/reports/prisma-repository.test.ts`, `src/modules/reports/export-route.test.ts` | Playwright smoke manager report and CSV export |
| Certificates | Certificates are issued from completed org-scoped assignments and public verification exposes only certificate fields. | `src/modules/certificates/certificates.test.ts`, `src/modules/certificates/prisma-repository.ts` covered by smoke verification | Playwright smoke certificate verification |
| Global library | Copying global courses into tenants must create tenant-owned catalog, module, video, SCORM, assessment, and assignment records. | `src/modules/library/global-library-copy.test.ts`, `src/modules/library/prisma-repository.test.ts` | Release log unit tests |
| Assessments and feedback | Knowledge checks, attempts, scoring, feedback, and survey rows must be tenant-scoped by assignment and course. | `src/modules/assessments/knowledge-checks.test.ts`, `src/modules/assessments/prisma-repository.test.ts`, `src/modules/feedback/course-feedback.test.ts` | Release log unit tests |
| Notifications and jobs | Notification jobs store `organizationId`, cron processing never accepts tenant ids from the browser, and tenant admins read only their tenant jobs. | `src/modules/notifications/notification-jobs.test.ts`, `src/modules/notifications/prisma-repository.test.ts`, `src/modules/notifications/notification-pages.test.ts` | Release log unit tests, provider setup sign-off |
| Production media and storage | R2 keys, Mux identifiers, SCORM package storage, validation, extraction, and signed reads must be server generated and tenant-scoped. | `src/modules/storage/object-storage.test.ts`, `src/modules/video/mux-provider.test.ts`, `src/modules/scorm/scorm-package-service.test.ts`, `src/modules/scorm/prisma-repository.test.ts` | Release log unit tests, provider setup sign-off |
| Credential operations | Credential issuance reads and retries require `organizationId`, certificate id, provider, and tenant-scoped repository methods. | `src/modules/credentials/credential-operations.test.ts`, `src/modules/credentials/prisma-repository.test.ts`, `src/modules/credentials/admin-certificate-pages.test.ts` | Playwright smoke certificate verification, Credly provider sign-off |
| Reporting analytics | Manager/admin analytics and CSV exports must compose role scope with tenant filters before reading report rows. | `src/modules/reports/progress-report.test.ts`, `src/modules/reports/reporting-analytics.test.ts`, `src/modules/reports/export-route.test.ts` | Playwright smoke manager report and CSV export |
| Operations views | Provider failure rows combine notification, credential, SCORM, Mux, and storage failures without exposing provider secrets. | `src/modules/operations/provider-failures.test.ts`, `src/modules/operations/operations-pages.test.ts` | Release log unit tests, operations review sign-off |
| Provider credentials | Provider secrets are platform configuration, not tenant-readable data. Tenant identifiers in provider payloads must be server generated. | `src/modules/providers/email/email-provider.test.ts`, release env tests | `src/lib/env.release-readiness.test.ts`, provider secret handling doc |
| Audit logs | Audit writes include `organizationId` for tenant actions; audit browsers compose actor, action, target, date, and organization filters without leaking cross-tenant data. | `src/modules/audit/audit-filters.test.ts`, `src/modules/audit/prisma-repository.test.ts`, `src/modules/audit/audit-pages.test.ts` | Release log unit tests |

## Release Checklist

1. Run `npm run test`.
2. Run `npx playwright test e2e/learnhub-mvp-smoke.spec.ts --project=chromium`.
3. Confirm this checklist has no module row without a test file or release evidence.
```

- [ ] **Step 3: Create provider secret handling doc**

Create `docs/security/provider-secret-handling.md`:

```markdown
# LearnHub Provider Secret Handling

## Rule

Provider secrets are stored only in Vercel environment variables or local developer `.env.local` files. They are never committed, logged, returned to the browser, placed in tenant settings, or included in export files.

## Secret Inventory

| Provider | Secret variables | Storage | Rotation trigger |
| --- | --- | --- | --- |
| NextAuth | `NEXTAUTH_SECRET` | Vercel env | Team member offboarding, suspected exposure, auth incident |
| Email SMTP | `SMTP_PASSWORD` | Vercel env | Provider credential exposure, mailbox compromise |
| Email API | `EMAIL_API_TOKEN` | Vercel env | Provider credential exposure, abnormal send volume |
| Mux | `MUX_TOKEN_SECRET`, `MUX_WEBHOOK_SECRET` | Vercel env | Failed webhook signature checks, dashboard exposure |
| Cloudflare R2 | `R2_SECRET_ACCESS_KEY` | Vercel env | Object access anomaly, key exposure |
| Upstash | `UPSTASH_REDIS_REST_TOKEN` | Vercel env | Redis access anomaly, token exposure |
| Cron | `NOTIFICATION_CRON_SECRET` | Vercel env and cron provider header | Unauthorized cron route attempt |
| Credly | `CREDLY_API_TOKEN` | Vercel env | Credential issuance anomaly, token exposure |

## Handling Rules

1. Use `.env.example` only for variable names and non-secret sample values.
2. Use `.env.local` for local secrets and keep it ignored by Git.
3. Never print secret values in release scripts, tests, runbooks, traceability matrices, or support exports.
4. Redact secrets in provider logs and application logs.
5. Rotate the provider secret before re-enabling any disabled webhook after suspected exposure.
6. Confirm server-only access for provider clients and cron route verification.
```

- [ ] **Step 4: Run security doc coverage checks**

Run:

```powershell
Select-String -LiteralPath .\docs\security\tenant-isolation-checklist.md -Pattern "organizations","users","catalog","assignments","video","SCORM","runtime","progress","reports","certificates","global library","assessments","feedback","notifications","storage","credentials","operations","providers","audit"
Select-String -LiteralPath .\docs\security\provider-secret-handling.md -Pattern "NEXTAUTH_SECRET","SMTP_PASSWORD","EMAIL_API_TOKEN","MUX_TOKEN_SECRET","R2_SECRET_ACCESS_KEY","UPSTASH_REDIS_REST_TOKEN","NOTIFICATION_CRON_SECRET","CREDLY_API_TOKEN"
```

Expected: all module and secret terms are present.

- [ ] **Step 5: Commit checkpoint**

```powershell
git add docs/security/tenant-isolation-checklist.md docs/security/provider-secret-handling.md
git commit -m "docs: add tenant isolation and secret handling checks"
```

---

### Task 6: Release Notes and Traceability Matrix

**Files:**
- Create: `docs/release/2026-06-learnhub-mvp-release-notes.md`
- Create: `docs/superpowers/traceability/2026-06-learnhub-mvp-traceability-matrix.md`

- [ ] **Step 1: Write failing release artifact checks**

Run:

```powershell
$paths = @(
  "docs/release/2026-06-learnhub-mvp-release-notes.md",
  "docs/superpowers/traceability/2026-06-learnhub-mvp-traceability-matrix.md"
)
foreach ($path in $paths) {
  if (-not (Test-Path $path)) { Write-Output "MISSING $path" }
}
```

Expected: both files are missing.

- [ ] **Step 2: Create release notes**

Create `docs/release/2026-06-learnhub-mvp-release-notes.md`:

```markdown
# LearnHub June 2026 MVP Release Notes

## Release Summary

LearnHub June 2026 MVP ships a commercial multi-tenant LMS foundation with platform owner organization provisioning, tenant admin user import, course catalog and assignments, global library copy workflows, knowledge checks, learner feedback, native video runtime, SCORM 1.2 runtime, production media/storage providers, learner progress, notifications, certificates, Credly credential operations, reporting analytics, audit/operations observability, CSV export, production environment validation, provider setup guidance, release checks, and rollback documentation.

## Included

- Commercial multi-tenant organization model using `/org/{slug}`.
- Platform owner organization provisioning.
- Imported tenant users with admin, manager, and learner roles.
- Course catalog, lifecycle, and assignments.
- Global library copy workflow into tenant-owned courses.
- Knowledge checks, scoring, and learner feedback.
- Native video launch and progress commit.
- SCORM 1.2 launch and commit support with production package storage.
- Mux video provider and Cloudflare R2 object storage operations.
- Notification jobs, reminder scheduling, and SMTP/API email providers.
- Progress reporting and analytics for admins, managers, and learners.
- Certificate verification page and Credly credential operations.
- Audit browsing and operations provider-failure observability.
- CSV progress export.
- Production environment validation for Vercel, Neon, Mux, R2, Upstash, SMTP/API email, Credly, and cron route secrets.
- Release gate script and Playwright MVP smoke.
- Runbooks for local development, production environment, provider setup, release checklist, and rollback.
- Security docs for tenant isolation and provider secret handling.
- Traceability matrix for MVP release evidence.

## Operational Requirements

- Run `npm run release:check` before release approval.
- Attach release evidence from `artifacts/release/2026-06-learnhub-mvp/`.
- Confirm Neon backup or branch exists before production migration.
- Confirm provider dashboards are configured before production smoke.

## Constraints

- Billing is not part of this MVP.
- Custom domains are not part of this MVP.
- SSO is not part of this MVP.
```

- [ ] **Step 3: Create traceability matrix**

Create `docs/superpowers/traceability/2026-06-learnhub-mvp-traceability-matrix.md` with these rows:

```markdown
# LearnHub June 2026 MVP Traceability Matrix

| MVP requirement | Spec source | Implementation module | Test file | Release evidence |
| --- | --- | --- | --- | --- |
| Commercial multi-tenant LMS with `/org/{slug}` routing | `docs/superpowers/specs/2026-06-09-learnhub-mvp-design.md` | `src/modules/tenants/tenant-scope.ts`, `src/app/org/[slug]/page.tsx` | `src/modules/tenants/tenant-scope.test.ts` | `learnhub-release-check.log`, tenant isolation checklist |
| Platform owner login and organization provision | `docs/superpowers/specs/2026-06-09-users-auth-tenant-admin-design.md` | `src/app/platform/organizations/new/actions.ts`, `src/modules/organizations/provisioning.ts` | `src/modules/organizations/provisioning.test.ts`, `src/modules/organizations/server-actions.test.ts` | Playwright smoke platform owner login and organization provision |
| Tenant admin user import | `docs/superpowers/specs/2026-06-09-users-auth-tenant-admin-design.md` | `src/modules/users/csv-import.ts`, `src/modules/users/user-import.ts`, `src/app/org/[slug]/admin/users/actions.ts` | `src/modules/users/csv-import.test.ts`, `src/modules/users/user-import.test.ts`, `src/modules/users/server-actions.test.ts` | Playwright smoke admin user import |
| Course creation and lifecycle | `docs/superpowers/specs/2026-06-09-course-catalog-assignments-design.md` | `src/modules/catalog/course-service.ts`, `src/modules/catalog/course-lifecycle.ts`, `src/app/org/[slug]/admin/catalog/actions.ts` | `src/modules/catalog/course-service.test.ts`, `src/modules/catalog/course-lifecycle.test.ts`, `src/modules/catalog/server-actions.test.ts` | Playwright smoke course creation |
| Assignment to learner | `docs/superpowers/specs/2026-06-09-course-catalog-assignments-design.md` | `src/modules/assignments/assignment-service.ts`, `src/app/org/[slug]/admin/assignments/actions.ts` | `src/modules/assignments/assignment-service.test.ts`, `src/modules/assignments/server-actions.test.ts` | Playwright smoke assignment |
| Native video learner launch | `docs/superpowers/specs/2026-06-10-native-video-runtime-design.md` | `src/modules/video/video-runtime.ts`, `src/app/api/org/[slug]/assignments/[assignmentId]/video/launch/route.ts` | `src/modules/video/video-runtime.test.ts`, `src/modules/runtime/video-route-handlers.test.ts` | Playwright smoke learner launch |
| Progress commit | `docs/superpowers/specs/2026-06-12-runtime-endpoints-design.md` | `src/modules/progress/progress.ts`, `src/app/api/org/[slug]/assignments/[assignmentId]/video/progress/route.ts` | `src/modules/progress/progress.test.ts`, `src/modules/runtime/video-route-handlers.test.ts` | Playwright smoke progress commit |
| Certificate verification | `docs/superpowers/specs/2026-06-09-learnhub-mvp-design.md` | `src/modules/certificates/certificates.ts`, `src/app/certificates/[verificationCode]/page.tsx` | `src/modules/certificates/certificates.test.ts` | Playwright smoke certificate verification |
| Manager report | `docs/superpowers/specs/2026-06-09-learnhub-mvp-design.md` | `src/modules/reports/progress-report.ts`, `src/app/org/[slug]/reports/page.tsx` | `src/modules/reports/progress-report.test.ts`, `src/modules/reports/prisma-repository.test.ts` | Playwright smoke manager report |
| CSV export | `docs/superpowers/specs/2026-06-09-learnhub-mvp-design.md` | `src/app/api/org/[slug]/reports/progress.csv/route.ts`, `src/modules/reports/progress-report.ts` | `src/modules/reports/export-route.test.ts` | Playwright smoke CSV export |
| SCORM launch and completion | `docs/superpowers/specs/2026-06-12-runtime-endpoints-design.md`, `docs/superpowers/plans/2026-06-13-production-media-storage-scorm-operations-implementation.md` | `src/modules/scorm/scorm-runtime.ts`, `src/app/api/org/[slug]/assignments/[assignmentId]/scorm/launch/route.ts`, `src/app/api/org/[slug]/assignments/[assignmentId]/scorm/commit/route.ts` | `src/modules/scorm/scorm-runtime.test.ts`, `src/modules/runtime/scorm-route-handlers.test.ts` | Playwright smoke SCORM launch and commit |
| Tenant lifecycle and branding | `docs/superpowers/plans/2026-06-13-tenant-operations-branding-user-lifecycle-implementation.md` | `src/modules/organizations/provisioning.ts`, `src/modules/organizations/branding.ts`, `src/app/platform/organizations/[slug]/page.tsx` | `src/modules/organizations/provisioning.test.ts`, `src/modules/organizations/branding.test.ts` | Tenant isolation checklist, release log |
| Global library copy workflow | `docs/superpowers/plans/2026-06-13-global-library-copy-workflow-implementation.md` | `src/modules/library/global-library-copy.ts`, `src/modules/library/prisma-repository.ts` | `src/modules/library/global-library-copy.test.ts`, `src/modules/library/prisma-repository.test.ts` | Release log unit tests |
| Knowledge checks and learner feedback | `docs/superpowers/plans/2026-06-13-knowledge-checks-scoring-feedback-implementation.md` | `src/modules/assessments/knowledge-checks.ts`, `src/modules/feedback/course-feedback.ts` | `src/modules/assessments/knowledge-checks.test.ts`, `src/modules/feedback/course-feedback.test.ts` | Release log unit tests |
| Notification jobs and production email providers | `docs/superpowers/plans/2026-06-13-notifications-jobs-email-providers-implementation.md` | `src/modules/notifications/notification-jobs.ts`, `src/modules/providers/email/email-provider.ts`, `src/app/api/cron/notifications/route.ts` | `src/modules/notifications/notification-jobs.test.ts`, `src/modules/providers/email/email-provider.test.ts`, `src/app/api/cron/notifications/route.test.ts` | Release log unit tests, provider setup sign-off |
| Production media, R2 storage, Mux, and SCORM extraction | `docs/superpowers/plans/2026-06-13-production-media-storage-scorm-operations-implementation.md` | `src/modules/storage/object-storage.ts`, `src/modules/video/mux-provider.ts`, `src/modules/scorm/scorm-package-service.ts`, `src/modules/scorm/prisma-repository.ts` | `src/modules/storage/object-storage.test.ts`, `src/modules/video/mux-provider.test.ts`, `src/modules/scorm/scorm-package-service.test.ts`, `src/modules/scorm/prisma-repository.test.ts` | Release log unit tests, provider setup sign-off |
| Certificates and Credly credential operations | `docs/superpowers/plans/2026-06-13-certificates-credentials-operations-implementation.md` | `src/modules/certificates/certificates.ts`, `src/modules/credentials/credential-operations.ts`, `src/modules/credentials/credly-provider.ts` | `src/modules/certificates/certificates.test.ts`, `src/modules/credentials/credential-operations.test.ts`, `src/modules/credentials/credly-provider.test.ts` | Playwright smoke certificate verification, Credly provider sign-off |
| Reporting analytics completion | `docs/superpowers/plans/2026-06-13-reporting-analytics-completion-implementation.md` | `src/modules/reports/progress-report.ts`, `src/modules/reports/reporting-analytics.ts`, `src/app/org/[slug]/reports/page.tsx` | `src/modules/reports/progress-report.test.ts`, `src/modules/reports/reporting-analytics.test.ts`, `src/modules/reports/export-route.test.ts` | Playwright smoke manager report and CSV export |
| Audit and operations observability | `docs/superpowers/plans/2026-06-13-audit-operations-observability-implementation.md` | `src/modules/audit/prisma-repository.ts`, `src/modules/operations/provider-failures.ts`, `src/app/platform/operations/page.tsx` | `src/modules/audit/prisma-repository.test.ts`, `src/modules/operations/provider-failures.test.ts`, `src/modules/operations/operations-pages.test.ts` | Release log unit tests, operations review sign-off |
| Production environment validation | This plan | `src/lib/env.ts`, `.env.example` | `src/lib/env.release-readiness.test.ts`, `src/lib/env.test.ts` | `npm run test`, release log |
| Release script ordering | This plan | `tooling/learnhub-release-check.ps1`, `package.json` | Release script text check | `summary.json`, release log |
| Deployment runbooks | This plan | `docs/runbooks/*.md` | Runbook coverage check | Release checklist sign-off |
| Tenant isolation checklist | This plan | `docs/security/tenant-isolation-checklist.md` | Security doc coverage check | Tenant isolation checklist sign-off |
| Provider secret handling | This plan | `docs/security/provider-secret-handling.md`, `src/lib/env.ts` | `src/lib/env.release-readiness.test.ts`, security doc coverage check | Provider setup sign-off |
| Rollback readiness | This plan | `docs/runbooks/rollback.md` | Rollback term coverage check | Release checklist sign-off |
```

- [ ] **Step 4: Run artifact coverage checks**

Run:

```powershell
Select-String -LiteralPath .\docs\release\2026-06-learnhub-mvp-release-notes.md -Pattern "commercial multi-tenant","Vercel","Neon","Mux","R2","Upstash","SMTP/API email","Credly","cron","rollback"
Select-String -LiteralPath .\docs\superpowers\traceability\2026-06-learnhub-mvp-traceability-matrix.md -Pattern "MVP requirement","Spec source","Implementation module","Test file","Release evidence","platform owner","organization provision","admin user import","course creation","assignment","learner launch","progress commit","certificate verification","manager report","CSV export"
```

Expected: all coverage terms are present.

- [ ] **Step 5: Commit checkpoint**

```powershell
git add docs/release/2026-06-learnhub-mvp-release-notes.md docs/superpowers/traceability/2026-06-learnhub-mvp-traceability-matrix.md
git commit -m "docs: add LearnHub MVP release artifacts"
```

---

### Task 7: Umbrella Verification and Release Evidence

**Files:**
- Verify all files created or modified in Tasks 1 through 6.

- [ ] **Step 1: Run focused checks**

Run:

```powershell
npx vitest run src/lib/env.release-readiness.test.ts src/lib/env.test.ts
npx playwright test e2e/learnhub-mvp-smoke.spec.ts --project=chromium --trace=retain-on-failure
```

Expected: both commands PASS.

- [ ] **Step 2: Run the umbrella release gate**

Run:

```powershell
npm run release:check
```

Expected order in `artifacts/release/2026-06-learnhub-mvp/learnhub-release-check.log`:

```text
START 01 tests
PASS 01 tests
START 02 lint
PASS 02 lint
START 03 prisma validate
PASS 03 prisma validate
START 04 prisma generate
PASS 04 prisma generate
START 05 typescript
PASS 05 typescript
START 06 build
PASS 06 build
START 07 playwright smoke
PASS 07 playwright smoke
```

- [ ] **Step 3: Run documentation and coverage scans**

Run:

```powershell
$banned = @(
  -join ([char[]](84,79,68,79)),
  -join ([char[]](84,66,68)),
  -join ([char[]](70,73,88,77,69)),
  -join ([char[]](105,109,112,108,101,109,101,110,116,32,108,97,116,101,114)),
  -join ([char[]](102,105,108,108,32,105,110,32,100,101,116,97,105,108,115)),
  -join ([char[]](97,100,100,32,97,112,112,114,111,112,114,105,97,116,101)),
  -join ([char[]](115,105,109,105,108,97,114,32,116,111)),
  -join ([char[]](112,108,97,99,101,104,111,108,100,101,114))
)
Select-String -Path .env.example,src/lib/env.ts,src/lib/env.test.ts,src/lib/env.release-readiness.test.ts,tooling/learnhub-release-check.ps1,playwright.config.ts,e2e/learnhub-mvp-smoke.spec.ts,docs/runbooks/*.md,docs/security/*.md,docs/release/*.md,docs/superpowers/traceability/*.md -Pattern $banned
```

Expected: no matches.

Run:

```powershell
Select-String -Path .env.example,src/lib/env.ts,src/lib/env.test.ts,src/lib/env.release-readiness.test.ts,tooling/learnhub-release-check.ps1,playwright.config.ts,e2e/learnhub-mvp-smoke.spec.ts,docs/runbooks/*.md,docs/security/*.md,docs/release/*.md,docs/superpowers/traceability/*.md -Pattern "Vercel","Neon","Mux","R2","Upstash","SMTP","API email","Credly","cron","database migration","tenant isolation","provider secret","traceability","platform owner","organization provision","admin user import","course creation","assignment","learner launch","progress commit","SCORM commit","certificate verification","manager report","CSV export","global library","knowledge checks","notifications","storage","operations","audit","rollback"
```

Expected: every term is present in at least one release artifact.

- [ ] **Step 4: Check final Git state**

Run:

```powershell
git status --short
```

Expected: only intended files from this plan are changed before the final implementation commit.

- [ ] **Step 5: Final Git state check**

```powershell
git status --short
git log --oneline -6
```

Expected: all intended release readiness files were already committed by the task checkpoints above; no duplicate or empty final commit is created.

## Implementation Notes

- Keep every future implementation step scoped to the files listed in this plan unless a failing command proves a small supporting edit is required.
- If another worker has edited one of these files, read the file first and preserve their changes.
- The Playwright smoke is allowed to use Prisma for deterministic fixture setup and verification, but user-facing coverage must still flow through real pages and route handlers for login, org provision, import, course creation, assignment, native video launch, native video progress commit, SCORM launch, SCORM commit, certificate verification, manager report, and CSV export.
- Production deploys must run `npx prisma migrate deploy`; local development uses `npm run prisma:migrate`.
- Treat database rollback as restore or forward corrective migration, not a destructive manual SQL exercise.
