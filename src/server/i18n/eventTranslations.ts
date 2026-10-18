import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { TRANSLATABLE_FIELDS, isTranslatableField, type TranslatableEntityType } from "@/config/translatableFields";
import { matchesSource, sourceHash } from "./sourceHash";

export type TranslationStore = Pick<Prisma.TransactionClient, "contentTranslation">;

/** Call inside the same transaction as the English write. No external IO here. */
export async function syncTranslations(tx: TranslationStore, entityType: TranslatableEntityType, entityId: string, fields: Record<string, unknown>) {
  for (const [fieldName, raw] of Object.entries(fields)) {
    if (!isTranslatableField(entityType, fieldName) || (raw !== null && typeof raw !== "string")) continue;
    const sourceText = typeof raw === "string" ? raw : "";
    const sourceTextHash = sourceHash(sourceText);
    for (const targetLocale of ["es", "pt"]) {
      const identity = { entityType, entityId, fieldName, targetLocale };
      const where = { entityType_entityId_fieldName_targetLocale: identity };
      const existing = await tx.contentTranslation.findUnique({ where });
      if (existing && matchesSource(existing.sourceTextHash, sourceText)) {
        // Older session editors could mark English fallback text as a completed
        // manual translation. Re-queue only that untranslated fallback; preserve
        // real reviewed translations even when their English source is unchanged.
        const untranslatedManualFallback = existing.provider === "manual-session-management"
          && existing.translatedText.trim() === sourceText.trim();
        if (!untranslatedManualFallback) continue;
      }
      const status = sourceText.trim() ? (existing ? "STALE" : "PENDING") : "COMPLETED";
      const data = { sourceLocale: "en", sourceText, sourceTextHash, translatedText: "", status, provider: "deepl",
        attemptCount: 0, nextAttemptAt: new Date(), processingUntil: null, lastErrorCode: null } as const;
      await tx.contentTranslation.upsert({ where, create: { ...identity, ...data }, update: data });
    }
  }
}

/** Batch-localize without ever serving a stale or failed translation. */
export async function localizeContent<T extends { id: string }>(entityType: TranslatableEntityType, items: T[], locale: string): Promise<T[]> {
  if ((locale !== "es" && locale !== "pt") || !items.length) return items;
  const rows = await prisma.contentTranslation.findMany({ where: { entityType, entityId: { in: items.map(item => item.id) }, targetLocale: locale, status: "COMPLETED" } });
  return items.map(item => {
    const copy = { ...item } as T & Record<string, unknown>;
    for (const row of rows.filter(row => row.entityId === item.id)) {
      const original = (item as Record<string, unknown>)[row.fieldName];
      if (isTranslatableField(entityType, row.fieldName) && typeof original === "string" && (!original.trim() || row.translatedText.trim()) && matchesSource(row.sourceTextHash, original))
        (copy as Record<string, unknown>)[row.fieldName] = row.translatedText;
    }
    return copy;
  });
}

export async function localizeEventCatalog<T extends { id: string; ticketTypes?: Array<{ id: string }>; addons?: Array<{ id: string }> }>(items: T[], locale: string): Promise<T[]> {
  const localized = await localizeContent("Series", items, locale);
  const tickets = await localizeContent("TicketType", items.flatMap(item => item.ticketTypes ?? []), locale);
  const addons = await localizeContent("ExperienceAddon", items.flatMap(item => item.addons ?? []), locale);
  return localized.map(item => ({ ...item,
    ...(item.ticketTypes ? { ticketTypes: item.ticketTypes.map(t => tickets.find(row => row.id === t.id) ?? t) } : {}),
    ...(item.addons ? { addons: item.addons.map(a => addons.find(row => row.id === a.id) ?? a) } : {}),
  }));
}

export const eventTextFields = (entityType: TranslatableEntityType) => TRANSLATABLE_FIELDS[entityType];
