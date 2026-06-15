import { expect, test, type Page } from "@playwright/test";

const organizationSlug = process.env.E2E_ORG_SLUG ?? "acme";
const demoPassword = process.env.E2E_PASSWORD ?? "LearnHubDemo123!";
const roleUsers = {
  admin: process.env.E2E_ADMIN_EMAIL ?? "admin@example.com",
  learner: process.env.E2E_LEARNER_EMAIL ?? "learner@acme.test",
  manager: process.env.E2E_MANAGER_EMAIL ?? "manager@acme.test",
};

test.describe("LearnHub role journeys", () => {
  test.describe.configure({ mode: "serial" });

  test("learner can navigate courses, launch video and SCORM, use assessments, view certificates, and log off", async ({
    page,
  }) => {
    await signIn(page, roleUsers.learner);

    await expect(page).toHaveURL(new RegExp(`/org/${organizationSlug}/learn$`));
    await expect(page.getByRole("heading", { name: "Pick up where you left off." })).toBeVisible();
    await expect(page.getByRole("button", { name: "Log off" })).toBeVisible();

    await page.getByRole("link", { name: "Catalog" }).click();
    await expect(page.getByRole("heading", { name: "Find the next course for your role." })).toBeVisible();
    await page.getByLabel("Search catalog").fill("privacy");
    await page.getByRole("button", { name: "Search" }).click();
    await expect(page).toHaveURL(/query=privacy/);

    await page.goto(`/org/${organizationSlug}/learn/courses/workplace-security-basics/lessons/password-and-device-hygiene`);
    await expect(page.getByRole("heading", { name: "Password and Device Hygiene" })).toBeVisible();
    await expect(page.locator("[data-video-launch-path]")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Knowledge checks" })).toBeVisible();
    const answerForm = page.locator("form").filter({ has: page.getByRole("button", { name: "Submit answer" }) }).first();
    await answerForm.getByRole("radio").first().check();
    await answerForm.getByRole("button", { name: "Submit answer" }).click();
    await expect(page.getByText(/Correct|Review needed/).first()).toBeVisible();

    await page.goto(`/org/${organizationSlug}/learn/compliance-policy-simulation/scorm`);
    await expect(page.getByRole("heading", { name: "Compliance Policy Simulation" })).toBeVisible();
    await expect(page.locator("[data-scorm-launch-path]")).toBeVisible();

    await page.getByRole("link", { name: "Assessments" }).click();
    await expect(page.getByRole("heading", { name: "Quizzes and knowledge checks." })).toBeVisible();

    await page.getByRole("link", { name: "Certificates" }).click();
    await expect(page.getByRole("heading", { name: "Your earned credentials." })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Earned certificates" })).toBeVisible();

    await logOff(page);
  });

  test("manager can inspect direct reports, assign learning controls, export reports, and log off", async ({ page }) => {
    await signIn(page, roleUsers.manager);

    await expect(page).toHaveURL(new RegExp(`/org/${organizationSlug}$`));
    await page.getByRole("link", { name: "Manager workspace" }).click();
    await expect(page.getByRole("heading", { name: "Keep direct-report learning moving." })).toBeVisible();
    await expect(page.getByRole("button", { name: "Log off" })).toBeVisible();

    await page.getByRole("link", { name: "View learner" }).first().click();
    await expect(page.getByRole("heading", { name: "Assignment history" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Certificate status" })).toBeVisible();

    await page.getByRole("link", { name: "Assignments" }).click();
    await expect(page.getByRole("heading", { name: "Assign courses to direct reports." })).toBeVisible();
    await expect(page.getByRole("button", { name: "Assign course" })).toBeVisible();

    await page.getByRole("link", { name: "Reports" }).click();
    await expect(page.getByRole("heading", { name: "Review team learning outcomes." })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Learner progress" })).toBeVisible();
    const csvResponse = await page.request.get(`/api/org/${organizationSlug}/reports/progress.csv`);
    expect(csvResponse.ok()).toBeTruthy();
    await expect(await csvResponse.text()).toContain("Learner Email");

    await logOff(page);
  });

  test("admin can create course content, visit SCORM import, bulk import users, bulk assign, remove access, review reports/settings, and log off", async ({
    page,
  }) => {
    const runId = Date.now().toString(36);
    const videoCourseSlug = `e2e-video-${runId}`;
    const videoLessonSlug = `intro-${runId}`;
    const importedEmail = `e2e-${runId}@example.com`;

    await signIn(page, roleUsers.admin);

    await expect(page).toHaveURL(new RegExp(`/org/${organizationSlug}$`));
    await page.getByRole("link", { name: "Admin console" }).click();
    await expect(page.getByRole("heading", { name: "Acme Learning dashboard" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Log off" })).toBeVisible();

    await page.getByRole("link", { name: "Create Course" }).first().click();
    await expect(page.getByRole("heading", { name: "Create Course" })).toBeVisible();
    await page.getByLabel("Title").fill(`E2E Video ${runId}`);
    await page.getByLabel("Slug").fill(videoCourseSlug);
    await page.getByLabel("Description").fill("Created by the Playwright role journey smoke.");
    await page.getByLabel("Type").selectOption("NATIVE_VIDEO");
    await page.getByLabel("Lifecycle").selectOption("DRAFT");
    await page.getByLabel("Expected duration minutes").fill("15");
    await page.getByLabel("Estimated business days").fill("2");
    await page.getByRole("button", { name: "Create Course" }).click();
    await expect(page).toHaveURL(new RegExp(`/admin/courses/${videoCourseSlug}/content$`));
    await expect(page.getByRole("heading", { name: "Mux upload readiness" })).toBeVisible();

    await page.getByLabel("Title").fill(`Intro ${runId}`);
    await page.getByLabel("Slug").fill(videoLessonSlug);
    await page.getByLabel("Sort order").fill("0");
    await page.getByLabel("Duration seconds").fill("120");
    await page.getByLabel("Playback URL").fill("/sample-video.mp4");
    await page.getByRole("button", { name: "Add lesson" }).click();
    await page.reload();
    await expect(page.getByRole("heading", { name: `Intro ${runId}` })).toBeVisible();

    await page.goto(`/org/${organizationSlug}/admin/courses/${videoCourseSlug}`);
    await page.getByRole("button", { name: "Publish" }).click();
    await expect(page.getByRole("status")).toContainText("Course lifecycle updated.");

    await page.goto(`/org/${organizationSlug}/admin/courses/compliance-policy-simulation/scorm`);
    await expect(page.getByRole("heading", { name: "SCORM storage readiness" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Active package" })).toBeVisible();
    await expect(page.getByText("index.html").first()).toBeVisible();

    await page.goto(`/org/${organizationSlug}/admin/users/import`);
    await expect(page.getByRole("heading", { name: "Bulk User Import" })).toBeVisible();
    await page.getByLabel("CSV import").fill(
      [
        "email,firstName,lastName,role,managerEmail,employeeId,department,title,status",
        `${importedEmail},E2E,Learner,LEARNER,manager@acme.test,E2E-${runId},QA,Smoke Learner,ACTIVE`,
      ].join("\n"),
    );
    await page.getByRole("button", { name: "Validate CSV" }).click();
    await expect(page.getByRole("status")).toContainText("CSV is valid for 1 users.");
    await page.getByRole("button", { name: "Import users" }).click();
    await expect(page.getByRole("status")).toContainText("Imported 1 users.");

    await page.goto(`/org/${organizationSlug}/admin/assignments/bulk`);
    await expect(page.getByRole("heading", { name: "Bulk Assignments" })).toBeVisible();
    await page.getByLabel("Course selector").selectOption({ label: `E2E Video ${runId} (NATIVE_VIDEO)` });
    await page.getByLabel(importedEmail).check();
    await page.getByLabel("Start date").fill(new Date().toISOString().slice(0, 10));
    await page.getByRole("button", { name: "Assign selected learners" }).click();
    await expect(page.getByRole("status")).toContainText("Assigned course to 1 learner.");

    await page.goto(`/org/${organizationSlug}/admin/users/remove`);
    await expect(page.getByRole("heading", { name: "Deactivate / remove access" })).toBeVisible();
    const importedUserRow = page.getByRole("row", { name: new RegExp(importedEmail) });
    await importedUserRow.getByRole("button", { name: "Deactivate / remove access" }).click();
    await expect(importedUserRow.getByRole("status")).toContainText("User updated.");

    await page.goto(`/org/${organizationSlug}/admin/reports`);
    await expect(page.getByRole("heading", { name: "Acme Learning organization progress" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Learner progress" })).toBeVisible();

    await page.goto(`/org/${organizationSlug}/admin/settings`);
    await expect(page.getByRole("heading", { name: "Acme Learning branding" })).toBeVisible();

    await logOff(page);
  });
});

async function signIn(page: Page, email: string) {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(demoPassword);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((url) => url.pathname !== "/login", { timeout: 30_000 });
}

async function logOff(page: Page) {
  await page.getByRole("button", { name: "Log off" }).evaluate((button) => {
    if (!(button instanceof HTMLButtonElement)) {
      throw new Error("Log off control is not a button");
    }

    button.click();
  });
  await expect(page).toHaveURL(/\/login$/);
}
