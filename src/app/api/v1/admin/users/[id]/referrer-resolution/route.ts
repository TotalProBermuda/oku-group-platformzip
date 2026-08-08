import { NextResponse } from "next/server";
import { requireSession } from "@/server/auth/session";
import { requirePermission } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { normaliseEmail, normalisePhone } from "@/server/referrals/referralActorIdentityService";

export type ReferrerResolutionState =
  | "resolved_v2"
  | "actor_no_link"
  | "actor_unlinked"
  | "resolved_legacy"
  | "unresolved"
  | "not_applicable"
  | "merge_required";

export type ReferrerResolutionResult = {
  state: ReferrerResolutionState;
  label: string;
  reason: string;
  actor: {
    id: string;
    displayName: string;
    actorType: string;
    actorTypeCode: string | null;
    activeLinkCount: number;
  } | null;
  legacyReferrer: {
    id: string;
    fullName: string;
    referrerType: string;
    referralCode: string;
  } | null;
};

/**
 * Resolve the referrer identity state for a given user.
 * Returns one of five states (see task spec).
 */
export async function resolveReferrerResolution(
  userId: string,
): Promise<ReferrerResolutionResult> {
  // 1. ReferralActor directly linked to this user?
  const actorByUser = await prisma.referralActor.findUnique({
    where: { userId },
    include: {
      links: { where: { isActive: true }, select: { id: true } },
    },
  });

  if (actorByUser) {
    const activeLinkCount = actorByUser.links.length;
    const actorSummary = {
      id: actorByUser.id,
      displayName: actorByUser.displayName,
      actorType: actorByUser.actorType,
      actorTypeCode: actorByUser.actorTypeCode ?? null,
      activeLinkCount,
    };

    if (activeLinkCount >= 1) {
      return {
        state: "resolved_v2",
        label: "Profile resolved",
        reason: "ReferralActor linked to this user with at least one active referral code.",
        actor: actorSummary,
        legacyReferrer: null,
      };
    }

    return {
      state: "actor_no_link",
      label: "Actor linked — no active referral code",
      reason:
        "A ReferralActor is linked to this user, but they have no active referral link. " +
        "Create or activate a link so the user can share their code.",
      actor: actorSummary,
      legacyReferrer: null,
    };
  }

  // 2. Actor found by email/phone with userId === null?
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, phone: true },
  });

  if (user) {
    const normEmail = normaliseEmail(user.email);
    const normPhone = normalisePhone(user.phone);
    const orClauses = [];
    if (normEmail) orClauses.push({ email: { equals: normEmail, mode: "insensitive" as const } });
    if (normPhone) orClauses.push({ phone: { endsWith: normPhone } });

    if (orClauses.length > 0) {
      const unlinkedActor = await prisma.referralActor.findFirst({
        where: { AND: [{ OR: orClauses }, { userId: null }] },
        include: { links: { where: { isActive: true }, select: { id: true } } },
        orderBy: { createdAt: "asc" },
      });

      if (unlinkedActor) {
        return {
          state: "actor_unlinked",
          label: "Unresolved — actor found, not linked",
          reason:
            "A ReferralActor matching this user's email or phone was found, but is not yet linked " +
            "to their account. Link the actor to grant dashboard access.",
          actor: {
            id: unlinkedActor.id,
            displayName: unlinkedActor.displayName,
            actorType: unlinkedActor.actorType,
            actorTypeCode: unlinkedActor.actorTypeCode ?? null,
            activeLinkCount: unlinkedActor.links.length,
          },
          legacyReferrer: null,
        };
      }
    }
  }

  // 3. Legacy Referrer row (no actor)?
  const legacy = await prisma.referrer.findUnique({
    where: { userId },
    select: {
      id: true,
      fullName: true,
      referrerType: true,
      referralCode: true,
      // Select userId on the actor so we can detect ownership mismatches.
      referralActor: { select: { id: true, userId: true } },
    },
  });

  if (legacy) {
    const legacySummary = {
      id: legacy.id,
      fullName: legacy.fullName,
      referrerType: legacy.referrerType,
      referralCode: legacy.referralCode,
    };

    if (legacy.referralActor) {
      const linkedActor = legacy.referralActor;

      // Actor belongs to a different user — hard-blocked, merge required.
      if (linkedActor.userId !== null && linkedActor.userId !== userId) {
        return {
          state: "merge_required",
          label: "Blocked — actor owned by another user",
          reason:
            "The ReferralActor associated with this legacy Referrer record is currently " +
            "linked to a different user account. A manual merge is required before " +
            "this user can be granted dashboard access.",
          actor: null,
          legacyReferrer: legacySummary,
        };
      }

      // Actor exists but userId is null — must be linked first (not create_link).
      if (linkedActor.userId === null) {
        const activeLinkCount = await prisma.referralLink.count({
          where: { referralActorId: linkedActor.id, isActive: true },
        });
        return {
          state: "actor_unlinked",
          label: "Unresolved — actor found via legacy, not linked",
          reason:
            "A ReferralActor is associated with this user's legacy Referrer record " +
            "but is not yet linked to their account. Link the actor to grant dashboard access.",
          actor: {
            id: linkedActor.id,
            displayName: legacy.fullName,
            actorType: legacy.referrerType,
            actorTypeCode: null,
            activeLinkCount,
          },
          legacyReferrer: legacySummary,
        };
      }

      // Actor userId === userId — check active links.
      const actorLinks = await prisma.referralLink.count({
        where: { referralActorId: linkedActor.id, isActive: true },
      });
      if (actorLinks >= 1) {
        return {
          state: "resolved_v2",
          label: "Profile resolved",
          reason: "ReferralActor linked via legacy Referrer with at least one active referral code.",
          actor: {
            id: linkedActor.id,
            displayName: legacy.fullName,
            actorType: legacy.referrerType,
            actorTypeCode: null,
            activeLinkCount: actorLinks,
          },
          legacyReferrer: legacySummary,
        };
      }
      return {
        state: "actor_no_link",
        label: "Actor linked — no active referral code",
        reason:
          "A ReferralActor is linked to this user via their legacy Referrer record, " +
          "but they have no active referral link. Create or activate a link.",
        actor: {
          id: linkedActor.id,
          displayName: legacy.fullName,
          actorType: legacy.referrerType,
          actorTypeCode: null,
          activeLinkCount: 0,
        },
        legacyReferrer: legacySummary,
      };
    }

    return {
      state: "resolved_legacy",
      label: "Profile resolved (legacy)",
      reason:
        "This user has a legacy Referrer record but no linked ReferralActor. " +
        "The dashboard will fall back to the legacy profile.",
      actor: null,
      legacyReferrer: legacySummary,
    };
  }

  // 4. No actor, no legacy referrer. Only return "unresolved" (with a Create action)
  // for users that have a referrer-capable role. For all others, return not_applicable
  // so the admin card doesn't offer to create a referrer profile for customers/staff.
  // Include both formal RoleKey values AND any actor-type-code strings that may
  // have been used as ad-hoc role keys for taxi, concierge, tour guide, etc.
  // Using a broad set so taxi/concierge users with no legacy row get "unresolved"
  // (actionable) rather than "not_applicable" (silent).
  const REFERRER_CAPABLE_ROLES = new Set([
    // Formal platform roles
    "REFERRER", "INFLUENCER", "PARTNER", "STREETSIDE_HOST", "RESTAURANT_HOST",
    // Actor-type-code values that may also appear as custom role keys
    "TAXI_DRIVER", "UBER_DRIVER", "HOTEL_CONCIERGE", "CONCIERGE",
    "TOUR_GUIDE", "PROMOTER", "PRIVATE_NETWORK", "INFLUENCER_SUB_REFERRER",
  ]);
  const userWithRoles = await prisma.user.findUnique({
    where: { id: userId },
    select: { roles: { select: { roleKey: true } } },
  });
  const hasReferrerCapableRole = (userWithRoles?.roles ?? []).some((r) =>
    REFERRER_CAPABLE_ROLES.has(r.roleKey),
  );

  if (!hasReferrerCapableRole) {
    return {
      state: "not_applicable",
      label: "Not applicable",
      reason: "This user does not have a referrer-capable role (REFERRER, INFLUENCER, PARTNER, STREETSIDE_HOST, RESTAURANT_HOST, TAXI_DRIVER, HOTEL_CONCIERGE, TOUR_GUIDE, PROMOTER, or similar).",
      actor: null,
      legacyReferrer: null,
    };
  }

  return {
    state: "unresolved",
    label: "Unresolved — no actor found",
    reason:
      "No ReferralActor or legacy Referrer record is associated with this user. " +
      "Create a referrer identity to grant dashboard and attribution access.",
    actor: null,
    legacyReferrer: null,
  };
}

/**
 * GET /api/v1/admin/users/[id]/referrer-resolution
 *
 * Returns the referrer identity resolution state for the specified user.
 * Used by the admin user drawer to render the diagnostic card.
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { roles } = await requireSession();
    requirePermission(roles, "admin:users:edit");
    const { id } = await ctx.params;

    const result = await resolveReferrerResolution(id);
    return NextResponse.json({ ok: true, resolution: result });
  } catch (e: unknown) {
    const err = e as { message?: string; status?: number };
    return NextResponse.json(
      { ok: false, error: err.message ?? "Unknown error" },
      { status: err.status ?? 500 },
    );
  }
}
