import type { PrismaClient } from "@prisma/client";
import { ReferralActorType } from "@prisma/client";
import { nanoid } from "nanoid";
import {
  findOrLinkReferralActor,
} from "./referralActorDedupeService";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://okuhospitality.com";

/**
 * Minimal Prisma surface this service needs. Both the app singleton
 * (`@/lib/prisma`) and the seed's own `new PrismaClient()` satisfy it, so the
 * caller owns the client — the service stays pure and connection-agnostic.
 *
 * `auditLog` is NOT required here: `findOrLinkReferralActor` writes its own
 * canonical dedupe audit rows using the prisma singleton internally.
 */
type Db = Pick<PrismaClient, "referralActor" | "referrer" | "referralLink">;

/**
 * Typed result returned by `ensureStreetsideReferralIdentity`.
 *
 * `ok: true`  — a governed identity exists and a QR code is ready.
 * `ok: false` — the dedupe chain detected that the matching actor is owned by
 *               a different user. No QR code is issued. The caller MUST surface
 *               a conflict banner rather than silently using a partial identity.
 */
export type StreetsideReferralResult =
  | {
      ok: true;
      referralActorId: string;
      code: string;
    }
  | {
      ok: false;
      mergeRequired: true;
      candidateActorId: string;
      candidateActorUserId: string | null;
      matchField: string | null;
      reason: string;
    };

/** @deprecated Use StreetsideReferralResult instead. Kept for existing consumers. */
export interface StreetsideReferralIdentity {
  referralActorId: string;
  code: string;
}

function buildHostCode(): string {
  return `HOST-${nanoid(8).toUpperCase()}`;
}

/**
 * Idempotently ensure a STREETSIDE_HOST user has a governed personal referral
 * identity: a user-owned `ReferralActor` plus an ACTIVE `ReferralLink` whose
 * code the Guest QR can emit.
 *
 * **Duplicate guard**: this function now delegates to `findOrLinkReferralActor`
 * (7-step canonical chain) as its first step with `isProvisioningCall: true`.
 * If the chain detects that a matching actor is already owned by a different
 * user (e.g. the operator created an actor via phone/email for the same person
 * before the host signed up), it returns `{ ok: false, mergeRequired: true }`
 * — no new actor is created, no exception is thrown, no QR is issued.
 * The AuditLog `merge_required` entry with
 * `{ provisioningPath: "streetside", matchField, candidateActorId, mutated: false }`
 * is written by `findOrLinkReferralActor` internally.
 *
 * This is the profile-independent counterpart to `provisionHostPersonalReferrer`
 * (which anchors on a `RestaurantHostProfile` via `EventReferrerAssignment`).
 * Streetside hosts are first-class referrers but were never given host
 * profiles, so without this their Guest QR carried no `?ref=` code and every
 * scan booked an unattributed DIRECT reservation — invisible in their feed.
 */
export async function ensureStreetsideReferralIdentity(
  db: Db,
  userId: string,
  displayName: string,
): Promise<StreetsideReferralResult> {
  // ── Step 1: canonical 7-step dedupe check ───────────────────────────────
  // findOrLinkReferralActor uses the prisma singleton internally; we do NOT
  // pass `db` as a txClient because the streetside provisioning path is never
  // inside an outer transaction, and the Db pick type does not include auditLog
  // (which the dedupe service needs internally for audit writes).
  const dedupeResult = await findOrLinkReferralActor(
    {
      actorType: ReferralActorType.STREETSIDE_HOST,
      displayName,
      userId,
      // metadataJson carries the provisioningPath for any AuditLog rows written
      // by the dedupe service (dedupe_found / dedupe_created / merge_required).
      metadataJson: { provisioningPath: "streetside" },
    },
    { isProvisioningCall: true },
    // No txClient — runs on the prisma singleton with its own internal tx.
  );

  // ── merge_required: a different user already owns the matching actor ────
  if (dedupeResult.status === "merge_required") {
    // AuditLog row (referral.actor.merge_required) already written by
    // findOrLinkReferralActor with matchField, candidateActorId, mutated: false.
    return {
      ok: false,
      mergeRequired: true,
      candidateActorId: dedupeResult.candidateActorId,
      candidateActorUserId: dedupeResult.candidateActorUserId ?? null,
      matchField: dedupeResult.matchField,
      reason: dedupeResult.reason,
    };
  }

  // ── blocked: legacy code taken ───────────────────────────────────────────
  if (dedupeResult.status === "blocked") {
    throw new Error(`Streetside referral provisioning blocked: ${dedupeResult.reason}`);
  }

  const actorId = dedupeResult.actorId;

  // ── If the dedupe result already resolved an active link, return it ──────
  // This covers the `reactivated_link` status where the inactive link was
  // reactivated inside findOrLinkReferralActor.
  if (dedupeResult.referralLinkId) {
    const link = await db.referralLink.findUnique({
      where: { id: dedupeResult.referralLinkId },
      select: { code: true },
    });
    if (link) {
      return { ok: true, referralActorId: actorId, code: link.code };
    }
  }

  // ── Reuse an ACTIVE link, else mint one (bounded retry on the unique code) ─
  const existing = await db.referralLink.findFirst({
    where: { referralActorId: actorId, isActive: true },
    select: { code: true },
    orderBy: { createdAt: "asc" },
  });
  if (existing) return { ok: true, referralActorId: actorId, code: existing.code };

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = buildHostCode();
    try {
      const link = await db.referralLink.create({
        data: {
          referralActorId: actorId,
          code,
          url: `${APP_URL}/r/${code}`,
          isActive: true,
        },
        select: { code: true },
      });
      return { ok: true, referralActorId: actorId, code: link.code };
    } catch (err) {
      // Unique collision on `code` (or a concurrent request that just minted
      // the link): re-read, and only give up after exhausting the retries.
      const raced = await db.referralLink.findFirst({
        where: { referralActorId: actorId, isActive: true },
        select: { code: true },
        orderBy: { createdAt: "asc" },
      });
      if (raced) return { ok: true, referralActorId: actorId, code: raced.code };
      if (attempt === 4) throw err;
    }
  }

  throw new Error("Failed to provision streetside referral link");
}
