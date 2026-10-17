const ARCHIVABLE_STATUSES = new Set([
  "PENDING", "PENDING_APPROVAL", "CONFIRMED", "WAITLISTED", "ACKNOWLEDGED",
  "ARRIVED", "REQUEST_ONLY", "PENDING_PAYMENT",
]);

export type ReservationArchiveSafety = {
  status: string;
  actualRevenueCents: number | null;
  boundInvuOrderId: string | null;
  hasPaymentIntent: boolean;
};

export function reservationArchiveBlockReason(reservation: ReservationArchiveSafety): string | null {
  if (!ARCHIVABLE_STATUSES.has(reservation.status)) {
    return reservation.status === "SEATED"
      ? "Already seated; only close/resolve the service."
      : "Already closed or inactive.";
  }
  if (reservation.boundInvuOrderId || reservation.actualRevenueCents !== null) return "POS/revenue evidence exists.";
  if (reservation.hasPaymentIntent) return "Payment record exists; supervised payment handling required.";
  return null;
}

export function isArchivableTestReservation(reservation: ReservationArchiveSafety) {
  return reservationArchiveBlockReason(reservation) === null;
}

export function noSaleCloseBlockReason(args: {
  status: string;
  actualRevenueCents: number | null;
  boundInvuOrderId: string | null;
  hasPaymentIntent: boolean;
  reason: string;
}): string | null {
  if (args.status !== "SEATED") return "No-sale close is only available for a seated reservation.";
  if (args.boundInvuOrderId || args.actualRevenueCents !== null || args.hasPaymentIntent) {
    return "This reservation has payment or POS evidence. Close or reconcile it through the normal POS workflow.";
  }
  if (args.reason.trim().length < 8 || args.reason.trim().length > 500) {
    return "Explain why the guests left without a purchase (8–500 characters).";
  }
  return null;
}
