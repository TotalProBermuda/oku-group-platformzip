/**
 * Browser-rendered tests for the trust components on:
 *   - /my/beneficiary
 *   - /influencer/dashboard
 *   - /partner/dashboard
 *
 * Run on both desktop (1280×800) and mobile (375×667) viewports via the
 * `desktop` / `mobile` projects in playwright.config.ts.
 *
 * Assertions cover:
 *   - calm anchor sentence renders
 *   - privacy notice panel is present on /my/beneficiary
 *   - PayoutTrustSummary shows on dashboards iff a beneficiary exists
 *   - missing-profile / unauthenticated states fail closed (no crash)
 *   - ComplianceHoldBanner appears only when status === ON_HOLD
 *   - bank account, doc status sentinels, finance notes never raw in DOM
 *   - masked sensitive fields stay masked after save
 *   - /my/beneficiary CTA / primary action is visible
 *   - no horizontal page overflow at 375px
 */
import { test, expect, type Page } from "@playwright/test";
import { loginAs, clearAuth } from "./helpers/auth";
import {
  clearBeneficiary,
  seedBeneficiary,
  KNOWN_FULL_ACCOUNT,
  KNOWN_LAST4,
  KNOWN_HOLD_REASON,
  KNOWN_ADMIN_NOTE,
} from "./helpers/seed";

const ANCHOR =
  "Your payout information is protected, your bank details are masked, and finance review is required before payment.";

const INFLUENCER = "influencer@oku.local";
const PARTNER = "partner@oku.local";

// Canonical seed state for `influencer@oku.local` and `partner@oku.local` is
// "no BeneficiaryProfile row" (verified against prisma/seed.ts — neither
// persona is given one). Tests mutate these users' beneficiary rows for
// behavioral coverage; this `beforeEach` resets them to the canonical
// baseline so every test starts from a known-clean state — even if a prior
// test crashed mid-way. Also clears auth cookies so login state never
// bleeds between tests. Idempotent.
test.beforeEach(async ({ context }) => {
  await clearAuth(context);
  await clearBeneficiary(INFLUENCER);
  await clearBeneficiary(PARTNER);
});

// Final safety net: even if a test crashes after the per-test reset, this
// guarantees the dev DB returns to baseline when the suite finishes.
test.afterAll(async () => {
  await clearBeneficiary(INFLUENCER);
  await clearBeneficiary(PARTNER);
});

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => {
    const w = document.documentElement.scrollWidth;
    const c = document.documentElement.clientWidth;
    return { scrollWidth: w, clientWidth: c };
  });
  // Allow 1px rounding tolerance.
  expect(overflow.scrollWidth, `page should not scroll horizontally`).toBeLessThanOrEqual(
    overflow.clientWidth + 1,
  );
}

async function expectNoLeakedSecrets(page: Page) {
  const html = await page.content();
  expect(html, "raw account number must never appear in DOM").not.toContain(KNOWN_FULL_ACCOUNT);
  expect(html, "compliance hold reason must not leak when not on hold").not.toContain(
    "DO-NOT-LEAK",
  ); // matches both sentinel strings unless explicitly on hold
}

