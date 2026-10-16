import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { encode } from "next-auth/jwt";
import nextEnv from "@next/env";

nextEnv.loadEnvConfig(process.cwd());
const id = "session-cards-fixture";
const endpoint = `**/api/v1/admin/series/${id}/session-management`;
const value = (v: unknown, mode = "inherit") => ({ value: v, mode, source: mode === "inherit" ? "series" : "override" });
const defaults = {
  capacity: value(24), "content.title.en": value("Wine evening"),
  "content.title.es": value("Noche de vino"), "content.subtitle.en": value("Shared subtitle"),
  "content.description.en": value("Shared description"), "artwork.en": value("/fixture-flyer.png"),
  "artwork.es": value("/fixture-flyer.png"), "artwork.pt": value(null),
  "hosts.PRIMARY_HOST": value(["oku"]), "hosts.CO_HOST": value([]),
  "hosts.SPONSOR": value([]), "hosts.BRAND_PARTNER": value([]), sponsors: value([]),
  "ticket.general.price": value(4500), "ticket.general.enabled": value(true),
  allowLateSales: value(false),
};

async function setup(page: Page, context: BrowserContext, baseURL?: string, roles = ["SUPERADMIN"], failures: number[] = []) {
  const origin = new URL(baseURL ?? "http://localhost:5000");
  const token = await encode({ secret: process.env.NEXTAUTH_SECRET ?? "replace-me", salt: "next-auth.session-token", maxAge: 3600,
    token: { sub: "fixture-admin", userId: "fixture-admin", roles, name: "Fixture", email: "fixture@example.test" } });
  await context.addCookies([{ name: "next-auth.session-token", value: token, domain: origin.hostname, path: "/", httpOnly: true, secure: origin.protocol === "https:", sameSite: "Lax" }]);
  const previews: Array<Record<string, any>> = [];
  const commits: unknown[] = [];
  const entities: unknown[] = [];
  const sessions = [
    { id: "date-a", title: "Wine evening A", startsAt: "2027-05-16T22:00:00.000Z", endsAt: "2027-05-17T01:00:00.000Z", status: "SCHEDULED",
      hasTicketHistory: true, inventory: { sold: 0, held: 0, issued: 0, minimum: 3 },
      fields: { ...defaults, "content.title.en": value("Wine evening A", "override") } },
    { id: "date-b", title: "Wine evening B", startsAt: "2027-05-23T22:00:00.000Z", endsAt: "2027-05-24T01:00:00.000Z", status: "SCHEDULED",
      hasTicketHistory: false, inventory: { sold: 0, held: 0, issued: 0, minimum: 0 }, fields: { ...defaults } },
  ];
  await page.route("**/api/**", (route) => route.fulfill({ status: 501, json: { ok: false, error: "Unstubbed fixture API" } }));
  await page.route("**/fixture-flyer.png", (route) => route.fulfill({ contentType: "image/png", body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==", "base64") }));
  await page.route("**/api/auth/session", (route) => route.fulfill({ json: { user: { id: "fixture-admin", name: "Fixture", roles }, expires: "2099-01-01" } }));
  await page.route(`**/api/v1/admin/experiences/${id}`, (route) => route.fulfill({ json: { series: {
    id, title: "Wine fixture", slug: id, status: "DRAFT", startsAt: sessions[0].startsAt, endsAt: sessions[0].endsAt,
    capacityTotal: 48, venueId: null, spaceId: null, ticketTypes: [{ id: "general", name: "General", priceCents: 4500 }],
    sessions: sessions.map((session) => ({ ...session, capacity: 24 })),
  } } }));
  await page.route("**/api/v1/admin/venues", (route) => route.fulfill({ json: { venues: [] } }));
  await page.route("**/api/v1/admin/spaces", (route) => route.fulfill({ json: { data: [] } }));
  await page.route("**/api/v1/admin/series/host-options", (route) => route.fulfill({ json: { data: { influencers: [], partners: [] } } }));
  await page.route("**/api/v1/admin/entities", async (route) => {
    entities.push(route.request().postDataJSON());
    return route.fulfill({ status: 201, json: { ok: true, entity: { id: "new-host", displayName: "New host" } } });
  });
  await page.route(endpoint, async (route) => {
    if (route.request().method() === "GET") return route.fulfill({ json: { ok: true, data: {
      fields: Object.keys(defaults), sessions, defaults,
      options: { tickets: [{ id: "general", name: "General" }], entities: [{ id: "oku", displayName: "OKÜ" }], profiles: [], sponsorTiers: [{ id: "partner", label: "Partner" }] },
    } } });
    if (route.request().method() === "POST") {
      const body = route.request().postDataJSON();
      previews.push(body);
      const changes = Object.entries(body.patch).map(([field, edit]) => ({ field, before: defaults[field as keyof typeof defaults] ?? value(null), after: edit }));
      if (body.schedules) changes.push({ field: "occurrenceSchedule", before: value(null), after: value(body.schedules) });
      const blocked = body.schedules && !body.postponement && body.sessionIds.includes("date-a") ? ["Ticket or checkout history requires deliberate postponement with reason and treatment."] : [];
      return route.fulfill({ json: { ok: true, data: {
        previewId: "fixture-preview", requestId: "fixture-request", targets: [{ id: body.sessionIds[0], changes, blocked, warnings: [], inventory: sessions[0].inventory, noticeCounts: { queued: 0, missingContacts: 0, locales: {} } }],
        blocked, warnings: [], expiresAt: "2099-01-01",
      } } });
    }
    commits.push(route.request().postDataJSON());
    const status = failures.shift() ?? 200;
    return route.fulfill({ status, json: status === 200 ? { ok: true, data: {} } : { ok: false, error: status === 409 ? "Preview is stale" : "Temporary failure" } });
  });
  await page.goto(`/admin/experiences/${id}?tab=dates`);
  await expect(page.getByRole("button", { name: "Edit Session", exact: true })).toHaveCount(2);
  const open = async () => {
    await page.getByRole("button", { name: "Edit Session", exact: true }).first().click();
    return page.getByRole("dialog");
  };
  return { previews, commits, entities, open };
}

test.describe("individual session editor", () => {
  test("calm cards, effective preview, one Save and no postponement for content history", async ({ page, context, baseURL }) => {
    const f = await setup(page, context, baseURL);
    await expect(page.getByLabel("Change scope")).toHaveCount(0);
    await expect(page.getByText("Session schedule & capacity", { exact: true })).toHaveCount(0);
    const sheet = await f.open();
    for (const name of ["Details", "Schedule & capacity", "Tickets", "Artwork", "Hosts", "Sponsors"]) await expect(sheet.getByRole("heading", { name, exact: true })).toBeVisible();
    await expect(sheet.getByText("Ticket history needs a deliberate date change")).toHaveCount(0);
    const title = sheet.getByLabel("Title", { exact: false }).first();
    await title.fill("Calm revised evening");
    await expect(sheet.getByRole("complementary", { name: "Effective values preview" })).toContainText("Calm revised evening");
    await sheet.getByRole("button", { name: "Save", exact: true }).click();
    await expect(sheet).toHaveCount(0);
    expect(f.previews[0]).toEqual({ kind: "sessions", sessionIds: ["date-a"], patch: { "content.title.en": { mode: "override", value: "Calm revised evening" } } });
    expect(f.commits).toHaveLength(1);
  });

  test("reset uses series details; first keystroke retains focus; dirty Escape preserves draft", async ({ page, context, baseURL }) => {
    const f = await setup(page, context, baseURL);
    const sheet = await f.open();
    const title = sheet.getByLabel("Title", { exact: false }).first();
    await title.focus();
    await page.keyboard.type("x");
    await expect(title).toBeFocused();
    page.once("dialog", (dialog) => dialog.dismiss());
    await page.keyboard.press("Escape");
    await expect(sheet).toBeVisible();
    await title.locator("..").getByRole("button", { name: "Use series details" }).click();
    await expect(title).toHaveValue("Wine evening");
    await sheet.getByRole("button", { name: "Save", exact: true }).click();
    expect(f.previews[0].patch).toEqual({ "content.title.en": { mode: "inherit" } });
    await expect(page.getByRole("button", { name: "Edit Session", exact: true }).first()).toBeFocused();
  });

  test("protected date warnings only on attempted save; reverting date lets content save", async ({ page, context, baseURL }) => {
    const f = await setup(page, context, baseURL);
    const sheet = await f.open();
    await sheet.getByLabel("Starts (Panama time)").fill("2027-05-16T18:00");
    await sheet.getByLabel("Ends (Panama time)").fill("2027-05-16T21:00");
    await expect(sheet.getByText("Ticket history needs a deliberate date change")).toHaveCount(0);
    await sheet.getByRole("button", { name: "Save", exact: true }).click();
    await expect(sheet.getByText("Ticket history needs a deliberate date change")).toBeVisible();
    expect(f.commits).toHaveLength(0);
    await sheet.getByLabel("Starts (Panama time)").fill("2027-05-16T17:00");
    await sheet.getByLabel("Ends (Panama time)").fill("2027-05-16T20:00");
    await sheet.getByLabel("Title", { exact: false }).first().fill("Only details");
    await sheet.getByRole("button", { name: "Save", exact: true }).click();
    await expect(sheet).toHaveCount(0);
    expect(f.previews[1]).not.toHaveProperty("postponement");
    expect(f.previews[1]).not.toHaveProperty("schedules");
    expect(f.commits).toHaveLength(1);
  });

  test("pending-date hold omits replacement schedule and preserves admission protection", async ({ page, context, baseURL }) => {
    const f = await setup(page, context, baseURL);
    const sheet = await f.open();
    await sheet.getByLabel("Starts (Panama time)").fill("2027-05-16T18:00");
    await sheet.getByLabel("Ends (Panama time)").fill("2027-05-16T21:00");
    await sheet.getByRole("button", { name: "Save", exact: true }).click();
    await sheet.getByLabel("Reason", { exact: true }).fill("Venue unavailable");
    await sheet.getByLabel("Admission treatment").selectOption("HOLD_PENDING_DATE");
    await sheet.getByRole("button", { name: "Save", exact: true }).click();
    await expect(sheet).toHaveCount(0);
    expect(f.previews[1].postponement).toEqual({ reason: "Venue unavailable", treatment: "HOLD_PENDING_DATE" });
    expect(f.previews[1]).not.toHaveProperty("schedules");
  });

  test("searchable create-host returns to intact draft; sponsor controls and 375px overflow", async ({ page, context, baseURL }) => {
    const f = await setup(page, context, baseURL);
    const sheet = await f.open();
    await sheet.getByLabel("Title", { exact: false }).first().fill("Draft with hosts");
    const choices = sheet.getByRole("group", { name: "PRIMARY HOST choices", exact: true });
    await expect(choices.getByRole("button").first()).toContainText("+ Create Host");
    await sheet.getByRole("searchbox").first().fill("Missing");
    await choices.getByRole("button", { name: "+ Create Host" }).click();
    await sheet.getByLabel("Name", { exact: true }).fill("New host");
    await sheet.getByRole("button", { name: "Create and add" }).click();
    await expect(sheet.getByLabel("Title", { exact: false }).first()).toHaveValue("Draft with hosts");
    await expect(choices.getByRole("button", { name: "New host" })).toHaveAttribute("aria-pressed", "true");
    await sheet.getByRole("button", { name: "Add sponsor", exact: true }).click();
    await sheet.getByRole("combobox", { name: "Sponsor", exact: true }).selectOption("oku");
    await sheet.getByRole("combobox", { name: "Tier", exact: true }).selectOption("partner");
    for (const element of [page.locator("html"), sheet]) {
      const sizes = await element.evaluate((el) => ({ width: el.clientWidth, scroll: el.scrollWidth }));
      expect(sizes.scroll).toBeLessThanOrEqual(sizes.width + 1);
    }
    await sheet.getByRole("button", { name: "Save", exact: true }).click();
    await expect(sheet).toHaveCount(0);
    expect(f.previews[0].patch["hosts.PRIMARY_HOST"].value).toEqual(["oku", "new-host"]);
    expect(f.previews[0].patch.sponsors.value[0]).toMatchObject({ entityId: "oku", tierId: "partner" });
    expect(f.entities).toEqual([{ type: "PERSON", displayName: "New host" }]);
  });

  test("stale preview preserves draft and temporary failure retries same idempotency keys", async ({ page, context, baseURL }) => {
    const f = await setup(page, context, baseURL, ["SUPERADMIN"], [409, 503, 200]);
    const sheet = await f.open();
    const title = sheet.getByLabel("Title", { exact: false }).first();
    await title.fill("Preserved draft");
    await sheet.getByRole("button", { name: "Save", exact: true }).click();
    await expect(sheet.getByRole("alert")).toContainText("Preview is stale");
    await expect(title).toHaveValue("Preserved draft");
    await sheet.getByRole("button", { name: "Save", exact: true }).click();
    await expect(sheet.getByRole("alert")).toContainText("Temporary failure");
    await sheet.getByRole("button", { name: "Save", exact: true }).click();
    await expect(sheet).toHaveCount(0);
    expect(f.previews).toHaveLength(2);
    expect(f.commits).toEqual(Array(3).fill({ previewId: "fixture-preview", requestId: "fixture-request" }));
  });

  test("capacity floor and restricted controls, artwork locale preserves the single English draft", async ({ page, context, baseURL }) => {
    const f = await setup(page, context, baseURL, ["FB_DIRECTOR"]);
    const sheet = await f.open();
    await expect(sheet.getByLabel("Price (cents)")).toBeDisabled();
    await expect(sheet.getByText("Artwork changes require additional access.").first()).toBeVisible();
    await sheet.getByLabel("Title", { exact: false }).first().fill("English draft");
    await sheet.getByRole("tab", { name: "ES", exact: true }).click();
    await sheet.getByRole("tab", { name: "EN", exact: true }).click();
    await sheet.getByRole("tab", { name: "ES", exact: true }).click();
    await expect(sheet.getByLabel("Title", { exact: false }).first()).toHaveValue("English draft");
    await expect(sheet.getByRole("tablist", { name: "Artwork language" })).toHaveCount(1);
    await expect(sheet.getByRole("tablist", { name: "Language", exact: true })).toHaveCount(0);
    await sheet.getByLabel("Capacity", { exact: false }).fill("2");
    await sheet.getByRole("button", { name: "Save", exact: true }).click();
    await expect(sheet.getByRole("alert")).toContainText("Capacity must be");
    expect(f.previews).toHaveLength(0);
  });
  test("saving English once sends no ES/PT text fields, but preserves per-language artwork", async ({ page, context, baseURL }) => {
    const f = await setup(page, context, baseURL);
    const sheet = await f.open();
    await sheet.getByLabel("Title", { exact: false }).first().fill("New English source");
    await sheet.getByRole("tab", { name: "PT", exact: true }).click();
    await expect(sheet.getByLabel("Title", { exact: false }).first()).toHaveValue("New English source");
    await sheet.getByRole("button", { name: "Save", exact: true }).click();
    expect(f.previews[0].patch["content.title.en"]).toEqual({ mode: "override", value: "New English source" });
    expect(Object.keys(f.previews[0].patch).filter(key => key.startsWith("content.") && (key.endsWith(".es") || key.endsWith(".pt")))).toEqual([]);
  });
});
