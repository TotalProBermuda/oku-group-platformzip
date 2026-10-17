import { beforeEach, describe, expect, it, vi } from "vitest";
const db = vi.hoisted(() => ({
  contentTranslation: { findUnique: vi.fn(), findMany: vi.fn(), upsert: vi.fn(), updateMany: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
import { syncTranslations, localizeEventCatalog } from "@/server/i18n/eventTranslations";
import { sourceHash } from "@/server/i18n/sourceHash";
import { deeplProvider, TranslationError } from "@/server/i18n/deeplProvider";
import { drainTranslations } from "@/server/i18n/translationProcessor";
import { localizeSessions } from "@/server/series/localizeSessions";
import { isTranslatableField } from "@/config/translatableFields";

const record = (overrides = {}) => ({ id: "translation", entityType: "Series", entityId: "series", fieldName: "title", sourceLocale: "en", targetLocale: "es",
  sourceText: "Evening", sourceTextHash: sourceHash("Evening"), translatedText: "Noche", status: "PENDING", attemptCount: 0, processingUntil: null, nextAttemptAt: new Date(0), ...overrides });
beforeEach(() => {
  vi.restoreAllMocks(); vi.clearAllMocks();
  db.contentTranslation.findUnique.mockResolvedValue(null);
  db.contentTranslation.findMany.mockResolvedValue([]);
  db.contentTranslation.updateMany.mockResolvedValue({ count: 1 });
});
describe("single-source event translation records", () => {
  it.each(["Series", "EventSession", "SeriesSessionDefaults", "TicketType", "ExperienceAddon"] as const)("registers English text for %s only, with two target languages", async entity => {
    const field = entity === "TicketType" || entity === "ExperienceAddon" ? "name" : "title";
    await syncTranslations(db as never, entity, "entity", { [field]: "Evening", heroImageUrlEs: "/art.png", priceCents: 900, id: "identity" });
    expect(db.contentTranslation.upsert).toHaveBeenCalledTimes(2);
    expect(db.contentTranslation.upsert.mock.calls.map(([arg]) => arg.create.targetLocale)).toEqual(["es", "pt"]);
    expect(db.contentTranslation.upsert.mock.calls[0][0].create).toMatchObject({ sourceLocale: "en", sourceTextHash: sourceHash("Evening"), status: "PENDING" });
  });
  it.each(["countdownLabel", "seoTitle", "seoDescription"])("includes series %s", field => expect(isTranslatableField("Series", field)).toBe(true));
  it("does not requeue unchanged completed translations (including historical truncated hashes)", async () => {
    db.contentTranslation.findUnique.mockResolvedValue(record({ status: "COMPLETED", sourceTextHash: sourceHash("Evening").slice(0, 16) }));
    await syncTranslations(db as never, "Series", "series", { title: "Evening" });
    expect(db.contentTranslation.upsert).not.toHaveBeenCalled();
  });
  it("invalidates old manual translations and in-flight results on a source change", async () => {
    db.contentTranslation.findUnique.mockResolvedValue(record({ status: "COMPLETED", provider: "manual-session-management" }));
    await syncTranslations(db as never, "Series", "series", { title: "New evening" });
    expect(db.contentTranslation.upsert.mock.calls[0][0].update).toMatchObject({ status: "STALE", translatedText: "", attemptCount: 0, processingUntil: null, sourceTextHash: sourceHash("New evening") });
  });
  it("clearing English clears translations without sending empty text to the provider", async () => {
    db.contentTranslation.findUnique.mockResolvedValue(record());
    await syncTranslations(db as never, "Series", "series", { description: null });
    expect(db.contentTranslation.upsert.mock.calls[0][0].update).toMatchObject({ sourceText: "", translatedText: "", status: "COMPLETED" });
  });
});
describe("guest mapping and English fallback", () => {
  const series = { id: "series", title: "Evening", description: "Current description", heroImageUrlEs: "/es.png",
    ticketTypes: [{ id: "ticket", name: "Admission", description: "Includes dinner" }], addons: [{ id: "addon", name: "Pairing", description: "Wine" }] };
  it.each(["es", "pt"])("localizes series, tickets and add-ons together in %s without touching artwork/ids", async locale => {
    db.contentTranslation.findMany.mockImplementation(async ({ where }) => [
      record({ entityType: "Series", entityId: "series", status: "COMPLETED" }),
      record({ entityType: "TicketType", entityId: "ticket", fieldName: "name", sourceTextHash: sourceHash("Admission"), translatedText: "Entrada", status: "COMPLETED" }),
      record({ entityType: "ExperienceAddon", entityId: "addon", fieldName: "description", sourceTextHash: sourceHash("Wine"), translatedText: "Vino", status: "COMPLETED" }),
    ].filter(row => row.entityType === where.entityType));
    const [mapped] = await localizeEventCatalog([series], locale);
    expect(mapped).toMatchObject({ id: "series", title: "Noche", heroImageUrlEs: "/es.png", ticketTypes: [{ id: "ticket", name: "Entrada" }], addons: [{ id: "addon", description: "Vino" }] });
    expect(series.title).toBe("Evening");
  });
  it.each(["en", "unknown"])("uses English without querying translations for %s", async locale => {
    expect(await localizeEventCatalog([series], locale)).toEqual([series]);
    expect(db.contentTranslation.findMany).not.toHaveBeenCalled();
  });
  it("rejects a completed translation with an obsolete hash", async () => {
    db.contentTranslation.findMany.mockResolvedValue([record({ status: "COMPLETED", sourceTextHash: sourceHash("Old title") })]);
    expect((await localizeEventCatalog([series], "es"))[0].title).toBe("Evening");
  });
  it("requests completed records only (pending, stale and failed are never eligible)", async () => {
    await localizeEventCatalog([series], "es");
    for (const [query] of db.contentTranslation.findMany.mock.calls) expect(query.where.status).toBe("COMPLETED");
  });
  it("keeps a session-specific English description while its translation is pending, rather than substituting series text", async () => {
    const [session] = await localizeSessions(series, [{ id: "session", description: "Date-only details" }], "es");
    expect(session.description).toBe("Date-only details");
  });
  it("uses current session translations and ignores old per-language field mode values", async () => {
    db.contentTranslation.findMany.mockResolvedValue([record({ entityType: "EventSession", entityId: "session", fieldName: "description", sourceTextHash: sourceHash("Date-only details"), translatedText: "Esta fecha", status: "COMPLETED" })]);
    const [session] = await localizeSessions(series, [{ id: "session", description: "Date-only details", fieldModes: { "content.description.es": { mode: "override", value: "Obsolete" } } }], "es");
    expect(session.description).toBe("Esta fecha");
  });
  it("uses SeriesSessionDefaults translation when English inherits customized defaults", async () => {
    db.contentTranslation.findMany.mockResolvedValue([record({ entityType: "SeriesSessionDefaults", fieldName: "description", sourceTextHash: sourceHash("Default details"), translatedText: "Detalles", status: "COMPLETED" })]);
    const [session] = await localizeSessions({ ...series, sessionDefaults: { "content.description.en": { mode: "override", value: "Default details" } } }, [{ id: "session", description: null }], "es");
    expect(session.description).toBe("Detalles");
  });
});
describe("durable processor, retries and concurrency", () => {
  it("processes durable records independently of Redis and only commits to the claimed source hash/lease", async () => {
    db.contentTranslation.findMany.mockResolvedValue([record()]);
    const translate = vi.fn().mockResolvedValue("Noche");
    await drainTranslations({ translate });
    expect(translate).toHaveBeenCalledWith("Evening", "es");
    expect(db.contentTranslation.updateMany.mock.calls[1][0]).toMatchObject({ where: { id: "translation", sourceTextHash: sourceHash("Evening"), processingUntil: expect.any(Date) }, data: { status: "COMPLETED", translatedText: "Noche", provider: "deepl" } });
  });
  it("does not call the provider when another worker already claimed the row", async () => {
    db.contentTranslation.findMany.mockResolvedValue([record()]);
    db.contentTranslation.updateMany.mockResolvedValue({ count: 0 });
    const translate = vi.fn();
    await drainTranslations({ translate });
    expect(translate).not.toHaveBeenCalled();
  });
  it("discards an in-flight completion after the source changed", async () => {
    db.contentTranslation.findMany.mockResolvedValue([record()]);
    db.contentTranslation.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    await drainTranslations({ translate: vi.fn().mockResolvedValue("Outdated result") });
    expect(db.contentTranslation.updateMany.mock.calls[1][0].where.sourceTextHash).toBe(sourceHash("Evening"));
    expect(db.contentTranslation.upsert).not.toHaveBeenCalled();
  });
  it.each([
    [new TranslationError("PROVIDER_UNREACHABLE"), 1, "PROVIDER_UNREACHABLE"],
    [new TranslationError("PROVIDER_NOT_CONFIGURED"), 0, "PROVIDER_NOT_CONFIGURED"],
    [new TranslationError("PROVIDER_HTTP_403", false), 6, "PROVIDER_HTTP_403"],
    [new Error("PRIVATE CONTENT"), 1, "TRANSLATION_FAILED"],
  ])("stores only safe failure metadata, with bounded retries", async (error, attempts, code) => {
    db.contentTranslation.findMany.mockResolvedValue([record()]);
    await drainTranslations({ translate: vi.fn().mockRejectedValue(error) });
    const update = db.contentTranslation.updateMany.mock.calls[1][0].data;
    expect(update).toMatchObject({ status: "FAILED", lastErrorCode: code, attemptCount: attempts, processingUntil: null });
    expect(update.nextAttemptAt.getTime()).toBeGreaterThan(Date.now());
    expect(JSON.stringify(update)).not.toContain("PRIVATE CONTENT");
  });
});
describe("DeepL adapter and privacy", () => {
  it("requires DEEPL_AUTH_KEY and never substitutes Google OAuth credentials", async () => {
    vi.stubEnv("DEEPL_AUTH_KEY", "");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "oauth-is-not-a-translation-key");
    const fetcher = vi.spyOn(globalThis, "fetch");
    await expect(deeplProvider().translate("PRIVATE CONTENT", "es")).rejects.toThrow("PROVIDER_NOT_CONFIGURED");
    expect(fetcher).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });
  it("uses DeepL free endpoint, English source and Brazilian Portuguese, preserving HTML", async () => {
    vi.stubEnv("DEEPL_AUTH_KEY", "fixture:fx");
    const fetcher = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ translations: [{ text: "<p>Noite</p>" }] })));
    expect(await deeplProvider().translate("<p>Evening</p>", "pt")).toBe("<p>Noite</p>");
    expect(fetcher).toHaveBeenCalledWith("https://api-free.deepl.com/v2/translate", expect.objectContaining({ body: JSON.stringify({ text: ["<p>Evening</p>"], source_lang: "EN", target_lang: "PT-BR", tag_handling: "html" }) }));
    vi.unstubAllEnvs();
  });
  it.each([403, 429, 456, 500])("never exposes provider response bodies on HTTP %s", async status => {
    vi.stubEnv("DEEPL_AUTH_KEY", "fixture");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("PRIVATE CONTENT fixture-key", { status }));
    await expect(deeplProvider().translate("PRIVATE CONTENT", "es")).rejects.toThrow(`PROVIDER_HTTP_${status}`);
    vi.unstubAllEnvs();
  });
});
