import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import ts from "typescript";

const m = vi.hoisted(() => ({
  rows: [] as Array<Record<string, any>>, title: "Evening",
  addon: { id: "addon", seriesId: "event", name: "Wine", description: "" },
  auth: vi.fn(), rate: vi.fn(),
}));

function matches(row: Record<string, any>, where: any): boolean {
  if (!where) return true;
  return Object.entries(where).every(([key, condition]: [string, any]) => {
    if (key === "AND") return condition.every((w: any) => matches(row, w));
    if (key === "OR") return condition.some((w: any) => matches(row, w));
    const value = row[key];
    if (condition instanceof Date) return value?.getTime() === condition.getTime();
    if (condition && typeof condition === "object") return Object.entries(condition).every(([op, operand]: [string, any]) => {
      if (op === "in") return operand.includes(value);
      if (op === "lt") return value < operand;
      if (op === "lte") return value <= operand;
      if (op === "gte") return value >= operand;
      return false;
    });
    return value === condition;
  });
}
const db = vi.hoisted(() => ({
  contentTranslation: {
    findUnique: vi.fn(), findMany: vi.fn(), upsert: vi.fn(), updateMany: vi.fn(),
  },
  series: { findUnique: vi.fn() },
  session: { findUnique: vi.fn(), update: vi.fn() },
  experienceAddon: { findFirst: vi.fn(), update: vi.fn() },
  auditLog: { create: vi.fn() }, $queryRaw: vi.fn(), $transaction: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/server/series/legacySessionGuard", () => ({ legacySessionWriteBlocked: vi.fn(async () => false), managedWriteMessage: "Use managed editor" }));
vi.mock("@/server/commerce/sessionInventory", () => ({ lockSessionInventory: vi.fn(async () => {}) }));
vi.mock("@/server/auth/session", () => ({ requireSession: m.auth }));
vi.mock("@/server/rateLimit", () => ({
  checkRateLimitAsync: m.rate, rateLimitedResponse: () => Response.json({ error: "Rate limited" }, { status: 429 }),
}));

import { syncTranslations, localizeContent } from "@/server/i18n/eventTranslations";
import { eventTranslationStatus, finishEventSave, processEventTranslationRequest } from "@/server/i18n/eventTranslationRequest";
import { GET, POST } from "@/app/api/v1/admin/series/[id]/translations/route";
import { PATCH as saveAddon } from "@/app/api/v1/admin/experiences/[id]/addons/[addonId]/route";
import { deeplProvider } from "@/server/i18n/deeplProvider";
import { formattingSignature } from "@/server/i18n/translationHtml";

const context = { params: Promise.resolve({ id: "event" }) };
const request = (retry = false) => new Request("http://localhost/api/v1/admin/series/event/translations", {
  method: "POST", body: JSON.stringify({ retry }), headers: { "content-type": "application/json" },
});
const providerSuccess = () => vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
  const body = JSON.parse(init!.body as string);
  return Response.json({ translations: [{ text: body.target_lang === "ES" ? "Noche" : "Noite" }] });
});
async function source(title = "Evening") {
  m.title = title;
  await syncTranslations(db as never, "Series", "event", { title });
}
beforeEach(() => {
  vi.clearAllMocks(); m.rows = []; m.title = "Evening";
  m.addon = { id: "addon", seriesId: "event", name: "Wine", description: "" };
  vi.stubEnv("DEEPL_AUTH_KEY", "fixture:fx");
  m.auth.mockResolvedValue({ userId: "staff", roles: ["SUPERADMIN"] });
  m.rate.mockResolvedValue({ ok: true });
  db.series.findUnique.mockImplementation(async ({ where }) => where.id === "event"
    ? { id: "event", sessions: [{ id: "date" }], ticketTypes: [{ id: "ticket" }], addons: [{ id: "addon" }] } : null);
  db.contentTranslation.findUnique.mockImplementation(async ({ where }) =>
    m.rows.find(row => matches(row, where.entityType_entityId_fieldName_targetLocale)) ?? null);
  db.contentTranslation.upsert.mockImplementation(async ({ where, create, update }) => {
    const row = m.rows.find(row => matches(row, where.entityType_entityId_fieldName_targetLocale));
    if (row) Object.assign(row, update); else m.rows.push({ id: `row-${m.rows.length}`, ...create });
  });
  db.contentTranslation.findMany.mockImplementation(async ({ where, take }) => structuredClone(
    m.rows.filter(row => matches(row, where)).sort((a, b) => +a.nextAttemptAt - +b.nextAttemptAt).slice(0, take)));
  db.contentTranslation.updateMany.mockImplementation(async ({ where, data }) => {
    const rows = m.rows.filter(row => matches(row, where));
    for (const row of rows) for (const [key, value] of Object.entries(data) as Array<[string, any]>)
      row[key] = value && typeof value === "object" && "increment" in value ? row[key] + value.increment : value;
    return { count: rows.length };
  });
  db.$transaction.mockImplementation(async action => action(db));
  db.experienceAddon.findFirst.mockImplementation(async ({ where }) => matches(m.addon, where) ? { ...m.addon } : null);
  db.experienceAddon.update.mockImplementation(async ({ data }) => Object.assign(m.addon, data));
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.useRealTimers(); });

it("awaits actual adapter ES/PT HTTP responses before returning ready; unchanged saves make no repeated calls", async () => {
  const fetcher = providerSuccess();
  await source();
  const progress = await processEventTranslationRequest("event");
  expect(progress).toMatchObject({ state: "ready", completed: 2, pending: 0 });
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(m.rows.map(r => r.translatedText).sort()).toEqual(["Noche", "Noite"]);
  await source(); await processEventTranslationRequest("event");
  expect(fetcher).toHaveBeenCalledTimes(2);
});

it("an authenticated add-on save remains committed on provider failure and reports saved / retry", async () => {
  const fetcher = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("PRIVATE BODY", { status: 503 }));
  const response = await saveAddon(new Request("http://localhost/addon", {
    method: "PATCH", body: JSON.stringify({ name: "New wine", description: "" }),
  }), { params: Promise.resolve({ id: "event", addonId: "addon" }) });
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body).toMatchObject({ saved: true, addon: { name: "New wine" }, translation: { state: "retry" } });
  expect(m.addon.name).toBe("New wine");
  expect(m.rows.find(r => r.targetLocale === "es" && r.fieldName === "name"))
    .toMatchObject({ sourceText: "New wine", status: "FAILED", lastErrorCode: "PROVIDER_HTTP_503" });
  expect(JSON.stringify(body)).not.toContain("PRIVATE BODY");
  expect(fetcher).toHaveBeenCalledOnce(); // Stop the chunk at the first provider failure.
});

