import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { drainTranslations } from "./translationProcessor";
import type { TranslationProvider } from "./deeplProvider";
import type { Prisma } from "@prisma/client";

export interface TranslationProgress {
  seriesId: string;
  state: "ready" | "pending" | "retry";
  completed: number;
  pending: number;
  failed: number;
  processing: number;
  canContinue: boolean;
  retryAfterMs: number;
  errorCode?: string;
}

async function eventScope(seriesId: string) {
  const event = await prisma.series.findUnique({ where: { id: seriesId },
    select: { id: true, sessions: { select: { id: true } },
      ticketTypes: { select: { id: true } }, addons: { select: { id: true } } } });
  if (!event) throw Object.assign(new Error("Series not found"), { status: 404 });
  return { OR: [
    { entityType: "Series", entityId: seriesId },
    { entityType: "SeriesSessionDefaults", entityId: seriesId },
    { entityType: "EventSession", entityId: { in: event.sessions.map(s => s.id) } },
    { entityType: "TicketType", entityId: { in: event.ticketTypes.map(t => t.id) } },
    { entityType: "ExperienceAddon", entityId: { in: event.addons.map(a => a.id) } },
  ] };
}

function summarize(seriesId: string, rows: Array<{
  status: string; nextAttemptAt: Date; processingUntil: Date | null; attemptCount: number;
}>): TranslationProgress {
  const now = Date.now();
  const pending = rows.filter(r => r.status !== "COMPLETED");
  const failed = pending.filter(r => r.status === "FAILED").length;
  const processing = pending.filter(r => r.processingUntil && r.processingUntil.getTime() > now).length;
  const due = pending.filter(r => (!r.processingUntil || r.processingUntil.getTime() <= now)
    && r.nextAttemptAt.getTime() <= now && r.attemptCount < 6);
  const blocked = failed ? pending.filter(r => r.status === "FAILED") : pending;
  const next = blocked.map(r => Math.max(r.nextAttemptAt.getTime(), r.processingUntil?.getTime() ?? 0));
  return { seriesId, state: !pending.length ? "ready" : failed ? "retry" : "pending",
    completed: rows.length - pending.length, pending: pending.length, failed, processing,
    canContinue: !failed && due.length > 0,
    retryAfterMs: next.length ? Math.max(0, (failed ? Math.max(...next) : Math.min(...next)) - now) : 0 };
}

/** Read metadata only. GET/public rendering never translates. */
export async function eventTranslationStatus(seriesId: string) {
  const scope = await eventScope(seriesId);
  const rows = await prisma.contentTranslation.findMany({ where: { AND: [scope,
    { targetLocale: { in: ["es", "pt"] }, sourceLocale: "en" }] },
    select: { status: true, nextAttemptAt: true, processingUntil: true, attemptCount: true } });
  return summarize(seriesId, rows);
}

/** English and durable status are already committed before any provider IO. */
export async function processEventTranslationRequest(seriesId: string, options: {
  retry?: boolean; signal?: AbortSignal; provider?: TranslationProvider;
} = {}): Promise<TranslationProgress> {
  const scope = await eventScope(seriesId);
  const now = new Date();
  if (options.retry) {
    // Manual retry cannot bypass persisted backoff or steal an unexpired lease.
    const due: Prisma.ContentTranslationWhereInput = { AND: [scope, {
      status: "FAILED", nextAttemptAt: { lte: now }, sourceLocale: "en",
      targetLocale: { in: ["es", "pt"] },
      OR: [{ processingUntil: null }, { processingUntil: { lte: now } }],
    }] };
    await prisma.contentTranslation.updateMany({ where: { AND: [due, { attemptCount: { lt: 6 } }] },
      data: { status: "PENDING", lastErrorCode: null } });
    // Only an explicit retry may re-arm an exhausted/permanent-failure budget.
    await prisma.contentTranslation.updateMany({ where: { AND: [due, { attemptCount: { gte: 6 } }] },
      data: { status: "PENDING", attemptCount: 0, lastErrorCode: null } });
  }
  // A failed row gates the whole event until explicit retry/backoff permits it.
  // Otherwise another due locale could immediately bypass a provider 429.
  const before = await eventTranslationStatus(seriesId);
  if (before.failed || options.signal?.aborted) return before;
  const deadline = AbortSignal.timeout(10_000);
  const signal = options.signal ? AbortSignal.any([deadline, options.signal]) : deadline;
  await drainTranslations(options.provider, 4, signal, scope);
  return eventTranslationStatus(seriesId);
}

/** Preserve successful English saves even if provider/status processing fails. */
export async function finishEventSave(seriesId: string, body: Record<string, unknown>, request?: Request, status = 200) {
  let translation: TranslationProgress;
  try { translation = await processEventTranslationRequest(seriesId, { signal: request?.signal }); }
  catch { translation = { seriesId, state: "retry", completed: 0, pending: 0,
    failed: 0, processing: 0, canContinue: false, retryAfterMs: 5000,
    errorCode: "TRANSLATION_STATUS_UNAVAILABLE" }; }
  return NextResponse.json({ ...body, saved: true, translation }, { status });
}
