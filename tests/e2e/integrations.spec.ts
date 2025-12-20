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
    window.localStorage.setItem(
      "onboarding_v1::mock-user",
      JSON.stringify({
        status: "complete",
        data: {},
        updatedAt: new Date().toISOString(),
      })
    );
  });
});

test("save and test integrations in mock mode", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("/auth");
  await page.getByLabel(/email/i).fill("ceo@example.com");
  await page.getByLabel(/password/i).fill("password123");
  await page.getByTestId("sign-in").click();

  await expect(page).toHaveURL(/\/app/);

  await page.getByTestId("go-integrations").click();
  await expect(page.getByTestId("integrations-page")).toBeVisible();

  await page.getByTestId("integration-key").fill("sk-test-123");
  await page.getByTestId("integration-save").click();
  await expect(page.getByTestId("integration-status")).toContainText("Saved");

  await page.getByTestId("integration-test-prompt").fill("Hello");
  await page.getByTestId("integration-test").click();
  await expect(page.getByTestId("integration-result")).toContainText("mock");

  expect(errors, errors.join("\n")).toEqual([]);
});
