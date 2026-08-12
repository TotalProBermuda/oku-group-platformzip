import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminRoles } from "@/server/auth/adminGuard";
import { prisma } from "@/lib/prisma";
import { ReferralActorType } from "@prisma/client";
import { nanoid } from "nanoid";
import {
  resolveReferrerResolution,
} from "../route";
import {
  findOrLinkReferralActor,
} from "@/server/referrals/referralActorDedupeService";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://okuhospitality.com";

function buildLinkCode(prefix = "REF"): string {
  return `${prefix}-${nanoid(8).toUpperCase()}`;
}

function buildLinkUrl(code: string): string {
  return `${APP_URL}/r/${code}`;
}

/**
 * Derive ReferralActorType from the user's roles and/or their legacy referrerType.
 * Role takes priority, then legacy referrerType direct mapping.
 * ReferralActorType enum values: STREETSIDE_HOST | TAXI_DRIVER | UBER_DRIVER |
 *   TOUR_GUIDE | HOTEL_CONCIERGE | INFLUENCER_SUB_REFERRER | PROMOTER |
 *   PRIVATE_NETWORK | OTHER
 */
// Unified mapping used for both role keys and legacy referrerType strings.
// Covers formal RoleKey values, actor-type-code strings used as ad-hoc role keys,
// and legacy Referrer.referrerType enum values.
const ROLE_OR_TYPE_TO_ACTOR: Record<string, ReferralActorType> = {
  // Role keys (formal + actor-type-code ad-hoc)
  STREETSIDE_HOST:         ReferralActorType.STREETSIDE_HOST,
  INFLUENCER:              ReferralActorType.INFLUENCER_SUB_REFERRER,
  INFLUENCER_SUB_REFERRER: ReferralActorType.INFLUENCER_SUB_REFERRER,
  TAXI_DRIVER:             ReferralActorType.TAXI_DRIVER,
  UBER_DRIVER:             ReferralActorType.UBER_DRIVER,
  HOTEL_CONCIERGE:         ReferralActorType.HOTEL_CONCIERGE,
  CONCIERGE:               ReferralActorType.HOTEL_CONCIERGE,
  TOUR_GUIDE:              ReferralActorType.TOUR_GUIDE,
  PROMOTER:                ReferralActorType.PROMOTER,
  PRIVATE_NETWORK:         ReferralActorType.PRIVATE_NETWORK,
};

/**
 * Derive ReferralActorType from the user's roles and/or their legacy referrerType.
 * Role key check runs first (priority order matters for INFLUENCER vs STREETSIDE_HOST).
 * Falls back to legacy referrerType, then OTHER.
 */
function deriveActorType(
  roles: string[],
  legacyReferrerType?: string | null,
): { actorType: ReferralActorType } {
  // Priority-ordered role scan — first match wins.
  const PRIORITY_ROLES = [
    "STREETSIDE_HOST", "TAXI_DRIVER", "UBER_DRIVER", "HOTEL_CONCIERGE", "CONCIERGE",
    "TOUR_GUIDE", "PROMOTER", "PRIVATE_NETWORK", "INFLUENCER_SUB_REFERRER", "INFLUENCER",
  ];
  for (const roleKey of PRIORITY_ROLES) {
    if (roles.includes(roleKey) && ROLE_OR_TYPE_TO_ACTOR[roleKey]) {
      return { actorType: ROLE_OR_TYPE_TO_ACTOR[roleKey] };
    }
  }
  // Fallback: legacy referrerType direct mapping.
  if (legacyReferrerType && ROLE_OR_TYPE_TO_ACTOR[legacyReferrerType]) {
    return { actorType: ROLE_OR_TYPE_TO_ACTOR[legacyReferrerType] };
  }
  return { actorType: ReferralActorType.OTHER };
}

const Body = z.object({
  mode: z.enum(["link", "create", "create_link"]),
  actorId: z.string().optional(),
});

