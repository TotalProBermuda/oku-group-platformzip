import type { Prisma } from "@prisma/client";

export type QueueSelection = { date?: string; reservationId?: string };

export function parseQueueSelection(params: { date?: unknown; reservationId?: unknown }): QueueSelection {
  const date = typeof params.date === "string" ? params.date : undefined;
  if (date && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(`${date}T00:00:00Z`)) || new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date)) {
    throw Object.assign(new Error("Invalid reservation date"), { status: 400 });
  }
  const reservationId = typeof params.reservationId === "string" && /^[a-zA-Z0-9_-]{1,100}$/.test(params.reservationId) ? params.reservationId : undefined;
  return { date: date || undefined, reservationId };
}

/** One policy for SSR and polling. Never filter by acquisition/referral source. */
export function hostQueueWhere(venueId: string, selection: QueueSelection = {}, now = new Date()): Prisma.ReservationWhereInput {
  // Panama service day (UTC-5; no daylight-saving change).
  const start = selection.date ? new Date(`${selection.date}T00:00:00-05:00`) : undefined;
  const scope: Prisma.ReservationWhereInput = start
    ? { reservationDate: { gte: start, lt: new Date(start.getTime() + 86_400_000) } }
    : { OR: [
        { reservationDate: { gte: new Date(now.getTime() - 12 * 3_600_000) } },
        { status: { in: ["PENDING", "PENDING_APPROVAL", "ACKNOWLEDGED", "WAITLISTED", "CONFIRMED", "ARRIVED", "SEATED"] } },
      ] };
  // The venue restriction applies even to an emailed booking ID.
  return { venueId, OR: [scope, ...(selection.reservationId ? [{ id: selection.reservationId }] : [])] };
}
