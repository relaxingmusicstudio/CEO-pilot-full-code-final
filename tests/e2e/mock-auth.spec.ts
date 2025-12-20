import { test, expect, Page } from "@playwright/test";

const shouldMockAuth = process.env.VITE_MOCK_AUTH === "true";

const collectErrors = (page: Page) => {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() == "error" || msg.type() == "assert") {
      errors.push(`console:${msg.text()}`);
    }
  });
  page.on("pageerror", (err) => errors.push(`page:${err.message}`));
  return errors;
};

test.beforeEach(async ({ page }) => {
  if (!shouldMockAuth) return;
  await page.addInitScript(() => {
    window.localStorage.setItem("VITE_MOCK_AUTH", "true");
  });
});

test("mock auth flow signs in and out", async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto("/auth");
  await page.getByLabel(/email/i).fill("ceo@example.com");
  await page.getByLabel(/password/i).fill("password123");
  await page.getByTestId("sign-in").click();
  await expect(page).toHaveURL(/\/ceo/);
  await expect(page.getByTestId("ceo-home")).toBeVisible();
  await page.getByTestId("sign-out").click();
  await expect(page).toHaveURL(/\/auth/);
  expect(errors, errors.join("\n")).toEqual([]);
});
