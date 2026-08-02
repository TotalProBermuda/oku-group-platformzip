/**
 * Browser smoke test for /admin/launch-readiness (Task #130).
 *
 * Asserts:
 *   - SUPERADMIN can load the page
 *   - The overall verdict banner renders (GO or NO_GO)
 *   - At least one gate row is visible
 *   - Non-superadmin requests do not land on the page
 */
import { test, expect } from "@playwright/test";
import { loginAs, clearAuth } from "./helpers/auth";

const SUPERADMIN = "admin@oku.local";
const INFLUENCER = "influencer@oku.local";

test.beforeEach(async ({ context }) => {
  await clearAuth(context);
});

test.describe("/admin/launch-readiness @launch", () => {
  test("superadmin sees verdict banner and gate rows", async ({ context, page }) => {
    await loginAs(context, SUPERADMIN);
    const res = await page.goto("/admin/launch-readiness", { waitUntil: "domcontentloaded" });
    expect(res, "page should respond").not.toBeNull();
    expect(page.url()).toContain("/admin/launch-readiness");

    const verdict = page.locator('[data-testid="launch-readiness-verdict"]');
    await expect(verdict).toBeVisible();
    const verdictAttr = await verdict.getAttribute("data-verdict");
    expect(["GO", "NO_GO"]).toContain(verdictAttr);

    const gates = page.locator('[data-testid="launch-readiness-gate"]');
    expect(await gates.count()).toBeGreaterThan(0);

    await expect(page.locator('[data-testid="launch-readiness-refresh"]')).toBeVisible();
  });

  test("non-superadmin cannot view the page", async ({ context, page }) => {
    await loginAs(context, INFLUENCER);
    await page.goto("/admin/launch-readiness", { waitUntil: "domcontentloaded" });
    expect(page.url()).not.toContain("/admin/launch-readiness");
  });
});