it("explicit Retry respects durable backoff, then resumes without changing saved English", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  const fetcher = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("", { status: 429 }));
  await source(); await processEventTranslationRequest("event");
  await POST(request(true), context);
  expect(fetcher).toHaveBeenCalledOnce();
  expect(m.rows[0].attemptCount).toBe(1);
  vi.setSystemTime(Date.now() + 5001);
  fetcher.mockRestore(); const good = providerSuccess();
  const response = await POST(request(true), context);
  expect((await response.json()).translation).toMatchObject({ state: "ready", pending: 0 });
  expect(m.title).toBe("Evening"); expect(good).toHaveBeenCalledTimes(2);
  expect(m.rate).toHaveBeenCalledWith(expect.objectContaining({ requireDistributed: false, limit: 20 }));
});

it("older provider results cannot overwrite a newer saved source", async () => {
  await source("Before");
  const fetcher = vi.spyOn(globalThis, "fetch").mockImplementationOnce(async () => {
    await source("After");
    return Response.json({ translations: [{ text: "Obsolete" }] });
  });
  await processEventTranslationRequest("event");
  expect(m.title).toBe("After");
  expect(m.rows.every(r => r.sourceText === "After" && r.status !== "COMPLETED")).toBe(true);
  expect((await localizeContent("Series", [{ id: "event", title: m.title }], "es"))[0].title).toBe("After");
  expect(fetcher).toHaveBeenCalledOnce();
  fetcher.mockRestore(); providerSuccess();
  expect((await processEventTranslationRequest("event")).state).toBe("ready");
});

