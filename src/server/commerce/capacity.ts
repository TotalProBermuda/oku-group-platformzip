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
