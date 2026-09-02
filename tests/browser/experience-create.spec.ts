import { expect, test, type Page, type Route } from "@playwright/test";
import { clearAuth, loginAs } from "./helpers/auth";

const SUPERADMIN = "admin@oku.local";
const VENUE = { id: "venue-browser-test", name: "Gold House", city: "Panama City" };

async function authenticate(context: Parameters<typeof loginAs>[0], baseURL?: string) {
  await clearAuth(context);
  await loginAs(context, SUPERADMIN, baseURL ?? "http://localhost:5000");
}

async function stubSupportingOptions(page: Page) {
  await page.route("**/api/v1/admin/spaces", (route) => route.fulfill({ json: { data: [] } }));
  await page.route("**/api/v1/admin/series/host-options", (route) =>
    route.fulfill({ json: { data: { influencers: [], partners: [] } } }),
  );
}

test.describe("Create experience reliability @experience-create", () => {
  test("creates once and performs a hard navigation to availability", async ({ baseURL, context, page }) => {
    await authenticate(context, baseURL);
    await stubSupportingOptions(page);
    await page.route("**/api/v1/admin/venues", (route) => route.fulfill({ json: { venues: [VENUE] } }));

    let postCount = 0;
    await page.route("**/api/v1/admin/series", async (route: Route) => {
      if (route.request().method() !== "POST") return route.fallback();
      postCount += 1;
      await new Promise((resolve) => setTimeout(resolve, 150));
      await route.fulfill({ status: 201, json: { ok: true, data: { id: "series-browser-test" } } });
    });

    await page.goto("/admin/experiences/new", { waitUntil: "domcontentloaded" });
    await page.getByLabel("Experience title").fill("Browser-created experience");
    await page.getByLabel(/Page URL/).fill("browser-created-experience");

    const continueButton = page.getByRole("button", { name: "Continue to availability" });
    await expect(continueButton).toBeEnabled();
    await continueButton.click();

    await page.locator("form").evaluate((form) => {
      const button = form.querySelector<HTMLButtonElement>('button[value="continue"]');
      (form as HTMLFormElement).requestSubmit(button ?? undefined);
    });

    await page.waitForURL(/\/admin\/experiences\/series-browser-test\?tab=dates$/);
    expect(postCount).toBe(1);
  });

  test("shows an empty-state error and recovers through Retry", async ({ baseURL, context, page }) => {
    await authenticate(context, baseURL);
    await stubSupportingOptions(page);

    let venueRequests = 0;
    await page.route("**/api/v1/admin/venues", async (route) => {
      venueRequests += 1;
      await route.fulfill({ json: { venues: venueRequests <= 2 ? [] : [VENUE] } });
    });

    await page.goto("/admin/experiences/new", { waitUntil: "domcontentloaded" });
    const alert = page.getByRole("alert").filter({ hasText: "Operating venues are unavailable" });
    await expect(alert).toBeVisible();
    await expect(page.getByRole("button", { name: "Continue to availability" })).toBeDisabled();

    await page.getByRole("button", { name: "Retry loading venues" }).click();
    await expect(page.getByLabel("Operating venue")).toHaveValue(VENUE.id);
    await expect(page.getByRole("option", { name: VENUE.name })).toHaveCount(1);
    await expect(alert).toBeHidden();
    expect(venueRequests).toBe(3);
  });
});
