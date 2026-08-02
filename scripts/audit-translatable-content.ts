#!/usr/bin/env tsx
/**
 * scripts/audit-translatable-content.ts
 *
 * Audits all translatable UGC content types in the database and reports
 * translation coverage by locale. Run this to check the health of the
 * translation pipeline.
 *
 * Usage:
 *   npx tsx scripts/audit-translatable-content.ts
 */

import { PrismaClient } from "@prisma/client";
import { TRANSLATABLE_FIELDS } from "../src/config/translatableFields";

const prisma = new PrismaClient();
const LOCALES = ["es", "pt"] as const;

async function main() {
  console.log("\n📊 OKÜ UGC Translation Coverage Audit\n");
  console.log("=".repeat(60));

  const totalByLocale: Record<string, { total: number; completed: number; pending: number; stale: number; failed: number }> = {};
  for (const locale of LOCALES) {
    totalByLocale[locale] = { total: 0, completed: 0, pending: 0, stale: 0, failed: 0 };
  }

  for (const [entityType, fields] of Object.entries(TRANSLATABLE_FIELDS)) {
    console.log(`\n▸ ${entityType} (fields: ${fields.join(", ")})`);

    for (const locale of LOCALES) {
      const counts = await prisma.contentTranslation.groupBy({
        by: ["status"],
        where: { entityType, targetLocale: locale },
        _count: { _all: true },
      });

      const statusMap: Record<string, number> = {};
      for (const c of counts) {
        statusMap[c.status] = c._count._all;
      }

      const total = Object.values(statusMap).reduce((a, b) => a + b, 0);
      const completed = statusMap["COMPLETED"] ?? 0;
      const pending = statusMap["PENDING"] ?? 0;
      const stale = statusMap["STALE"] ?? 0;
      const failed = statusMap["FAILED"] ?? 0;
      const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

      totalByLocale[locale].total += total;
      totalByLocale[locale].completed += completed;
      totalByLocale[locale].pending += pending;
      totalByLocale[locale].stale += stale;
      totalByLocale[locale].failed += failed;

      if (total === 0) {
        console.log(`  [${locale.toUpperCase()}] No records yet`);
      } else {
        const bar = "█".repeat(Math.round(pct / 10)) + "░".repeat(10 - Math.round(pct / 10));
        console.log(`  [${locale.toUpperCase()}] ${bar} ${pct}% — ${completed}/${total} complete, ${pending} pending, ${stale} stale, ${failed} failed`);
      }
    }
  }

  console.log("\n" + "=".repeat(60));
  console.log("TOTALS");
  for (const locale of LOCALES) {
    const s = totalByLocale[locale];
    const pct = s.total > 0 ? Math.round((s.completed / s.total) * 100) : 0;
    console.log(`  [${locale.toUpperCase()}] ${pct}% complete — ${s.completed}/${s.total} | pending: ${s.pending} | stale: ${s.stale} | failed: ${s.failed}`);
  }
  console.log();
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
