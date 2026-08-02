import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdminRoles } from "@/server/auth/adminGuard";
import { getProviderAdapterSafe } from "@/server/payments/providers";

function maskTxId(id: string | null | undefined): string | null {
  if (!id) return null;
  if (id.length <= 4) return `····${id}`;
  return `····${id.slice(-4)}`;
}

// Website-purchase order types only. POS / table / private bookings are
// handled elsewhere (INVU reconciliation), per Payments P2 scope.
const WEBSITE_ORDER_TYPES = ["TICKET", "EXPERIENCE", "EVENT", "MEMBERSHIP"] as const;

type Eligibility = {
  refundEligible: boolean;
  voidEligible: boolean;
  demoOnly: boolean;
  blockedReason: string | null;
};

function classify(order: {
  status: string;
  totalCents: number;
  payment:
    | {
        provider: string;
        status: string;
        authNetTransId: string | null;
        gatewayTransactionId: string | null;
        amountCents: number;
      }
    | null;
}): Eligibility {
  if (order.status === "REFUNDED") {
    return {
      refundEligible: false,
      voidEligible: false,
      demoOnly: false,
      blockedReason: "Already fully refunded",
    };
  }
  if (order.status === "CANCELLED") {
    return {
      refundEligible: false,
      voidEligible: false,
      demoOnly: false,
      blockedReason: "Order is cancelled",
    };
  }
  if (!order.payment) {
    return {
      refundEligible: false,
      voidEligible: false,
      demoOnly: false,
      blockedReason: "No payment record on this order",
    };
  }
  if (order.payment.provider === "DEMO") {
    return {
      refundEligible: false,
      voidEligible: false,
      demoOnly: true,
      blockedReason: "Demo payment — no gateway transaction to refund or void",
    };
  }
  const adapter = getProviderAdapterSafe(order.payment.provider);
  if (!adapter) {
    return {
      refundEligible: false,
      voidEligible: false,
      demoOnly: false,
      blockedReason: `Adapter unavailable for provider ${order.payment.provider}`,
    };
  }
  const refTransId =
    order.payment.gatewayTransactionId ?? order.payment.authNetTransId ?? null;
  if (!refTransId) {
    return {
      refundEligible: false,
      voidEligible: false,
      demoOnly: false,
      blockedReason: `Missing ${adapter.provider} transaction id (cannot refund or void)`,
    };
  }
  if (order.payment.status !== "SUCCEEDED") {
    return {
      refundEligible: false,
      voidEligible: order.status === "PAID",
      demoOnly: false,
      blockedReason:
        order.payment.status === "VOIDED" || order.payment.status === "REFUNDED"
          ? `Payment ${order.payment.status.toLowerCase()}`
          : `Payment status is ${order.payment.status}`,
    };
  }
  // SUCCEEDED + has gateway txid: refundable. Void eligibility (pre-settlement)
  // is ultimately decided by the gateway — we surface it as a possibility for
  // PAID orders.
  return {
    refundEligible: order.status === "PAID" || order.status === "PARTIALLY_REFUNDED",
    voidEligible: order.status === "PAID",
    demoOnly: false,
    blockedReason: null,
  };
}

export async function GET(req: Request) {
  try {
    await requireAdminRoles(req, ["SUPERADMIN"]);

    const { searchParams } = new URL(req.url);
    const q = (searchParams.get("q") ?? "").trim();
    const statusFilter = (searchParams.get("status") ?? "").trim();
    const providerFilter = (searchParams.get("provider") ?? "").trim();
    const eligibilityFilter = (searchParams.get("eligibility") ?? "").trim();
    const limit = Math.min(parseInt(searchParams.get("limit") ?? "20", 10) || 20, 100);

    const allowedStatuses = ["PAID", "PARTIALLY_REFUNDED", "REFUNDED", "CANCELLED"];
    const where: any = {
      orderType: { in: WEBSITE_ORDER_TYPES as unknown as string[] },
      status: allowedStatuses.includes(statusFilter)
        ? statusFilter
        : { in: ["PAID", "PARTIALLY_REFUNDED"] },
    };
    if (
      providerFilter === "AUTHORIZE_NET" ||
      providerFilter === "CYBERSOURCE" ||
      providerFilter === "DEMO"
    ) {
      where.payment = { provider: providerFilter };
    }

    if (q.length > 0) {
      where.OR = [
        { orderNumber: { contains: q, mode: "insensitive" } },
        { user: { name: { contains: q, mode: "insensitive" } } },
        { user: { email: { contains: q, mode: "insensitive" } } },
        { payment: { authNetTransId: { contains: q, mode: "insensitive" } } },
        { payment: { gatewayTransactionId: { contains: q, mode: "insensitive" } } },
        { tickets: { some: { code: { contains: q, mode: "insensitive" } } } },
      ];
    }

    const orders = await prisma.order.findMany({
      where,
      orderBy: { paidAt: "desc" },
      take: limit,
      select: {
        id: true,
        orderNumber: true,
        status: true,
        orderType: true,
        totalCents: true,
        currency: true,
        paidAt: true,
        createdAt: true,
        user: { select: { name: true, email: true } },
        payment: {
          select: {
            provider: true,
            status: true,
            authNetTransId: true,
            gatewayTransactionId: true,
            amountCents: true,
          },
        },
      },
    });

    let rows = orders.map((o) => {
      const txId =
        o.payment?.gatewayTransactionId ?? o.payment?.authNetTransId ?? null;
      return {
        id: o.id,
        orderNumber: o.orderNumber ?? `···${o.id.slice(-8)}`,
        orderType: o.orderType,
        status: o.status,
        provider: o.payment?.provider ?? null,
        paymentStatus: o.payment?.status ?? null,
        totalCents: o.totalCents,
        currency: o.currency,
        paidAt: o.paidAt?.toISOString() ?? null,
        createdAt: o.createdAt.toISOString(),
        guestName: o.user?.name ?? null,
        guestEmail: o.user?.email ?? null,
        // Masked: only last 4 chars surface to the UI / audit table.
        gatewayTransIdMasked: maskTxId(txId),
        // Backward-compat for older clients still reading this field.
        authNetTransIdMasked: maskTxId(o.payment?.authNetTransId ?? null),
        eligibility: classify(o),
      };
    });

    if (eligibilityFilter) {
      const f = eligibilityFilter.toLowerCase();
      rows = rows.filter((r) => {
        if (f === "refund") return r.eligibility.refundEligible;
        if (f === "void") return r.eligibility.voidEligible;
        if (f === "demo") return r.eligibility.demoOnly;
        if (f === "blocked")
          return (
            !r.eligibility.refundEligible &&
            !r.eligibility.voidEligible &&
            !r.eligibility.demoOnly
          );
        return true;
      });
    }

    return NextResponse.json({
      ok: true,
      data: {
        scopeNote:
          "Refunds and voids here apply only to website checkout orders (tickets, experiences, events, memberships). POS/table payments are reconciled through INVU.",
        websiteOrderTypes: WEBSITE_ORDER_TYPES,
        rows,
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e.message },
      { status: e.status || 500 }
    );
  }
}
