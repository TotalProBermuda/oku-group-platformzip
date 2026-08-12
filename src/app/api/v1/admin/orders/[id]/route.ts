import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/server/auth/session";
import { requirePermission } from "@/lib/rbac";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { roles } = await requireSession();
    requirePermission(roles, "admin:orders:read");
    const isOwner = roles.includes("SUPERADMIN");
    const { id } = await params;

    const order = await prisma.order.findUniqueOrThrow({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            status: true,
            roles: { select: { roleKey: true } },
            membership: { select: { tier: true, status: true } },
            orders: { select: { id: true } },
          },
        },
        series: {
          select: {
            id: true, title: true, slug: true, status: true, venue: true,
            hostType: true, influencer: { select: { id: true, displayName: true, handle: true } },
          },
        },
        session: { select: { id: true, startsAt: true, endsAt: true, status: true } },
        payment: true,
        lineItems: {
          include: { ticketType: { select: { id: true, name: true, priceCents: true } } },
        },
        tickets: {
          select: {
            id: true, ticketStatus: true, checkedInAt: true, code: true,
            checkins: { select: { id: true, createdAt: true } },
          },
        },
        attribution: { select: { id: true, refCode: true, influencerId: true } },
        attributedInfluencer: {
          include: { user: { select: { id: true, name: true, email: true } } },
        },
        attributedEventReferrerAssignment: {
          select: {
            id: true,
            displayName: true,
            referralCode: true,
            assignedUser: { select: { id: true, name: true, email: true } },
          },
        },
        LedgerEntry: {
          select: { id: true, type: true, amountCents: true, currency: true, note: true, createdAt: true },
          orderBy: { createdAt: "desc" },
        },
      },
    });

    let sourceName: string | null = null;
    let sourceType: string | null = null;
    if (order.attributedInfluencer) {
      sourceName = order.attributedInfluencer.displayName || order.attributedInfluencer.user?.name || null;
      sourceType = "INFLUENCER";
    } else if (order.attributedEventReferrerAssignment) {
      const era = order.attributedEventReferrerAssignment;
      sourceName = era.displayName || era.assignedUser?.name || era.assignedUser?.email || null;
      sourceType = "REFERRER";
    }

    const operationalOrder = { ...order } as Record<string, unknown>;
    delete operationalOrder.LedgerEntry;
    delete operationalOrder.attribution;
    delete operationalOrder.attributedInfluencer;
    delete operationalOrder.attributedEventReferrerAssignment;
    delete operationalOrder.commissionCents;
    delete operationalOrder.netRevenueCents;

    const result = isOwner
      ? {
          ...order,
          sourceName,
          sourceType,
          userOrderCount: order.user.orders?.length ?? 0,
        }
      : {
          ...operationalOrder,
          userOrderCount: order.user.orders?.length ?? 0,
        };

    return NextResponse.json({ ok: true, data: result });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e.message },
      { status: e.status || 500 }
    );
  }
}