/**
 * POST /api/v1/admin/users/[id]/referrer-resolution/resolve
 *
 * Performs one of three resolve actions:
 *  - "link":        link an existing unlinked actor to this user.
 *  - "create":      create a new actor (+ link) for this user, via the
 *                   canonical dedupe service.
 *  - "create_link": user already has a linked actor but no active link;
 *                   create or reactivate a ReferralLink.
 *
 * All modes write a structured AuditLog entry and return the updated
 * resolution state.
 *
 * Convention: HTTP 409 is reserved exclusively for cross-user identity
 * conflicts (merge_required from the dedupe service). Same-user idempotent
 * matches always succeed. Future implementors: do not return 409 for
 * same-user "already exists" cases — use a descriptive error message with
 * a 409 only when a DIFFERENT user owns the conflicting actor.
 */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { userId: adminUserId } = await requireAdminRoles(req, ["SUPERADMIN"]);
    const { id: targetUserId } = await ctx.params;

    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: "Invalid request body", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const { mode, actorId } = parsed.data;

    // Load the target user (with roles for actorType derivation)
    const targetUser = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: {
        id: true,
        email: true,
        phone: true,
        name: true,
        roles: { select: { roleKey: true } },
      },
    });
    if (!targetUser) {
      return NextResponse.json(
        { ok: false, error: "User not found" },
        { status: 404 },
      );
    }

    if (mode === "link") {
      // ── Link an existing actor to this user ─────────────────────────────
      if (!actorId) {
        return NextResponse.json(
          { ok: false, error: "actorId is required for mode=link" },
          { status: 400 },
        );
      }

      const actor = await prisma.referralActor.findUnique({
        where: { id: actorId },
        include: { links: { where: { isActive: true }, select: { id: true } } },
      });
      if (!actor) {
        return NextResponse.json(
          { ok: false, error: "ReferralActor not found" },
          { status: 404 },
        );
      }

      if (actor.userId !== null && actor.userId !== targetUserId) {
        return NextResponse.json(
          {
            ok: false,
            error:
              "This actor is already linked to a different user. " +
              "A merge flow is required to reassign it.",
          },
          { status: 409 },
        );
      }

      const previousActorUserId = actor.userId;

      await prisma.$transaction(async (tx) => {
        await tx.referralActor.update({
          where: { id: actorId },
          data: { userId: targetUserId },
        });

        await tx.auditLog.create({
          data: {
            actorId: adminUserId,
            action: "referrer.profile.resolved",
            metadata: {
              adminUserId,
              targetUserId,
              actorId,
              previousActorUserId,
              newActorUserId: targetUserId,
              mode: "link",
              referralLinkCreated: false,
              referralLinkReused: false,
            },
          },
        });
      });
    } else if (mode === "create") {
      // ── Create/resolve actor via canonical dedupe service ────────────────
      //
      // findOrLinkReferralActor runs the 7-step dedup chain. Possible outcomes:
      //   • found_existing_linked   — actor already belongs to targetUserId → 200 (idempotent)
      //   • merge_required          — actor belongs to a DIFFERENT user → 409 (cross-user)
      //   • blocked                 — legacy code taken, no replacement allowed → 409
      //   • linked / found_existing_unlinked — unowned actor now linked to targetUserId
      //   • reactivated_link        — actor linked + inactive link reactivated
      //   • created                 — new actor minted
      //
      // Convention: HTTP 409 is ONLY for cross-user conflicts (merge_required) and
      // blocked provisioning. Same-user matches (found_existing_linked) → 200 always.

      const userRoles = targetUser.roles.map((r) => r.roleKey);

      // Quick legacy-referrer lookup for actorType derivation only.
      // Full legacy-referrer integration (legacyReferrerId binding) is handled
      // by findOrLinkReferralActor step 4 internally.
      const legacy = await prisma.referrer.findUnique({
        where: { userId: targetUserId },
        select: { referrerType: true, referralCode: true },
      });

      const { actorType } = deriveActorType(userRoles, legacy?.referrerType ?? null);
      const displayName = targetUser.name ?? targetUser.email ?? "Referrer";

      const dedupeResult = await findOrLinkReferralActor(
        {
          actorType,
          displayName,
          email: targetUser.email ?? undefined,
          phone: targetUser.phone ?? undefined,
          userId: targetUserId,
          initiatedByUserId: adminUserId,
        },
        { isProvisioningCall: true },
      );

      // Cross-user identity conflict — requires admin merge resolution (Task #170).
      // Convention: 409 merge_required = different user owns the matching actor.
      if (dedupeResult.status === "merge_required") {
        return NextResponse.json(
          {
            ok: false,
            code: "merge_required",
            candidateActorId: dedupeResult.candidateActorId,
            candidateActorUserId: dedupeResult.candidateActorUserId ?? null,
            matchField: dedupeResult.matchField,
          },
          { status: 409 },
        );
      }

      // Provisioning blocked (e.g. legacy code taken) — surface the reason.
      if (dedupeResult.status === "blocked") {
        return NextResponse.json(
          { ok: false, error: `Actor provisioning blocked: ${dedupeResult.reason}` },
          { status: 409 },
        );
      }

      // Actor is already correctly linked to this user — idempotent no-op → 200.
      // Convention: same user = success; only cross-user conflicts are 409.
      // Use mode=create_link if a referral link is also needed.
      if (dedupeResult.status === "found_existing_linked") {
        const updated = await resolveReferrerResolution(targetUserId);
        return NextResponse.json({ ok: true, resolution: updated });
      }

      const resolvedActorId = dedupeResult.actorId;
      let referralLinkCreated = false;
      let referralLinkReused = false;

      // The dedupe service reactivates links in the reactivated_link path.
      // All other paths (created, linked, found_existing_unlinked) may need
      // a link created or reactivated by this route.
      if (dedupeResult.status === "reactivated_link") {
        referralLinkReused = true;
      } else {
        // Load all links for the resolved actor to decide on link action.
        const resolvedActor = await prisma.referralActor.findUnique({
          where: { id: resolvedActorId },
          include: {
            links: {
              orderBy: { createdAt: "desc" },
              select: { id: true, isActive: true },
            },
          },
        });

        const activeLinks = (resolvedActor?.links ?? []).filter((l) => l.isActive);
        const inactiveLinks = (resolvedActor?.links ?? []).filter((l) => !l.isActive);

        if (activeLinks.length > 0) {
          referralLinkReused = true;
        } else {
          await prisma.$transaction(async (tx) => {
            if (inactiveLinks.length > 0) {
              await tx.referralLink.update({
                where: { id: inactiveLinks[0].id },
                data: { isActive: true },
              });
              referralLinkReused = true;
            } else {
              // No links at all — prefer the legacy referral code so existing
              // printed/shared codes keep working; fall back to a fresh code.
              let linkCode = legacy?.referralCode ?? buildLinkCode();
              let attempts = 0;
              while (
                await tx.referralLink.findUnique({ where: { code: linkCode }, select: { id: true } })
              ) {
                if (attempts++ > 10) throw new Error("Could not generate a unique referral code");
                linkCode = buildLinkCode();
              }
              await tx.referralLink.create({
                data: {
                  referralActorId: resolvedActorId,
                  code: linkCode,
                  url: buildLinkUrl(linkCode),
                  isActive: true,
                },
              });
              referralLinkCreated = true;
            }
          });
        }
      }

      await prisma.auditLog.create({
        data: {
          actorId: adminUserId,
          action: "referrer.profile.resolved",
          metadata: {
            adminUserId,
            targetUserId,
            actorId: resolvedActorId,
            previousActorUserId: null,
            newActorUserId: targetUserId,
            mode: "create",
            dedupeStatus: dedupeResult.status,
            referralLinkCreated,
            referralLinkReused,
          },
        },
      });
    } else {
      // ── mode = "create_link" ─────────────────────────────────────────────
      // User already has a linked actor — add or reactivate a ReferralLink,
      // but only when no active link already exists (prevent duplicate active links).
      const actor = await prisma.referralActor.findUnique({
        where: { userId: targetUserId },
        include: {
          links: { orderBy: { createdAt: "desc" } },
        },
      });

      if (!actor) {
        return NextResponse.json(
          {
            ok: false,
            error:
              "No ReferralActor is linked to this user. " +
              "Use mode=create to provision one first.",
          },
          { status: 409 },
        );
      }

      // Guard: if an active link already exists, this is a no-op. The caller
      // should have read the resolution state first; if the state is actor_no_link
      // there are no active links yet. This prevents duplicate active links.
      const existingActiveLink = actor.links.find((l) => l.isActive);
      if (existingActiveLink) {
        const updated = await resolveReferrerResolution(targetUserId);
        return NextResponse.json({ ok: true, resolution: updated });
      }

      const inactiveLink = actor.links.find((l) => !l.isActive);
      let referralLinkCreated = false;
      let referralLinkReused = false;

      if (inactiveLink) {
        // Reactivate the most recent inactive link.
        await prisma.$transaction(async (tx) => {
          await tx.referralLink.update({
            where: { id: inactiveLink.id },
            data: { isActive: true },
          });

          await tx.auditLog.create({
            data: {
              actorId: adminUserId,
              action: "referrer.profile.resolved",
              metadata: {
                adminUserId,
                targetUserId,
                actorId: actor.id,
                previousActorUserId: targetUserId,
                newActorUserId: targetUserId,
                mode: "create_link",
                referralLinkCreated: false,
                referralLinkReused: true,
              },
            },
          });
        });
        referralLinkReused = true;
      } else {
        // Create a brand new link.
        await prisma.$transaction(async (tx) => {
          let linkCode = buildLinkCode();
          let attempts = 0;
          while (
            await tx.referralLink.findUnique({ where: { code: linkCode }, select: { id: true } })
          ) {
            if (attempts++ > 10) throw new Error("Could not generate a unique referral code");
            linkCode = buildLinkCode();
          }

          await tx.referralLink.create({
            data: {
              referralActorId: actor.id,
              code: linkCode,
              url: buildLinkUrl(linkCode),
              isActive: true,
            },
          });

          await tx.auditLog.create({
            data: {
              actorId: adminUserId,
              action: "referrer.profile.resolved",
              metadata: {
                adminUserId,
                targetUserId,
                actorId: actor.id,
                previousActorUserId: targetUserId,
                newActorUserId: targetUserId,
                mode: "create_link",
                referralLinkCreated: true,
                referralLinkReused: false,
              },
            },
          });
        });
        referralLinkCreated = true;
      }

      void referralLinkCreated;
      void referralLinkReused;
    }

    // Return updated resolution state
    const updated = await resolveReferrerResolution(targetUserId);
    return NextResponse.json({ ok: true, resolution: updated });
  } catch (e: unknown) {
    const err = e as { message?: string; status?: number };
    return NextResponse.json(
      { ok: false, error: err.message ?? "Unknown error" },
      { status: err.status ?? 500 },
    );
  }
}