it("legacy session GET is read-only; PATCH commits English then awaits ES/PT", async () => {
  const { GET: readSession, PATCH: saveSession } = await import("@/app/api/v1/admin/sessions/[id]/route");
  const fetcher = providerSuccess();
  db.session.findUnique.mockResolvedValue({ id: "date", title: "Existing" });
  const context = { params: Promise.resolve({ id: "date" }) };
  const read = await readSession(new Request("http://localhost/session") as never, context);
  expect(read.status).toBe(200); expect(fetcher).not.toHaveBeenCalled();
  expect(db.contentTranslation.findMany).not.toHaveBeenCalled();
  db.session.update.mockImplementation(async ({ data }) => ({ id: "date", seriesId: "event", ...data }));
  const saved = await saveSession(new Request("http://localhost/session", {
    method: "PATCH", body: JSON.stringify({ title: "Saved session" }),
  }) as never, context);
  expect(saved.status).toBe(200);
  expect(await saved.json()).toMatchObject({ saved: true, data: { title: "Saved session" }, translation: { state: "ready" } });
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(m.rows.every(row => row.sourceText === "Saved session" && row.status === "COMPLETED")).toBe(true);
});

it("repeated rate limits preserve exponential backoff across explicit retries", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  const fetcher = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("", { status: 429 }));
  await source();
  m.rows[1].status = "COMPLETED"; // Isolate the same field/locale's retry budget.
  await processEventTranslationRequest("event");
  vi.setSystemTime(Date.now() + 5001);
  await processEventTranslationRequest("event", { retry: true });
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(m.rows.find(r => r.status === "FAILED")).toMatchObject({ attemptCount: 2 });
  expect((await eventTranslationStatus("event")).retryAfterMs).toBe(10000);
});

it("concurrent request leases prevent duplicate translation of the same source/locale", async () => {
  await source();
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const fetcher = vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
    await gate; return Response.json({ translations: [{ text: "Translated" }] });
  });
  const first = processEventTranslationRequest("event");
  const second = processEventTranslationRequest("event");
  await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
  release(); await Promise.all([first, second]);
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect((await eventTranslationStatus("event")).state).toBe("ready");
});

it("browser close leaves resumable durable state; reads/visitor localization never translate", async () => {
  await source(); const controller = new AbortController();
  const fetcher = vi.spyOn(globalThis, "fetch").mockImplementationOnce(async () => {
    controller.abort(); return Response.json({ translations: [{ text: "Noche" }] });
  });
  expect(await processEventTranslationRequest("event", { signal: controller.signal }))
    .toMatchObject({ state: "pending", completed: 1, pending: 1 });
  const get = await GET(new Request("http://localhost/status"), context);
  expect((await get.json()).translation.state).toBe("pending");
  await localizeContent("Series", [{ id: "event", title: "Evening" }], "pt");
  expect(fetcher).toHaveBeenCalledOnce();
  fetcher.mockRestore(); const resumed = providerSuccess();
  expect((await (await POST(request(), context)).json()).translation.state).toBe("ready");
  expect(resumed).toHaveBeenCalledOnce();
});

it("does not steal active leases or bypass another event's scope", async () => {
  await source();
  m.rows[0].processingUntil = new Date(Date.now() + 60000);
  m.rows[1].entityId = "another-event";
  const fetcher = providerSuccess();
  expect(await processEventTranslationRequest("event", { retry: true }))
    .toMatchObject({ state: "pending", processing: 1, canContinue: false });
  expect(fetcher).not.toHaveBeenCalled();
});

it("handles missing provider configuration without using OAuth credentials or losing source", async () => {
  vi.stubEnv("DEEPL_AUTH_KEY", "");
  await source(); const fetcher = vi.spyOn(globalThis, "fetch");
  const result = await finishEventSave("event", { data: { title: "Evening" } });
  expect(await result.json()).toMatchObject({ saved: true, translation: { state: "retry" } });
  expect(m.rows[0]).toMatchObject({ sourceText: "Evening", attemptCount: 0, lastErrorCode: "PROVIDER_NOT_CONFIGURED" });
  expect(fetcher).not.toHaveBeenCalled();
});

