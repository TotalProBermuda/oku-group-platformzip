import { test, expect, type Page } from "@playwright/test";
import { loginAs } from "./helpers/auth";

const pixel = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");
function row() {
  const start = new Date(); start.setUTCDate(15); start.setUTCHours(20, 0, 0, 0);
  return {
    id: "artwork-session", title: "Artwork session", startsAt: start.toISOString(), endsAt: new Date(start.getTime() + 3600000).toISOString(),
    capacity: 10, soldCount: 0, status: "SCHEDULED",
    flyerImageUrl: "/__artwork/session-legacy.gif", flyerImageUrlEn: "/__artwork/session-en.gif", flyerImageUrlEs: "/__artwork/session-es.gif", flyerImageUrlPt: "/__artwork/session-pt.gif",
    flyerImageUrlMobileEn: "/__artwork/session-mobile-en.gif", flyerImageUrlMobileEs: "/__artwork/session-mobile-es.gif", flyerImageUrlMobilePt: "/__artwork/session-mobile-pt.gif",
    series: { id: "artwork-series", slug: "artwork-series", title: "Artwork series", venue: "OKU", heroImageUrl: "/__artwork/series-legacy.gif", heroImageUrlEn: "/__artwork/series-en.gif", heroImageUrlEs: "/__artwork/series-es.gif", heroImageUrlPt: "/__artwork/series-pt.gif" },
  };
}
async function stubImages(page: Page, failed: string[] = []) {
  await page.route("**/__artwork/**", route => {
    const path = new URL(route.request().url()).pathname;
    return failed.some(name => path.endsWith(name)) ? route.fulfill({ status: 404, body: "Missing" }) : route.fulfill({ contentType: "image/gif", body: pixel });
  });
}

test.describe("localized artwork guest rendering", () => {
  for (const locale of ["en", "es", "pt"]) {
    test(`calendar renders matching ${locale} session and series artwork`, async ({ page }) => {
      await stubImages(page);
      const session = row();
      await page.route("**/api/v1/sessions?**", route => route.fulfill({ json: { sessions: [session, { ...session, id: "series-fallback", title: "Series fallback", flyerImageUrl: null, flyerImageUrlEn: null, flyerImageUrlEs: null, flyerImageUrlPt: null }] } }));
      await page.goto(`/${locale}/calendar`, { waitUntil: "domcontentloaded" });
      const mobilePrefix = (page.viewportSize()?.width ?? 1280) <= 640 ? "mobile-" : "";
      const sessionImage = page.locator(`article img[src="/__artwork/session-${mobilePrefix}${locale}.gif"]`);
      const seriesImage = page.locator(`article img[src="/__artwork/series-${locale}.gif"]`);
      await expect(sessionImage).toHaveCount(1);
      await expect(seriesImage).toHaveCount(1);
      await expect.poll(() => sessionImage.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
    });
  }
  test("small-screen calendar cards use the matching mobile flyer", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await stubImages(page);
    const session = row();
    await page.route("**/api/v1/sessions?**", route => route.fulfill({ json: { sessions: [session] } }));
    await page.goto("/es/calendar", { waitUntil: "domcontentloaded" });
    const mobileImage = page.locator('article img[src="/__artwork/session-mobile-es.gif"]');
    await expect(mobileImage).toHaveCount(1);
    await expect.poll(() => mobileImage.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
  });

  test("failed Spanish image uses English, then legacy; all failures remove img", async ({ page }) => {
    const session = row();
    const mobilePrefix = (page.viewportSize()?.width ?? 1280) <= 640 ? "mobile-" : "";
    let failed = [`session-${mobilePrefix}es.gif`];
    await page.route("**/__artwork/**", route => {
      const path = new URL(route.request().url()).pathname;
      return failed.some(name => path.endsWith(name)) ? route.fulfill({ status: 404, body: "Missing" }) : route.fulfill({ contentType: "image/gif", body: pixel });
    });
    await page.route("**/api/v1/sessions?**", route => route.fulfill({ json: { sessions: [{ ...session, series: { ...session.series, heroImageUrl: null, heroImageUrlEn: null, heroImageUrlEs: null, heroImageUrlPt: null } }] } }));
    await page.goto("/es/calendar", { waitUntil: "domcontentloaded" });
    await expect(page.locator(`article img[src="/__artwork/session-${mobilePrefix}en.gif"]`)).toHaveCount(1);
    failed = [`session-${mobilePrefix}es.gif`, `session-${mobilePrefix}en.gif`];
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator(`article img[src="/__artwork/session-${mobilePrefix}legacy.gif"]`)).toHaveCount(1);
    failed.push(`session-${mobilePrefix}legacy.gif`);
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator("article")).toHaveCount(1);
    await expect(page.locator("article img")).toHaveCount(0);
    failed = [];
    await page.goto("/pt/calendar", { waitUntil: "domcontentloaded" });
    await expect(page.locator('article img[src="/__artwork/session-pt.gif"]')).toHaveCount(1);
  });
});

test("superadmin editor exposes distinct EN/ES/PT series and session upload controls without live edits", async ({ page, context, baseURL }) => {
  await loginAs(context, "admin@oku.local", baseURL);
  const session = row();
  await stubImages(page);
  await page.route("**/api/v1/admin/experiences/artwork-editor", route => route.fulfill({ json: { series: { ...session.series, status: "DRAFT", hostType: "OKU", capacityTotal: 10, sessions: [session], ticketTypes: [], addons: [], socialLinksJson: {} } } }));
  await page.route("**/api/v1/admin/venues", route => route.fulfill({ json: { venues: [] } }));
  await page.route("**/api/v1/admin/spaces", route => route.fulfill({ json: { data: [] } }));
  await page.route("**/api/v1/admin/series/host-options", route => route.fulfill({ json: { data: { influencers: [], partners: [] } } }));
  await page.goto("/admin/experiences/artwork-editor", { waitUntil: "domcontentloaded" });
  const series = page.locator("fieldset").filter({ hasText: "Localized series hero / flyer" });
  await expect(series).toHaveCount(1);
  for (const language of ["English (EN)", "Spanish (ES)", "Portuguese (PT)"]) await expect(series.getByLabel(language)).toHaveCount(1);
  await page.getByRole("button", { name: "Dates & Capacity", exact: true }).click();
  await page.getByRole("button", { name: /Edit.*content/i }).click();
  const sessionEditor = page.locator("fieldset").filter({ hasText: "Localized session flyer" });
  await expect(sessionEditor).toHaveCount(1);
  for (const language of ["English (EN)", "Spanish (ES)", "Portuguese (PT)"]) await expect(sessionEditor.getByLabel(language)).toHaveCount(1);
  const mobileEditor = page.locator("fieldset").filter({ hasText: "Mobile flyer artwork (optional)" });
  await expect(mobileEditor).toHaveCount(1);
  for (const language of ["English (EN)", "Spanish (ES)", "Portuguese (PT)"]) await expect(mobileEditor.getByLabel(language)).toHaveCount(1);
});
