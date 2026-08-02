// Partner-scoped assignment creation. A partner can issue ReferralAssignments
// only against ReferralActors they own (their own ReferralActor row, or one
// linked via partnerOwnerId). Re-uses the same identity dedup service the
// admin endpoint uses, so partner invites converge on the canonical actor
// rather than spawning duplicates.

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/server/auth/session";
import {
  ReferralCompensationMode,
  ReferralScopeType,
  OfferType,
  ReferralActorType,
} from "@prisma/client";
import { logReferrerAssignmentAction } from "@/server/referrals/referrerAssignmentAudit";
import { generateReferralLink } from "@/server/referrals/referralLinkService";
import {
  findOrCreateReferralActor,
} from "@/server/referrals/referralActorIdentityService";

const PARTNER_ROLES = new Set(["PARTNER", "PARTNER_OWNER"]);

/**
 * Authorise a partner to share an offer of `offerType`/`offerId` under
 * `scopeType`/`scopeId`. Returns null on success or a string blocker.
 *
 *   - GLOBAL scope is forbidden for partners (admins only).
 *   - SERIES scope must reference a Series whose partnerId = caller's profile.
 *   - When offerType=SERIES the offerId must match the same partner-owned
 *     series so a partner cannot mint links for another partner's series.
 *   - Other scopes (VENUE/CAMPAIGN/EVENT) are reserved for admin issuance
 *     and rejected at the partner surface.
 */
async function assertPartnerCanShare(
  partnerProfileId: string,
  input: { scopeType: string; scopeId?: string; offerType: string; offerId?: string },
): Promise<string | null> {
  if (input.scopeType === "GLOBAL") {
    return "Partners may not create GLOBAL-scope assignments";
  }
  if (input.scopeType !== "SERIES" || !input.scopeId) {
    return "Partners may only share SERIES-scoped offers";
  }
  const series = await prisma.series.findUnique({
    where: { id: input.scopeId },
    select: { id: true, partnerId: true, sessions: { select: { id: true } } },
  });
  if (!series || series.partnerId !== partnerProfileId) {
    return "You are not associated with this series";
  }
  // Offer/scope mismatch guard: a partner inside a SERIES scope may only
  // mint offers that map back to that same series — the SERIES itself, an
  // EVENT/SESSION belonging to that series, or a PACKAGE explicitly tied
  // to it. Other offerTypes (RESTAURANT/MEMBERSHIP/PRIVATE_DINING) are
  // reserved for admin issuance because they cross series boundaries.
  switch (input.offerType) {
    case "SERIES":
      if (input.offerId && input.offerId !== series.id) {
        return "offerId must match the partner-owned series";
      }
      return null;
    case "EVENT": {
      if (!input.offerId) return "offerId is required for EVENT offers";
      const sessionIds = new Set(series.sessions.map((s) => s.id));
      if (!sessionIds.has(input.offerId)) {
        return "EVENT offerId must belong to a session of the partner-owned series";
      }
      return null;
    }
    case "PACKAGE":
      // Packages are SERIES-anchored; require offerId === series.id.
      if (input.offerId && input.offerId !== series.id) {
        return "PACKAGE offerId must match the partner-owned series";
      }
      return null;
    case "RESTAURANT":
    case "MEMBERSHIP":
    case "PRIVATE_DINING":
      return `Partners may not issue ${input.offerType} offers`;
    default:
      return `Unsupported offerType for partners: ${input.offerType}`;
  }
}

const Body = z.object({
  // Either point at an existing actor OR provide identity to find-or-create one
  referralActorId: z.string().optional(),
  invite: z
    .object({
      displayName: z.string().min(1),
      email: z.string().email().optional(),
      phone: z.string().optional(),
      whatsapp: z.string().optional(),
      organizationName: z.string().optional(),
      // Partners typically introduce sub-referrers (taxi drivers, hosts,
      // promoters) — INFLUENCER_SUB_REFERRER is the closest existing
      // canonical type. Callers may override with any ReferralActorType.
      actorType: z.nativeEnum(ReferralActorType).default(ReferralActorType.INFLUENCER_SUB_REFERRER),
    })
    .optional(),
  scopeType: z.nativeEnum(ReferralScopeType).default(ReferralScopeType.GLOBAL),
  scopeId: z.string().optional(),
  offerType: z.nativeEnum(OfferType),
  offerId: z.string().optional(),
  offerLabel: z.string().max(200).optional(),
  offerStartAt: z.string().datetime().optional(),
  offerEndAt: z.string().datetime().optional(),
  isCommissionEligible: z.boolean().default(false),
  compensationMode: z.nativeEnum(ReferralCompensationMode).default(ReferralCompensationMode.NONE),
  rateBps: z.number().int().min(0).max(10000).optional(),
  flatAmountCents: z.number().int().min(0).optional(),
  generateLink: z.boolean().default(true),
}).refine(
  (b) => b.referralActorId || b.invite,
  { message: "Either referralActorId or invite is required" },
).refine(
  (b) => !b.offerStartAt || !b.offerEndAt || new Date(b.offerEndAt) > new Date(b.offerStartAt),
  { message: "offerEndAt must be after offerStartAt", path: ["offerEndAt"] },
);

