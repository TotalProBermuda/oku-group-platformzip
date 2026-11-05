/** Venue-scoped query for future bookings shown on the host dashboard. */
export function hostUpcomingReservationWhere(venueId: string, from: Date) {
  return {
    venueId,
    reservationDate: { gte: from },
  } as const;
}
