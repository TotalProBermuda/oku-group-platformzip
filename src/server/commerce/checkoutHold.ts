import { prisma } from "@/lib/prisma";
import { releaseCatalogCapacity } from "@/server/commerce/capacity";

export const CHECKOUT_HOLD_EVENT = "checkout-capacity-hold";
export const CHECKOUT_HOLD_MS = 15 * 60 * 1000;

type HoldPayload = { expiresAt?: string };

export async function createCheckoutHold(orderId: string) {
  const expiresAt = new Date(Date.now() + CHECKOUT_HOLD_MS);
  await prisma.orderEvent.create({
    data: {
      orderId,
      eventType: "OTHER",
      eventLabel: CHECKOUT_HOLD_EVENT,
      eventPayload: { expiresAt: expiresAt.toISOString() },
    },
  });
  return expiresAt;
}

export async function hasActiveCheckoutHold(orderId: string) {
  const event = await prisma.orderEvent.findFirst({
    where: { orderId, eventLabel: CHECKOUT_HOLD_EVENT },
    orderBy: { createdAt: "desc" },
  });
  const payload = event?.eventPayload as HoldPayload | null;
  return Boolean(payload?.expiresAt && Date.parse(payload.expiresAt) > Date.now());
}

/**
 * Opportunistic expiry cleanup run before a new reservation. It keeps the
 * checkout self-healing even if a browser is closed and no worker is running.
 * A future scheduled worker can invoke the same operation across sessions.
 */
export async function expireCheckoutHoldsForSession(sessionId: string) {
  const cutoff = new Date(Date.now() - CHECKOUT_HOLD_MS);
  const expired = await prisma.order.findMany({
    where: {
      sessionId,
      status: "PENDING",
      events: { some: { eventLabel: CHECKOUT_HOLD_EVENT, createdAt: { lte: cutoff } } },
    },
    include: { lineItems: true },
  });

  for (const order of expired) {
    // The status transition is the idempotency gate: only the request that
    // changes PENDING to CANCELLED is permitted to release capacity.
    const changed = await prisma.order.updateMany({
      where: { id: order.id, status: "PENDING" },
      data: { status: "CANCELLED", cancelledAt: new Date() },
    });
    if (changed.count !== 1) continue;

    await releaseCatalogCapacity({
      sessionId: order.sessionId,
      ticketItems: order.lineItems
        .filter((item) => item.ticketTypeId)
        .map((item) => ({ id: item.ticketTypeId!, qty: item.qty })),
      addonItems: order.lineItems
        .filter((item) => item.addonId)
        .map((item) => ({ id: item.addonId!, qty: item.qty })),
    });
    await prisma.orderEvent.create({
      data: {
        orderId: order.id,
        eventType: "OTHER",
        eventLabel: "checkout-hold-expired",
        eventPayload: { expiredAt: new Date().toISOString() },
      },
    });
  }
}
