import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createAttributionSession: vi.fn(),
  ensureHostAttributionForReservation: vi.fn(),
  enqueueLedgerEvent: vi.fn(),
  assertNoBlockingOccupancy: vi.fn(),
  findGuest: vi.fn(),
  createReservation: vi.fn(),
  createHandoff: vi.fn(),
  createStatusLog: vi.fn(),
  findHostProfile: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@/server/services/invu/identityService", () => ({
  createAttributionSession: mocks.createAttributionSession,
}));
vi.mock("@/server/referrals/hostAttributionResolver", () => ({
  ensureHostAttributionForReservation: mocks.ensureHostAttributionForReservation,
}));
vi.mock("@/server/services/ledger/ledgerOutboxService", () => ({
  enqueueLedgerEvent: mocks.enqueueLedgerEvent,
}));
vi.mock("@/server/events/eventOccupancyService", () => ({
  assertNoBlockingOccupancy: mocks.assertNoBlockingOccupancy,
}));
vi.mock("@/server/invitation/resend", () => ({
  isResendConfigured: () => false,
  getResendClient: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    resGuestProfile: { findFirst: mocks.findGuest },
    restaurantHostProfile: { findUnique: mocks.findHostProfile },
    $transaction: mocks.transaction,
  },
}));

import { createStreetsideBooking } from "@/server/host/hostService";

describe("streetside attribution lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findGuest.mockResolvedValue({ id: "guest-1", whatsapp: null });
    mocks.createReservation.mockResolvedValue({ id: "reservation-1", venueId: "venue-1" });
    mocks.createHandoff.mockResolvedValue({ id: "handoff-1" });
    mocks.createStatusLog.mockResolvedValue({ id: "log-1" });
    mocks.findHostProfile.mockResolvedValue(null);
    mocks.createAttributionSession.mockResolvedValue({
      attributionSessionId: "attribution-1",
      tableSessionId: "table-session-1",
      bookingCode: "BOOKING-1",
    });
    mocks.transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn({
      reservation: { create: mocks.createReservation },
      reservationHandoff: { create: mocks.createHandoff },
      reservationStatusLog: { create: mocks.createStatusLog },
    }));
  });

  it("keeps a pending host-form request CAPTURED until the floor team seats it", async () => {
    await createStreetsideBooking({
      venueId: "venue-1",
      guestName: "Lifecycle Test",
      guestEmail: "lifecycle@example.invalid",
      partySize: 2,
      sourceUserId: "host-1",
    });

    expect(mocks.createReservation).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: "PENDING" }),
    }));
    expect(mocks.createAttributionSession).toHaveBeenCalledWith(expect.objectContaining({
      reservationId: "reservation-1",
      source: "HOST_WALKIN",
      initialStatus: "CAPTURED",
    }));
  });
});
