import { describe, expect, it } from "vitest";
import { hostUpcomingReservationWhere } from "@/server/host/upcomingReservations";

describe("host upcoming reservations query", () => {
  it("scopes future bookings to the assigned venue and starts after the current service day", () => {
    const serviceDayEnd = new Date("2026-10-14T05:00:00.000Z");

    expect(hostUpcomingReservationWhere("venue-1", serviceDayEnd)).toEqual({
      venueId: "venue-1",
      reservationDate: { gte: serviceDayEnd },
    });
  });
});
