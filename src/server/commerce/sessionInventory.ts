import type { Prisma } from "@prisma/client";

/** Row locks, not Redis. All seat mutations serialize against capacity edits. */
export async function lockSessionInventory(tx: Prisma.TransactionClient, sessionId: string) {
  await tx.$queryRaw`SELECT "id" FROM "Session" WHERE "id" = ${sessionId} FOR UPDATE`;
}
export async function safeInventoryFloor(tx: Prisma.TransactionClient, sessionId: string, soldCount: number) {
  const [tickets, orders] = await Promise.all([
    tx.ticket.findMany({ where: { sessionId, ticketStatus: { notIn: ["CANCELLED", "REFUNDED", "VOIDED"] } }, select: { orderId: true } }),
    tx.order.findMany({ where: { sessionId, status: { in: ["PENDING", "PAID", "PARTIALLY_REFUNDED"] } }, include: { lineItems: true } }),
  ]);
  const quantity = (o: typeof orders[number]) => o.lineItems.filter(l => l.ticketTypeId).reduce((n, l) => n + l.qty, 0);
  const held = orders.filter(o => o.status === "PENDING").reduce((n, o) => n + quantity(o), 0);
  const paid = orders.filter(o => o.status !== "PENDING").reduce((n, o) => n + Math.max(quantity(o), tickets.filter(t => t.orderId === o.id).length), 0);
  return Math.max(soldCount, paid + held, tickets.length + held);
}
