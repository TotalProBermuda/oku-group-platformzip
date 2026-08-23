import { prisma } from "@/lib/prisma";

/**
 * Transaction-safe capacity reservation.
 * Uses atomic update on Session.soldCount within a DB transaction.
 */
export async function reserveCapacityOrThrow(sessionId: string, qty: number) {
  return prisma.$transaction(async (tx) => {
    const session = await tx.session.findUnique({ where: { id: sessionId } });
    if (!session) throw new Error("Session not found");
    if (session.status !== "SCHEDULED") throw new Error("Session not available");

    const remaining = session.capacity - session.soldCount;
    if (qty > remaining) throw new Error("Not enough seats remaining");

    // Atomic increment
    const updated = await tx.session.update({
      where: { id: sessionId },
      data: { soldCount: { increment: qty } },
    });

    // Mark sold out if needed
    if (updated.soldCount >= updated.capacity) {
      await tx.session.update({ where: { id: sessionId }, data: { status: "SOLD_OUT" } });
    }

    return updated;
  });
}

/** Reserve a cart as one transaction. This keeps session capacity and limited
 * ticket/add-on inventory in sync; callers must run authorization/catalog
 * policy before calling it. */
export async function reserveCatalogCapacityOrThrow(input: {
  sessionId: string;
  ticketItems: Array<{ id: string; qty: number }>;
  addonItems: Array<{ id: string; qty: number }>;
}) {
  const ticketQty = input.ticketItems.reduce((sum, item) => sum + item.qty, 0);
  return prisma.$transaction(async (tx) => {
    const session = await tx.session.findUnique({ where: { id: input.sessionId } });
    if (!session || session.status !== "SCHEDULED") throw new Error("Session not available");
    if (ticketQty > session.capacity - session.soldCount) throw new Error("Not enough seats remaining");

    // Compare-and-swap prevents two carts from both consuming the same seats.
    const updatedSession = await tx.session.updateMany({
      where: { id: session.id, soldCount: session.soldCount, status: "SCHEDULED" },
      data: { soldCount: { increment: ticketQty } },
    });
    if (updatedSession.count !== 1) throw new Error("Capacity changed; please try again");

    for (const item of input.ticketItems) {
      const ticket = await tx.ticketType.findUnique({ where: { id: item.id } });
      if (!ticket) throw new Error("Invalid ticket type");
      if (ticket.typeCapacity !== null && item.qty > ticket.typeCapacity - ticket.soldCount) {
        throw new Error(`${ticket.name} is sold out`);
      }
      if (ticket.typeCapacity !== null) {
        const updated = await tx.ticketType.updateMany({
          where: { id: ticket.id, soldCount: ticket.soldCount },
          data: { soldCount: { increment: item.qty } },
        });
        if (updated.count !== 1) throw new Error("Ticket inventory changed; please try again");
      }
    }

    for (const item of input.addonItems) {
      const addon = await tx.experienceAddon.findUnique({ where: { id: item.id } });
      if (!addon) throw new Error("Invalid add-on");
      if (addon.capacity !== null && item.qty > addon.capacity - addon.soldCount) {
        throw new Error(`${addon.name} is sold out`);
      }
      if (addon.capacity !== null) {
        const updated = await tx.experienceAddon.updateMany({
          where: { id: addon.id, soldCount: addon.soldCount },
          data: { soldCount: { increment: item.qty } },
        });
        if (updated.count !== 1) throw new Error("Add-on inventory changed; please try again");
      }
    }

    const finalSold = session.soldCount + ticketQty;
    if (finalSold >= session.capacity) {
      await tx.session.update({ where: { id: session.id }, data: { status: "SOLD_OUT" } });
    }
  });
}

/**
 * Revert capacity on refund/cancel.
 */
export async function releaseCapacity(sessionId: string, qty: number) {
  return prisma.$transaction(async (tx) => {
    const session = await tx.session.findUnique({ where: { id: sessionId } });
    if (!session) return;
    const nextSold = Math.max(0, session.soldCount - qty);
    const updated = await tx.session.update({
      where: { id: sessionId },
      data: { soldCount: nextSold },
    });

    if (updated.status === "SOLD_OUT" && nextSold < updated.capacity) {
      await tx.session.update({ where: { id: sessionId }, data: { status: "SCHEDULED" } });
    }
  });
}
