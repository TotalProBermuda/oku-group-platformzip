import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

/**
 * Canonical earner-scope helper for `CommissionEntry` reads during the
 * Referrer → ReferralActor migration.
 *
 * Why this exists
 * ───────────────
 * `CommissionEntry` carries TWO earner FKs while the migration is in
 * progress: the legacy required `referrerId` and the optional native
 * `referralActorId`. Schema comment on the field is explicit: "writers
 * can populate both fields during the migration without double-counting
 * stats" — *but only if every read surface goes through one resolver*.
 *
 * Two failure modes this helper prevents:
 *
 *  1. **Under-count.** A read site that filters by `referrerId` only
 *     will silently start dropping rows the moment writers shift to
 *     `referralActorId`-primary (or stop populating the legacy FK at
 *     all). Stats look low. Money is owed and not paid. Worst possible
 *     bug class for this layer.
 *
 *  2. **Double-count.** A read site that does two separate queries
 *     (one by `referrerId`, one by `referralActorId`) and concatenates
 *     them will count rows that have BOTH FKs set twice. Stats look
 *     high. Money is paid twice.
 *
 * Both vanish if every read site uses `commissionWhereForEarner` —
 * Prisma's `findMany` returns each row from the underlying table at
 * most once even when multiple OR branches match it.
 */

export type EarnerScope = {
  /** Always present; CommissionEntry.referrerId is required at the schema level. */
  referrerId: string;
  /** Resolved native ReferralActor.id, when the legacy Referrer has been migrated. */
  actorId: string | null;
};

/**
 * Build a `where` clause that matches commission rows attributed via
 * EITHER the legacy `referrerId` or the native `referralActorId` for
 * the same earner. Compose with date / status filters via spread.
 *
 * Returns an `OR` clause when the earner has both IDs, otherwise a
 * direct `referrerId` filter. A row that has both FKs set will only
 * appear once in the result set because Prisma `findMany` returns
 * distinct rows from the table.
 */
export function commissionWhereForEarner(
  scope: EarnerScope,
): Prisma.CommissionEntryWhereInput {
  if (!scope.actorId) return { referrerId: scope.referrerId };
  return {
    OR: [
      { referrerId: scope.referrerId },
      { referralActorId: scope.actorId },
    ],
  };
}

/**
 * Resolve a single legacy `referrerId` to its `EarnerScope`, including
 * the linked ReferralActor.id when one exists. Returns `null` if the
 * Referrer doesn't exist.
 *
 * Cheap (one indexed lookup); safe to call inline at the top of a
 * route handler. Callers needing many at once should use
 * `resolveEarnerScopesForReferrers` for a single batched query.
 */
export async function resolveEarnerScopeForReferrer(
  referrerId: string,
): Promise<EarnerScope | null> {
  const r = await prisma.referrer.findUnique({
    where: { id: referrerId },
    select: { id: true, referralActor: { select: { id: true } } },
  });
  if (!r) return null;
  return { referrerId: r.id, actorId: r.referralActor?.id ?? null };
}

/**
 * Batched variant: resolve N legacy referrerIds → Map<referrerId, scope>.
 * Used by surfaces (compensation dashboard, partner reports) that fan
 * out per-referrer queries.
 */
export async function resolveEarnerScopesForReferrers(
  referrerIds: string[],
): Promise<Map<string, EarnerScope>> {
  if (referrerIds.length === 0) return new Map();
  const actors = await prisma.referralActor.findMany({
    where: { legacyReferrerId: { in: referrerIds } },
    select: { id: true, legacyReferrerId: true },
  });
  const actorByLegacy = new Map(
    actors
      .filter((a): a is { id: string; legacyReferrerId: string } => !!a.legacyReferrerId)
      .map(a => [a.legacyReferrerId, a.id] as const),
  );
  const out = new Map<string, EarnerScope>();
  for (const id of referrerIds) {
    out.set(id, { referrerId: id, actorId: actorByLegacy.get(id) ?? null });
  }
  return out;
}

/**
 * Defensive dedupe by row id. Only needed when a caller has *two
 * separate queries* against `CommissionEntry` whose result sets might
 * overlap (e.g. one batched-by-referrerIds, one batched-by-actorIds).
 * Single OR-query callers don't need this — Prisma already returns
 * each row once.
 */
export function dedupeCommissions<T extends { id: string }>(rows: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const r of rows) {
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    out.push(r);
  }
  return out;
}
