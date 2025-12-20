import { test, expect, Page } from "@playwright/test";

const shouldMockAuth = process.env.VITE_MOCK_AUTH === "true";

const watchErrors = (page: Page) => {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error" || msg.type() === "assert") errors.push(`console:${msg.text()}`);
  });
  page.on("pageerror", (err) => errors.push(`page:${err.message}`));
  return errors;
};

test.beforeEach(async ({ page }) => {
  if (!shouldMockAuth) return;
  await page.addInitScript(() => {
    window.localStorage.setItem("VITE_MOCK_AUTH", "true");
    window.localStorage.setItem("cookie_consent", "true");
    window.localStorage.setItem(
      "cookie_preferences",
      JSON.stringify({ essential: true, analytics: false, functional: false, marketing: false })
    );
    window.localStorage.setItem(
      "enhanced_tracking_consent",
      JSON.stringify({ enhanced_analytics: false, marketing_emails: false, personalization: false })
    );
    window.localStorage.setItem("enhanced_tracking_asked", "true");
    window.localStorage.removeItem("onboarding_v1::mock-user");
  });
});

test("completes onboarding and lands on dashboard", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("/auth");
  await page.getByLabel(/email/i).fill("ceo@example.com");
  await page.getByLabel(/password/i).fill("password123");
  await page.getByTestId("sign-in").click();

  await expect(page).toHaveURL(/\/app\/onboarding/);
  await expect(page.getByTestId("onboarding-root")).toBeVisible();

  await page.getByLabel("Business name").fill("Pipeline Pros");
  await page.getByLabel("Industry").fill("HVAC");
  await page.getByLabel("Service area").fill("Austin");
  await page.getByRole("button", { name: "Next" }).click();

  await page.getByLabel("Primary goal metric").fill("MRR");
  await page.getByLabel("Offer & pricing").fill("Tune-up $129");
  await page.getByLabel("Target customer").fill("Homeowners");
  await page.getByRole("button", { name: "Next" }).click();

  await page.getByLabel("Lead sources").fill("Google Ads");
  await page.getByLabel("Calendar link (optional)").fill("https://cal.com/demo");
  await page.getByLabel("Contact phone (optional)").fill("555-123-4567");
  await page.getByTestId("finish-onboarding").click();

  await expect(page).toHaveURL(/\/app/);
  await expect(page.getByTestId("dashboard-home")).toBeVisible();
  expect(errors, errors.join("\n")).toEqual([]);
});
