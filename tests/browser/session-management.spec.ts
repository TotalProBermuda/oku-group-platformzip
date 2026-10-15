import { expect, test, type BrowserContext, type Page, type Route } from "@playwright/test";
import { encode } from "next-auth/jwt";
import nextEnv from "@next/env";

nextEnv.loadEnvConfig(process.cwd());

const SERIES_ID = "session-management-fixture";
const MANAGEMENT_URL = `**/api/v1/admin/series/${SERIES_ID}/session-management`;
const start = "2027-05-16T22:00:00.000Z";
const end = "2027-05-17T01:00:00.000Z";

const fixtureEffective = (value: unknown, source = "series", mode: "inherit" | "override" | "clear" = "inherit") => ({ value, source, mode });
const sessions = [
  {
    id: "fixture-session-a", title: "Fixture evening A", startsAt: start, endsAt: end, status: "SCHEDULED",
    inventory: { sold: 3, held: 1, issued: 0, minimum: 0 },
    fields: {
      "capacity": fixtureEffective(24), "schedule": fixtureEffective({ localStart: "18:00", durationMinutes: 180 }),
      "content.title.en": fixtureEffective("English title"), "content.title.es": fixtureEffective("Título anterior", "override", "override"),
      "content.title.pt": fixtureEffective("Título português"), "ticket.fixture-ticket.price": fixtureEffective(4500),
      "ticket.fixture-ticket.enabled": fixtureEffective(true), "hosts.PRIMARY_HOST": fixtureEffective(["entity-oku"]),
    },
  },
  {
    id: "fixture-session-b", title: "Fixture evening B", startsAt: "2027-05-23T22:00:00.000Z", endsAt: "2027-05-24T01:00:00.000Z", status: "SCHEDULED",
    inventory: { sold: 0, held: 0, issued: 0, minimum: 0 },
    fields: {
      "capacity": fixtureEffective(30), "schedule": fixtureEffective({ localStart: "19:00", durationMinutes: 180 }),
      "content.title.en": fixtureEffective("English title B"), "content.title.es": fixtureEffective("Otro título", "series", "inherit"),
      "content.title.pt": fixtureEffective("Outro título"), "ticket.fixture-ticket.price": fixtureEffective(4500),
      "ticket.fixture-ticket.enabled": fixtureEffective(true), "hosts.PRIMARY_HOST": fixtureEffective(["entity-oku"]),
    },
  },
];

const managementFixture = {
  fields: ["capacity", "schedule", "content.title.en", "content.title.es", "content.title.pt", "ticket.fixture-ticket.price", "ticket.fixture-ticket.enabled", "hosts.PRIMARY_HOST"],
  sessions,
  defaults: {
    "capacity": fixtureEffective(24), "schedule": fixtureEffective({ localStart: "18:00", durationMinutes: 180 }),
    "content.title.en": fixtureEffective("Series title"), "content.title.es": fixtureEffective("Título de serie"),
    "content.title.pt": fixtureEffective("Título da série"), "ticket.fixture-ticket.price": fixtureEffective(4500),
    "ticket.fixture-ticket.enabled": fixtureEffective(true), "hosts.PRIMARY_HOST": fixtureEffective(["entity-oku"]),
  },
  options: {
    tickets: [{ id: "fixture-ticket", name: "General" }],
    entities: [{ id: "entity-oku", displayName: "OKU fixture" }],
    profiles: [{ id: "profile-fixture", displayName: "Fixture host" }],
    sponsorTiers: [{ id: "tier-fixture", label: "Partner" }],
    referrals: [
      { id: "referral-fixture", scopeType: "SERIES", scopeId: SERIES_ID, isCommissionEligible: true, status: "ACTIVE", isActive: true, actorName: "María Velasquez", actorStatus: "ACTIVE" },
      { id: "referral-draft", scopeType: "SERIES", scopeId: SERIES_ID, isCommissionEligible: true, status: "DRAFT", isActive: false, actorName: "Draft referral", actorStatus: "ACTIVE" },
      { id: "referral-global", scopeType: "GLOBAL", scopeId: "global", isCommissionEligible: false, status: "ACTIVE", isActive: true, actorName: "Global referral", actorStatus: "ACTIVE" },
      { id: "referral-venue", scopeType: "VENUE", scopeId: "fixture-venue", isCommissionEligible: true, status: "PAUSED", isActive: false, actorName: "Venue referral", actorStatus: "PAUSED" },
    ],
  },
};

