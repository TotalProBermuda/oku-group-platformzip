import { randomUUID } from "node:crypto";
import { Prisma, type HostRole, type SeriesAssignmentRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { syncTranslations } from "@/server/i18n/eventTranslations";
import { applyScheduleTemplate, fieldDefinition, hostRoles, managementInputSchema, modes, patchModes, profileRoles, sponsorValue, type EffectiveField, type FieldModes, type ManagementInput } from "./sessionFields";
import { defaultField, digest, effectiveField, fieldKeys, inventory, loadSessionState, textHash, type ManagedSession, type State } from "./sessionState";
import { noticePayload, postponementRecipients, recipientKey } from "./postponementNotices";
import { lockOccupancySpaces } from "./publicationLifecycle";
import { createReservationConflictRecords } from "@/server/events/eventOccupancyService";
import { applyFinancialAssignments, financialDiffs } from "./sessionFinancialAssignments";

export class SessionManagementError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
const json = (v: unknown): Prisma.InputJsonValue => JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;
export type SessionTarget = {
  id: string; title: string; inventory: ReturnType<typeof inventory>;
  changes: Array<{ field: string; before: EffectiveField; after: EffectiveField }>;
  warnings: string[]; blocked: string[];
  noticeCounts: ReturnType<typeof postponementRecipients>["counts"];
};
function assertFieldPermissions(input: ManagementInput, roles: readonly string[]) {
  if (!roles.includes("SUPERADMIN") && (input.assignmentChanges?.length || Object.keys(input.patch).some(k => fieldDefinition(k)?.restricted)))
    throw new SessionManagementError(403, "Only a superadmin can change artwork, products, ticket rights or profile assignments.");
}
export async function validateIdentities(tx: Prisma.TransactionClient, state: State, input: ManagementInput) {
  const allowed = new Set(fieldKeys(state));
  for (const [key, edit] of Object.entries(input.patch)) {
    if (!allowed.has(key)) throw new SessionManagementError(400, "Field or ticket does not belong to this series.");
    if (edit.mode !== "override") continue;
    const value = fieldDefinition(key)!.schema.parse(edit.value);
    if (key.startsWith("hosts.")) {
      const ids = value as string[];
      if (await tx.entity.count({ where: { id: { in: ids } } }) !== ids.length)
        throw new SessionManagementError(400, "Host entity not found.");
    }
    if (key.startsWith("profiles.")) {
      const ids = value as string[];
      if (await tx.profile.count({ where: { id: { in: ids }, status: "ACTIVE" } }) !== ids.length)
        throw new SessionManagementError(400, "Every assigned profile must be active.");
    }
    if (key === "sponsors") {
      const assignments = sponsorValue.parse(value);
      const entities = [...new Set(assignments.map(s => s.entityId))], tiers = [...new Set(assignments.map(s => s.tierId))];
      if (await tx.entity.count({ where: { id: { in: entities } } }) !== entities.length ||
        await tx.sponsorTier.count({ where: { id: { in: tiers }, isActive: true } }) !== tiers.length)
        throw new SessionManagementError(400, "Sponsor entity or active tier not found.");
    }
  }
}
async function validateEffectiveAssignments(tx: Prisma.TransactionClient, state: State, targets: SessionTarget[]) {
  const entities = new Set<string>(), profiles = new Set<string>(), tiers = new Set<string>();
  for (const target of targets) for (const change of target.changes) {
    if (change.field.startsWith("hosts.") || change.field.startsWith("profiles.")) {
      for (const id of change.after.value as string[] ?? []) (change.field.startsWith("hosts.") ? entities : profiles).add(id);
    } else if (change.field === "sponsors") {
      for (const row of change.after.value as Array<{ entityId: string; tierId: string }> ?? []) { entities.add(row.entityId); tiers.add(row.tierId); }
    }
  }
  const [entityCount, profileCount, tierCount] = await Promise.all([
    tx.entity.count({ where: { id: { in: [...entities] } } }),
    tx.profile.count({ where: { id: { in: [...profiles] }, status: "ACTIVE" } }),
    tx.sponsorTier.count({ where: { id: { in: [...tiers] }, isActive: true } }),
  ]);
  if (entityCount !== entities.size || profileCount !== profiles.size || tierCount !== tiers.size)
    throw new SessionManagementError(409, "An effective host, profile or sponsor is no longer eligible. Refresh the preview.");
}
function normalizedModes(state: State, session: ManagedSession): FieldModes {
  const result = Object.fromEntries(fieldKeys(state).map(key => {
    const current = effectiveField(state, session, key);
    return [key, current.mode === "override" ? { mode: "override", value: current.value } : { mode: current.mode }];
  })) as FieldModes;
  const existing = modes(session.fieldModes).__legacySponsorAdditions;
  if (existing) result.__legacySponsorAdditions = existing;
  else if (!modes(session.fieldModes).sponsors && session.inheritsSeriesSponsors) {
    const direct = state.sponsors.filter(s => s.scopeType === "EVENT" && s.scopeId === session.id && s.isActive).map(s => ({
      entityId: s.entityId, tierId: s.tierId, showOnEventPage: s.showOnEventPage, showOnTicket: s.showOnTicket, showOnEmail: s.showOnEmail, showOnCheckInView: s.showOnCheckInView,
    }));
    if (direct.length) result.__legacySponsorAdditions = { mode: "override", value: direct };
  }
  return result;
}
export function buildManagementPlan(state: State, input: ManagementInput) {
  const nextState: State = input.kind === "defaults"
    ? { ...state, series: { ...state.series, sessionDefaults: json(patchModes(state.series.sessionDefaults, input.patch)) as Prisma.JsonValue } }
    : state;
  const targets: SessionTarget[] = [];
  const financial = financialDiffs(state.series.id, state.financialAssignments ?? [], input);
  const nextSessions = new Map<string, ManagedSession>();
  for (const current of state.sessions) {
    const nextModes = input.kind === "sessions" ? patchModes(normalizedModes(state, current), input.patch) : normalizedModes(state, current);
    if (input.kind === "sessions" && input.patch.sponsors) delete nextModes.__legacySponsorAdditions;
    const next: ManagedSession = { ...current, fieldModes: json(nextModes) as Prisma.JsonValue };
    const changes: SessionTarget["changes"] = [];
    for (const key of Object.keys(input.patch)) {
      const before = effectiveField(state, current, key);
      // Defaults never enroll an override, even if its value happens to match.
      if (input.kind === "defaults" && before.mode !== "inherit") continue;
      // Retain legacy API preview/apply compatibility; new editors author English only.
      const edit = input.patch[key];
      const legacyLocale = key.startsWith("content.") && !key.endsWith(".en");
      const after: EffectiveField = legacyLocale && edit.mode !== "inherit"
        ? { value: edit.mode === "clear" ? null : edit.value, mode: edit.mode, source: edit.mode === "clear" ? "clear" : "override" }
        : effectiveField(nextState, next, key);
      if (digest(before) !== digest(after)) changes.push({ field: key, before, after });
    }
    const scheduled = input.schedules?.[current.id];
    const templateChanged = changes.some(c => c.field === "schedule");
    const schedule = scheduled
      ? { startsAt: new Date(scheduled.startsAt), endsAt: new Date(scheduled.endsAt) }
      : templateChanged ? applyScheduleTemplate(current.startsAt, effectiveField(nextState, next, "schedule").value)
      : { startsAt: current.startsAt, endsAt: current.endsAt };
    const timeChanged = schedule.startsAt.getTime() !== current.startsAt.getTime() || schedule.endsAt.getTime() !== current.endsAt.getTime();
    if (scheduled) {
      // A concrete date edit is an occurrence override, not implicit template inheritance.
      nextModes.schedule = { mode: "override", value: {
        localStart: new Intl.DateTimeFormat("en-GB", { timeZone: "America/Panama", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(schedule.startsAt),
        durationMinutes: (schedule.endsAt.getTime() - schedule.startsAt.getTime()) / 60000,
      } };
      next.fieldModes = json(nextModes) as Prisma.JsonValue;
    }
    if (timeChanged) changes.push({ field: "occurrenceSchedule",
      before: { value: { startsAt: current.startsAt.toISOString(), endsAt: current.endsAt.toISOString() }, source: "override", mode: "override" },
      after: { value: { startsAt: schedule.startsAt.toISOString(), endsAt: schedule.endsAt.toISOString() }, source: "override", mode: "override" },
    });
    const hold = input.postponement?.treatment === "HOLD_PENDING_DATE";
    const isTarget = changes.length > 0 || (input.kind === "sessions" && Boolean(input.postponement));
    if (!isTarget && financial.length) {
      targets.push({ id: current.id, title: current.title ?? state.series.title, inventory: inventory(current), changes: [...financial],
        warnings: ["SERIES financial assignment lifecycle affects future bookings across this entire series; commission terms and historical purchases/earnings are unchanged."],
        blocked: [], noticeCounts: { queued: 0, missingContacts: 0, locales: { en: 0, es: 0, pt: 0 } } });
      nextSessions.set(current.id, current);
      continue;
    }
    if (!isTarget) continue;
    changes.push(...financial);
    const inv = inventory(current), blocked: string[] = [], warnings: string[] = [];
    const capacity = Number(effectiveField(nextState, next, "capacity").value);
    if (capacity < inv.minimum) blocked.push(`Capacity cannot be below ${inv.minimum} committed or held seats.`);
    if (!["SCHEDULED", "SOLD_OUT", "POSTPONED", "PAUSED"].includes(current.status)) blocked.push("This session state cannot be edited.");
    const history = current.soldCount > 0 || current.tickets.length > 0 || current.Order.length > 0;
    if (input.postponement && current.Order.some(o => o.status === "PENDING"))
      blocked.push("Resolve or expire pending checkouts before postponing. In-flight payments cannot be silently moved or notified as completed purchases.");
    if (timeChanged && history && !input.postponement) blocked.push("Ticket or checkout history requires deliberate postponement with reason and treatment.");
    if (input.postponement?.treatment === "PRESERVE_ADMISSION" && (!timeChanged || schedule.startsAt <= new Date()))
      blocked.push("Preserved admission requires a confirmed future replacement schedule.");
    if (input.postponement && current.tickets.some(t => t.ticketStatus === "CHECKED_IN"))
      blocked.push("An occurrence with checked-in attendees requires owner review; postponement is not supported here.");
    if (input.postponement && current.reservationBlocks.some(b => b.arrivals.length > 0))
      blocked.push("Groups that have already arrived require an owner-approved attendance policy before postponement.");
    if (changes.some(c => c.field === "giftBagEnabled" && c.after.value === false) && current.tickets.some(t => t.entitlementSnapshot === null))
      blocked.push("Legacy ticket rights cannot be reconstructed. Disabling gift bags requires owner review.");
    const allHosts = hostRoles.flatMap(role => effectiveField(nextState, next, `hosts.${role}`).value as string[]);
    if (new Set(allHosts).size !== allHosts.length) blocked.push("An entity cannot occupy multiple host roles in one occurrence.");
    if (timeChanged || hold) {
      const conflicts = current.occupancies.reduce((n, o) => n + o.reservationConflicts.filter(c => c.status === "OPEN").length, 0);
      warnings.push(`${current.occupancies.length} occupancy block(s) and ${conflicts} existing open reservation conflict(s) are retained and synchronized; new overlaps are recorded. No reservation is cancelled.`);
    }
    if (input.postponement) warnings.push("Notices will be held for future delivery, not sent. No refund, reissue or transfer is performed.");
    const noticeCounts = input.postponement ? postponementRecipients(current).counts : { queued: 0, missingContacts: 0, locales: { en: 0, es: 0, pt: 0 } };
    next.startsAt = schedule.startsAt; next.endsAt = schedule.endsAt; next.capacity = capacity;
    if (hold) next.status = "POSTPONED";
    else if (input.postponement || current.status === "SOLD_OUT") next.status = inv.minimum >= capacity ? "SOLD_OUT" : "SCHEDULED";
    if (next.status !== current.status) changes.push({ field: "status", before: { value: current.status, source: "override", mode: "override" }, after: { value: next.status, source: "override", mode: "override" } });
    nextSessions.set(current.id, next);
    targets.push({ id: current.id, title: current.title ?? state.series.title, inventory: inv, changes, warnings, blocked, noticeCounts });
  }
  const deliveries = new Map<string, { sessionId: string; email: string; locale: "en" | "es" | "pt"; payloads: ReturnType<typeof noticePayload>[] }>();
  if (input.postponement) {
    for (const target of targets) {
      const current = state.sessions.find(s => s.id === target.id)!, next = nextSessions.get(target.id)!;
      target.noticeCounts.queued = 0;
      target.noticeCounts.locales = { en: 0, es: 0, pt: 0 };
      for (const contact of postponementRecipients(current).recipients) {
        const existing = deliveries.get(contact.email);
        if (existing) existing.payloads.push(noticePayload(current, next, input.postponement, existing.locale, String(effectiveField(state, current, `content.title.${existing.locale}`).value ?? state.series.title)));
        else {
          deliveries.set(contact.email, { sessionId: target.id, email: contact.email, locale: contact.locale, payloads: [noticePayload(current, next, input.postponement, contact.locale, String(effectiveField(state, current, `content.title.${contact.locale}`).value ?? state.series.title))] });
          target.noticeCounts.queued++;
          target.noticeCounts.locales[contact.locale]++;
        }
      }
    }
  }
  return {
    nextState, nextSessions, targets,
    deliveries: [...deliveries.values()],
    blocked: targets.flatMap(t => t.blocked.map(m => `${t.id}: ${m}`)),
    warnings: [
      "Recipient fallback: ticket attendee email, then a buyer with purchased lines; no-contact comps are skipped. Recorded checkout locale is used, otherwise English. One held notice per accepted change and normalized email covers all affected occurrences; conflicting locales use the first stable session/ticket match.",
      ...(input.kind === "defaults" ? ["All affected inheritors are listed separately. Overrides are never silently included."] : []),
      ...(financial.length ? ["SERIES financial assignments affect every occurrence shown, not a session-only override. GLOBAL/VENUE/CAMPAIGN assignments remain in their canonical scope administration. No commission terms, eligibility, links, order attribution or earned amounts change."] : []),
    ],
    defaults: input.kind === "defaults" ? [...Object.keys(input.patch).map(field => ({ field, before: defaultField(state, field), after: defaultField(nextState, field) })), ...financial] : [],
  };
}

export async function previewSessionManagement(seriesId: string, actorId: string, roles: readonly string[], raw: unknown) {
  const input = managementInputSchema.parse(raw);
  assertFieldPermissions(input, roles);
  return prisma.$transaction(async tx => {
    const state = await loadSessionState(tx, seriesId, input.kind === "sessions" ? input.sessionIds : undefined, Boolean(input.assignmentChanges?.length));
    await validateIdentities(tx, state, input);
    const plan = buildManagementPlan(state, input);
    await validateEffectiveAssignments(tx, state, plan.targets);
    const expiresAt = new Date(Date.now() + 15 * 60000), requestId = randomUUID();
    const preview = { targets: plan.targets, blocked: plan.blocked, warnings: plan.warnings, defaults: plan.defaults, expiresAt: expiresAt.toISOString() };
    const record = await tx.sessionManagementChange.create({ data: {
      actorId, seriesId, requestId, payload: json(input), snapshotHash: digest(state), preview: json(preview), expiresAt,
    } });
    return { ...preview, previewId: record.id, requestId };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
}

async function writeTranslation(tx: Prisma.TransactionClient, sessionId: string, field: string, locale: string, value: unknown, source: string) {
  if (locale === "en") return;
  await tx.contentTranslation.upsert({
    where: { entityType_entityId_fieldName_targetLocale: { entityType: "EventSession", entityId: sessionId, fieldName: field, targetLocale: locale } },
    create: { entityType: "EventSession", entityId: sessionId, fieldName: field, targetLocale: locale, sourceLocale: "en", sourceText: source, sourceTextHash: textHash(source), translatedText: typeof value === "string" ? value : "", status: "COMPLETED", provider: "manual-session-management" },
    update: { sourceText: source, sourceTextHash: textHash(source), translatedText: typeof value === "string" ? value : "", status: "COMPLETED", provider: "manual-session-management" },
  });
}
async function writeDefaultTranslations(tx: Prisma.TransactionClient, state: State, keys: string[]) {
  for (const key of keys.filter(k => k.startsWith("content."))) {
    const [, field, locale] = key.split(".");
    const source = String(defaultField(state, `content.${field}.en`).value ?? "");
    if (locale === "en") {
      await syncTranslations(tx, "SeriesSessionDefaults", state.series.id, { [field]: source });
      continue;
    }
    const edit = modes(state.series.sessionDefaults)[key];
    const value = edit?.mode === "override" ? edit.value : edit?.mode === "clear" ? null : defaultField(state, key).value;
    const data = { sourceLocale: "en", sourceText: source, sourceTextHash: textHash(source), translatedText: typeof value === "string" ? value : "", status: "COMPLETED" as const, provider: "manual-session-management" };
    await tx.contentTranslation.upsert({
      where: { entityType_entityId_fieldName_targetLocale: { entityType: "SeriesSessionDefaults", entityId: state.series.id, fieldName: field, targetLocale: locale } },
      create: { entityType: "SeriesSessionDefaults", entityId: state.series.id, fieldName: field, targetLocale: locale, ...data }, update: data,
    });
  }
}

export async function materializeSession(tx: Prisma.TransactionClient, state: State, current: ManagedSession, next: ManagedSession, keys: string[]) {
  const data: Prisma.SessionUpdateInput = { fieldModes: json(next.fieldModes), startsAt: next.startsAt, endsAt: next.endsAt, capacity: next.capacity, status: next.status };
  for (const key of keys) {
    const value = effectiveField(state, next, key).value;
    const [kind, name, locale] = key.split(".");
    if (["giftBagEnabled", "streetsideEnabled", "allowLateSales"].includes(key)) Object.assign(data, { [key]: value });
    if (kind === "artwork") Object.assign(data, { [`flyerImageUrl${name === "en" ? "En" : name === "es" ? "Es" : "Pt"}`]: value });
    if (kind === "artworkMobile") Object.assign(data, { [`flyerImageUrlMobile${name === "en" ? "En" : name === "es" ? "Es" : "Pt"}`]: value });
    if (kind === "content" && locale === "en") {
      Object.assign(data, { [name]: value });
      await syncTranslations(tx, "EventSession", next.id, { [name]: modes(next.fieldModes)[key]?.mode === "inherit" ? null : value ?? null });
    }
    if (kind === "content" && locale !== "en") {
      const mode = modes(next.fieldModes)[key];
      await writeTranslation(tx, next.id, name, locale, mode?.mode === "override" ? mode.value : mode?.mode === "clear" ? null : value, String(effectiveField(state, next, `content.${name}.en`).value ?? ""));
    }
    if (kind === "ticket" && locale === "price") {
      await tx.sessionTicketPrice.upsert({ where: { sessionId_ticketTypeId: { sessionId: next.id, ticketTypeId: name } }, create: { sessionId: next.id, ticketTypeId: name, priceCents: Number(value) }, update: { priceCents: Number(value) } });
    }
  }
  if (keys.some(k => k.startsWith("hosts."))) {
    data.overridesSeriesHost = true;
    // Keep the identity (and any legacy commission metadata) of retained rows.
    const effective = hostRoles.flatMap(role => (effectiveField(state, next, `hosts.${role}`).value as string[]).map((entityId, sortOrder) => ({ entityId, role, sortOrder })));
    await tx.eventHost.deleteMany({ where: { sessionId: next.id, entityId: { notIn: effective.map(h => h.entityId) } } });
    for (const host of effective) await tx.eventHost.upsert({ where: { sessionId_entityId: { sessionId: next.id, entityId: host.entityId } }, create: { sessionId: next.id, ...host }, update: { role: host.role as HostRole, sortOrder: host.sortOrder } });
  }
  if (keys.some(k => k.startsWith("profiles."))) {
    for (const role of profileRoles) {
      const profileIds = effectiveField(state, next, `profiles.${role}`).value as string[];
      await tx.sessionProfileAssignment.deleteMany({ where: { sessionId: next.id, assignmentRole: role, profileId: { notIn: profileIds } } });
      for (const [displayOrder, profileId] of profileIds.entries()) await tx.sessionProfileAssignment.upsert({ where: { sessionId_profileId_assignmentRole: { sessionId: next.id, profileId, assignmentRole: role } }, create: { sessionId: next.id, profileId, assignmentRole: role as SeriesAssignmentRole, displayOrder }, update: { displayOrder } });
    }
  }
  if (keys.includes("sponsors")) {
    data.inheritsSeriesSponsors = false;
    const sponsors = sponsorValue.parse(effectiveField(state, next, "sponsors").value);
    await tx.sponsorAssignment.updateMany({ where: { scopeType: "EVENT", scopeId: next.id, entityId: { notIn: sponsors.map(s => s.entityId) } }, data: { isActive: false } });
    for (const sponsor of sponsors) {
      const retained = await tx.sponsorAssignment.findFirst({ where: { scopeType: "EVENT", scopeId: next.id, entityId: sponsor.entityId } });
      if (retained) await tx.sponsorAssignment.update({ where: { id: retained.id }, data: { ...sponsor, isActive: true } });
      else await tx.sponsorAssignment.create({ data: { scopeType: "EVENT", scopeId: next.id, ...sponsor } });
    }
  }
  await tx.session.update({ where: { id: next.id }, data });
  if (current.startsAt.getTime() !== next.startsAt.getTime() || current.endsAt.getTime() !== next.endsAt.getTime() || current.status !== next.status) {
    const occupancies = await tx.eventSpaceOccupancy.findMany({ where: { sessionId: next.id, status: { not: "CANCELLED" } }, orderBy: [{ venueId: "asc" }, { spaceId: "asc" }] });
    for (const occupancy of occupancies) {
      await lockOccupancySpaces(tx, occupancy.venueId, occupancy.scope, occupancy.spaceId);
      const updated = await tx.eventSpaceOccupancy.update({ where: { id: occupancy.id }, data: {
        eventStartsAt: next.startsAt, eventEndsAt: next.endsAt,
        blockStartsAt: new Date(next.startsAt.getTime() - occupancy.setupMinutes * 60000),
        blockEndsAt: new Date(next.endsAt.getTime() + occupancy.resetMinutes * 60000),
        status: next.status === "POSTPONED" ? "POSTPONED" : state.series.status === "PUBLISHED" ? "ACTIVE" : "DRAFT",
      } });
      if (updated.status === "ACTIVE") await createReservationConflictRecords(tx, updated);
    }
  }
}

export async function applySessionManagement(seriesId: string, actorId: string, roles: readonly string[], previewId: string, requestId: string) {
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT "id" FROM "Series" WHERE "id" = ${seriesId} FOR UPDATE`;
    const record = await tx.sessionManagementChange.findUnique({ where: { id: previewId } });
    if (!record || record.seriesId !== seriesId || record.actorId !== actorId || record.requestId !== requestId) throw new SessionManagementError(404, "Preview not found for this request.");
    const input = managementInputSchema.parse(record.payload);
    assertFieldPermissions(input, roles);
    if (record.state === "APPLIED") return record.result;
    if (record.expiresAt < new Date()) throw new SessionManagementError(409, "Preview expired. Preview again; your draft has not been applied.");
    const ids = input.kind === "sessions" ? input.sessionIds : undefined;
    // A fixed lock order is shared by edits and inventory operations.
    await tx.$queryRaw`SELECT "id" FROM "Session" WHERE "seriesId" = ${seriesId} ORDER BY "id" FOR UPDATE`;
    const state = await loadSessionState(tx, seriesId, ids, Boolean(input.assignmentChanges?.length));
    if (digest(state) !== record.snapshotHash) throw new SessionManagementError(409, "Session, catalogue, assignment or inventory changed. Preview again before saving.");
    await validateIdentities(tx, state, input);
    const plan = buildManagementPlan(state, input);
    await validateEffectiveAssignments(tx, state, plan.targets);
    if (plan.blocked.length) throw new SessionManagementError(409, plan.blocked.join(" "));
    if (input.kind === "defaults" && Object.keys(input.patch).length) {
      await tx.series.update({ where: { id: seriesId }, data: { sessionDefaults: json(plan.nextState.series.sessionDefaults) } });
      await writeDefaultTranslations(tx, plan.nextState, Object.keys(input.patch));
    }
    let noticeCount = 0;
    for (const target of plan.targets) {
      const current = state.sessions.find(s => s.id === target.id)!, next = plan.nextSessions.get(target.id)!;
      const keys = target.changes.map(c => c.field).filter(k => !k.startsWith("referral."));
      if (keys.length || input.postponement) await materializeSession(tx, plan.nextState, current, next, keys);
    }
    await applyFinancialAssignments(tx, seriesId, actorId, record.id, state.financialAssignments ?? [], input);
    for (const delivery of plan.deliveries) {
      await tx.sessionAttendeeNotice.create({ data: {
        changeId: record.id, sessionId: delivery.sessionId, recipientKey: recipientKey(delivery.email), recipientEmail: delivery.email, locale: delivery.locale,
        payload: json({ ...delivery.payloads[0], occurrences: delivery.payloads }), state: "HELD",
      } });
      noticeCount++;
    }
    const result = { changeId: record.id, targetIds: plan.targets.map(t => t.id), noticeCount };
    await tx.auditLog.create({ data: { actorId, action: "series.sessions.management.applied", metadata: json({
      requestId, changeId: record.id, seriesId, kind: input.kind, targets: plan.targets,
      defaults: plan.defaults, reason: input.postponement?.reason ?? null, treatment: input.postponement?.treatment ?? null, noticeCount,
    }) } });
    await tx.sessionManagementChange.update({ where: { id: record.id }, data: { state: "APPLIED", appliedAt: new Date(), result: json(result) } });
    return result;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30000 });
}
