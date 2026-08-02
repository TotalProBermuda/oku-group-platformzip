import { prisma } from "@/lib/prisma";
import { createHash } from "crypto";
import { SUPPORTED_LOCALES, type Locale } from "@/types/i18n";
import { isTranslatableField, type TranslatableEntityType } from "@/config/translatableFields";

function hashText(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, 16);
}

export type TranslationStatus = "PENDING" | "COMPLETED" | "FAILED" | "STALE";

/**
 * Retrieves a stored translation for a given entity field and target locale.
 * Returns null if no translation exists yet (fallback to source text handled by caller).
 */
export async function getTranslation(
  entityType: string,
  entityId: string,
  fieldName: string,
  targetLocale: Locale
): Promise<string | null> {
  const record = await prisma.contentTranslation.findFirst({
    where: { entityType, entityId, fieldName, targetLocale, status: "COMPLETED" },
    select: { translatedText: true },
  });
  return record?.translatedText ?? null;
}

/**
 * Upserts a translation record. If the source text has changed, marks
 * existing translations for other locales as STALE and queues fresh jobs.
 */
export async function upsertTranslation(params: {
  entityType: string;
  entityId: string;
  fieldName: string;
  sourceLocale: Locale;
  sourceText: string;
  targetLocale: Locale;
  translatedText: string;
  provider?: string;
}): Promise<void> {
  const { entityType, entityId, fieldName, sourceLocale, sourceText, targetLocale, translatedText, provider } = params;
  const sourceTextHash = hashText(sourceText);

  await prisma.contentTranslation.upsert({
    where: {
      entityType_entityId_fieldName_targetLocale: {
        entityType,
        entityId,
        fieldName,
        targetLocale,
      },
    },
    create: {
      entityType,
      entityId,
      fieldName,
      sourceLocale,
      targetLocale,
      sourceText,
      sourceTextHash,
      translatedText,
      status: "COMPLETED",
      provider: provider ?? "manual",
    },
    update: {
      translatedText,
      sourceText,
      sourceTextHash,
      status: "COMPLETED",
      provider: provider ?? "manual",
      updatedAt: new Date(),
    },
  });
}

/**
 * When a field's source text changes, mark all existing translations as STALE
 * so they are re-queued on the next pipeline run.
 */
export async function markStaleIfSourceChanged(
  entityType: string,
  entityId: string,
  fieldName: string,
  newSourceText: string
): Promise<boolean> {
  const newHash = hashText(newSourceText);
  const existing = await prisma.contentTranslation.findFirst({
    where: { entityType, entityId, fieldName },
    select: { sourceTextHash: true },
  });
  if (!existing || existing.sourceTextHash === newHash) return false;

  await prisma.contentTranslation.updateMany({
    where: { entityType, entityId, fieldName },
    data: { status: "STALE" },
  });
  return true;
}

/**
 * Creates PENDING translation records for all supported target locales
 * for a given entity field. Called after entity creation/update.
 */
export async function queueTranslations(params: {
  entityType: string;
  entityId: string;
  fieldName: string;
  sourceLocale: Locale;
  sourceText: string;
}): Promise<void> {
  const { entityType, entityId, fieldName, sourceLocale, sourceText } = params;
  if (!sourceText?.trim()) return;

  const sourceTextHash = hashText(sourceText);
  const targetLocales = SUPPORTED_LOCALES.filter((l) => l !== sourceLocale);

  for (const targetLocale of targetLocales) {
    await prisma.contentTranslation.upsert({
      where: {
        entityType_entityId_fieldName_targetLocale: {
          entityType,
          entityId,
          fieldName,
          targetLocale,
        },
      },
      create: {
        entityType,
        entityId,
        fieldName,
        sourceLocale,
        targetLocale,
        sourceText,
        sourceTextHash,
        translatedText: "",
        status: "PENDING",
        provider: null,
      },
      update: {
        sourceText,
        sourceTextHash,
        status: "PENDING",
        updatedAt: new Date(),
      },
    });
  }
}

/**
 * Queues translations for all registered translatable fields of an entity.
 * Call this from create/update API routes.
 */
export async function queueEntityTranslations(params: {
  entityType: TranslatableEntityType;
  entityId: string;
  fields: Partial<Record<string, string>>;
  sourceLocale?: Locale;
}): Promise<void> {
  const { entityType, entityId, fields, sourceLocale = "en" } = params;

  for (const [fieldName, sourceText] of Object.entries(fields)) {
    if (!sourceText || !isTranslatableField(entityType, fieldName)) continue;
    await queueTranslations({ entityType, entityId, fieldName, sourceLocale, sourceText });
  }
}

/**
 * Returns the translated text for a field in the given locale,
 * with fallback to source text if no translation is available.
 */
export async function resolveTranslation(params: {
  entityType: string;
  entityId: string;
  fieldName: string;
  sourceText: string;
  targetLocale: Locale;
}): Promise<string> {
  const { entityType, entityId, fieldName, sourceText, targetLocale } = params;
  const translated = await getTranslation(entityType, entityId, fieldName, targetLocale);
  return translated ?? sourceText;
}

/**
 * Returns translation coverage stats for a given entity type and locale.
 */
export async function getCoverageStats(entityType: string, targetLocale: Locale) {
  const total = await prisma.contentTranslation.count({ where: { entityType, targetLocale } });
  const completed = await prisma.contentTranslation.count({ where: { entityType, targetLocale, status: "COMPLETED" } });
  const pending = await prisma.contentTranslation.count({ where: { entityType, targetLocale, status: "PENDING" } });
  const stale = await prisma.contentTranslation.count({ where: { entityType, targetLocale, status: "STALE" } });
  const failed = await prisma.contentTranslation.count({ where: { entityType, targetLocale, status: "FAILED" } });
  return { total, completed, pending, stale, failed, pctComplete: total > 0 ? Math.round((completed / total) * 100) : 0 };
}
