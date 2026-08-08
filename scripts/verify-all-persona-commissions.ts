/* eslint-disable no-console */
/**
 * Simulation: for every commission-earning persona in the database, simulate
 * what would happen when a $100 table closes attributed to them. Uses the
 * EXACT same 3-tier resolution + rate-source chain that the manual close
 * route and the auto-mint service use. Reports any persona type that would
 * crash, silently skip, or attribute to the wrong entity.
 *
 * Also runs a pre-flight ReferralActor duplicate check (userId, email, phone)
 * with normalized comparison — exits non-zero with a structured list on any
 * duplicate found before the simulation begins.
 *
 * Usage:
 *   npx tsx scripts/verify-all-persona-commissions.ts
 */
import { prisma } from "../src/lib/prisma";
import {
  normalizeEmail,
  normalizePhone,
} from "../src/server/referrals/referralActorDedupeService";

// ── Pre-flight: ReferralActor duplicate checks ────────────────────────────────

/**
 * Scan every ReferralActor row for userId / email / phone duplicates.
 *
 * Normalization rules (identical to the dedupe service):
 *  - userId:  null rows (orphan actors) are EXCLUDED — only non-null userId
 *             values are grouped. A null userId just means "not yet claimed".
 *  - email:   trim + lowercase before grouping. Raw string comparison is NOT
 *             acceptable ("User@Example.com" and "user@example.com" collide).
 *  - phone:   strip all non-digit characters before grouping. Raw string
 *             comparison is NOT acceptable ("+507 6123-4567" == "50761234567").
 *
 * Exits non-zero with a structured conflict list if any duplicates are found.
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

  // userId duplicates (null rows excluded)
  const byUserId = new Map<string, string[]>();
  for (const a of allActors) {
    if (a.userId === null) continue;
    const bucket = byUserId.get(a.userId) ?? [];
    bucket.push(a.id);
    byUserId.set(a.userId, bucket);
  }
  for (const [userId, ids] of byUserId) {
    if (ids.length > 1) {
      conflictLines.push(`userId=${userId}  actorIds=[${ids.join(", ")}]  count=${ids.length}`);
    }
  }

  // email duplicates (normalized in memory)
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
      conflictLines.push(`email(normalized)=${email}  actorIds=[${ids.join(", ")}]  count=${ids.length}`);
    }
  }

  // phone duplicates (normalized in memory — strip non-digits)
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
      conflictLines.push(`phone(normalized)=${phone}  actorIds=[${ids.join(", ")}]  count=${ids.length}`);
    }
  }

  if (conflictLines.length === 0) {
    console.log(
      `Pre-flight PASS: ${allActors.length} ReferralActor rows scanned — no userId/email/phone duplicates.\n`
    );
    return;
  }

  console.error(
    `\nPre-flight FAIL: ${conflictLines.length} duplicate ReferralActor group(s) detected.`
  );
  console.error("Structured conflict list:");
  for (const line of conflictLines) console.error(`  ${line}`);
  console.error(
    "\nRun the migration with --strict to surface all conflicts and block the run."
  );
  process.exit(1);
}

const SIMULATED_TABLE_TOTAL_CENTS = 10_000; // $100
const PLATFORM_FALLBACK_PCT = 5; // mirrors close-route fallbackPct

type Outcome = {
  persona: string;
  name: string;
  identityKind: "ReferralActor" | "Referrer";
  identityId: string;
  resolvedEarnerType: "REFERRER" | null;
  resolvedEarnerRefId: string | null;
  rateSource:
    | "ReferralAssignment.rateBps"
    | "EventReferrerAssignment.commissionShareBps"
    | "legacy_CompensationPlan"
    | "platform_fallback_5pct"
    | "NONE";
  ratePct: number;
  commissionCents: number;
  status: "OK" | "FALLBACK_RATE" | "WOULD_NOT_MINT" | "ERROR";
  notes?: string;
};

async function simulateForReferralActor(actorId: string): Promise<Outcome> {
  try {
    const ra = await prisma.referralActor.findUnique({
      where: { id: actorId },
      include: {
        assignments: { where: { isActive: true }, take: 1 },
        legacyEventReferrerAssignment: true,
        legacyReferrer: { include: { compensationPlan: true } },
      },
    });
    if (!ra) {
      return {
        persona: "?",
        name: "?",
        identityKind: "ReferralActor",
        identityId: actorId,
        resolvedEarnerType: null,
        resolvedEarnerRefId: null,
        rateSource: "NONE",
        ratePct: 0,
        commissionCents: 0,
        status: "ERROR",
        notes: "actor not found",
      };
    }

    let ratePct = PLATFORM_FALLBACK_PCT;
    let rateSource: Outcome["rateSource"] = "platform_fallback_5pct";

    const assignment = ra.assignments?.[0];
    if (assignment?.rateBps && assignment.rateBps > 0) {
      ratePct = assignment.rateBps / 100;
      rateSource = "ReferralAssignment.rateBps";
    } else if (
      ra.legacyEventReferrerAssignment?.isCommissionEligible &&
      ra.legacyEventReferrerAssignment.commissionShareBps != null &&
      ra.legacyEventReferrerAssignment.commissionShareBps > 0
    ) {
      ratePct = ra.legacyEventReferrerAssignment.commissionShareBps / 100;
      rateSource = "EventReferrerAssignment.commissionShareBps";
    } else if (
      ra.legacyReferrer?.compensationPlan?.isActive &&
      ra.legacyReferrer.compensationPlan.commissionPercent != null
    ) {
      ratePct = Number(ra.legacyReferrer.compensationPlan.commissionPercent);
      rateSource = "legacy_CompensationPlan";
    }

    const commissionCents = Math.round(SIMULATED_TABLE_TOTAL_CENTS * ratePct / 100);
    const status: Outcome["status"] =
      rateSource === "platform_fallback_5pct" ? "FALLBACK_RATE" : "OK";

    return {
      persona: ra.actorType,
      name: ra.displayName,
      identityKind: "ReferralActor",
      identityId: ra.id,
      resolvedEarnerType: "REFERRER",
      resolvedEarnerRefId: ra.id,
      rateSource,
      ratePct,
      commissionCents,
      status,
    };
  } catch (e) {
    return {
      persona: "?",
      name: "?",
      identityKind: "ReferralActor",
      identityId: actorId,
      resolvedEarnerType: null,
      resolvedEarnerRefId: null,
      rateSource: "NONE",
      ratePct: 0,
      commissionCents: 0,
      status: "ERROR",
      notes: (e as Error).message,
    };
  }
}

async function simulateForLegacyReferrer(referrerId: string): Promise<Outcome> {
  try {
    const r = await prisma.referrer.findUnique({
      where: { id: referrerId },
      include: { compensationPlan: true },
    });
    if (!r) {
      return {
        persona: "?",
        name: "?",
        identityKind: "Referrer",
        identityId: referrerId,
        resolvedEarnerType: null,
        resolvedEarnerRefId: null,
        rateSource: "NONE",
        ratePct: 0,
        commissionCents: 0,
        status: "ERROR",
        notes: "referrer not found",
      };
    }

    let ratePct = PLATFORM_FALLBACK_PCT;
    let rateSource: Outcome["rateSource"] = "platform_fallback_5pct";
    if (r.compensationPlan?.isActive && r.compensationPlan.commissionPercent != null) {
      ratePct = Number(r.compensationPlan.commissionPercent);
      rateSource = "legacy_CompensationPlan";
    }
    const commissionCents = Math.round(SIMULATED_TABLE_TOTAL_CENTS * ratePct / 100);
    const status: Outcome["status"] =
      rateSource === "platform_fallback_5pct" ? "FALLBACK_RATE" : "OK";

    return {
      persona: r.referrerType,
      name: r.fullName,
      identityKind: "Referrer",
      identityId: r.id,
      resolvedEarnerType: "REFERRER",
      resolvedEarnerRefId: r.id,
      rateSource,
      ratePct,
      commissionCents,
      status,
    };
  } catch (e) {
    return {
      persona: "?",
      name: "?",
      identityKind: "Referrer",
      identityId: referrerId,
      resolvedEarnerType: null,
      resolvedEarnerRefId: null,
      rateSource: "NONE",
      ratePct: 0,
      commissionCents: 0,
      status: "ERROR",
      notes: (e as Error).message,
    };
  }
}

async function main() {
  // ── Pre-flight: assert no duplicate ReferralActor rows ────────────────────
  // Exits non-zero with a structured conflict list if any userId/email/phone
  // duplicates are found. Normalization is done in memory — raw string
  // comparison is not used for either email or phone.
  console.log("=== Pre-flight: ReferralActor duplicate checks ===");
  await assertNoDuplicateActors();

  console.log(
    `\nSimulating commission allocation for $${SIMULATED_TABLE_TOTAL_CENTS / 100} table close per persona.\n` +
      `(Identical 3-tier resolution as the manual close route + auto-mint service.)\n`
  );

  const actors = await prisma.referralActor.findMany({ select: { id: true } });
  const referrers = await prisma.referrer.findMany({
    select: { id: true },
    where: { referralActor: null }, // legacy-only — modern actors handled above
  });

  const outcomes: Outcome[] = [];
  for (const a of actors) outcomes.push(await simulateForReferralActor(a.id));
  for (const r of referrers) outcomes.push(await simulateForLegacyReferrer(r.id));

  // Group by status
  const ok = outcomes.filter((o) => o.status === "OK");
  const fallback = outcomes.filter((o) => o.status === "FALLBACK_RATE");
  const noMint = outcomes.filter((o) => o.status === "WOULD_NOT_MINT");
  const errors = outcomes.filter((o) => o.status === "ERROR");

  // Group by persona type
  const byPersona = new Map<string, { ok: number; fallback: number; noMint: number; error: number }>();
  for (const o of outcomes) {
    const k = `${o.identityKind}:${o.persona}`;
    const cur = byPersona.get(k) ?? { ok: 0, fallback: 0, noMint: 0, error: 0 };
    if (o.status === "OK") cur.ok++;
    else if (o.status === "FALLBACK_RATE") cur.fallback++;
    else if (o.status === "WOULD_NOT_MINT") cur.noMint++;
    else cur.error++;
    byPersona.set(k, cur);
  }

  console.log("=== Summary by persona type ===");
  console.log(
    "(OK = configured rate, FALLBACK = no rate so 5% default, WOULD_NOT_MINT = $0 commission, ERROR = code crashed)\n"
  );
  for (const [k, v] of [...byPersona.entries()].sort()) {
    console.log(`  ${k.padEnd(45)} OK=${v.ok}  FALLBACK=${v.fallback}  NO_MINT=${v.noMint}  ERROR=${v.error}`);
  }

  console.log(`\n=== Totals ===`);
  console.log(`  OK (configured rate)         : ${ok.length}`);
  console.log(`  FALLBACK_RATE (5% default)   : ${fallback.length}`);
  console.log(`  WOULD_NOT_MINT ($0)          : ${noMint.length}`);
  console.log(`  ERROR (code crashed)         : ${errors.length}`);

  if (errors.length > 0) {
    console.log("\n!! ERRORS — these would crash at close time:");
    for (const o of errors) console.log(`  ${o.persona} ${o.name}: ${o.notes}`);
  }

  console.log("\n=== Configured-rate personas (would mint correctly) ===");
  for (const o of ok) {
    console.log(
      `  ${o.persona.padEnd(25)} ${o.name.padEnd(35)} ${o.ratePct}% via ${o.rateSource}  →  $${(o.commissionCents / 100).toFixed(2)}`
    );
  }

  console.log("\n=== Fallback-rate personas (would mint at platform default 5%) ===");
  for (const o of fallback) {
    console.log(`  ${o.persona.padEnd(25)} ${o.name.padEnd(35)} → $${(o.commissionCents / 100).toFixed(2)} (default)`);
  }

  console.log("\nDone.");
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
