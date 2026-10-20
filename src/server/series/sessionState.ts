import { createHash } from "node:crypto";
import { sessionTranslation } from "@/server/i18n/sessionTranslation";
import { matchesSource } from "@/server/i18n/sourceHash";
import { Prisma } from "@prisma/client";
import { hostRoles, locales, profileRoles, resolveField, modes, type EffectiveField } from "./sessionFields";
import { panamaDateTimeLocalInput } from "@/lib/panamaDateTime";
import { financialInclude, type FinancialAssignment } from "./sessionFinancialAssignments";

export const sessionInclude = {
  reservationBlocks: { orderBy: { id: "asc" as const }, include: { arrivals: true } },
  occupancies: { orderBy: { id: "asc" as const }, include: { reservationConflicts: { orderBy: { id: "asc" as const } } } },
  ticketPrices: { orderBy: { ticketTypeId: "asc" as const } },
  eventHosts: { orderBy: { entityId: "asc" as const } },
  profileAssignments: { orderBy: [{ assignmentRole: "asc" as const }, { profileId: "asc" as const }] },
  tickets: {
    orderBy: { id: "asc" as const },
    include: { order: { include: { user: { select: { email: true } } } } },
  },
  Order: { orderBy: { id: "asc" as const }, include: { lineItems: true, payment: true, events: { where: { eventLabel: "guest-checkout-contact" }, orderBy: { createdAt: "desc" as const } } } },
} satisfies Prisma.SessionInclude;
export const seriesInclude = {
  ticketTypes: { orderBy: { id: "asc" as const } },
  seriesHosts: { orderBy: { entityId: "asc" as const } },
  profileAssignments: { orderBy: [{ assignmentRole: "asc" as const }, { profileId: "asc" as const }] },
} satisfies Prisma.SeriesInclude;
export type ManagedSession = Prisma.SessionGetPayload<{ include: typeof sessionInclude }>;
export type ManagedSeries = Prisma.SeriesGetPayload<{ include: typeof seriesInclude }>;
export type Translation = Prisma.ContentTranslationGetPayload<Prisma.ContentTranslationDefaultArgs>;
export type Sponsor = Prisma.SponsorAssignmentGetPayload<{}>;
export type State = { series: ManagedSeries; sessions: ManagedSession[]; translations: Translation[]; sponsors: Sponsor[]; financialAssignments?: FinancialAssignment[] };

export function digest(value: unknown): string {
  const canonical = (v: unknown): unknown => {
    if (v instanceof Date) return v.toISOString();
    if (Array.isArray(v)) return v.map(canonical);
    if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)).map(([k, x]) => [k, canonical(x)]));
    return v;
  };
  return createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
}
export function textHash(value: string) { return createHash("sha256").update(value).digest("hex"); }

export async function loadSessionState(tx: Prisma.TransactionClient, seriesId: string, ids?: string[], withFinancial = false): Promise<State> {
  const series = await tx.series.findUnique({ where: { id: seriesId }, include: seriesInclude });
  if (!series) throw Object.assign(new Error("Series not found"), { status: 404 });
  const sessions = await tx.session.findMany({
    where: { seriesId, ...(ids ? { id: { in: ids } } : {}) },
    orderBy: { id: "asc" }, take: ids ? 51 : 201, include: sessionInclude,
  });
  if (sessions.length > (ids ? 50 : 200)) throw Object.assign(new Error("This selection is too large. Manage at most 50 selected sessions or 200 default inheritors."), { status: 409 });
  if (ids && sessions.length !== ids.length) throw Object.assign(new Error("Every selected session must belong to this series"), { status: 400 });
  const [translations, sponsors] = await Promise.all([
    tx.contentTranslation.findMany({ where: { OR: [{ entityType: "Series", entityId: seriesId }, { entityType: "SeriesSessionDefaults", entityId: seriesId }, { entityType: "EventSession", entityId: { in: sessions.map(s => s.id) } }] }, orderBy: { id: "asc" } }),
    tx.sponsorAssignment.findMany({ where: { OR: [{ scopeType: "SERIES", scopeId: seriesId }, { scopeType: "EVENT", scopeId: { in: sessions.map(s => s.id) } }] }, orderBy: { id: "asc" } }),
  ]);
  const financialAssignments = withFinancial ? await tx.referralAssignment.findMany({
    where: { scopeType: "SERIES", scopeId: seriesId }, include: financialInclude, orderBy: { id: "asc" },
  }) : undefined;
  return { series, sessions, translations, sponsors, ...(financialAssignments ? { financialAssignments } : {}) };
}