async function addFixtureAuth(context: BrowserContext, baseURL?: string, roles = ["SUPERADMIN"]) {
  const origin = new URL(baseURL ?? "http://localhost:5000");
  const secret = process.env.NEXTAUTH_SECRET ?? "replace-me";
  const token = await encode({
    secret,
    salt: "next-auth.session-token",
    maxAge: 60 * 60,
    token: {
      sub: "fixture-superadmin",
      userId: "fixture-superadmin",
      roles,
      name: "Fixture Administrator",
      email: "fixture-admin@example.test",
    },
  });
  await context.addCookies([{
    name: "next-auth.session-token", value: token, domain: origin.hostname, path: "/",
    httpOnly: true, secure: origin.protocol === "https:", sameSite: "Lax",
  }]);
}

async function installApiFixtures(page: Page, patchStatuses: number[] = [], roles = ["SUPERADMIN"]) {
  const previewRequests: unknown[] = [];
  const committed: unknown[] = [];
  const createRequests: Array<Record<string, unknown>> = [];
  const referrals = managementFixture.options.referrals.map((item) => ({ ...item }));
  let pendingAssignmentChanges: Array<{ assignmentId: string; status: "DRAFT" | "ACTIVE" | "PAUSED" | "RETIRED" }> = [];

  // Default-deny API traffic: known fixture requests below override this route.
  await page.route("**/api/**", async (route: Route) => {
    const method = route.request().method();
    await route.fulfill({ status: method === "GET" || method === "HEAD" ? 404 : 501, contentType: "application/json", body: JSON.stringify({ ok: false, error: "Unstubbed fixture request" }) });
  });
  await page.route("**/api/auth/session", (route) => route.fulfill({ json: { user: { id: "fixture-superadmin", name: "Fixture Administrator", email: "fixture-admin@example.test", roles }, expires: "2099-01-01T00:00:00.000Z" } }));
  await page.route("**/api/v1/admin/experiences/" + SERIES_ID, (route) => route.fulfill({ json: { series: {
    id: SERIES_ID, title: "Fixture series", slug: SERIES_ID, status: "DRAFT", startsAt: start, endsAt: end, capacityTotal: 30,
    venueId: "fixture-venue", spaceId: null, ticketTypes: [{ id: "fixture-ticket", name: "General", priceCents: 4500 }],
    sessions: sessions.map((session) => ({ id: session.id, title: session.title, startsAt: session.startsAt, endsAt: session.endsAt, capacity: 24, status: session.status })),
  } } }));
  await page.route("**/api/v1/admin/venues", (route) => route.fulfill({ json: { venues: [] } }));
  await page.route("**/api/v1/admin/spaces", (route) => route.fulfill({ json: { data: [] } }));
  await page.route("**/api/v1/admin/series/host-options", (route) => route.fulfill({ json: { data: { influencers: [], partners: [] } } }));
  await page.route(`**/api/v1/admin/series/${SERIES_ID}/sessions`, async (route) => {
    if (route.request().method() !== "POST") return route.fulfill({ status: 405, json: { ok: false } });
    createRequests.push(route.request().postDataJSON() as Record<string, unknown>);
    return route.fulfill({ status: 201, json: { ok: true, data: { id: "created-fixture-session" }, conflictCount: 0 } });
  });
  await page.route(MANAGEMENT_URL, async (route) => {
    const method = route.request().method();
    if (method === "GET") return route.fulfill({ json: { ok: true, data: { ...managementFixture, options: { ...managementFixture.options, referrals } } } });
    if (method === "POST") {
      const body = route.request().postDataJSON() as { kind: string; patch: Record<string, { mode: string; value?: unknown }>; assignmentChanges?: Array<{ assignmentId: string; status: "DRAFT" | "ACTIVE" | "PAUSED" | "RETIRED" }> };
      previewRequests.push(body);
      pendingAssignmentChanges = body.assignmentChanges ?? [];
      const target = sessions[0];
      const changes = Object.entries(body.patch).map(([field, change]) => ({
        field,
        before: (target.fields as Record<string, ReturnType<typeof fixtureEffective>>)[field] ?? fixtureEffective(null),
        after: fixtureEffective(change.mode === "override" ? change.value : change.mode === "clear" ? null : "inherited fixture value", change.mode === "override" ? "override" : "series", change.mode as "inherit" | "override" | "clear"),
      }));
       const assignmentDiffs = (body.assignmentChanges ?? []).map(({ assignmentId, status }) => {
        const assignment = referrals.find((item) => item.id === assignmentId)!;
         return {
           field: `referral.${assignmentId}.status`,
           before: fixtureEffective(assignment.status, "series", "inherit"),
           after: fixtureEffective(status, "series", "override"),
         };
       });
       const defaults = body.kind === "defaults" ? [...changes, ...assignmentDiffs] : [];
      const targets = body.kind === "defaults" ? [] : [{
        id: target.id, title: target.title, inventory: target.inventory, changes, warnings: [], blocked: [],
        noticeCounts: { queued: 2, missingContacts: 1, locales: { en: 1, es: 1, pt: 0 } },
      }];
      return route.fulfill({ json: { ok: true, data: {
        previewId: "fixture-preview", requestId: "fixture-request", targets, defaults, warnings: [], blocked: [],
        expiresAt: "2099-01-01T00:05:00.000Z",
      } } });
    }
    if (method === "PATCH") {
      committed.push(route.request().postDataJSON());
      const status = patchStatuses.shift() ?? 200;
      if (status === 200) {
        for (const change of pendingAssignmentChanges) {
          const assignment = referrals.find((item) => item.id === change.assignmentId);
          if (assignment) assignment.status = change.status;
        }
      }
      return route.fulfill({ status, json: status === 200 ? { ok: true, data: { changeId: "fixture-change", targetIds: [sessions[0].id], noticeCount: 2 } } : { ok: false, error: "Preview is stale" } });
    }
    return route.fulfill({ status: 405, json: { ok: false, error: "Unexpected method" } });
  });
  return { previewRequests, committed, createRequests };
}

