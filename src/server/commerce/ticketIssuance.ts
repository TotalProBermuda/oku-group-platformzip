import { randomUUID } from "node:crypto";

export function ticketRows(order: { id: string; userId: string; sessionId: string; user: { name: string | null; email: string }; lineItems: { ticketTypeId: string | null; qty: number }[] }) {
  return order.lineItems.filter(item => item.ticketTypeId).flatMap(item => {
    if (!Number.isSafeInteger(item.qty) || item.qty < 1 || item.qty > 10000) throw new Error("Invalid ticket quantity");
    return Array.from({ length: item.qty }, () => ({
      orderId: order.id, userId: order.userId, sessionId: order.sessionId,
      ticketTypeId: item.ticketTypeId!, code: `T-${randomUUID()}`,
      attendeeName: order.user.name, attendeeEmail: order.user.email.trim().toLowerCase(),
      attendeeEmailNormalized: order.user.email.trim().toLowerCase(),
    }));
  });
}