export function fieldKeys(state: State): string[] {
  return [
    "capacity", "schedule", "giftBagEnabled", "streetsideEnabled", "allowLateSales",
    ...["title", "subtitle", "description"].flatMap(f => locales.map(l => `content.${f}.${l}`)),
    ...locales.map(l => `artwork.${l}`),
    ...locales.map(l => `artworkMobile.${l}`),
    ...state.series.ticketTypes.flatMap(t => [`ticket.${t.id}.enabled`, `ticket.${t.id}.price`]),
    ...hostRoles.map(r => `hosts.${r}`), "sponsors", ...profileRoles.map(r => `profiles.${r}`),
  ];
}
function translated(state: State, entityType: string, entityId: string, fieldName: string, locale: string, source: string | null) {
  if (locale === "en") return source;
  return state.translations.find(t => t.entityType === entityType && t.entityId === entityId && t.fieldName === fieldName && t.targetLocale === locale && t.status === "COMPLETED" && t.sourceTextHash === textHash(source ?? ""))?.translatedText ?? null;
}
function sponsorValues(rows: Sponsor[]) {
  return rows.filter(s => s.isActive).map(s => ({
    entityId: s.entityId, tierId: s.tierId, showOnEventPage: s.showOnEventPage,
    showOnTicket: s.showOnTicket, showOnEmail: s.showOnEmail, showOnCheckInView: s.showOnCheckInView,
  }));
}
export function effectiveField(state: State, session: ManagedSession, key: string): EffectiveField {
  const { series } = state;
  const [kind, name, locale] = key.split(".");
  let legacy: unknown = null, base: unknown = null, inherits = true;
  // capacityTotal is a series aggregate, never a per-occurrence template.
  if (key === "capacity") { legacy = session.capacity; base = session.capacity; inherits = false; }
  else if (key === "schedule") {
    legacy = { localStart: panamaDateTimeLocalInput(session.startsAt).slice(11), durationMinutes: (session.endsAt.getTime() - session.startsAt.getTime()) / 60000 };
    base = legacy; inherits = false;
  } else if (["giftBagEnabled", "streetsideEnabled", "allowLateSales"].includes(key)) {
    legacy = session[key as "giftBagEnabled"]; base = false; inherits = false;
  } else if (kind === "content") {
    const field = name as "title" | "subtitle" | "description";
    if (locale !== "en") {
      const englishKey = `content.${name}.en`;
      const english = effectiveField(state, session, englishKey);
      const localMode = modes(session.fieldModes)[key];
      const reviewed = state.translations.some(row => row.entityType === "EventSession" && row.entityId === session.id && row.fieldName === name && row.targetLocale === locale && row.status === "COMPLETED" && row.provider === "manual-session-management" && matchesSource(row.sourceTextHash, String(english.value ?? "")));
      const value = english.mode === "clear" ? null : sessionTranslation(state.translations, series, session, english, name, locale) ?? english.value;
      return reviewed && localMode && localMode.mode !== "inherit" ? { value, mode: localMode.mode, source: localMode.mode === "clear" ? "clear" : "override" } : { ...english, value };
    }
    legacy = translated(state, "EventSession", session.id, field, locale, session[field]);
    base = translated(state, "Series", series.id, field, locale, series[field]) ?? series[field];
    inherits = legacy === null;
  } else if (kind === "artwork") {
    const field = `flyerImageUrl${name === "en" ? "En" : name === "es" ? "Es" : "Pt"}` as "flyerImageUrlEn";
    const seriesField = `heroImageUrl${name === "en" ? "En" : name === "es" ? "Es" : "Pt"}` as "heroImageUrlEn";
    legacy = session[field] ?? (name === "en" ? session.flyerImageUrl : null);
    base = series[seriesField] ?? series.heroImageUrlEn ?? series.heroImageUrl;
    inherits = legacy === null;
  } else if (kind === "artworkMobile") {
    const field = `flyerImageUrlMobile${locale === "en" ? "En" : locale === "es" ? "Es" : "Pt"}` as "flyerImageUrlMobileEn";
    legacy = session[field];
    // Mobile art has no series-level counterpart; inherit means use the normal
    // localized session flyer as the responsive fallback rather than duplicating it.
    base = null;
    inherits = legacy === null;
  } else if (kind === "ticket") {
    const ticket = series.ticketTypes.find(t => t.id === name);
    if (!ticket) throw Object.assign(new Error("Ticket must belong to this series"), { status: 400 });
    if (locale === "price") {
      legacy = session.ticketPrices.find(p => p.ticketTypeId === name)?.priceCents ?? null;
      base = ticket.priceCents; inherits = legacy === null;
    } else { base = ticket.ticketStatus === "ACTIVE"; legacy = base; }
  } else if (kind === "hosts") {
    legacy = session.eventHosts.filter(h => h.role === name).map(h => h.entityId);
    base = series.seriesHosts.filter(h => h.role === name).map(h => h.entityId);
    inherits = !session.overridesSeriesHost;
  } else if (kind === "profiles") {
    legacy = session.profileAssignments.filter(p => p.assignmentRole === name).map(p => p.profileId);
    base = series.profileAssignments.filter(p => p.assignmentRole === name).map(p => p.profileId);
    inherits = !(legacy as string[]).length;
  } else if (key === "sponsors") {
    const direct = sponsorValues(state.sponsors.filter(s => s.scopeType === "EVENT" && s.scopeId === session.id));
    base = sponsorValues(state.sponsors.filter(s => s.scopeType === "SERIES" && s.scopeId === series.id));
    legacy = session.inheritsSeriesSponsors
      ? [...direct, ...(base as typeof direct).filter(s => !direct.some(d => d.entityId === s.entityId))]
      : direct;
    const savedAdditions = modes(session.fieldModes).__legacySponsorAdditions;
    const explicit = modes(session.fieldModes).sponsors;
    const additions = savedAdditions?.mode === "override" ? savedAdditions.value as typeof direct : !explicit && session.inheritsSeriesSponsors ? direct : [];
    if ((!explicit || explicit.mode === "inherit") && (session.inheritsSeriesSponsors || savedAdditions || explicit?.mode === "inherit")) {
      const inherited = resolveField(key, { sponsors: { mode: "inherit" } }, series.sessionDefaults, null, true, base);
      const shared = inherited.value as typeof direct;
      return { ...inherited, value: [...additions, ...(shared ?? []).filter(s => !additions.some(d => d.entityId === s.entityId))] };
    }
    inherits = false;
  }
  return resolveField(key, session.fieldModes, series.sessionDefaults, legacy, inherits, base);
}
export function defaultField(state: State, key: string): EffectiveField {
  if (key === "capacity" && modes(state.series.sessionDefaults).capacity?.mode !== "override")
    return { value: null, source: "series", mode: "inherit" };
  const dummy = state.sessions[0];
  if (dummy) {
    const englishKey = key.startsWith("content.") ? key.replace(/\.(es|pt)$/, ".en") : key;
    const field = effectiveField(state, { ...dummy, fieldModes: { [key]: { mode: "inherit" }, [englishKey]: { mode: "inherit" } } }, key);
    const edit = modes(state.series.sessionDefaults)[key];
    return { ...field, mode: edit?.mode ?? "inherit", source: edit?.mode === "clear" ? "clear" : "series" };
  }
  const [kind, name, locale] = key.split(".");
  let base: unknown = null;
  if (key === "capacity") base = null;
  else if (key === "schedule") base = { localStart: "18:00", durationMinutes: 180 };
  else if (["giftBagEnabled", "streetsideEnabled", "allowLateSales"].includes(key)) base = false;
  else if (kind === "content") {
    const field = name as "title" | "subtitle" | "description";
    base = translated(state, "Series", state.series.id, field, locale, state.series[field]) ?? state.series[field];
  } else if (kind === "artwork") base = state.series[`heroImageUrl${name === "en" ? "En" : name === "es" ? "Es" : "Pt"}` as "heroImageUrlEn"] ?? state.series.heroImageUrlEn ?? state.series.heroImageUrl;
  else if (kind === "artworkMobile") base = null;
  else if (kind === "ticket") {
    const ticket = state.series.ticketTypes.find(t => t.id === name);
    base = locale === "price" ? ticket?.priceCents ?? 0 : ticket?.ticketStatus === "ACTIVE";
  } else if (kind === "hosts") base = state.series.seriesHosts.filter(h => h.role === name).map(h => h.entityId);
  else if (kind === "profiles") base = state.series.profileAssignments.filter(p => p.assignmentRole === name).map(p => p.profileId);
  else if (key === "sponsors") base = sponsorValues(state.sponsors.filter(s => s.scopeType === "SERIES" && s.scopeId === state.series.id));
  const edit = modes(state.series.sessionDefaults)[key];
  return { value: edit?.mode === "override" ? edit.value : edit?.mode === "clear" ? null : base, source: "series", mode: edit?.mode ?? "inherit" };
}
export function inventory(session: ManagedSession) {
  const active = session.tickets.filter(t => !["CANCELLED", "REFUNDED", "VOIDED"].includes(t.ticketStatus));
  const seatQty = (o: ManagedSession["Order"][number]) => o.lineItems.filter(l => l.ticketTypeId).reduce((sum, l) => sum + l.qty, 0);
  const held = session.Order.filter(o => o.status === "PENDING").reduce((sum, o) => sum + seatQty(o), 0);
  const paid = session.Order.filter(o => ["PAID", "PARTIALLY_REFUNDED"].includes(o.status)).reduce((sum, o) => sum + Math.max(seatQty(o), active.filter(t => t.orderId === o.id).length), 0);
  return { sold: session.soldCount, held, issued: active.length, minimum: Math.max(session.soldCount, paid + held, active.length + held) };
}
