import { test, expect } from "@playwright/test";

test("calendar purchase links stay exact, fail closed, and expire without choosing a sibling", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-10-28T18:00:00Z") });
  await page.addInitScript(() => sessionStorage.setItem("oku_session_locale", "en"));
  const slug = "wine-down-wednesday";
  const activeId = "cmv1ohwb40006w3f2woikjbnk";
  const base = {
    capacity: 20, soldCount: 0, status: "SCHEDULED", allowLateSales: false,
    startsAt: "2026-10-28T23:00:00Z", endsAt: "2026-10-29T02:00:00Z",
  };
  const sessions = [
    { ...base, id: activeId, title: "Active Oct 28 Wine Down" },
    { ...base, id: "eligible-sibling", title: "Eligible sibling", startsAt: "2026-10-29T23:00:00Z", endsAt: "2026-10-30T02:00:00Z" },
    { ...base, id: "past-session", title: "Past Wednesday", startsAt: "2026-10-27T17:00:00Z", endsAt: "2026-10-27T22:00:00Z" },
    { ...base, id: "ongoing-session", title: "Ongoing Wednesday", startsAt: "2026-10-28T17:00:00Z", endsAt: "2026-10-28T22:00:00Z" },
    { ...base, id: "sales-closed-session", title: "Closed product Wednesday", fieldModes: { "ticket.open.enabled": { mode: "clear" } } },
  ];
  const series = {
    id: "fixture-series", slug, title: "Wine Down Wednesday", status: "PUBLISHED", venue: "OKU", heroImageUrl: null,
    ticketTypes: [
      { id: "open", ticketStatus: "ACTIVE", saleEndsAt: "2026-10-28T18:05:00Z" },
      { id: "expired", ticketStatus: "ACTIVE", saleEndsAt: "2026-10-27T00:00:00Z" },
    ],
    sessions: sessions.filter(session => !["past-session", "ongoing-session"].includes(session.id)),
  };
  const unsafeRequests: string[] = [];
  await page.route("**/api/**", async route => {
    const request = route.request();
    if (!["GET", "HEAD"].includes(request.method())) {
      unsafeRequests.push(request.method());
      await route.abort();
      return;
    }
    const url = new URL(request.url());
    if (url.pathname === "/api/v1/sessions") {
      await route.fulfill({ json: { sessions: sessions.map(session => ({ ...session, series })) } });
    } else if (url.pathname === "/api/v1/experiences") {
      expect(url.searchParams.get("slug")).toBe(slug);
      expect(url.searchParams.has("sessionId")).toBe(false);
      await route.fulfill({ json: { series: [series] } });
    } else {
      await route.continue();
    }
  });
  await page.goto("/en/experiences", { waitUntil: "domcontentloaded" });
  const month = page.locator("#events-month-panel");
  await expect(month.locator("article")).toHaveCount(5);
  await expect(month.locator('a[href*="/checkout/"]')).toHaveCount(2);
  for (const session of sessions) {
    const card = month.locator(`article[id="session-${session.id}"]`);
    await expect(card.getByRole("link", { name: "View event", exact: true })).toHaveAttribute("href", `/en/experiences/${slug}/sessions/${session.id}`);
    await expect(card.getByRole("link", { name: "View series →", exact: true })).toHaveAttribute("href", `/en/experiences/${slug}`);
    const ticket = card.locator('a[href*="/checkout/"]');
    if ([activeId, "eligible-sibling"].includes(session.id)) {
      await expect(ticket).toHaveAttribute("href", `/en/checkout/${slug}?sessionId=${session.id}`);
    } else {
      await expect(ticket).toHaveCount(0);
      await expect(card.getByText("Tickets not currently on sale")).toBeVisible();
    }
  }
  const firstCard = month.locator(`article[id="session-${activeId}"]`);
  const viewEventBox = await firstCard.getByRole("link", { name: "View event", exact: true }).boundingBox();
  const ticketBox = await firstCard.locator('a[href*="/checkout/"]').boundingBox();
  const seriesBox = await firstCard.getByRole("link", { name: "View series →", exact: true }).boundingBox();
  expect(viewEventBox).not.toBeNull();
  expect(ticketBox).not.toBeNull();
  expect(seriesBox).not.toBeNull();
  expect(seriesBox!.y).toBeGreaterThanOrEqual(Math.max(viewEventBox!.y + viewEventBox!.height, ticketBox!.y + ticketBox!.height) + 5);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  // Exercise compact previews, not only month cards.
  const calendarTab = page.getByRole("tab", { name: "Calendar", exact: true });
  if (await calendarTab.isVisible()) await calendarTab.click();
  await page.getByRole("button", { name: /Wednesday, October 28, 3 events/ }).focus();
  const preview = page.getByRole("group", { name: "Event previews for 28" });
  await expect(preview.locator('a[href*="/checkout/"]')).toHaveCount(1);
  await expect(preview.locator('a[href*="/checkout/"]')).toHaveAttribute("href", `/en/checkout/${slug}?sessionId=${activeId}`);
  await expect(preview.getByRole("link", { name: "View series →", exact: true })).toHaveCount(0);
  await page.clock.fastForward(5 * 60 * 1000 + 1000);
  await expect(page.locator('article a[href*="/checkout/"]')).toHaveCount(0);
  if (await calendarTab.isVisible()) await page.getByRole("tab", { name: "List", exact: true }).click();
  await expect(month.getByRole("link", { name: "View event", exact: true })).toHaveCount(5);
  await expect(month.getByRole("link", { name: "View series →", exact: true })).toHaveCount(5);
  expect(unsafeRequests).toEqual([]);
});