async function openDatesTab(page: Page, context: BrowserContext, baseURL?: string, patchStatuses: number[] = [], roles = ["SUPERADMIN"]) {
  await addFixtureAuth(context, baseURL, roles);
  const fixtures = await installApiFixtures(page, patchStatuses, roles);
  await page.goto(`/admin/experiences/${SERIES_ID}?tab=dates`, { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Event dates" })).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: "Advanced series tools", exact: true }).click();
  // A cold Next dev compilation may finish the shell before hydrating the editor.
  await expect(page.getByRole("heading", { name: "Session management" })).toBeVisible({ timeout: 20_000 });
  return fixtures;
}

test.describe("session management fixture workflow", () => {
  test("edits a SERIES referral lifecycle through defaults preview/apply without overflowing at 375px", async ({ baseURL, context, page }) => {
    page.setDefaultTimeout(10000);
    await page.setViewportSize({ width: 375, height: 800 });
    const { previewRequests, committed } = await openDatesTab(page, context, baseURL, [409, 200]);
    await page.getByRole("checkbox", { name: "Select session Fixture evening A" }).check();
    await page.getByLabel("Starts at", { exact: true }).fill("2027-05-17T18:00");
    await page.getByLabel("This is a deliberate postponement").check();
    await page.getByLabel("Reason for postponement").fill("Fixture pending-date treatment");
    await page.getByLabel("Admission treatment").selectOption("HOLD_PENDING_DATE");
    await page.getByLabel("Change scope").selectOption("defaults");
    const editor = page.getByRole("region", { name: "Session management" });
    const dimensions = await editor.evaluate((element) => ({ width: element.clientWidth, scrollWidth: element.scrollWidth }));
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.width + 2);

    await expect(page.getByLabel("María Velasquez Assignment status")).toBeVisible();
    await expect(page.getByLabel("Draft referral Assignment status")).toBeVisible();
    await expect(page.getByText("Global referral")).toBeVisible();
    await expect(page.getByRole("link", { name: "Manage referrers" })).toHaveAttribute("href", "/admin/referrals");
    await page.getByLabel("María Velasquez Assignment status").selectOption("PAUSED");
    await page.getByRole("button", { name: "Preview changes" }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("Referral assignment · María Velasquez · Status");
    await expect(dialog).toContainText("ACTIVE");
    await expect(dialog).toContainText("PAUSED");
    expect(previewRequests).toHaveLength(1);
    expect(previewRequests[0]).toEqual({
      kind: "defaults",
      sessionIds: [],
      patch: {},
      assignmentChanges: [{ assignmentId: "referral-fixture", status: "PAUSED" }],
    });
    expect(previewRequests[0]).not.toHaveProperty("postponement");

    await dialog.getByRole("button", { name: "Confirm and apply" }).click();
    await expect(page.getByText("The preview is stale.", { exact: false })).toBeVisible();
    await expect(page.getByLabel("María Velasquez Assignment status")).toHaveValue("PAUSED");
    await page.getByRole("button", { name: "Preview changes" }).click();
    await expect(page.getByRole("dialog")).toContainText("Referral assignment · María Velasquez · Status");
    expect(previewRequests).toHaveLength(2);
    expect(previewRequests[1]).toEqual(previewRequests[0]);
    await page.getByRole("dialog").getByRole("button", { name: "Confirm and apply" }).click();
    await expect(page.getByRole("status")).toContainText("Session changes saved.");
    expect(committed).toEqual([
      { previewId: "fixture-preview", requestId: "fixture-request" },
      { previewId: "fixture-preview", requestId: "fixture-request" },
    ]);
  });

  test("activates a draft SERIES assignment then retires it through preview/apply", async ({ baseURL, context, page }) => {
    const { previewRequests, committed } = await openDatesTab(page, context, baseURL);
    await page.getByLabel("Change scope").selectOption("defaults");
    const assignmentStatus = page.getByLabel("Draft referral Assignment status");

    await assignmentStatus.selectOption("ACTIVE");
    await page.getByRole("button", { name: "Preview changes" }).click();
    let dialog = page.getByRole("dialog");
    await expect(dialog).toContainText("Referral assignment · Draft referral · Status");
    await expect(dialog).toContainText("DRAFT");
    await expect(dialog).toContainText("ACTIVE");
    expect(previewRequests[0]).toMatchObject({
      kind: "defaults", sessionIds: [], patch: {},
      assignmentChanges: [{ assignmentId: "referral-draft", status: "ACTIVE" }],
    });
    await dialog.getByRole("button", { name: "Confirm and apply" }).click();
    await expect(page.getByRole("status")).toContainText("Session changes saved.");
    await expect(page.getByLabel("Draft referral Assignment status")).toHaveValue("");

    await page.getByLabel("Draft referral Assignment status").selectOption("RETIRED");
    await page.getByRole("button", { name: "Preview changes" }).click();
    dialog = page.getByRole("dialog");
    await expect(dialog).toContainText("Referral assignment · Draft referral · Status");
    await expect(dialog).toContainText("ACTIVE");
    await expect(dialog).toContainText("RETIRED");
    expect(previewRequests[1]).toMatchObject({
      kind: "defaults", sessionIds: [], patch: {},
      assignmentChanges: [{ assignmentId: "referral-draft", status: "RETIRED" }],
    });
    await dialog.getByRole("button", { name: "Confirm and apply" }).click();
    await expect(page.getByRole("status")).toContainText("Session changes saved.");
    expect(committed).toEqual([
      { previewId: "fixture-preview", requestId: "fixture-request" },
      { previewId: "fixture-preview", requestId: "fixture-request" },
    ]);
    expect(previewRequests).toHaveLength(2);
  });

  test("previews a date-only session change with an empty patch", async ({ baseURL, context, page }) => {
    const { previewRequests } = await openDatesTab(page, context, baseURL);
    await page.getByRole("checkbox", { name: "Select session Fixture evening A" }).check();
    await page.getByLabel("Starts at").fill("2027-05-16T18:00");
    await page.getByLabel("Ends at").fill("2027-05-16T21:00");
    await page.getByRole("button", { name: "Preview changes" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();

    expect(previewRequests).toHaveLength(1);
    expect(previewRequests[0]).toMatchObject({
      kind: "sessions",
      sessionIds: ["fixture-session-a"],
      patch: {},
      schedules: { "fixture-session-a": { startsAt: expect.any(String), endsAt: expect.any(String) } },
    });
    expect(previewRequests[0]).not.toHaveProperty("postponement");
  });

  test("FB_DIRECTOR fixture has no referral lifecycle controls", async ({ baseURL, context, page }) => {
    await openDatesTab(page, context, baseURL, [], ["FB_DIRECTOR"]);
    await page.getByLabel("Change scope").selectOption("defaults");
    await expect(page.getByText("Financial referral assignments")).toHaveCount(0);
    await expect(page.getByLabel("María Velasquez Assignment status")).toHaveCount(0);
  });

  test("selects a session, edits one locale, and previews exact old/new values without contacts", async ({ baseURL, context, page }) => {
    const { previewRequests } = await openDatesTab(page, context, baseURL);
    await page.getByRole("checkbox", { name: "Select session Fixture evening A" }).check();
    const localeMode = page.getByLabel("Title · ES Change");
    await expect(localeMode.locator("option")).toHaveText(["Untouched", "Inherit", "Override", "Clear"]);
    await localeMode.selectOption("override");
    await page.getByRole("textbox", { name: "Title · ES" }).fill("Noche revisada");
    await page.getByRole("button", { name: "Preview changes" }).click();

    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByRole("dialog")).toContainText("Título anterior");
    await expect(page.getByRole("dialog")).toContainText("Noche revisada");
    await expect(page.getByRole("dialog")).toContainText("override");
    await expect(page.getByRole("dialog")).toContainText("No attendee contact details are shown.");
    expect(previewRequests).toHaveLength(1);
    expect(previewRequests[0]).toMatchObject({
      kind: "sessions", sessionIds: ["fixture-session-a"],
      patch: { "content.title.es": { mode: "override", value: "Noche revisada" } },
    });
    expect(Object.keys((previewRequests[0] as any).patch)).toEqual(["content.title.es"]);
  });

  test("shows defaults preview diffs even when a new series has zero affected sessions", async ({ baseURL, context, page }) => {
    await openDatesTab(page, context, baseURL);
    await page.getByLabel("Change scope").selectOption("defaults");
    const mode = page.getByLabel("Title · EN Change");
    await mode.selectOption("override");
    await page.getByRole("textbox", { name: "Title · EN" }).fill("Series-wide title");
    await expect(page.getByText("Fixture evening A, Fixture evening B")).toBeVisible();
    await page.getByRole("button", { name: "Preview changes" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText("0 target sessions");
    await expect(dialog.getByText("Series default changes")).toBeVisible();
    await expect(dialog).toContainText("English title");
    await expect(dialog).toContainText("Series-wide title");
    await expect(dialog).toContainText("Title · EN");
  });

  test("a 409 preserves the selected session and locale draft for re-preview", async ({ baseURL, context, page }) => {
    const { previewRequests } = await openDatesTab(page, context, baseURL, [409]);
    await page.getByRole("checkbox", { name: "Select session Fixture evening A" }).check();
    await page.getByLabel("Title · ES Change").selectOption("override");
    await page.getByRole("textbox", { name: "Title · ES" }).fill("Draft survives conflict");
    await page.getByRole("button", { name: "Preview changes" }).click();
    await page.getByRole("button", { name: "Confirm and apply" }).click();
    await expect(page.locator('[role="alert"]').filter({ hasText: "The preview is stale." })).toBeVisible();
    await expect(page.getByRole("checkbox", { name: "Select session Fixture evening A" })).toBeChecked();
    await expect(page.getByLabel("Title · ES Change")).toHaveValue("override");
    await expect(page.getByRole("textbox", { name: "Title · ES" })).toHaveValue("Draft survives conflict");
    await page.getByRole("button", { name: "Preview changes" }).click();
    await expect(page.getByRole("dialog")).toContainText("Draft survives conflict");
    expect(previewRequests).toHaveLength(2);
  });

  test("confirmation dialog receives focus and Enter applies the fixture preview", async ({ baseURL, context, page }) => {
    const { committed } = await openDatesTab(page, context, baseURL);
    await page.getByRole("checkbox", { name: "Select session Fixture evening A" }).check();
    await page.getByLabel("Title · ES Change").selectOption("override");
    await page.getByRole("textbox", { name: "Title · ES" }).fill("Keyboard-confirmed value");
    await page.getByRole("button", { name: "Preview changes" }).click();
    const confirm = page.getByRole("button", { name: "Confirm and apply" });
    await expect(confirm).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("status")).toContainText("Session changes saved.");
    expect(committed).toEqual([{ previewId: "fixture-preview", requestId: "fixture-request" }]);
  });

  test("new session defaults checkbox is false by default and only sends true when opted in", async ({ baseURL, context, page }) => {
    const { createRequests } = await openDatesTab(page, context, baseURL);
    await page.getByRole("button", { name: "+ Create event" }).click();
    const inheritDefaults = page.getByLabel("Inherit series session defaults");
    await expect(inheritDefaults).not.toBeChecked();
    await page.getByRole("button", { name: "Create event", exact: true }).click();
    await expect(page.getByText("Event created.")).toBeVisible();
    await expect.poll(() => createRequests).toHaveLength(1);
    expect(createRequests[0]).not.toHaveProperty("useSeriesDefaults");

    await page.getByRole("button", { name: "+ Create event" }).click();
    await page.getByLabel("Inherit series session defaults").check();
    await page.getByRole("button", { name: "Create event", exact: true }).click();
    await expect.poll(() => createRequests).toHaveLength(2);
    expect(createRequests[1]).toHaveProperty("useSeriesDefaults", true);
  });

  test("stacks within a 375px viewport and preserves existing create-session flow", async ({ baseURL, context, page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await openDatesTab(page, context, baseURL);
    const editor = page.getByRole("region", { name: "Session management" });
    const dimensions = await editor.evaluate((element) => ({ width: element.clientWidth, scrollWidth: element.scrollWidth }));
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.width + 2);
    await page.getByRole("button", { name: "+ Create event" }).click();
    const inheritance = page.getByLabel("Inherit series session defaults");
    await expect(inheritance).not.toBeChecked();
    await expect(page.getByText("The event’s explicit start and end dates remain occurrence dates.")).toBeVisible();
  });
});