test.describe("/my/beneficiary @beneficiary", () => {
  test("unauthenticated request fails closed (redirect, no crash)", async ({ page }) => {
    const res = await page.goto("/my/beneficiary", { waitUntil: "domcontentloaded" });
    expect(res, "page should respond").not.toBeNull();
    // Dev redirects unauth users to /login — final URL must not be the secured page.
    expect(page.url()).not.toContain("/my/beneficiary");
    // Page must render something (no crash / 500).
    await expect(page.locator("body")).toBeVisible();
  });

  test("API boundary: /api/v1/me/beneficiary must null adminVerificationNotes", async ({
    context,
  }) => {
    // Architect-recommended boundary assertion: even if the SSR page later
    // stops passing the field down, the API must independently scrub it so
    // a future client component that fetches /api/v1/me/beneficiary cannot
    // accidentally re-leak finance notes. Pins the getOwnProfile sanitizer.
    await seedBeneficiary(INFLUENCER, "OKU_APPROVED");
    await loginAs(context, INFLUENCER);
    const res = await context.request.get(
      "http://localhost:5000/api/v1/me/beneficiary",
    );
    expect(res.ok(), `expected 2xx, got ${res.status()}`).toBeTruthy();
    const body = (await res.json()) as Record<string, unknown>;
    const text = JSON.stringify(body);
    expect(text, "raw account number must not appear in API response").not.toContain(
      KNOWN_FULL_ACCOUNT,
    );
    expect(text, "admin verification note must be scrubbed for self-service").not.toContain(
      KNOWN_ADMIN_NOTE,
    );
    // Field may be present-and-null or omitted — both satisfy the contract.
    if ("adminVerificationNotes" in body) {
      expect(body.adminVerificationNotes).toBeNull();
    }
  });

  test("READY profile renders anchor sentence, privacy notice, and masked field", async ({
    page,
    context,
  }) => {
    await seedBeneficiary(INFLUENCER, "OKU_APPROVED");
    await loginAs(context, INFLUENCER);
    await page.goto("/my/beneficiary", { waitUntil: "networkidle" });

    await expect(page.getByText(ANCHOR)).toBeVisible();
    await expect(page.getByText(/How we handle your information/i)).toBeVisible();

    // Masked field must show the last 4 (and ONLY the last 4) of the account.
    await expect(page.getByText(`•••• ${KNOWN_LAST4}`).first()).toBeVisible();
    const html = await page.content();
    expect(html).not.toContain(KNOWN_FULL_ACCOUNT);

    // Finance / admin notes column must never reach the self-service page.
    expect(html).not.toContain(KNOWN_ADMIN_NOTE);

    // Primary save button must be visible (not clipped off-canvas).
    const save = page.getByRole("button", { name: /Save bank info/i });
    await expect(save).toBeVisible();

    await expectNoHorizontalOverflow(page);
  });

  test("masked field stays masked after entering Replace mode and cancelling", async ({
    page,
    context,
  }) => {
    await seedBeneficiary(INFLUENCER, "OKU_APPROVED");
    await loginAs(context, INFLUENCER);
    await page.goto("/my/beneficiary", { waitUntil: "networkidle" });

    await page.getByRole("button", { name: /Replace/i }).click();
    // Edit input is present
    const input = page.getByLabel(/Banesco account number — new value/i);
    await expect(input).toBeVisible();
    // Cancel — field returns to masked form
    await page.getByRole("button", { name: /^Cancel$/i }).click();
    await expect(page.getByText(`•••• ${KNOWN_LAST4}`).first()).toBeVisible();
    await expect(input).not.toBeVisible();
  });

  test("ON_HOLD shows ComplianceHoldBanner with reason; READY does not", async ({
    page,
    context,
  }) => {
    await seedBeneficiary(INFLUENCER, "ON_HOLD");
    await loginAs(context, INFLUENCER);
    await page.goto("/my/beneficiary", { waitUntil: "networkidle" });

    await expect(page.getByText(/Your beneficiary profile is on hold/i)).toBeVisible();
    // The hold reason itself IS expected to appear here — that's the whole
    // point of the banner. It legitimately appears twice (once in the banner
    // and once via the "Compliance hold: …" blocking-reasons line on the
    // PayoutEligibilityStatus strip), so we assert at least one occurrence.
    await expect(page.getByText(KNOWN_HOLD_REASON).first()).toBeVisible();
    // Anchor sentence still renders alongside the banner.
    await expect(page.getByText(ANCHOR)).toBeVisible();

    // Now flip to READY and re-load: banner must disappear.
    await seedBeneficiary(INFLUENCER, "OKU_APPROVED");
    await page.goto("/my/beneficiary", { waitUntil: "networkidle" });
    await expect(page.getByText(/Your beneficiary profile is on hold/i)).toHaveCount(0);
  });

  test("missing profile (no beneficiary row) renders without crash", async ({
    page,
    context,
  }) => {
    await clearBeneficiary(INFLUENCER);
    await loginAs(context, INFLUENCER);
    await page.goto("/my/beneficiary", { waitUntil: "networkidle" });

    await expect(page.getByText(ANCHOR)).toBeVisible();
    // No last4 to show — masked field renders the placeholder instead.
    await expect(page.getByText(/Not yet set/i).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /Save bank info/i })).toBeVisible();
  });
});

