import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/server/auth/session";
import { requirePermission } from "@/lib/rbac";
import { recordIntegrationAudit } from "@/server/services/invu/invuAuditService";

// Roles permitted to bind across ownership boundaries (admin override).
// SUPERADMIN is the only role that both (a) bypasses the host:checkin
// permission gate above and (b) is intended to override object scoping.
// Other admin roles must be granted host:reservations:checkin explicitly
// to call this route at all.
const ADMIN_BIND_ROLES = new Set(["SUPERADMIN"]);

type Body = {
  bookingCode?: string;
  attributionSessionId?: string;
  invuOrderId?: string;
  bindingType?: "TABLE_OPEN_BINDING" | "MANUAL_ADMIN_BIND";
  supportingData?: Record<string, unknown>;
};

export async function POST(req: NextRequest) {
  try {
    const { roles, userId } = await requireSession();
    requirePermission(roles, "host:reservations:checkin");

    const body = (await req.json()) as Body;
    if (!body.invuOrderId?.trim()) {
      return NextResponse.json({ ok: false, error: "invuOrderId is required" }, { status: 400 });
    }
    if (!body.bookingCode && !body.attributionSessionId) {
      return NextResponse.json({ ok: false, error: "bookingCode or attributionSessionId is required" }, { status: 400 });
    }

    const attribution = await prisma.attributionSession.findFirst({
      where: body.attributionSessionId
        ? { id: body.attributionSessionId }
        : { bookingCode: body.bookingCode! },
      select: {
        id: true,
        venueId: true,
        bookingCode: true,
        hostUserId: true,
        createdByUserId: true,
        tableSession: { select: { id: true, openedInvuOrderId: true } },
      },
    });
    if (!attribution) {
      return NextResponse.json({ ok: false, error: "attribution session not found" }, { status: 404 });
    }
    if (!attribution.tableSession) {
      return NextResponse.json({ ok: false, error: "attribution has no table session" }, { status: 500 });
    }

    // Object-level authorization: a regular host may only bind sessions they
    // own (created the booking or were assigned as host). RESTAURANT_HOST users
    // may additionally bind any session whose venue matches their
    // RestaurantHostProfile.venueId — this reflects the actual operational flow,
    // where the maitre d' (not the street greeter) is the one talking to the
    // server about INVU table ids. Admin-class roles may bind any session in any
    // venue and may use MANUAL_ADMIN_BIND.
    //
    // A streetside host who merely *referred* the upstream reservation is NOT
    // an owner for binding purposes: referral identity never grants operational
    // INVU/table control. (Pure STREETSIDE_HOST is already blocked one layer up
    // by the host:reservations:checkin permission gate; this removed branch is
    // the belt-and-suspenders object-scope enforcement.)
    const isAdmin = roles.some((r) => ADMIN_BIND_ROLES.has(r));
    if (!isAdmin) {
      const ownsBySession =
        (attribution.hostUserId && attribution.hostUserId === userId) ||
        (attribution.createdByUserId && attribution.createdByUserId === userId);

      let ownsByVenue = false;
      if (!ownsBySession && roles.includes("RESTAURANT_HOST")) {
        const hostProfile = await prisma.restaurantHostProfile.findUnique({
          where: { userId },
          select: { venueId: true },
        });
        ownsByVenue =
          !!hostProfile?.venueId && hostProfile.venueId === attribution.venueId;
      }

      if (!ownsBySession && !ownsByVenue) {
        return NextResponse.json(
          { ok: false, error: "not authorized to bind this attribution session" },
          { status: 403 }
        );
      }
    }

    // Server-side binding type policy: only admins may write
    // MANUAL_ADMIN_BIND. All host-initiated calls collapse to
    // TABLE_OPEN_BINDING regardless of the client payload.
    const requestedType = body.bindingType ?? "TABLE_OPEN_BINDING";
    const bindingType =
      requestedType === "MANUAL_ADMIN_BIND" && isAdmin
        ? "MANUAL_ADMIN_BIND"
        : "TABLE_OPEN_BINDING";

    // Immutability: once a different INVU order has been opened against
    // this table session, refuse to silently overwrite the trust chain.
    // Same-order retries are idempotent; admins may force-replace via the
    // dedicated manual-override endpoint, not this host route.
    const existingOrderId = attribution.tableSession.openedInvuOrderId;
    if (existingOrderId && existingOrderId !== body.invuOrderId.trim()) {
      return NextResponse.json(
        {
          ok: false,
          error: `attribution session is already bound to INVU order ${existingOrderId}; use manual override to replace`,
          existingInvuOrderId: existingOrderId,
        },
        { status: 409 }
      );
    }

    const tableSessionId = attribution.tableSession.id;
    const trimmedOrderId = body.invuOrderId.trim();

    const result = await prisma.$transaction(async (tx) => {
      // Global uniqueness guard: an INVU order may only be bound to one
      // attribution session at a time. If another session already claims
      // this order, fail closed rather than corrupting the trust chain.
      const conflict = await tx.operationalBinding.findFirst({
        where: { invuOrderId: trimmedOrderId, attributionSessionId: { not: attribution.id } },
        select: { attributionSessionId: true },
      });
      if (conflict) {
        const e = new Error(`INVU order ${trimmedOrderId} is already bound to another attribution session`) as Error & { status?: number };
        e.status = 409;
        throw e;
      }

      const binding = await tx.operationalBinding.upsert({
        where: { invuOrderId_attributionSessionId: { invuOrderId: trimmedOrderId, attributionSessionId: attribution.id } },
        create: {
          attributionSessionId: attribution.id,
          invuOrderId: trimmedOrderId,
          bindingType,
          boundByUserId: userId ?? null,
          supportingDataJson: (body.supportingData ?? {}) as Prisma.InputJsonValue,
        },
        update: {},
        select: { id: true, bindingType: true },
      });

      // Race-safe table-session claim: updateMany with a where-clause that
      // matches only when the slot is unclaimed OR already claimed by the
      // same order. If a concurrent bind beat us to a different order, the
      // count will be 0 and we abort the transaction with a 409.
      const claim = await tx.tableSession.updateMany({
        where: {
          id: tableSessionId,
          OR: [{ openedInvuOrderId: null }, { openedInvuOrderId: trimmedOrderId }],
        },
        data: { openedInvuOrderId: trimmedOrderId, syncStatus: "OPEN" },
      });
      if (claim.count === 0) {
        const e = new Error("table session was claimed by a different INVU order concurrently") as Error & { status?: number };
        e.status = 409;
        throw e;
      }

      // Set openedAt only on the first claim (when prior order was null) so
      // idempotent retries don't shift the canonical open timestamp.
      if (!existingOrderId) {
        await tx.tableSession.update({
          where: { id: tableSessionId },
          data: { openedAt: new Date() },
        });
      }

      // Advance the attribution lifecycle to POS_BIND_INTENT_RECORDED.
      // This is now the terminal pre-verification state — the previous
      // POS_REFERENCE_WRITTEN step (citas/add HTTP push to INVU) was
      // retired Apr 28 2026 after the INVU vendor (Madelaine) confirmed
      // no API path exists to write external references into open
      // orders. Tier-2 (OperationalBinding, written above) is now the
      // primary deterministic trust anchor; verification happens when
      // the close-of-sale sync resolves this binding to a paid INVU
      // order and flips the row to VERIFIED_POS_SALE.
      // Idempotent: only updates rows still in CAPTURED/SEATED so an INVU
      // match that already flipped this row to VERIFIED_POS_SALE is never
      // rewound.
      await tx.attributionSession.updateMany({
        where: {
          id: attribution.id,
          status: { in: ["CAPTURED", "SEATED"] },
        },
        data: {
          status: "POS_BIND_INTENT_RECORDED",
          boundAt: new Date(),
          invuOrderId: trimmedOrderId,
          bindMethod: bindingType,
        },
      });

      return binding;
    });

    await recordIntegrationAudit("INVU_TABLE_OPEN_BIND", userId ?? null, null, {
      attributionSessionId: attribution.id,
      tableSessionId,
      invuOrderId: trimmedOrderId,
      bindingType,
      bookingCode: attribution.bookingCode,
    });

    return NextResponse.json({
      ok: true,
      bindingId: result.id,
      tableSessionId,
      attributionSessionId: attribution.id,
      bookingCode: attribution.bookingCode,
    }, { status: 201 });
  } catch (e: unknown) {
    const err = e as { message?: string; status?: number };
    return NextResponse.json({ ok: false, error: err.message ?? "unknown" }, { status: err.status ?? 500 });
  }
}
