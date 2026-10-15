import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PrismaClient, Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";

// Deliberately cannot use DATABASE_URL or the project's shared database.
const { client, auth, emit } = vi.hoisted(() => ({
  client: { current: null as unknown as PrismaClient }, auth: { userId: "", roles: ["SUPERADMIN"] },
  emit: vi.fn(),
}));
vi.mock("next-auth", () => ({ getServerSession: async () => ({ user: { id: auth.userId, roles: auth.roles } }) }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/checkInEmitter", () => ({ checkInEmitter: { emit } }));
vi.mock("@/lib/prisma", () => ({ prisma: new Proxy({}, { get: (_target, key) => {
  const value = Reflect.get(client.current, key);
  return typeof value === "function" ? value.bind(client.current) : value;
} }) }));
vi.mock("@/server/auth/session", () => ({ requireSession: async () => auth }));
vi.mock("@/server/queue/queue", () => ({ safeEnqueue: vi.fn(() => { throw new Error("Mail/queue must never be invoked"); }) }));
import { applySessionManagement, previewSessionManagement } from "@/server/series/sessionManagement";
import { loadSessionState, inventory, effectiveField, defaultField } from "@/server/series/sessionState";
import { reserveCatalogCapacityInTransaction } from "@/server/commerce/capacity";
import { assertCheckoutCatalogPolicy } from "@/server/commerce/catalogPolicy";
import { claimAdmission } from "@/server/checkin/claimAdmission";
import { POST as createSession } from "@/app/api/v1/admin/series/[id]/sessions/route";
import { localizeSessions } from "@/server/series/localizeSessions";
import { ticketRows } from "@/server/commerce/ticketIssuance";
import { POST as issueComp } from "@/app/api/v1/admin/tickets/issue/route";
import { expireCheckoutHoldsForSession, CHECKOUT_HOLD_EVENT } from "@/server/commerce/checkoutHold";
import { GET as managementGET } from "@/app/api/v1/admin/series/[id]/session-management/route";
import { POST as adminCheckin } from "@/app/api/v1/admin/experiences/[id]/attendees/route";

const suite = process.env.RUN_SESSION_MANAGEMENT_DB_TESTS === "1" ? describe : describe.skip;
suite("dynamic sessions — isolated PostgreSQL transactions", () => {
  let db: PrismaClient;
  beforeAll(async () => {
    db = new PrismaClient({ datasources: { db: { url: "postgresql://fixture@127.0.0.1:55432/oku_session_management_test" } } });
    client.current = db;
    await db.$connect();
  });
  afterAll(async () => { await db?.$disconnect(); });
  const roles = ["SUPERADMIN"];
  async function fixture(capacity = 10) {
    const suffix = randomUUID();
    const user = await db.user.create({ data: { email: `session-${suffix}@example.invalid`, name: "Fixture guest" } });
    auth.userId = user.id;
    const series = await db.series.create({ data: { slug: `session-${suffix}`, title: "Series original", hostType: "OKU", status: "PUBLISHED", capacityTotal: 10 } });
    const ticket = await db.ticketType.create({ data: { seriesId: series.id, name: "Original admission", priceCents: 1000 } });
    const sessions = await Promise.all([1, 2, 3].map(day => db.session.create({ data: {
      seriesId: series.id, startsAt: new Date(`2099-11-0${day}T23:00:00Z`), endsAt: new Date(`2099-11-0${day + 1}T01:00:00Z`), capacity,
    } })));
    return { user, series, ticket, sessions };
  }
  async function change(f: Awaited<ReturnType<typeof fixture>>, input: unknown) {
    const p = await previewSessionManagement(f.series.id, f.user.id, roles, input);
    await applySessionManagement(f.series.id, f.user.id, roles, p.previewId, p.requestId);
    return p;
  }
  async function paid(f: Awaited<ReturnType<typeof fixture>>, index = 0, locale = "es") {
    const order = await db.order.create({ data: {
      userId: f.user.id, seriesId: f.series.id, sessionId: f.sessions[index].id, status: "PAID", subtotalCents: 1000, totalCents: 1000,
      checkoutLocale: locale, entitlementSnapshot: { version: 1, admission: true, giftBag: true },
      lineItems: { create: { ticketTypeId: f.ticket.id, nameSnapshot: "Original admission", qty: 1, unitPriceCents: 1000, totalCents: 1000 } },
    }, include: { user: true, lineItems: true } });
    await db.ticket.createMany({ data: ticketRows(order) });
    await db.session.update({ where: { id: f.sessions[index].id }, data: { soldCount: 1 } });
    return order;
  }
  async function financialFixture(f: Awaited<ReturnType<typeof fixture>>) {
    const actor = await db.referralActor.create({ data: { actorType: "OTHER", displayName: "Fixture financial actor" } });
    const assignment = await db.referralAssignment.create({ data: {
      referralActorId: actor.id, scopeType: "SERIES", scopeId: f.series.id,
      isCommissionEligible: true, compensationMode: "PERCENT_OF_TRANSACTION", rateBps: 700,
      commissionPlanId: "fixture-existing-plan", status: "ACTIVE", isActive: true,
    } });
    const link = await db.referralLink.create({ data: { referralActorId: actor.id, referralAssignmentId: assignment.id, code: randomUUID() } });
    const input = { kind: "defaults" as const, sessionIds: [], patch: {}, assignmentChanges: [{ assignmentId: assignment.id, status: "PAUSED" as const }] };
    return { actor, assignment, link, input };
  }
  it("previews/applies existing series financial lifecycle across all occurrences without changing economics or purchased rights", async () => {
    const f = await fixture(), a = await financialFixture(f), order = await paid(f);
    const beforeOrder = await db.order.findUniqueOrThrow({ where: { id: order.id }, include: { lineItems: true, tickets: true } });
    const beforeSessions = await db.session.findMany({ where: { seriesId: f.series.id }, orderBy: { id: "asc" } });
    const p = await change(f, a.input);
    expect(p.targets.map(t => t.id).sort()).toEqual(f.sessions.map(s => s.id).sort());
    expect(p.defaults[0]).toMatchObject({ field: `referral.${a.assignment.id}.status`, before: { value: { status: "ACTIVE", isActive: true } }, after: { value: { status: "PAUSED", isActive: false } } });
    const changed = await db.referralAssignment.findUniqueOrThrow({ where: { id: a.assignment.id } });
    expect(changed).toMatchObject({ ...a.assignment, status: "PAUSED", isActive: false, updatedAt: expect.any(Date) });
    expect(await db.referralLink.findUniqueOrThrow({ where: { id: a.link.id } })).toEqual(a.link);
    expect(await db.order.findUniqueOrThrow({ where: { id: order.id }, include: { lineItems: true, tickets: true } })).toEqual(beforeOrder);
    expect(await db.session.findMany({ where: { seriesId: f.series.id }, orderBy: { id: "asc" } })).toEqual(beforeSessions);
    expect((await db.series.findUniqueOrThrow({ where: { id: f.series.id } })).sessionDefaults).toBeNull();
    expect(await db.sessionAttendeeNotice.count({ where: { changeId: p.previewId } })).toBe(0);
    const result = await applySessionManagement(f.series.id, f.user.id, roles, p.previewId, p.requestId);
    expect(result).toMatchObject({ changeId: p.previewId, noticeCount: 0 });
    expect(await db.auditLog.count({ where: { action: "referrer.assignment.status.changed", metadata: { path: ["changeId"], equals: p.previewId } } })).toBe(1);
  });
  it("does not expand financial authorization, including retries after a role is removed", async () => {
    const f = await fixture(), a = await financialFixture(f);
    await expect(previewSessionManagement(f.series.id, f.user.id, ["FB_DIRECTOR"], a.input)).rejects.toMatchObject({ status: 403 });
    const p = await previewSessionManagement(f.series.id, f.user.id, roles, a.input);
    await expect(applySessionManagement(f.series.id, f.user.id, ["FB_DIRECTOR"], p.previewId, p.requestId)).rejects.toMatchObject({ status: 403 });
    await applySessionManagement(f.series.id, f.user.id, roles, p.previewId, p.requestId);
    await expect(applySessionManagement(f.series.id, f.user.id, ["FB_DIRECTOR"], p.previewId, p.requestId)).rejects.toMatchObject({ status: 403 });
  });
  it("rejects session financial scope, economic payloads and cross-series/global/venue/campaign assignment changes", async () => {
    const f = await fixture(), a = await financialFixture(f);
    await expect(previewSessionManagement(f.series.id, f.user.id, roles, { ...a.input, kind: "sessions", sessionIds: [f.sessions[0].id] })).rejects.toThrow();
    await expect(previewSessionManagement(f.series.id, f.user.id, roles, { ...a.input, assignmentChanges: [{ assignmentId: a.assignment.id, status: "PAUSED", rateBps: 9999 }] })).rejects.toThrow();
    for (const scopeType of ["GLOBAL", "VENUE", "CAMPAIGN", "SERIES"] as const) {
      const foreign = await db.referralAssignment.create({ data: { referralActorId: a.actor.id, scopeType, scopeId: scopeType === "GLOBAL" ? null : `foreign-${randomUUID()}` } });
      await expect(previewSessionManagement(f.series.id, f.user.id, roles, { ...a.input, assignmentChanges: [{ assignmentId: foreign.id, status: "PAUSED" }] })).rejects.toMatchObject({ status: 400 });
    }
  });
  it("rejects financial previews after terms, scope, lifecycle, actor status or eligibility drift", async () => {
    const f = await fixture(), a = await financialFixture(f);
    for (const mutation of [
      () => db.referralAssignment.update({ where: { id: a.assignment.id }, data: { rateBps: 800 } }),
      () => db.referralAssignment.update({ where: { id: a.assignment.id }, data: { scopeId: "fixture-other-series" } }),
      () => db.referralAssignment.update({ where: { id: a.assignment.id }, data: { status: "PAUSED", isActive: false } }),
      () => db.referralActor.update({ where: { id: a.actor.id }, data: { status: "SUSPENDED" } }),
      () => db.referralActor.update({ where: { id: a.actor.id }, data: { commissionEligible: true } }),
    ]) {
      await db.referralAssignment.update({ where: { id: a.assignment.id }, data: { scopeId: f.series.id, rateBps: 700, status: "ACTIVE", isActive: true } });
      await db.referralActor.update({ where: { id: a.actor.id }, data: { status: "ACTIVE", commissionEligible: false } });
      const p = await previewSessionManagement(f.series.id, f.user.id, roles, a.input);
      await mutation();
      await expect(applySessionManagement(f.series.id, f.user.id, roles, p.previewId, p.requestId)).rejects.toMatchObject({ status: 409 });
    }
  });
  it("supports the canonical assignment lifecycle without rewriting terms and blocks inactive-actor activation", async () => {
    const f = await fixture(), a = await financialFixture(f);
    for (const status of ["DRAFT", "ACTIVE", "PAUSED", "RETIRED"] as const) {
      await change(f, { ...a.input, assignmentChanges: [{ assignmentId: a.assignment.id, status }] });
      expect(await db.referralAssignment.findUniqueOrThrow({ where: { id: a.assignment.id } })).toMatchObject({
        ...a.assignment, status, isActive: status === "ACTIVE", updatedAt: expect.any(Date),
      });
    }
    await db.referralAssignment.update({ where: { id: a.assignment.id }, data: { status: "PAUSED", isActive: false } });
    await db.referralActor.update({ where: { id: a.actor.id }, data: { status: "SUSPENDED" } });
    await expect(previewSessionManagement(f.series.id, f.user.id, roles, { ...a.input, assignmentChanges: [{ assignmentId: a.assignment.id, status: "ACTIVE" }] })).rejects.toMatchObject({ status: 409 });
  });
  it("new sessions keep submitted capacity unless an explicit per-session default is opted into", async () => {
    const f = await fixture();
    await db.series.update({ where: { id: f.series.id }, data: { capacityTotal: 9999 } });
    const create = async (useSeriesDefaults: boolean, expected: number) => {
      const response = await createSession(new Request("http://fixture.invalid/sessions", { method: "POST",
        headers: { "content-type": "application/json" }, body: JSON.stringify({
          startsAt: "2099-12-01T23:00:00Z", endsAt: "2099-12-02T01:00:00Z", capacity: 17, useSeriesDefaults,
        }) }), { params: Promise.resolve({ id: f.series.id }) });
      expect(response.status).toBe(201);
      const { data } = await response.json();
      expect(data.capacity).toBe(expected);
      expect((await db.session.findUniqueOrThrow({ where: { id: data.id } })).capacity).toBe(expected);
    };
    await create(false, 17);
    await create(true, 17);
    await db.series.update({ where: { id: f.series.id }, data: { sessionDefaults: { capacity: { mode: "override", value: 33 } } } });
    await create(true, 33);
    await create(false, 17);
    await db.series.update({ where: { id: f.series.id }, data: { sessionDefaults: { capacity: { mode: "inherit" } } } });
    await create(true, 17);
  });
  it("capacity resolution never presents or propagates the aggregate as an occurrence default", async () => {
    const f = await fixture(17);
    await db.series.update({ where: { id: f.series.id }, data: { capacityTotal: 9999 } });
    const state = await db.$transaction(tx => loadSessionState(tx, f.series.id));
    expect(defaultField(state, "capacity").value).toBeNull();
    const inherited = { ...state.sessions[0], fieldModes: { capacity: { mode: "inherit" } } };
    expect(effectiveField(state, inherited, "capacity").value).toBe(17);
    await change(f, { kind: "sessions", sessionIds: [f.sessions[0].id], patch: { capacity: { mode: "inherit" } } });
    expect((await db.session.findUniqueOrThrow({ where: { id: f.sessions[0].id } })).capacity).toBe(17);
    await db.session.deleteMany({ where: { seriesId: f.series.id } });
    const empty = await db.$transaction(tx => loadSessionState(tx, f.series.id));
    expect(defaultField(empty, "capacity").value).toBeNull();
  });
  async function checkin(f: Awaited<ReturnType<typeof fixture>>, ticketId: string) {
    return adminCheckin(new NextRequest("http://fixture.invalid/attendees", { method: "POST",
      headers: { "content-type": "application/json" }, body: JSON.stringify({ ticketId }) }),
      { params: Promise.resolve({ id: f.series.id }) });
  }
  it("rolls back admin admission on ExperienceCheckin failure and emits only after a successful audited retry", async () => {
    const f = await fixture(), order = await paid(f);
    const ticket = await db.ticket.findFirstOrThrow({ where: { orderId: order.id } });
    emit.mockClear();
    await db.$executeRawUnsafe(`ALTER TABLE "ExperienceCheckin" ADD CONSTRAINT fixture_checkin_audit_failure CHECK (method <> 'ADMIN_OVERRIDE') NOT VALID`);
    try {
      expect((await checkin(f, ticket.id)).status).toBe(409);
      expect(await db.ticket.findUniqueOrThrow({ where: { id: ticket.id } })).toMatchObject({
        ticketStatus: "ISSUED", checkedInAt: null, checkedInById: null,
      });
      expect(await db.experienceCheckin.count({ where: { ticketId: ticket.id } })).toBe(0);
      expect(emit).not.toHaveBeenCalled();
    } finally { await db.$executeRawUnsafe(`ALTER TABLE "ExperienceCheckin" DROP CONSTRAINT fixture_checkin_audit_failure`); }
    expect((await checkin(f, ticket.id)).status).toBe(200);
    expect((await db.ticket.findUniqueOrThrow({ where: { id: ticket.id } })).ticketStatus).toBe("CHECKED_IN");
    expect(await db.experienceCheckin.count({ where: { ticketId: ticket.id } })).toBe(1);
    expect(emit).toHaveBeenCalledTimes(1);
  });
  it("rejects paused admin check-in without creating an audit or broadcasting admission", async () => {
    const f = await fixture(), order = await paid(f);
    const ticket = await db.ticket.findFirstOrThrow({ where: { orderId: order.id } });
    await db.session.update({ where: { id: f.sessions[0].id }, data: { status: "PAUSED" } });
    emit.mockClear();
    expect((await checkin(f, ticket.id)).status).toBe(409);
    expect((await db.ticket.findUniqueOrThrow({ where: { id: ticket.id } })).ticketStatus).toBe("ISSUED");
    expect(await db.experienceCheckin.count({ where: { ticketId: ticket.id } })).toBe(0);
    expect(emit).not.toHaveBeenCalled();
  });
  it("admits once under concurrent admin check-in and records exactly one ExperienceCheckin", async () => {
    const f = await fixture(), order = await paid(f);
    const ticket = await db.ticket.findFirstOrThrow({ where: { orderId: order.id } });
    emit.mockClear();
    const responses = await Promise.all([checkin(f, ticket.id), checkin(f, ticket.id)]);
    expect(responses.filter(r => r.status === 200)).toHaveLength(1);
    expect(responses.every(r => [200, 400, 409].includes(r.status))).toBe(true);
    expect(await db.experienceCheckin.count({ where: { ticketId: ticket.id } })).toBe(1);
    expect(emit).toHaveBeenCalledTimes(1);
  });
  it("rolls back financial lifecycle and operational edits together if the transactional financial audit fails", async () => {
    const f = await fixture(), a = await financialFixture(f);
    const p = await previewSessionManagement(f.series.id, f.user.id, roles, { ...a.input, patch: { "content.title.en": { mode: "override", value: "Atomic title" } } });
    await db.$executeRawUnsafe(`ALTER TABLE "AuditLog" ADD CONSTRAINT fixture_financial_audit_failure CHECK (action <> 'referrer.assignment.status.changed') NOT VALID`);
    try {
      await expect(applySessionManagement(f.series.id, f.user.id, roles, p.previewId, p.requestId)).rejects.toThrow();
      expect((await db.referralAssignment.findUniqueOrThrow({ where: { id: a.assignment.id } })).status).toBe("ACTIVE");
      expect((await db.session.findUniqueOrThrow({ where: { id: f.sessions[0].id } })).title).toBeNull();
      expect((await db.series.findUniqueOrThrow({ where: { id: f.series.id } })).sessionDefaults).toBeNull();
      expect((await db.sessionManagementChange.findUniqueOrThrow({ where: { id: p.previewId } })).state).toBe("PREVIEW");
    } finally { await db.$executeRawUnsafe(`ALTER TABLE "AuditLog" DROP CONSTRAINT fixture_financial_audit_failure`); }
  });
  it("supports financial-only edits for an empty series and terminal occurrences without modifying occurrence state", async () => {
    const f = await fixture(), a = await financialFixture(f);
    await db.session.update({ where: { id: f.sessions[0].id }, data: { status: "CANCELLED" } });
    await change(f, a.input);
    expect((await db.session.findUniqueOrThrow({ where: { id: f.sessions[0].id } })).status).toBe("CANCELLED");
    await db.session.deleteMany({ where: { seriesId: f.series.id } });
    const p = await change(f, { ...a.input, assignmentChanges: [{ assignmentId: a.assignment.id, status: "ACTIVE" }] });
    expect(p.targets).toHaveLength(0);
    expect(p.defaults).toHaveLength(1);
    expect((await db.referralAssignment.findUniqueOrThrow({ where: { id: a.assignment.id } })).isActive).toBe(true);
  });
  it("returns inactive financial options only to SUPERADMIN, with no attendee or actor contact details", async () => {
    const f = await fixture(), a = await financialFixture(f);
    await db.referralAssignment.update({ where: { id: a.assignment.id }, data: { status: "PAUSED", isActive: false } });
    auth.roles = ["SUPERADMIN"];
    const context = { params: Promise.resolve({ id: f.series.id }) };
    const owner = await managementGET(new Request("http://fixture.invalid/management"), context);
    const data = (await owner.json()).data;
    expect(data.options.referrals).toContainEqual(expect.objectContaining({ id: a.assignment.id, status: "PAUSED", actorName: a.actor.displayName }));
    expect(data.options.referrals[0]).not.toHaveProperty("email");
    try {
      auth.roles = ["FB_DIRECTOR"];
      const operations = await managementGET(new Request("http://fixture.invalid/management"), context);
      expect((await operations.json()).data.options.referrals).toEqual([]);
    } finally { auth.roles = ["SUPERADMIN"]; }
  });
  it("edits one locale and host role without overwriting unrelated content or roster", async () => {
    const f = await fixture();
    const primary = await db.entity.create({ data: { displayName: "Primary fixture" } }), cohost = await db.entity.create({ data: { displayName: "Co fixture" } });
    await db.seriesHost.create({ data: { seriesId: f.series.id, entityId: primary.id, role: "PRIMARY_HOST" } });
    await change(f, { kind: "sessions", sessionIds: [f.sessions[0].id], patch: {
      "content.title.es": { mode: "override", value: "Título especial" },
      "hosts.CO_HOST": { mode: "override", value: [cohost.id] },
    } });
    const session = await db.session.findUniqueOrThrow({ where: { id: f.sessions[0].id }, include: { eventHosts: true } });
    expect(session.eventHosts.map(h => h.entityId).sort()).toEqual([primary.id, cohost.id].sort());
    expect((await localizeSessions(f.series, [session], "es"))[0].title).toBe("Título especial");
    expect((await localizeSessions(f.series, [session], "en"))[0].title).toBe(f.series.title);
    expect((await db.session.findUniqueOrThrow({ where: { id: f.sessions[1].id } })).fieldModes).toBeNull();
  });
  it("separately discloses inheritors and never targets an unselected override", async () => {
    const f = await fixture();
    await change(f, { kind: "sessions", sessionIds: [f.sessions[0].id], patch: { capacity: { mode: "inherit" } } });
    const preview = await previewSessionManagement(f.series.id, f.user.id, roles, { kind: "defaults", sessionIds: [], patch: { capacity: { mode: "override", value: 20 } } });
    expect(preview.targets.map(t => t.id)).toEqual([f.sessions[0].id]);
    await applySessionManagement(f.series.id, f.user.id, roles, preview.previewId, preview.requestId);
    expect((await db.session.findMany({ where: { seriesId: f.series.id }, orderBy: { startsAt: "asc" } })).map(s => s.capacity)).toEqual([20, 10, 10]);
  });
  it("can return to inheritance after later defaults and preserve an intentional clear", async () => {
    const f = await fixture();
    await change(f, { kind: "sessions", sessionIds: [f.sessions[0].id], patch: { "content.title.es": { mode: "clear" } } });
    await change(f, { kind: "defaults", sessionIds: [], patch: { "content.title.es": { mode: "override", value: "Nuevo programa" } } });
    let state = await db.$transaction(tx => loadSessionState(tx, f.series.id));
    expect((await localizeSessions(state.series, [state.sessions.find(s => s.id === f.sessions[0].id)!], "es"))[0].title).toBe("");
    await change(f, { kind: "sessions", sessionIds: [f.sessions[0].id], patch: { "content.title.es": { mode: "inherit" } } });
    state = await db.$transaction(tx => loadSessionState(tx, f.series.id));
    expect((await localizeSessions(state.series, [state.sessions.find(s => s.id === f.sessions[0].id)!], "es"))[0].title).toBe("Nuevo programa");
  });
  it("rejects stale inventory/catalogue snapshots and payload/key substitution", async () => {
    const f = await fixture();
    const p = await previewSessionManagement(f.series.id, f.user.id, roles, { kind: "sessions", sessionIds: [f.sessions[0].id], patch: { capacity: { mode: "override", value: 12 } } });
    await db.ticketType.update({ where: { id: f.ticket.id }, data: { priceCents: 1100 } });
    await expect(applySessionManagement(f.series.id, f.user.id, roles, p.previewId, p.requestId)).rejects.toMatchObject({ status: 409 });
    await expect(applySessionManagement(f.series.id, f.user.id, roles, p.previewId, randomUUID())).rejects.toMatchObject({ status: 404 });
    expect((await db.session.findUniqueOrThrow({ where: { id: f.sessions[0].id } })).capacity).toBe(10);
  });
  it("rolls back an entire selected batch if one target is blocked", async () => {
    const f = await fixture();
    await paid(f, 1);
    await db.session.update({ where: { id: f.sessions[1].id }, data: { soldCount: 5 } });
    const p = await previewSessionManagement(f.series.id, f.user.id, roles, { kind: "sessions", sessionIds: f.sessions.slice(0, 2).map(s => s.id), patch: { capacity: { mode: "override", value: 3 } } });
    expect(p.blocked).not.toHaveLength(0);
    await expect(applySessionManagement(f.series.id, f.user.id, roles, p.previewId, p.requestId)).rejects.toMatchObject({ status: 409 });
    expect((await db.session.findMany({ where: { seriesId: f.series.id } })).every(s => s.capacity === 10)).toBe(true);
  });
  it("requires deliberate treatment even for an inherited sold schedule template", async () => {
    const f = await fixture();
    await change(f, { kind: "sessions", sessionIds: [f.sessions[0].id], patch: { schedule: { mode: "inherit" } } });
    await paid(f);
    const p = await previewSessionManagement(f.series.id, f.user.id, roles, { kind: "defaults", sessionIds: [], patch: { schedule: { mode: "override", value: { localStart: "19:00", durationMinutes: 120 } } } });
    expect(p.targets).toHaveLength(1);
    expect(p.blocked.join()).toContain("postponement");
    expect(f.sessions[0].startsAt.toISOString().slice(0, 10)).toBe("2099-11-01");
  });
  it("preserves purchased identity/prices/rights, deduplicates locales and replays without duplicate notices", async () => {
    const f = await fixture(), order = await paid(f);
    const before = await db.ticket.findFirstOrThrow({ where: { orderId: order.id } });
    await db.ticket.create({ data: { orderId: order.id, userId: f.user.id, sessionId: f.sessions[0].id, code: randomUUID(), attendeeEmail: ` ${f.user.email.toUpperCase()} `, entitlementSnapshot: { admission: true, giftBag: true } } });
    const p = await change(f, { kind: "sessions", sessionIds: [f.sessions[0].id], patch: { [`ticket.${f.ticket.id}.price`]: { mode: "override", value: 2000 }, [`ticket.${f.ticket.id}.enabled`]: { mode: "override", value: false } },
      schedules: { [f.sessions[0].id]: { startsAt: "2099-12-01T23:00:00.000Z", endsAt: "2099-12-02T01:00:00.000Z" } },
      postponement: { reason: "Venue repair", treatment: "PRESERVE_ADMISSION" },
    });
    expect(p.targets[0].noticeCounts.queued).toBe(1);
    const result = await applySessionManagement(f.series.id, f.user.id, roles, p.previewId, p.requestId);
    expect(result).toMatchObject({ noticeCount: 1 });
    const notices = await db.sessionAttendeeNotice.findMany({ where: { changeId: p.previewId } });
    expect(notices).toHaveLength(1); expect(notices[0]).toMatchObject({ state: "HELD", locale: "es" });
    expect(notices[0].payload).toMatchObject({ treatment: "PRESERVE_ADMISSION", reason: "Venue repair", originalSchedule: { startsAt: f.sessions[0].startsAt.toISOString() } });
    expect(await db.ticket.findUniqueOrThrow({ where: { id: before.id } })).toEqual(before);
    expect((await db.orderLineItem.findMany({ where: { orderId: order.id } }))[0]).toMatchObject({ nameSnapshot: "Original admission", unitPriceCents: 1000 });
    await expect(assertCheckoutCatalogPolicy({ userId: f.user.id, sessionId: f.sessions[0].id, items: [{ ticketTypeId: f.ticket.id, qty: 1 }] })).rejects.toMatchObject({ code: "SESSION_PRODUCT_DISABLED" });
  });
  it("pending-date hold pauses checkout and check-in while preserving ticket codes", async () => {
    const f = await fixture(); await paid(f);
    const ticket = await db.ticket.findFirstOrThrow({ where: { sessionId: f.sessions[0].id } });
    await change(f, { kind: "sessions", sessionIds: [f.sessions[0].id], patch: {}, postponement: { reason: "Date pending", treatment: "HOLD_PENDING_DATE" } });
    await expect(claimAdmission({ ticketId: ticket.id, sessionId: ticket.sessionId, actorId: f.user.id, at: new Date() })).rejects.toMatchObject({ status: 409 });
    await expect(db.$transaction(tx => reserveCatalogCapacityInTransaction(tx, { sessionId: ticket.sessionId, ticketItems: [{ id: f.ticket.id, qty: 1 }], addonItems: [] }))).rejects.toThrow("Session not available");
    expect((await db.ticket.findUniqueOrThrow({ where: { id: ticket.id } })).code).toBe(ticket.code);
  });
  it("safely increases SOLD_OUT capacity and reconciles legacy issued plus held seats", async () => {
    const f = await fixture(1); await paid(f);
    await db.session.update({ where: { id: f.sessions[0].id }, data: { status: "SOLD_OUT" } });
    await change(f, { kind: "sessions", sessionIds: [f.sessions[0].id], patch: { capacity: { mode: "override", value: 4 } } });
    expect((await db.session.findUniqueOrThrow({ where: { id: f.sessions[0].id } })).status).toBe("SCHEDULED");
    await db.order.create({ data: { userId: f.user.id, seriesId: f.series.id, sessionId: f.sessions[0].id, status: "PENDING", subtotalCents: 1000, totalCents: 1000, lineItems: { create: { ticketTypeId: f.ticket.id, nameSnapshot: "Held", qty: 2, unitPriceCents: 1000, totalCents: 2000 } } } });
    const state = await db.$transaction(tx => loadSessionState(tx, f.series.id, [f.sessions[0].id]));
    expect(inventory(state.sessions[0]).minimum).toBe(3);
  });
  it("serializes a concurrent checkout against a capacity preview/apply", async () => {
    const f = await fixture(4);
    const p = await previewSessionManagement(f.series.id, f.user.id, roles, { kind: "sessions", sessionIds: [f.sessions[0].id], patch: { capacity: { mode: "override", value: 2 } } });
    await Promise.allSettled([
      applySessionManagement(f.series.id, f.user.id, roles, p.previewId, p.requestId),
      db.$transaction(tx => reserveCatalogCapacityInTransaction(tx, { sessionId: f.sessions[0].id, ticketItems: [{ id: f.ticket.id, qty: 3 }], addonItems: [] }), { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }),
    ]);
    const current = await db.session.findUniqueOrThrow({ where: { id: f.sessions[0].id } });
    expect(current.soldCount).toBeLessThanOrEqual(current.capacity);
    expect(current.capacity === 2 || current.soldCount === 3).toBe(true);
  });
  it("creates an explicitly dated occurrence from reusable defaults, without recurring dates", async () => {
    const f = await fixture();
    await change(f, { kind: "defaults", sessionIds: [], patch: { capacity: { mode: "override", value: 25 }, schedule: { mode: "override", value: { localStart: "18:30", durationMinutes: 90 } } } });
    const response = await createSession(new Request("http://fixture.invalid/api", { method: "POST", body: JSON.stringify({
      startsAt: "2099-12-24T22:00:00.000Z", endsAt: "2099-12-25T01:00:00.000Z", capacity: 10, useSeriesDefaults: true,
    }), headers: { "Content-Type": "application/json" } }), { params: Promise.resolve({ id: f.series.id }) });
    expect(response.status).toBe(201);
    const data = (await response.json()).data;
    expect(data.capacity).toBe(25); expect(data.startsAt).toBe("2099-12-24T23:30:00.000Z"); expect(data.endsAt).toBe("2099-12-25T01:00:00.000Z");
  });
  it("rejects unsupported field scopes, blank reasons, foreign sessions and restricted artwork", async () => {
    const f = await fixture(), foreign = await fixture();
    await expect(previewSessionManagement(f.series.id, f.user.id, roles, { kind: "sessions", sessionIds: [foreign.sessions[0].id], patch: { capacity: { mode: "inherit" } } })).rejects.toMatchObject({ status: 400 });
    await expect(previewSessionManagement(f.series.id, f.user.id, ["FB_DIRECTOR"], { kind: "sessions", sessionIds: [f.sessions[0].id], patch: { "artwork.es": { mode: "clear" } } })).rejects.toMatchObject({ status: 403 });
    await expect(previewSessionManagement(f.series.id, f.user.id, roles, { kind: "sessions", sessionIds: [f.sessions[0].id], patch: { "referral.SESSION": { mode: "override", value: "new scope" } } })).rejects.toThrow();
    await expect(previewSessionManagement(f.series.id, f.user.id, roles, { kind: "sessions", sessionIds: [f.sessions[0].id], patch: {}, postponement: { reason: "  ", treatment: "HOLD_PENDING_DATE" } })).rejects.toThrow();
  });
  it("combines selected occurrences into one immutable notice per normalized recipient", async () => {
    const f = await fixture(); await paid(f, 0, "pt"); await paid(f, 1, "es");
    const p = await change(f, { kind: "sessions", sessionIds: f.sessions.slice(0, 2).map(s => s.id), patch: {}, postponement: { reason: "Dates pending", treatment: "HOLD_PENDING_DATE" } });
    expect(p.targets.reduce((n, t) => n + t.noticeCounts.queued, 0)).toBe(1);
    const notices = await db.sessionAttendeeNotice.findMany({ where: { changeId: p.previewId } });
    expect(notices).toHaveLength(1);
    expect((notices[0].payload as { occurrences: unknown[] }).occurrences).toHaveLength(2);
  });
  it("rolls back schedule, notice insertion and audit together if durable notice storage fails", async () => {
    const f = await fixture(); await paid(f);
    const p = await previewSessionManagement(f.series.id, f.user.id, roles, { kind: "sessions", sessionIds: [f.sessions[0].id], patch: {}, postponement: { reason: "fixture fail rollback", treatment: "HOLD_PENDING_DATE" } });
    // A test-only constraint, exclusively in the hard-coded temporary database.
    await db.$executeRawUnsafe(`ALTER TABLE "SessionAttendeeNotice" ADD CONSTRAINT fixture_notice_failure CHECK (payload->>'reason' <> 'fixture fail rollback') NOT VALID`);
    try {
      await expect(applySessionManagement(f.series.id, f.user.id, roles, p.previewId, p.requestId)).rejects.toThrow();
      expect((await db.session.findUniqueOrThrow({ where: { id: f.sessions[0].id } })).status).toBe("SCHEDULED");
      expect(await db.sessionAttendeeNotice.count({ where: { changeId: p.previewId } })).toBe(0);
      expect((await db.sessionManagementChange.findUniqueOrThrow({ where: { id: p.previewId } })).state).toBe("PREVIEW");
    } finally { await db.$executeRawUnsafe(`ALTER TABLE "SessionAttendeeNotice" DROP CONSTRAINT fixture_notice_failure`); }
  });
  it("keeps a capacity edit safe against concurrent comp issuance", async () => {
    const f = await fixture(2);
    const p = await previewSessionManagement(f.series.id, f.user.id, roles, { kind: "sessions", sessionIds: [f.sessions[0].id], patch: { capacity: { mode: "override", value: 1 } } });
    const request = () => new Request("http://fixture.invalid/comp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId: f.sessions[0].id, ticketTypeId: f.ticket.id, attendeeName: "Fixture comp", attendeeEmail: f.user.email, reason: "Fixture only" }) });
    await Promise.allSettled([
      applySessionManagement(f.series.id, f.user.id, roles, p.previewId, p.requestId),
      issueComp(request()), issueComp(request()),
    ]);
    const current = await db.session.findUniqueOrThrow({ where: { id: f.sessions[0].id } });
    const issued = await db.ticket.count({ where: { sessionId: current.id } });
    expect(issued).toBeLessThanOrEqual(current.capacity);
    expect(current.soldCount).toBe(issued);
  });
  it("expires a hold atomically and refuses postponement while a checkout is pending", async () => {
    const f = await fixture();
    const pending = await db.order.create({ data: {
      userId: f.user.id, seriesId: f.series.id, sessionId: f.sessions[0].id, status: "PENDING", subtotalCents: 1000, totalCents: 1000,
      lineItems: { create: { ticketTypeId: f.ticket.id, nameSnapshot: "Held product", qty: 1, unitPriceCents: 1000, totalCents: 1000 } },
      events: { create: { eventLabel: CHECKOUT_HOLD_EVENT, createdAt: new Date(Date.now() - 3600000), eventPayload: { expiresAt: new Date(Date.now() - 1800000).toISOString() } } },
    } });
    await db.session.update({ where: { id: f.sessions[0].id }, data: { soldCount: 1 } });
    const p = await previewSessionManagement(f.series.id, f.user.id, roles, { kind: "sessions", sessionIds: [f.sessions[0].id], patch: {}, postponement: { reason: "Pending", treatment: "HOLD_PENDING_DATE" } });
    expect(p.blocked.join()).toContain("pending checkouts");
    await expireCheckoutHoldsForSession(f.sessions[0].id);
    expect((await db.order.findUniqueOrThrow({ where: { id: pending.id } })).status).toBe("CANCELLED");
    expect((await db.session.findUniqueOrThrow({ where: { id: f.sessions[0].id } })).soldCount).toBe(0);
    await expect(applySessionManagement(f.series.id, f.user.id, roles, p.previewId, p.requestId)).rejects.toMatchObject({ status: 409 });
  });
  it("synchronizes active occupancy windows and preserves reservation conflicts on postponement", async () => {
    const f = await fixture(); await paid(f);
    const venue = await db.venue.create({ data: { name: "Fixture venue", slug: `fixture-${randomUUID()}` } });
    await db.series.update({ where: { id: f.series.id }, data: { venueId: venue.id } });
    const block = await db.eventSpaceOccupancy.create({ data: {
      seriesId: f.series.id, sessionId: f.sessions[0].id, venueId: venue.id, scope: "VENUE", status: "ACTIVE",
      eventStartsAt: f.sessions[0].startsAt, eventEndsAt: f.sessions[0].endsAt,
      blockStartsAt: new Date(f.sessions[0].startsAt.getTime() - 1800000), blockEndsAt: new Date(f.sessions[0].endsAt.getTime() + 900000), setupMinutes: 30, resetMinutes: 15,
    } });
    const startsAt = "2099-06-01T23:00:00.000Z", endsAt = "2099-06-02T01:00:00.000Z";
    await change(f, { kind: "sessions", sessionIds: [f.sessions[0].id], patch: {}, schedules: { [f.sessions[0].id]: { startsAt, endsAt } }, postponement: { reason: "New date", treatment: "PRESERVE_ADMISSION" } });
    const updated = await db.eventSpaceOccupancy.findUniqueOrThrow({ where: { id: block.id } });
    expect(updated.eventStartsAt.toISOString()).toBe(startsAt);
    expect(updated.blockStartsAt.toISOString()).toBe("2099-06-01T22:30:00.000Z");
    expect(updated.blockEndsAt.toISOString()).toBe("2099-06-02T01:15:00.000Z");
    await change(f, { kind: "sessions", sessionIds: [f.sessions[0].id], patch: {}, postponement: { reason: "Pending confirmation", treatment: "HOLD_PENDING_DATE" } });
    expect((await db.eventSpaceOccupancy.findUniqueOrThrow({ where: { id: block.id } })).status).toBe("POSTPONED");
  });
  it("preserves legacy sponsor additions while future inherited defaults propagate", async () => {
    const f = await fixture();
    const [a, b, c] = await Promise.all(["A", "B", "C"].map(name => db.entity.create({ data: { displayName: `Sponsor ${name}` } })));
    const tier = await db.sponsorTier.findFirst() ?? await db.sponsorTier.create({ data: { label: "Fixture", key: `fixture-${randomUUID()}` } });
    const flags = { showOnEventPage: true, showOnTicket: true, showOnEmail: true, showOnCheckInView: true };
    await db.sponsorAssignment.create({ data: { scopeType: "SERIES", scopeId: f.series.id, entityId: a.id, tierId: tier.id, ...flags } });
    await db.sponsorAssignment.create({ data: { scopeType: "EVENT", scopeId: f.sessions[0].id, entityId: b.id, tierId: tier.id, ...flags } });
    const p = await change(f, { kind: "defaults", sessionIds: [], patch: { sponsors: { mode: "override", value: [{ entityId: c.id, tierId: tier.id, ...flags }] } } });
    expect(p.targets.map(t => t.id)).toContain(f.sessions[0].id);
    const state = await db.$transaction(tx => loadSessionState(tx, f.series.id, [f.sessions[0].id]));
    expect((effectiveField(state, state.sessions[0], "sponsors").value as { entityId: string }[]).map(s => s.entityId)).toEqual([b.id, c.id]);
    await change(f, { kind: "sessions", sessionIds: [f.sessions[0].id], patch: { sponsors: { mode: "inherit" } } });
    const reset = await db.$transaction(tx => loadSessionState(tx, f.series.id, [f.sessions[0].id]));
    expect((effectiveField(reset, reset.sessions[0], "sponsors").value as { entityId: string }[]).map(s => s.entityId)).toEqual([c.id]);
  });
});
