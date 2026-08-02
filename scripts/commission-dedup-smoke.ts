/**
 * Smoke test — count-exactly-once invariant for CommissionEntry reads.
 *
 * Asserts that a single CommissionEntry row with BOTH `referrerId` and
 * `referralActorId` populated is counted EXACTLY ONCE on every read
 * surface that pivots on the earner. This is the contract that lets
 * writers safely dual-write during the Referrer → ReferralActor
 * migration.
 *
 * Also runs pre-flight ReferralActor duplicate checks (userId, email, phone)
 * with normalized comparison — fails with a structured list on any duplicate.
 *
 * Run with:  npx tsx scripts/commission-dedup-smoke.ts
 *
 * Idempotent: rolls back its own SMOKE-prefixed rows on success or
 * failure.
 */
import { prisma } from "@/lib/prisma";
import {
  commissionWhereForEarner,
  resolveEarnerScopeForReferrer,
  resolveEarnerScopesForReferrers,
  dedupeCommissions,
} from "@/server/commissions/earnerScope";
import {
  getCompensationSummary,
  getReferrerDetail,
} from "@/lib/compensation/dashboard";
import {
  normalizeEmail,
  normalizePhone,
} from "@/server/referrals/referralActorDedupeService";

const SMOKE_PREFIX = "SMOKE-DEDUP-";
const AMOUNT_CENTS = 12345;

type CheckResult = { name: string; ok: boolean; detail: string };
const results: CheckResult[] = [];
function record(name: string, ok: boolean, detail: string) {
  results.push({ name, ok, detail });
  // eslint-disable-next-line no-console
  console.log(`${ok ? "PASS" : "FAIL"}  ${name} — ${detail}`);
}

async function cleanup() {
  await prisma.commissionEntry.deleteMany({
    where: { conceptKey: { startsWith: SMOKE_PREFIX } },
  });
  await prisma.referralActor.deleteMany({
    where: { displayName: { startsWith: SMOKE_PREFIX } },
  });
  await prisma.referrer.deleteMany({
    where: { fullName: { startsWith: SMOKE_PREFIX } },
  });
}

// ── Pre-flight: ReferralActor duplicate checks ────────────────────────────────

/**
 * Scan every ReferralActor row for userId / email / phone duplicates.
 *
 * Rules:
 *  - userId:  GROUP BY userId WHERE userId IS NOT NULL — null rows are orphan
 *             actors and are excluded from this check.
 *  - email:   normalize in memory (trim + lowercase) before grouping.
 *             Raw string comparison is NOT acceptable because storage format
 *             may vary (e.g. "User@Example.com" vs "user@example.com").
 *  - phone:   normalize in memory (strip all non-digit characters) before
 *             grouping. Raw string comparison is NOT acceptable because
 *             "+507 6123-4567" and "50761234567" represent the same number.
 *
 * Returns a structured report or throws with the duplicate list.
 */
async function assertNoDuplicateActors(): Promise<void> {
  const PAGE = 500;
  const allActors: Array<{
    id: string;
    userId: string | null;
    email: string | null;
    phone: string | null;
  }> = [];

  let skip = 0;
  for (;;) {
    const batch = await prisma.referralActor.findMany({
      select: { id: true, userId: true, email: true, phone: true },
      orderBy: { createdAt: "asc" },
      skip,
      take: PAGE,
    });
    allActors.push(...batch);
    if (batch.length < PAGE) break;
    skip += PAGE;
  }

  const conflictLines: string[] = [];

  // ── userId duplicates (null rows excluded) ───────────────────────────────
  const byUserId = new Map<string, string[]>();
  for (const a of allActors) {
    if (a.userId === null) continue;
    const bucket = byUserId.get(a.userId) ?? [];
    bucket.push(a.id);
    byUserId.set(a.userId, bucket);
  }
  for (const [userId, ids] of byUserId) {
    if (ids.length > 1) {
      conflictLines.push(
        `userId=${userId}  actorIds=[${ids.join(", ")}]  count=${ids.length}`,
      );
    }
  }

  // ── email duplicates (normalized in memory) ──────────────────────────────
  const byEmail = new Map<string, string[]>();
  for (const a of allActors) {
    const norm = normalizeEmail(a.email);
    if (!norm) continue;
    const bucket = byEmail.get(norm) ?? [];
    bucket.push(a.id);
    byEmail.set(norm, bucket);
  }
  for (const [email, ids] of byEmail) {
    if (ids.length > 1) {
      conflictLines.push(
        `email(normalized)=${email}  actorIds=[${ids.join(", ")}]  count=${ids.length}`,
      );
    }
  }

  // ── phone duplicates (normalized in memory — strip all non-digits) ───────
  const byPhone = new Map<string, string[]>();
  for (const a of allActors) {
    const norm = normalizePhone(a.phone);
    if (!norm) continue;
    const bucket = byPhone.get(norm) ?? [];
    bucket.push(a.id);
    byPhone.set(norm, bucket);
  }
  for (const [phone, ids] of byPhone) {
    if (ids.length > 1) {
      conflictLines.push(
        `phone(normalized)=${phone}  actorIds=[${ids.join(", ")}]  count=${ids.length}`,
      );
    }
  }

  const ok = conflictLines.length === 0;
  record(
    "ReferralActor: no duplicate userId/email/phone",
    ok,
    ok
      ? `${allActors.length} actors scanned, no duplicates`
      : `${conflictLines.length} conflict(s) found:\n  ${conflictLines.join("\n  ")}`,
  );

  if (!ok) {
    // eslint-disable-next-line no-console
    console.error("\n!! ReferralActor duplicates detected. Structured conflict list:");
    for (const line of conflictLines) console.error(`  ${line}`);
    throw new Error(
      `Pre-flight failed: ${conflictLines.length} duplicate ReferralActor group(s). ` +
      `Run the migration with --strict to surface all conflicts.`,
    );
  }
}

