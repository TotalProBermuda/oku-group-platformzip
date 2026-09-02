import type { ReservationStatus } from "@prisma/client";

type ExistingReservation = {
  status: ReservationStatus;
  assignedSpaceId: string | null;
  requestedSpaceId: string | null;
  assignedTableLabel: string | null;
};

type TransitionOptions = {
  assignedSpaceId?: string;
  reservationDate?: string;
  tableLabel?: string;
};

function operationalError(message: string) {
  const error = new Error(message) as Error & { status?: number };
  error.status = 400;
  return error;
}

/**
 * Enforces the boundary between advance reservation approval and live service.
 * Approval requires capacity-bearing space/time; seating requires the exact
 * operational table that will later be bound to an INVU check.
 */
export function assertTransitionOperationalRequirements(
  existing: ExistingReservation,
  toStatus: ReservationStatus,
  options?: TransitionOptions,
) {
  if (existing.status === "PENDING_APPROVAL" && toStatus === "CONFIRMED") {
    if (!(options?.assignedSpaceId || existing.assignedSpaceId || existing.requestedSpaceId)) {
      throw operationalError("Choose a final dining space before confirming this request");
    }
    if (!options?.reservationDate) {
      throw operationalError("Confirm the reservation date and time before accepting this request");
    }
  }

  if (toStatus === "SEATED") {
    const effectiveTable = options?.tableLabel?.trim() || existing.assignedTableLabel?.trim();
    if (!effectiveTable) {
      throw operationalError("tableLabel is required to seat a reservation");
    }
  }
}