it("a post-commit status/database outage cannot falsely report an English save failure", async () => {
  db.series.findUnique.mockRejectedValue(new Error("PRIVATE DB DETAILS"));
  const response = await finishEventSave("event", { series: { id: "event" } }, undefined, 201);
  expect(response.status).toBe(201);
  expect(await response.json()).toMatchObject({ saved: true, translation: {
    state: "retry", errorCode: "TRANSLATION_STATUS_UNAVAILABLE",
  } });
});

it.each([["anonymous", 401], ["VIEWER", 403]])("blocks %s continuation before processing", async (role, status) => {
  if (role === "anonymous") m.auth.mockRejectedValue(Object.assign(new Error("No session"), { status: 401 }));
  else m.auth.mockResolvedValue({ userId: "viewer", roles: [role] });
  expect((await POST(request(), context)).status).toBe(status);
  expect((await GET(new Request("http://localhost"), context)).status).toBe(status);
  expect(db.series.findUnique).not.toHaveBeenCalled();
});
it("rate limits and validates continuation inputs without doing provider work", async () => {
  m.rate.mockResolvedValueOnce({ ok: false });
  expect((await POST(request(), context)).status).toBe(429);
  expect((await POST(new Request("http://localhost", { method: "POST", body: '{"entityId":"other"}' }), context)).status).toBe(400);
  expect(db.series.findUnique).not.toHaveBeenCalled();
});

it("propagates bounded cancellation to the adapter without leaking fetch errors", async () => {
  const fetcher = vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
    expect(init?.signal?.aborted).toBe(true); throw new Error("PRIVATE FETCH DETAILS");
  });
  await expect(deeplProvider().translate("Evening", "es", { signal: AbortSignal.abort() })).rejects.toThrow("PROVIDER_UNREACHABLE");
  expect(fetcher).toHaveBeenCalledOnce();
});
it("preserves simple HTML formatting and rejects unsafe or provider-injected markup", async () => {
  expect(formattingSignature("<p>Hello <strong>world</strong><br /></p>")).toBe("p|strong|/strong|br|/p");
  expect(() => formattingSignature('<p onclick="x">Hello</p>')).toThrow("UNSAFE_TRANSLATION_FORMAT");
  expect(() => formattingSignature("<script>bad</script>")).toThrow("UNSAFE_TRANSLATION_FORMAT");
  vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ translations: [{ text: "<p>Hola<img src=x></p>" }] }));
  await expect(deeplProvider().translate("<p>Hello</p>", "es")).rejects.toThrow("UNSAFE_TRANSLATION_FORMAT");
});

it("all PR132 authoring entrypoints await request processing, with normal startup and no translation poller", () => {
  const routes = [
    "series/route.ts", "series/[id]/sessions/route.ts", "sessions/[id]/route.ts",
    "series/[id]/session-management/route.ts", "experiences/route.ts", "experiences/[id]/route.ts",
    "experiences/[id]/ticket-types/route.ts", "experiences/[id]/ticket-types/[ttId]/route.ts",
    "experiences/[id]/addons/[addonId]/route.ts", "experiences/[id]/duplicate/route.ts",
  ];
  for (const route of routes) {
    const text = readFileSync(`src/app/api/v1/admin/${route}`, "utf8");
    const ast = ts.createSourceFile(route, text, ts.ScriptTarget.Latest, true);
    const methods = ast.statements.filter(ts.isFunctionDeclaration)
      .filter(node => node.body?.getText(ast).includes("finishEventSave(")).map(node => node.name?.text);
    expect(methods).toHaveLength(1);
    expect(["POST", "PATCH"]).toContain(methods[0]);
  }
  expect(readFileSync("scripts/deploy-prisma-with-rate-limit-repair.sh", "utf8"))
    .toContain('exec "$NODE_BIN" node_modules/next/dist/bin/next start -p "${PORT:-5000}"');
  expect(readFileSync("worker/index.ts", "utf8")).not.toMatch(/translationQueue|translationWorker|startTranslationPolling/);
  expect(readFileSync("src/server/i18n/translationProcessor.ts", "utf8")).not.toContain("setInterval");
});