// Dashboard tests give the dev server more headroom — Next.js compiles
// each route on first hit in dev mode, which can push first-render past
// the default 30s budget. They also explicitly wait for the
// `/api/v1/me/beneficiary` response instead of relying on `networkidle`,
// which is brittle when the dashboard has long-poll-style fetches.
async function gotoAndWaitForBeneficiary(page: Page, path: string): Promise<void> {
  const resp = page.waitForResponse(
    (r) => r.url().includes("/api/v1/me/beneficiary") && r.request().method() === "GET",
    { timeout: 30_000 },
  );
  await page.goto(path, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await resp;
}

test.describe("/influencer/dashboard @dashboard", () => {
  test.setTimeout(60_000);

  test("PayoutTrustSummary appears for an influencer with a beneficiary profile", async ({
    page,
    context,
  }) => {
    await seedBeneficiary(INFLUENCER, "OKU_APPROVED");
    await loginAs(context, INFLUENCER);
    await gotoAndWaitForBeneficiary(page, "/influencer/dashboard");

    await expect(page.getByText(/Payout protection/i)).toBeVisible({ timeout: 10_000 });
    await expect(
      page.getByText(/Your payout information is protected/i).first(),
    ).toBeVisible();

    // CTA to /my/beneficiary must be visible AND clickable.
    const cta = page.getByRole("link", { name: /Manage bank info|Complete bank info/i });
    await expect(cta).toBeVisible();
    expect(await cta.getAttribute("href")).toBe("/my/beneficiary");

    // No raw secrets / finance notes in the dashboard summary.
    await expectNoLeakedSecrets(page);
    await expectNoHorizontalOverflow(page);
  });

  test("missing profile → PayoutTrustSummary renders nothing (graceful)", async ({
    page,
    context,
  }) => {
    await clearBeneficiary(INFLUENCER);
    await loginAs(context, INFLUENCER);
    await gotoAndWaitForBeneficiary(page, "/influencer/dashboard");

    await expect(page.getByText(/Payout protection/i)).toHaveCount(0);
    // Page itself must still render without crash.
    await expect(page.locator("body")).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });
});

test.describe("/partner/dashboard @dashboard", () => {
  test.setTimeout(60_000);

  test("PayoutTrustSummary appears for a partner with a beneficiary profile", async ({
    page,
    context,
  }) => {
    await seedBeneficiary(PARTNER, "OKU_APPROVED");
    await loginAs(context, PARTNER);
    await gotoAndWaitForBeneficiary(page, "/partner/dashboard");

    await expect(page.getByText(/Payout protection/i)).toBeVisible({ timeout: 10_000 });
    const cta = page.getByRole("link", { name: /Manage bank info|Complete bank info/i });
    await expect(cta).toBeVisible();
    expect(await cta.getAttribute("href")).toBe("/my/beneficiary");

    await expectNoLeakedSecrets(page);
    await expectNoHorizontalOverflow(page);
  });

  test("missing profile → PayoutTrustSummary stays hidden", async ({ page, context }) => {
    await clearBeneficiary(PARTNER);
    await loginAs(context, PARTNER);
    await gotoAndWaitForBeneficiary(page, "/partner/dashboard");

    await expect(page.getByText(/Payout protection/i)).toHaveCount(0);
    await expect(page.locator("body")).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });
});