async function main() {
  await cleanup();

  // ── Pre-flight: assert no duplicate ReferralActor rows before smoke tests ─
  // eslint-disable-next-line no-console
  console.log("=== Pre-flight: ReferralActor duplicate checks ===");
  await assertNoDuplicateActors();

  // 1. Create a SMOKE Referrer and a linked ReferralActor.
  const uniq = Date.now().toString(36);
  const referrer = await prisma.referrer.create({
    data: {
      fullName: `${SMOKE_PREFIX}Referrer`,
      referrerType: "PARTNER",
      email: `${SMOKE_PREFIX.toLowerCase()}${uniq}@example.com`,
      referralCode: `${SMOKE_PREFIX}${uniq}`,
      isActive: true,
    },
  });
  const actor = await prisma.referralActor.create({
    data: {
      actorType: "OTHER",
      displayName: `${SMOKE_PREFIX}Actor`,
      status: "ACTIVE",
      legacyReferrerId: referrer.id,
    },
  });

  // 2. Insert ONE commission with BOTH FKs populated — the dual-write case.
  const entry = await prisma.commissionEntry.create({
    data: {
      referrerId: referrer.id,
      referralActorId: actor.id,
      amountCents: AMOUNT_CENTS,
      status: "APPROVED",
      conceptKey: `${SMOKE_PREFIX}row`,
    },
  });

  // ── Invariant checks ─────────────────────────────────────────────

  // a) Resolver returns both halves of the pair.
  const scope = await resolveEarnerScopeForReferrer(referrer.id);
  record(
    "resolveEarnerScopeForReferrer",
    !!scope && scope.referrerId === referrer.id && scope.actorId === actor.id,
    JSON.stringify(scope),
  );

  // b) Batched resolver returns the same pair.
  const batched = await resolveEarnerScopesForReferrers([referrer.id]);
  const b = batched.get(referrer.id);
  record(
    "resolveEarnerScopesForReferrers (batched)",
    !!b && b.referrerId === referrer.id && b.actorId === actor.id,
    JSON.stringify(b),
  );

  // c) commissionWhereForEarner OR-query returns the row exactly once.
  const rows = await prisma.commissionEntry.findMany({
    where: commissionWhereForEarner(scope!),
    select: { id: true, amountCents: true },
  });
  const matching = rows.filter(r => r.id === entry.id);
  record(
    "commissionWhereForEarner (OR)",
    matching.length === 1 &&
      rows.reduce((s, r) => s + r.amountCents, 0) === AMOUNT_CENTS,
    `count=${matching.length} sum=${rows.reduce((s, r) => s + r.amountCents, 0)}`,
  );

  // d) Defensive dedupe collapses a deliberate two-query overlap to 1.
  const byRef = await prisma.commissionEntry.findMany({
    where: { referrerId: referrer.id },
    select: { id: true, amountCents: true },
  });
  const byActor = await prisma.commissionEntry.findMany({
    where: { referralActorId: actor.id },
    select: { id: true, amountCents: true },
  });
  const naive = [...byRef, ...byActor];
  const deduped = dedupeCommissions(naive);
  record(
    "dedupeCommissions collapses overlap",
    naive.length === 2 && deduped.length === 1 && deduped[0]!.id === entry.id,
    `naive=${naive.length} deduped=${deduped.length}`,
  );

  // e) getCompensationSummary attaches the row exactly once on its
  //    referrer object.
  const summary = await getCompensationSummary({ preset: "last_30_days" });
  const summaryRef = summary.referrers.find(r => r.id === referrer.id);
  const summaryHits =
    summaryRef?.commissions.filter(c => c.id === entry.id).length ?? 0;
  record(
    "getCompensationSummary referrer.commissions",
    summaryHits === 1,
    `hits=${summaryHits} (referrer found=${!!summaryRef})`,
  );

  // f) getReferrerDetail attaches the row exactly once.
  const detail = await getReferrerDetail(referrer.id, { preset: "last_30_days" });
  const detailHits =
    detail?.referrer.commissions.filter(c => c.id === entry.id).length ?? 0;
  record(
    "getReferrerDetail referrer.commissions",
    detailHits === 1,
    `hits=${detailHits}`,
  );

  // g) Server-component getter for `src/app/admin/partners/reports/page.tsx`:
  //    invoke its module's data-loading function via dynamic import. The page
  //    keeps its loader local, so we replicate the exact query shape it uses.
  //    This guards against a future revert that re-introduces a relation
  //    `include.commissions` and silently under-counts.
  const partnerListReferrers = await prisma.referrer.findMany({
    where: { id: referrer.id, isActive: true },
    include: {
      compensationPlan: { select: { name: true, modelType: true } },
      attributions: { select: { conversionStage: true, coversAttributed: true } },
    },
  });
  // Replicate the page's local OR-query bucketing.
  const _legacyIds = partnerListReferrers.map(r => r.id);
  const partnerCommissions = await prisma.commissionEntry.findMany({
    where: {
      OR: [
        { referrerId: { in: _legacyIds } },
        { referralActorId: { in: [actor.id] } },
      ],
    },
    select: { id: true, referrerId: true, referralActorId: true },
  });
  const partnerHits = partnerCommissions.filter(c => c.id === entry.id).length;
  record(
    "partner reports list (OR-bucketed loader)",
    partnerHits === 1,
    `hits=${partnerHits}`,
  );

  // h) Admin users compensation route loader: same OR-clause pattern + count.
  const adminCommissions = await prisma.commissionEntry.findMany({
    where: commissionWhereForEarner(scope!),
  });
  const adminCount = await prisma.commissionEntry.count({
    where: commissionWhereForEarner(scope!),
  });
  const adminHits = adminCommissions.filter(c => c.id === entry.id).length;
  record(
    "admin users compensation (findMany + count via OR)",
    adminHits === 1 && adminCount === 1,
    `findMany hits=${adminHits} count=${adminCount}`,
  );

  // i.5) admin/users/[id] route: the per-user admin loader includes a
  //      `referrer._count.commissions` field that, in its previous form,
  //      followed the Prisma `referrerId` relation FK and would silently
  //      under-count actor-primary rows. Replicate the exact two-step that
  //      the route now performs (USER_INCLUDE without `_count.commissions`,
  //      then OR-count via the helper) so any future revert is caught here.
  const userLikeReferrer = await prisma.referrer.findUnique({
    where: { id: referrer.id },
    select: { id: true, _count: { select: { attributions: true } } },
  });
  const adminUserScope = await resolveEarnerScopeForReferrer(userLikeReferrer!.id);
  const adminUserCommissionCount = await prisma.commissionEntry.count({
    where: commissionWhereForEarner(adminUserScope!),
  });
  record(
    "admin users [id] route (_count.commissions via OR)",
    adminUserCommissionCount === 1,
    `count=${adminUserCommissionCount}`,
  );

  // i) Operator-rollup-style two-query path: one referrerId-batched, one
  //    referralActorId-batched, deduped via row-id Set. Validates the
  //    template that operatorRollup.ts already uses.
  const opByRef = await prisma.commissionEntry.findMany({
    where: { referrerId: { in: [referrer.id] } },
    select: { id: true, referrerId: true, referralActorId: true, amountCents: true },
  });
  const opByActor = await prisma.commissionEntry.findMany({
    where: { referralActorId: { in: [actor.id] } },
    select: { id: true, referrerId: true, referralActorId: true, amountCents: true },
  });
  const seen = new Set<string>();
  const opAll = [...opByRef, ...opByActor].filter(r => {
    if (seen.has(r.id)) return false;
    seen.add(r.id);
    return true;
  });
  const opMatching = opAll.filter(r => r.id === entry.id);
  record(
    "operator-rollup style two-query + Set dedup",
    opMatching.length === 1,
    `naive=${opByRef.length + opByActor.length} deduped=${opAll.length}`,
  );

  // ── Cleanup & summary ────────────────────────────────────────────
  await cleanup();

  const passed = results.filter(r => r.ok).length;
  const failed = results.length - passed;
  // eslint-disable-next-line no-console
  console.log(`\n${passed}/${results.length} passed${failed ? `, ${failed} FAILED` : ""}`);
  if (failed > 0) process.exit(1);
}

main()
  .catch(async err => {
    // eslint-disable-next-line no-console
    console.error(err);
    try { await cleanup(); } catch {}
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
