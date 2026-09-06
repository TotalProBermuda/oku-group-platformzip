import { NextResponse } from "next/server";
import { requireSession } from "@/server/auth/session";
import { prisma } from "@/lib/prisma";
import { provisionHostPersonalReferrer } from "@/server/events/eventReferrerService";
import {
  resolveOwnedEarnerIdentities,
  myReferralsReservationWhere,
  myReferralsLookbackStart,
} from "@/server/referrals/myReferralsSource";
import { ensureStreetsideReferralIdentity } from "@/server/referrals/streetsideReferralService";

export async function GET() {
  try {
    const { userId, roles } = await requireSession();

    const isHost = roles.some((r) =>
      ["RESTAURANT_HOST", "RESTAURANT_SUPERVISOR", "FB_DIRECTOR", "ADMIN_COMMERCIAL", "STREETSIDE_HOST", "SUPERADMIN"].includes(r)
    );
    if (!isHost) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const isRestaurantHost = roles.some((r) => ["RESTAURANT_HOST", "RESTAURANT_SUPERVISOR", "FB_DIRECTOR", "ADMIN_COMMERCIAL", "SUPERADMIN"].includes(r));
    const isStreetsideHost = roles.includes("STREETSIDE_HOST");

    // Streetside hosts are first-class referrers (employed by the
    // restaurant). Make sure every host has a personal commission code
    // before we read their assignments — idempotent, so calling on
    // every request is cheap (one indexed lookup) and means hosts
    // never see "no referral code yet" again.
    //
    // We track whether provisioning succeeded so the UI can show an
    // explicit "couldn't load your QR right now" message instead of
    // silently rendering a refless QR if something went wrong.
    let provisionFailed = false;
    const hostProfile = await prisma.restaurantHostProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (hostProfile) {
      try {
        const provisionResult = await provisionHostPersonalReferrer(hostProfile.id);
        if (!provisionResult.ok) {
          // Identity merge conflict — actor already exists under a different user.
          // Write to AuditLog (not just console) so admins can find and resolve
          // the conflict without relying on server log rotation.
          // Use a distinct action name so this surface context is searchable
          // separately from the generic referral.actor.merge_required rows the
          // dedupe service writes.
          provisionFailed = true;
          await prisma.auditLog.create({
            data: {
              actorId: userId,
              action: "host.me.referral_actor_conflict",
              metadata: {
                hostProfileId: hostProfile.id,
                hostUserId: userId,
                candidateActorId: provisionResult.candidateActorId,
                surface: "host.me",
              } as object,
            },
          });
        }
      } catch (provisionErr) {
        provisionFailed = true;
        // Log but don't fail the whole /me request — the host can
        // still see bookings/queue without a code; admin can intervene.
        console.error("[host/me] provisionHostPersonalReferrer failed", provisionErr);
      }
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        imageUrl: true,
        roles: { select: { roleKey: true } },
        restaurantHost: {
          include: {
            venue: { select: { id: true, name: true, slug: true } },
            parentProfile: { select: { id: true, displayName: true } },
            referrerAssignments: {
              where: { status: "ACTIVE" },
              select: {
                id: true,
                displayName: true,
                referralCode: true,
                referralUrl: true,
                qrCodeImageUrl: true,
                isCommissionEligible: true,
                commissionMode: true,
                commissionShareBps: true,
                commissionPayer: true,
                scopeType: true,
                // Needed downstream to distinguish the host's
                // self-anchored personal code (parentHostProfileId =
                // host.id) from delegated seats where they're just the
                // recipient of a partner/influencer-anchored row.
                parentHostProfileId: true,
                series: { select: { id: true, title: true } },
              },
            },
          },
        },
      },
    });

    if (!user) {
      return NextResponse.json({ ok: false, error: "User not found" }, { status: 404 });
    }

    const venue = await prisma.venue.findFirst();

    // Same rolling-window rationale as getHostQueue: server runs in UTC,
    // Venue has no timezone column, so the old midnight-bounded window was
    // dropping Panama-evening bookings into "yesterday". -12h covers
    // still-active seated tables; +30h covers tonight + tomorrow prep.
    const now = new Date();
    const windowStart = new Date(now.getTime() - 12 * 60 * 60 * 1000);
    const windowEnd = new Date(now.getTime() + 30 * 60 * 60 * 1000);
    // For commission-day rollups, keep "since start of today (UTC)" — that's
    // an admin counter, not the host queue, and changing it would shift
    // payout numbers visible to hosts.
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Reservation include shape, reused for both the active queue and the
    // 7-day closed window so both lists carry the full attribution chain
    // the host UI needs to render referrer/host names and the bind UI.
    // NOTE: `include: {}` returns top-level scalar fields by default — that
    // means hostUserId / source / status / seatedAt / confirmationCode all
    // come back without being explicitly listed.
    const reservationInclude = {
      zone: { select: { name: true, conceptKey: true } },
      handoffs: { orderBy: { createdAt: "desc" as const }, take: 1 },
      attributions: {
        include: { referrer: { select: { fullName: true, referrerType: true } } },
        take: 1,
      },
      // Same rationale as src/server/host/hostService.ts INCLUDE_FULL:
      // the legacy `attributions` row is missing for actor-only chains
      // (RAFNH01-style host links, INFLUENCER_SUB_REFERRER, etc.). The
      // host UI falls back to `attributionSession.referralActor` /
      // `attributionSession.legacyReferrer` so every QR-attributed
      // booking shows the correct "Referred by" name.
      attributionSession: {
        include: {
          referralActor:  { select: { id: true, displayName: true, actorType: true } },
          legacyReferrer: { select: { id: true, fullName: true,    referrerType: true } },
          // BindInvuOrderControl reads bindings[0]?.invuOrderId and
          // tableSession?.openedInvuOrderId to decide whether the
          // session is already bound to a POS order. Omitting these
          // makes `bindings` undefined on the client and crashes
          // when the component tries `bindings[0]`.
          bindings: {
            select: { invuOrderId: true, bindingType: true, createdAt: true },
            orderBy: { createdAt: "desc" as const },
            take: 1,
          },
          tableSession: { select: { openedInvuOrderId: true, invuReferenceField: true } },
        },
      },
      addons: { select: { addonType: true, label: true } },
      assignedHost: { select: { displayName: true, badgeColor: true } },
      statusLogs: {
        select: { toStatus: true, changedAt: true, changedByLabel: true, notes: true },
        orderBy: { changedAt: "desc" as const },
        take: 20,
      },
    } as const;

    // 7-day closed window for the host dashboard's "Closed" tab. Same
    // include shape so the front-end card renders identically. Uses
    // reservationDate (not COMPLETED-at) so the row stays attached to
    // the night the guest dined, which is what hosts intuit when they
    // ask "what did we close last week?".
    const CLOSED_WINDOW_DAYS = 7;
    const closedWindowStart = new Date(now.getTime() - CLOSED_WINDOW_DAYS * 24 * 60 * 60 * 1000);

    const todayReservations = (isRestaurantHost && venue)
      ? await prisma.reservation.findMany({
          where: {
            venueId: venue.id,
            reservationDate: { gte: windowStart, lt: windowEnd },
            status: { notIn: ["CANCELLED", "COMPLETED"] },
          },
          include: reservationInclude,
          orderBy: { reservationDate: "asc" as const },
        })
      : [];

    // A table can be seated and bound late in the night, then its POS close
    // can arrive after the active-queue window rolls over. Keep those
    // actionable, bound-but-unverified reservations visible for the same
    // seven-day period as closed reservations. This deliberately limits the
    // carry-over list to SEATED rows with an open bound table session: old
    // unconfirmed bookings and already-settled tables must not reappear.
    const unresolvedBoundReservations = (isRestaurantHost && venue)
      ? await prisma.reservation.findMany({
          where: {
            venueId: venue.id,
            reservationDate: { gte: closedWindowStart, lt: windowStart },
            status: "SEATED",
            attributionSession: {
              tableSession: {
                is: {
                  openedInvuOrderId: { not: null },
                  closedAt: null,
                },
              },
            },
          },
          include: reservationInclude,
          orderBy: { reservationDate: "desc" as const },
          take: 100,
        })
      : [];

    // Feed carry-over POS work through the existing host-card controls. The
    // date ranges are intentionally non-overlapping, so a reservation is
    // never duplicated in the queue. Hosts can use the normal "Sync closed
    // INVU check" control without reopening or recreating the reservation.
    const actionableReservations = [...todayReservations, ...unresolvedBoundReservations];

    const closedReservations = (isRestaurantHost && venue)
      ? await prisma.reservation.findMany({
          where: {
            venueId: venue.id,
            reservationDate: { gte: closedWindowStart, lt: windowEnd },
            status: "COMPLETED",
          },
          include: reservationInclude,
          orderBy: { reservationDate: "desc" as const },
          take: 100, // sane cap so a busy week can't blow up the response
        })
      : [];

    // The host name behind a HOST_WALKIN AttributionSession lives on
    // `User`, not `AttributionSession`. Batch-load all referenced host
    // user names in one query so the front-end can render "Walked in by
    // <name>" without N+1 calls or another schema relation.
    const hostUserIdSet = new Set<string>();
    for (const r of [...actionableReservations, ...closedReservations]) {
      const id = (r as { attributionSession?: { hostUserId?: string | null } | null })
        .attributionSession?.hostUserId;
      if (id) hostUserIdSet.add(id);
    }
    const hostUserNameById: Record<string, string> = {};
    if (hostUserIdSet.size > 0) {
      const hostUsers = await prisma.user.findMany({
        where: { id: { in: Array.from(hostUserIdSet) } },
        select: { id: true, name: true },
      });
      for (const u of hostUsers) {
        if (u.name) hostUserNameById[u.id] = u.name;
      }
    }

    // Streetside host: show every booking attributed to any earner identity
    // this host owns — their personal QR chain (ReferralActor, possibly not
    // user-linked), any legacy referrer, their own walk-ins/check-ins — PLUS
    // the legacy direct-submission handoff fingerprint. Resolved through the
    // ONE shared "my referrals" source (Task #140) so the ownership rules
    // never drift across surfaces.
    //
    // The old query windowed on `createdAt >= now-8h`, which silently dropped
    // BOTH future-dated reservations (created earlier than 8h ago) and
    // tonight's bookings taken the day before — the streetside "Active" bug.
    // We now window on the Panama-local SERVICE date via `reservationDate`,
    // so upcoming bookings surface and stay visible through their service day.
    const mySubmissions = isStreetsideHost
      ? await (async () => {
          const ids = await resolveOwnedEarnerIdentities(userId);
          const lookbackStart = myReferralsLookbackStart(now);
          return prisma.reservation.findMany({
            where: myReferralsReservationWhere(ids, lookbackStart, [
              {
                source: "STREETSIDE_HOST",
                handoffs: { some: { sentByLabel: userId } },
              },
            ]),
            include: {
              zone: { select: { name: true, conceptKey: true } },
              handoffs: { orderBy: { createdAt: "desc" }, take: 1 },
              statusLogs: { orderBy: { changedAt: "desc" }, take: 1 },
              attributionSession: {
                include: {
                  referralActor:  { select: { id: true, displayName: true, actorType: true } },
                  legacyReferrer: { select: { id: true, fullName: true,    referrerType: true } },
                },
              },
            },
            // Newest-first so the cap can only truncate the OLDEST history
            // tail, never upcoming/active or future-dated bookings (the
            // "false empty active" bug). The client re-splits by Panama day.
            orderBy: { reservationDate: "desc" },
            take: 200,
          });
        })()
      : [];

    // Active inbound handoffs
    const inboundHandoffs = (isRestaurantHost && venue)
      ? await prisma.reservationHandoff.findMany({
          where: {
            handoffStatus: { in: ["PENDING", "ACKNOWLEDGED", "GUEST_EN_ROUTE", "GUEST_ARRIVED"] },
            reservation: { venueId: venue.id },
          },
          include: {
            reservation: {
              include: {
                zone: { select: { name: true, conceptKey: true } },
                attributions: {
                  include: { referrer: { select: { fullName: true, referrerType: true } } },
                  take: 1,
                },
                attributionSession: {
                  include: {
                    referralActor:  { select: { id: true, displayName: true, actorType: true } },
                    legacyReferrer: { select: { id: true, fullName: true,    referrerType: true } },
                  },
                },
              },
            },
          },
          orderBy: { createdAt: "desc" },
          take: 20,
        })
      : [];

    // Open chat sessions
    const chatSessions = venue
      ? await prisma.hostChatSession.findMany({
          where: {
            venueId: venue.id,
            status: { in: ["OPEN", "WAITING"] },
          },
          include: {
            messages: { orderBy: { createdAt: "desc" }, take: 1 },
          },
          orderBy: { updatedAt: "desc" },
          take: 20,
        })
      : [];

    const referrerAssignmentIds = (user.restaurantHost?.referrerAssignments ?? []).map((a) => a.id);
    const commissions = referrerAssignmentIds.length > 0
      ? await prisma.order.findMany({
          where: {
            attributedEventReferrerAssignmentId: { in: referrerAssignmentIds },
            createdAt: { gte: today },
            status: { notIn: ["CANCELLED", "REFUNDED"] },
          },
          select: {
            id: true,
            status: true,
            totalCents: true,
            commissionCents: true,
            coversCount: true,
            placedAt: true,
            createdAt: true,
          },
          orderBy: { createdAt: "desc" },
        })
      : [];

    // Pick the host's PERSONAL self-anchored assignment specifically.
    // `referrerAssignments` may also contain delegated seats (where this
    // host is the recipient on a partner/influencer-anchored row), and
    // we don't want the streetside QR to encode one of those — that
    // would credit the wrong anchor. The personal one is always
    // parentHostProfileId === host.id.
    const personalReferrerAssignment =
      user.restaurantHost?.referrerAssignments.find(
        (a) =>
          (a as unknown as { parentHostProfileId?: string | null })
            .parentHostProfileId === user.restaurantHost?.id
      ) ?? null;

    // Streetside hosts have no RestaurantHostProfile, so the profile-anchored
    // `personalReferrerAssignment` above is null for them and their Guest QR
    // would carry no `?ref=` code (every scan → unattributed DIRECT booking,
    // invisible in their feed). Lazily ensure the governed, profile-independent
    // identity (ReferralActor + ReferralLink) and surface its code. The
    // profiled-host path above still wins, so this leaves it untouched.
    let streetsideReferralCode: string | null = null;
    if (isStreetsideHost && !personalReferrerAssignment) {
      try {
        const result = await ensureStreetsideReferralIdentity(
          prisma,
          userId,
          user.name ?? "Streetside Host"
        );
        if (result.ok) {
          streetsideReferralCode = result.code;
        } else {
          // merge_required: the matching actor belongs to a different user.
          // Do NOT issue a QR code — surface the banner so the host contacts
          // support to resolve the conflict.
          provisionFailed = true;
          console.warn(
            "[GET /api/v1/host/me] ensureStreetsideReferralIdentity merge_required",
            {
              userId,
              candidateActorId: result.candidateActorId,
              matchField: result.matchField,
              reason: result.reason,
            }
          );
        }
      } catch (err) {
        // Mirror the provisionHostPersonalReferrer failure path: surface a
        // banner rather than 500, so the host knows scans aren't credited.
        provisionFailed = true;
        console.error(
          "[GET /api/v1/host/me] ensureStreetsideReferralIdentity failed",
          { userId, err }
        );
      }
    }

    return NextResponse.json({
      ok: true,
      data: {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          imageUrl: user.imageUrl,
          roles: user.roles.map((r) => r.roleKey),
        },
        hostProfile: user.restaurantHost,
        // Suppress the assignment from the response when provisioning failed
        // due to a merge conflict so the front-end shows the "couldn't load
        // QR" banner instead of rendering an assignment whose actor bridge is
        // unresolved (active-but-unanchored state).
        personalReferrerAssignment: provisionFailed ? null : personalReferrerAssignment,
        // Profile-independent Guest-QR code for streetside hosts (null for
        // profiled hosts, who use personalReferrerAssignment.referralCode).
        streetsideReferralCode,
        provisionFailed,
        todayReservations: actionableReservations,
        // Closed within the last 7 days at this venue. Powers the host
        // dashboard's Closed tab + stats chip. Empty for non-restaurant
        // hosts (their Closed view is currently scoped to mySubmissions).
        closedReservations,
        // hostUserId → display name lookup, populated for both
        // todayReservations and closedReservations. The client uses this
        // to render "Walked in by <name>" for HOST_WALKIN sessions
        // without needing another schema relation on AttributionSession.
        hostUserNameById,
        mySubmissions,
        inboundHandoffs,
        chatSessions,
        commissions,
        venue: venue ? { id: venue.id, name: venue.name } : null,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: e.status || 500 });
  }
}