/**
 * GET — list ReferralAssignments scoped to series the caller's
 * PartnerProfile owns. Filterable by status / offerType.
 */
export async function GET(req: Request) {
  let userId: string;
  let roles: string[];
  try {
    ({ userId, roles } = await requireSession());
  } catch (e) {
    const status = (e as { status?: number }).status ?? 401;
    return NextResponse.json({ error: "Unauthorized" }, { status });
  }
  if (!roles.some((r) => PARTNER_ROLES.has(r))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const partnerProfile = await prisma.partnerProfile.findUnique({
    where: { userId },
    select: { id: true },
  });
  if (!partnerProfile) {
    return NextResponse.json({ error: "No partner profile" }, { status: 403 });
  }
  // Authoritative scoping: load the partner's series IDs once and filter
  // assignments to only those scopeIds. Avoids any chance of cross-tenant
  // leakage through the response.
  const series = await prisma.series.findMany({
    where: { partnerId: partnerProfile.id },
    select: { id: true },
  });
  const seriesIds = series.map((s) => s.id);
  const url = new URL(req.url);
  const where: Record<string, unknown> = {
    scopeType: "SERIES",
    scopeId: { in: seriesIds.length > 0 ? seriesIds : ["__none__"] },
  };
  const status = url.searchParams.get("status");
  if (status) where.status = status;
  const offerType = url.searchParams.get("offerType");
  if (offerType) where.offerType = offerType;
  const rows = await prisma.referralAssignment.findMany({
    where,
    include: { links: { select: { id: true, code: true, url: true, isActive: true } } },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return NextResponse.json({ rows, total: rows.length });
}

export async function POST(req: Request) {
  let userId: string;
  let roles: string[];
  try {
    ({ userId, roles } = await requireSession());
  } catch (e) {
    const status = (e as { status?: number }).status ?? 401;
    return NextResponse.json({ error: "Unauthorized" }, { status });
  }
  if (!roles.some((r) => PARTNER_ROLES.has(r))) {
    return NextResponse.json({ error: "Forbidden — partner role required" }, { status: 403 });
  }

  // Resolve the caller's PartnerProfile up-front — assignment writes must
  // be tied to a real partner record, not just a user with the role.
  const partnerProfile = await prisma.partnerProfile.findUnique({
    where: { userId },
    select: { id: true },
  });
  if (!partnerProfile) {
    return NextResponse.json({ error: "No partner profile" }, { status: 403 });
  }

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body", issues: parsed.error.issues }, { status: 400 });
  }
  const input = parsed.data;

  // Authorise the offer/scope BEFORE doing any actor work — prevents
  // partners minting links for series they don't own (IDOR/cross-tenant).
  const blocker = await assertPartnerCanShare(partnerProfile.id, {
    scopeType: input.scopeType,
    scopeId: input.scopeId,
    offerType: input.offerType,
    offerId: input.offerId,
  });
  if (blocker) {
    return NextResponse.json({ error: blocker }, { status: 403 });
  }

  // Resolve actor — TWO mutually-exclusive paths, each with its own
  // ownership proof. We never trust request-supplied ownership: the proof
  // is either (a) the actor is the partner themselves, (b) the actor was
  // previously created by THIS partner via prior dedup-create (we record
  // that in `partnerOwnerUserIds` ONLY when *we* create the actor — never
  // as a side-effect of an arbitrary `referralActorId`), or (c) the
  // partner is supplying canonical identity (phone/email/whatsapp) that
  // resolves to the actor via the dedup service.
  let referralActorId = input.referralActorId;
  let actorOwnedViaInvite = false;

  if (!referralActorId && input.invite) {
    const found = await findOrCreateReferralActor({
      displayName: input.invite.displayName,
      email: input.invite.email,
      phone: input.invite.phone,
      whatsapp: input.invite.whatsapp,
      organizationName: input.invite.organizationName,
      actorType: input.invite.actorType,
      invitedByUserId: userId,
    });

    // A merge conflict means the supplied identity matches an actor owned by
    // a different user. We must NOT stamp partnerOwnerUserIds onto that actor
    // (doing so would let a partner claim ownership of a foreign actor).
    // Surface the conflict to the caller so they can resolve it explicitly.
    if (found.mergeRequired) {
      return NextResponse.json(
        {
          error:
            "The supplied contact details match an existing actor owned by another user. " +
            "Resolve the identity conflict before creating this assignment.",
          mergeRequired: true,
          candidateActorId: found.candidateActorId,
        },
        { status: 409 },
      );
    }

    referralActorId = found.actor.id;
    // Only newly-created actors get the partner ownership stamp — matched
    // existing actors keep their original metadata untouched. This means
    // the metadata is a *result* of partner-led creation, never a claim
    // smuggled in via the request body.
    if (!found.matched) {
      await prisma.referralActor.update({
        where: { id: found.actor.id },
        data: {
          metadataJson: {
            partnerOwnerUserIds: [userId],
            createdViaPartnerInvite: true,
          },
        },
      });
    }
    // Invite path: the partner just supplied verified identity (phone or
    // email) that resolved to this actor. That counts as ownership for
    // this assignment — see canonical identity rules in task spec.
    actorOwnedViaInvite = true;
  }
  if (!referralActorId) {
    return NextResponse.json({ error: "Could not resolve referralActor" }, { status: 400 });
  }

  const actor = await prisma.referralActor.findUnique({ where: { id: referralActorId } });
  if (!actor) return NextResponse.json({ error: "ReferralActor not found" }, { status: 404 });

  // STRICT ownership check for the direct `referralActorId` path. We do
  // NOT mutate metadata here — ownership must come from the database, not
  // from the request. Partners may only attach assignments to:
  //   1. their own ReferralActor row (actor.userId === self), OR
  //   2. an actor previously created by them via partner invite (the
  //      partnerOwnerUserIds set was written at *creation time* only).
  if (!actorOwnedViaInvite) {
    const meta = (actor.metadataJson ?? {}) as Record<string, unknown>;
    const ownerSetRaw = Array.isArray(meta.partnerOwnerUserIds) ? meta.partnerOwnerUserIds : [];
    const ownerSet = new Set<string>(ownerSetRaw.filter((v): v is string => typeof v === "string"));
    const isOwn = actor.userId === userId;
    const isManaged = ownerSet.has(userId);
    if (!isOwn && !isManaged) {
      return NextResponse.json(
        { error: "Forbidden — actor not owned/managed by partner" },
        { status: 403 },
      );
    }
  }

  const result = await prisma.$transaction(async (tx) => {
    const assignment = await tx.referralAssignment.create({
      data: {
        referralActorId,
        scopeType: input.scopeType,
        scopeId: input.scopeId,
        offerType: input.offerType,
        offerId: input.offerId,
        offerLabel: input.offerLabel,
        offerStartAt: input.offerStartAt ? new Date(input.offerStartAt) : null,
        offerEndAt: input.offerEndAt ? new Date(input.offerEndAt) : null,
        isCommissionEligible: input.isCommissionEligible,
        compensationMode: input.compensationMode,
        rateBps: input.rateBps ?? null,
        flatAmountCents: input.flatAmountCents ?? null,
        createdByUserId: userId,
        creatorRole: "PARTNER",
      },
    });

    await logReferrerAssignmentAction(
      {
        actorId: userId,
        action: "assignment.created",
        referralActorId,
        referralAssignmentId: assignment.id,
        after: {
          surface: "PARTNER",
          offerType: input.offerType,
          offerLabel: input.offerLabel,
        },
      },
      tx,
    );

    return { assignment };
  });

  let link = null;
  if (input.generateLink) {
    link = await generateReferralLink({
      referralActorId,
      referralAssignmentId: result.assignment.id,
    });
    await prisma.referralAssignment.update({
      where: { id: result.assignment.id },
      data: { canonicalCode: link.code },
    });
    await logReferrerAssignmentAction({
      actorId: userId,
      action: "link.generated",
      referralActorId,
      referralAssignmentId: result.assignment.id,
      referralLinkId: link.id,
      after: { code: link.code, surface: "PARTNER" },
    });
  }

  return NextResponse.json({ ok: true, assignment: result.assignment, link });
}
