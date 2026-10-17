import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { deeplProvider, TranslationError, type TranslationProvider } from "./deeplProvider";

/** Only called and awaited by authenticated editor requests; never by a timer. */
export async function drainTranslations(provider: TranslationProvider = deeplProvider(), limit = 4, signal?: AbortSignal, scope: Prisma.ContentTranslationWhereInput = {}) {
  if (signal?.aborted) return 0;
  const now = new Date();
  const rows = await prisma.contentTranslation.findMany({
    where: { AND: [scope, { sourceLocale: "en", targetLocale: { in: ["es", "pt"] }, status: { in: ["PENDING", "STALE", "FAILED"] },
      attemptCount: { lt: 6 }, nextAttemptAt: { lte: now }, OR: [{ processingUntil: null }, { processingUntil: { lt: now } }] }] },
    orderBy: { nextAttemptAt: "asc" }, take: limit,
  });
  for (const row of rows) {
    if (signal?.aborted) break;
    const processingUntil = new Date(Date.now() + 60_000);
    const claim = await prisma.contentTranslation.updateMany({
      where: { id: row.id, sourceTextHash: row.sourceTextHash, status: row.status, processingUntil: row.processingUntil, attemptCount: row.attemptCount },
      data: { processingUntil, attemptCount: { increment: 1 } },
    });
    if (!claim.count) continue;
    const where = { id: row.id, sourceTextHash: row.sourceTextHash, processingUntil };
    try {
      const translatedText = !row.sourceText.trim() ? "" : signal
        ? await provider.translate(row.sourceText, row.targetLocale as "es" | "pt", { signal })
        : await provider.translate(row.sourceText, row.targetLocale as "es" | "pt");
      await prisma.contentTranslation.updateMany({ where, data: { translatedText, status: "COMPLETED", provider: "deepl", processingUntil: null, lastErrorCode: null } });
    } catch (error) {
      const safe = error instanceof TranslationError ? error : new TranslationError("TRANSLATION_FAILED");
      const unconfigured = safe.code === "PROVIDER_NOT_CONFIGURED";
      await prisma.contentTranslation.updateMany({ where, data: {
        status: "FAILED", processingUntil: null, lastErrorCode: safe.code,
        attemptCount: unconfigured ? row.attemptCount : safe.retryable ? row.attemptCount + 1 : 6,
        nextAttemptAt: new Date(Date.now() + (unconfigured ? 60_000 : Math.min(3_600_000, 5000 * 2 ** row.attemptCount))),
      } });
      // A provider outage/rate limit must not fan out across the remaining fields.
      break;
    }
  }
  return rows.length;
}
