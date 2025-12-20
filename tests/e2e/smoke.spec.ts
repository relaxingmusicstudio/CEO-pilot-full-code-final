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

test("auth page loads without console or page errors", async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto("/auth");
  await expect(page.getByTestId("auth-form")).toBeVisible();
  expect(errors, errors.join("\n")).toEqual([]);
});
