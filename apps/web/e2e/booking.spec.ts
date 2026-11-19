import { expect, test, type Locator, type Page } from "@playwright/test";

// Journeys through the public UI only. Accounts are created through the sign-up form, so the tests never need
// a seeded password or direct database access.

const RUN = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;
const PASSWORD = "e2e-password-123";

// The calendar disables past days; closed days show an empty state instead of times.
// Walks the enabled days of the current month (then the next) until one has a free time.
async function pickFirstOpenDay(page: Page) {
  const freeTimes = page.locator('[role="radio"]:not([disabled])');
  for (let month = 0; month < 2; month++) {
    const days = page.getByRole("group").locator("button:not([disabled])");
    const count = await days.count();
    for (let i = 0; i < count; i++) {
      await days.nth(i).click();
      const outcome = await Promise.race([
        freeTimes.first().waitFor({ state: "visible", timeout: 5_000 }).then(() => "open" as const),
        page.getByText("Closed on this day").waitFor({ state: "visible", timeout: 5_000 }).then(() => "closed" as const),
      ]).catch(() => "unknown" as const);
      if (outcome === "open") return;
    }
    await page.getByRole("button", { name: "Next month" }).click();
  }
  throw new Error("No open day with free times found in the next two months");
}

async function pickFirstFreeTime(page: Page): Promise<Locator> {
  const free = page.locator('[role="radio"]:not([disabled])').first();
  await expect(free).toBeVisible();
  await free.click();
  await expect(free).toHaveAttribute("aria-checked", "true");
  return free;
}

test.describe("customer booking journey", () => {
  test("sign up, book a slot, see it in My bookings, and cancel it", async ({ page }) => {
    const email = `e2e-${RUN}@example.com`;

    await test.step("create an account", async () => {
      await page.goto("/sign-up");
      await page.getByLabel("Name").fill("E2E Customer");
      await page.getByLabel("Email").fill(email);
      await page.getByLabel("Password").fill(PASSWORD);
      await page.getByRole("button", { name: "Create account" }).click();
      await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
    });

    await test.step("choose service, date and time", async () => {
      await page.goto("/");
      await expect(page.getByRole("heading", { name: "1. Choose a service" })).toBeVisible();
      await pickFirstOpenDay(page);
      await pickFirstFreeTime(page);
    });

    await test.step("review and confirm", async () => {
      await page.getByRole("button", { name: "Review booking" }).click();
      await page.getByLabel("Notes (optional)").fill("Please use the clippers only");
      await page.getByRole("button", { name: "Confirm booking" }).click();
      await expect(page).toHaveURL(/\/booking-confirmed\/[^/]+$/);
      await expect(page.getByRole("heading", { name: "Booking confirmed" })).toBeVisible();
    });

    await test.step("cancel from My bookings", async () => {
      await page.goto("/my-bookings");
      const row = page.getByRole("row").filter({ hasText: "Confirmed" }).first();
      await expect(row).toBeVisible();
      await row.getByRole("button", { name: /^Cancel / }).click();
      await page.getByRole("button", { name: "Yes, cancel" }).click();
      await expect(page.getByRole("row").filter({ hasText: "Cancelled" }).first()).toBeVisible();
    });
  });
});

test.describe("guest and error states", () => {
  test("a guest is asked to sign in before booking", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("link", { name: "Sign in to book" })).toBeVisible();
  });

  test("a wrong password shows an error and stays on the sign-in page", async ({ page }) => {
    await page.goto("/sign-in");
    await page.getByLabel("Email").fill(`nobody-${RUN}@example.com`);
    await page.getByLabel("Password").fill("wrong-password");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByRole("alert")).toBeVisible();
    await expect(page).toHaveURL(/\/sign-in/);
  });

  test("an unknown page renders the branded not-found state", async ({ page }) => {
    const res = await page.goto(`/this-page-does-not-exist-${RUN}`);
    expect(res?.status()).toBe(404);
    await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
  });
});
