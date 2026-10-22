import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { OrderChannel, OrderStatus, OrderType } from "@prisma/client";
import { getAdminApiErrorDetails } from "@/app/api/v1/admin/errorDetails";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/server/auth/session";
import { requirePermission } from "@/lib/rbac";

export async function GET(req: NextRequest) {
  try {
    const { roles } = await requireSession();
    requirePermission(roles, "admin:orders:read");
    const isOwner = roles.includes("SUPERADMIN");

    const { searchParams } = req.nextUrl;
    const statusRaw = searchParams.get("status");
    const orderTypeRaw = searchParams.get("orderType");
    const channelRaw = searchParams.get("channel");
    const status = statusRaw ? Object.values(OrderStatus).find((value) => value === statusRaw) : undefined;
    const orderType = orderTypeRaw ? Object.values(OrderType).find((value) => value === orderTypeRaw) : undefined;
    const channel = channelRaw ? Object.values(OrderChannel).find((value) => value === channelRaw) : undefined;
    const dateFrom  = searchParams.get("dateFrom") || undefined;
    const dateTo    = searchParams.get("dateTo") || undefined;
    const q         = searchParams.get("q") || undefined;
    if ((statusRaw && !status) || (orderTypeRaw && !orderType) || (channelRaw && !channel)) {
      return NextResponse.json({ ok: false, error: "Invalid order filter." }, { status: 400 });
    }
    const page      = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const pageSize  = Math.min(100, Math.max(1, parseInt(searchParams.get("pageSize") || "50", 10)));

    const where: Prisma.OrderWhereInput = {};
    if (status)    where.status    = status;
    if (orderType) where.orderType = orderType;
    if (channel)   where.channel   = channel;
    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) where.createdAt.gte = new Date(dateFrom);
      if (dateTo)   where.createdAt.lte = new Date(dateTo);
    }
    if (q) {
      where.OR = [
        { orderNumber: { contains: q, mode: "insensitive" } },
        { user: { name: { contains: q, mode: "insensitive" } } },
        { user: { email: { contains: q, mode: "insensitive" } } },
        { series: { title: { contains: q, mode: "insensitive" } } },
      ];
    }

    const [total, orders] = await Promise.all([
      prisma.order.count({ where }),
      prisma.order.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          user: { select: { id: true, name: true, email: true } },
          series: { select: { id: true, title: true, slug: true } },
          payment: { select: { id: true, status: true, provider: true } },
          lineItems: { select: { id: true } },
          attributedInfluencer: {
            select: { id: true, displayName: true, handle: true, user: { select: { name: true } } },
          },
          attribution: { select: { id: true, refCode: true } },
          attributedEventReferrerAssignment: {
            select: { id: true, displayName: true, inviteEmail: true, referralCode: true },
          },
        },
      }),
    ]);

    const data = orders.map((o) => {
      let sourceName: string | null = null;
      if (o.attributedInfluencer) {
        sourceName = o.attributedInfluencer.displayName || o.attributedInfluencer.user?.name || o.attributedInfluencer.handle || null;
      } else if (o.attributedEventReferrerAssignment) {
        sourceName = o.attributedEventReferrerAssignment.displayName || o.attributedEventReferrerAssignment.inviteEmail || o.attributedEventReferrerAssignment.referralCode || null;
      }

      return {
        id: o.id,
        orderNumber: o.orderNumber,
        orderType: o.orderType,
        channel: o.channel,
        status: o.status,
        subtotalCents: o.subtotalCents,
        feesCents: o.feesCents,
        taxCents: o.taxCents,
        discountCents: o.discountCents,
        totalCents: o.totalCents,
        coversCount: o.coversCount,
        currency: o.currency,
        placedAt: o.placedAt,
        paidAt: o.paidAt,
        cancelledAt: o.cancelledAt,
        createdAt: o.createdAt,
        updatedAt: o.updatedAt,
        user: o.user,
        series: o.series,
        payment: o.payment,
        itemCount: o.lineItems.length,
        ...(isOwner
          ? {
              commissionCents: o.commissionCents,
              netRevenueCents: o.netRevenueCents,
              sourceName,
              attribution: o.attribution ? { refCode: o.attribution.refCode } : null,
            }
          : {}),
      };
    });

    return NextResponse.json({
      ok: true,
      data,
      meta: { total, page, pageSize, totalPages: Math.ceil(total / pageSize) },
    });
  } catch (e: unknown) {
    const error = getAdminApiErrorDetails(e);
    return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
  }
}
