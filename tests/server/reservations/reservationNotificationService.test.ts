import { beforeEach, describe, expect, it, vi } from "vitest";

const findFirst = vi.fn();
const create = vi.fn();
const update = vi.fn();
const findUniqueOrThrow = vi.fn();
const sendConfirmation = vi.fn();
const sendUpdated = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    reservation: { findUniqueOrThrow },
    reservationCommunication: { findFirst, create, update },
  },
}));

vi.mock("@/server/reservations/confirmationEmail", () => ({
  buildReservationConfirmationSubject: vi.fn(() => "Reservation confirmed"),
  buildReservationRequestSubject: vi.fn(() => "Request received"),
  buildReservationUpdatedSubject: vi.fn(() => "Reservation updated"),
  sendReservationConfirmationEmail: sendConfirmation,
  sendReservationRequestReceivedEmail: vi.fn(),
  sendReservationUpdatedEmail: sendUpdated,
}));

const reservation = {
  id: "res-1", status: "CONFIRMED", statusLogs: [], contactName: "Denzil",
  contactEmail: "guest@example.com", confirmationCode: "ABC123",
  reservationDate: new Date("2026-09-02T23:00:00.000Z"), partySize: 2,
  venue: { name: "Gold House", city: "Panama City" }, zone: null,
  assignedSpace: { name: "CATCH" },
  assignedTableLabel: null, occasion: null, seatingPreference: null, notes: null, addons: [],
};

describe("reservation confirmation delivery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findUniqueOrThrow.mockResolvedValue(reservation);
    update.mockResolvedValue({});
    sendConfirmation.mockResolvedValue({ sent: true, reason: null, bodySnapshot: "email body" });
    sendUpdated.mockResolvedValue({ sent: true, reason: null, bodySnapshot: "updated body" });
  });

  it("uses the assigned physical space in confirmation email details", async () => {
    findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: "comm-pending", status: "PENDING" });
    const { deliverReservationStateEmail } = await import("@/server/reservations/reservationNotificationService");
    await deliverReservationStateEmail("res-1", "CONFIRMATION");
    expect(sendConfirmation).toHaveBeenCalledWith(expect.objectContaining({ zoneName: "CATCH" }));
  });

  it("delivers the exact durable move message for a reservation update", async () => {
    findFirst.mockResolvedValueOnce({ id: "move-1", status: "PENDING", bodySnapshot: "We moved you to CATCH." });
    const { deliverReservationStateEmail } = await import("@/server/reservations/reservationNotificationService");
    const result = await deliverReservationStateEmail("res-1", "RESERVATION_UPDATED", { communicationId: "move-1" });
    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: "move-1" }) }));
    expect(sendUpdated).toHaveBeenCalledWith(expect.objectContaining({ guestMessage: "We moved you to CATCH.", zoneName: "CATCH" }));
    expect(result).toMatchObject({ sent: true, communicationId: "move-1" });
  });

  it("delivers the durable pending intent instead of silently skipping it", async () => {
    findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: "comm-pending", status: "PENDING" });
    const { deliverReservationStateEmail } = await import("@/server/reservations/reservationNotificationService");
    const result = await deliverReservationStateEmail("res-1", "CONFIRMATION");
    expect(create).not.toHaveBeenCalled();
    expect(sendConfirmation).toHaveBeenCalledOnce();
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "comm-pending" }, data: expect.objectContaining({ status: "SENT" }) }));
    expect(result).toMatchObject({ skipped: false, sent: true, communicationId: "comm-pending" });
  });

  it("does not duplicate an already-sent confirmation during normal delivery", async () => {
    findFirst.mockResolvedValueOnce({ id: "comm-sent" });
    const { deliverReservationStateEmail } = await import("@/server/reservations/reservationNotificationService");
    const result = await deliverReservationStateEmail("res-1", "CONFIRMATION");
    expect(result).toEqual({ skipped: true, communicationId: "comm-sent" });
    expect(sendConfirmation).not.toHaveBeenCalled();
  });

  it("creates a new delivery attempt for an explicit resend", async () => {
    findFirst.mockResolvedValueOnce({ id: "comm-sent" });
    create.mockResolvedValueOnce({ id: "comm-resend" });
    const { deliverReservationStateEmail } = await import("@/server/reservations/reservationNotificationService");
    const result = await deliverReservationStateEmail("res-1", "CONFIRMATION", { force: true });
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ templateKey: "CONFIRMATION", status: "PENDING" }) }));
    expect(sendConfirmation).toHaveBeenCalledOnce();
    expect(result).toMatchObject({ skipped: false, sent: true, communicationId: "comm-resend" });
  });
});
