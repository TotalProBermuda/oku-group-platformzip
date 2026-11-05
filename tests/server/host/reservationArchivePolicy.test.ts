import { describe, expect, it } from "vitest";
import { isArchivableTestReservation, noSaleCloseBlockReason, reservationArchiveBlockReason } from "@/server/host/reservationArchivePolicy";

describe("host test reservation archive policy", () => {
  const cleanPending = {
    status: "PENDING",
    actualRevenueCents: null,
    boundInvuOrderId: null,
    hasPaymentIntent: false,
  };

  it("allows human-reviewed active reservations only before seating and with no payment/POS evidence", () => {
    expect(isArchivableTestReservation(cleanPending)).toBe(true);
    expect(reservationArchiveBlockReason({ ...cleanPending, status: "SEATED" })).toMatch(/seated/i);
    expect(reservationArchiveBlockReason({ ...cleanPending, boundInvuOrderId: "POS-1" })).toMatch(/POS/i);
    expect(reservationArchiveBlockReason({ ...cleanPending, actualRevenueCents: 0 })).toMatch(/POS/i);
    expect(reservationArchiveBlockReason({ ...cleanPending, hasPaymentIntent: true })).toMatch(/Payment/i);
    expect(reservationArchiveBlockReason({ ...cleanPending, status: "CANCELLED" })).toMatch(/inactive/i);
  });

  it("allows an auditable no-sale close only for a seated booking without financial evidence", () => {
    expect(noSaleCloseBlockReason({ status: "SEATED", actualRevenueCents: null, boundInvuOrderId: null, hasPaymentIntent: false, reason: "Guest left without ordering" })).toBeNull();
    expect(noSaleCloseBlockReason({ status: "ARRIVED", actualRevenueCents: null, boundInvuOrderId: null, hasPaymentIntent: false, reason: "Guest left without ordering" })).toMatch(/seated/i);
    expect(noSaleCloseBlockReason({ status: "SEATED", actualRevenueCents: null, boundInvuOrderId: "POS-1", hasPaymentIntent: false, reason: "Guest left without ordering" })).toMatch(/POS/i);
    expect(noSaleCloseBlockReason({ status: "SEATED", actualRevenueCents: null, boundInvuOrderId: null, hasPaymentIntent: true, reason: "Guest left without ordering" })).toMatch(/payment/i);
    expect(noSaleCloseBlockReason({ status: "SEATED", actualRevenueCents: null, boundInvuOrderId: null, hasPaymentIntent: false, reason: "short" })).toMatch(/8–500/);
  });
});
