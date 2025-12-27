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

    const windowWithClipboard = window as Window & { __clipboardText?: string };
    windowWithClipboard.__clipboardText = "";
    try {
      Object.defineProperty(navigator, "clipboard", {
        value: {
          writeText: async (text: string) => {
            windowWithClipboard.__clipboardText = String(text);
          },
          readText: async () => windowWithClipboard.__clipboardText || "",
        },
        configurable: true,
      });
    } catch {
      // ignore
    }
  });
});

test("maintenance section loads and Copy FOB writes non-empty text", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("/auth");
  await page.getByLabel(/email/i).fill("ceo@example.com");
  await page.getByLabel(/password/i).fill("password123");
  await page.getByTestId("sign-in").click();

  await expect(page).toHaveURL(/\/app/);

  const navLink = page.getByRole("link", { name: "Ops Hub" });
  if (await navLink.isVisible().catch(() => false)) {
    await navLink.click();
  } else {
    await page.goto("/app/ops");
  }

  await expect(page.getByTestId("ops-home")).toBeVisible();
  await expect(page.getByTestId("maintenance-home")).toBeVisible();

  await page.getByTestId("maintenance-copy-fob").click();
  await expect(page.getByTestId("maintenance-copy-fob")).toContainText("Copied");

  const clipboardText = await page.evaluate(() => {
    const windowWithClipboard = window as Window & { __clipboardText?: string };
    return windowWithClipboard.__clipboardText || "";
  });
  expect(clipboardText.length).toBeGreaterThan(0);
  expect(() => JSON.parse(clipboardText)).not.toThrow();

  expect(errors, errors.join("\n")).toEqual([]);
});
