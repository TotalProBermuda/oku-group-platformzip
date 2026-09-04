import { beforeEach, describe, expect, it, vi } from "vitest";

const send = vi.fn();

vi.mock("@/server/invitation/resend", () => ({
  isResendConfigured: vi.fn(() => true),
  getResendClient: vi.fn(async () => ({
    client: { emails: { send } },
    fromEmail: "reservations@okuhospitalitygroup.com",
  })),
}));

const props = {
  contactName: "Denzil Nelson",
  contactEmail: "guest@example.com",
  confirmationCode: "TEST1234",
  reservationDate: new Date("2026-09-03T23:00:00.000Z"),
  partySize: 2,
  venueName: "Gold House",
  venueCity: "Panama City",
  zoneName: "CATCH",
  tableLabel: null,
  occasion: null,
  seatingPreference: null,
  notes: null,
  addons: [],
};

describe("reservation email provider responses", () => {
  beforeEach(() => vi.clearAllMocks());

  it.each([
    ["request receipt", "sendReservationRequestReceivedEmail"],
    ["confirmation", "sendReservationConfirmationEmail"],
    ["reservation update", "sendReservationUpdatedEmail"],
  ] as const)("does not report %s as sent when Resend returns an error", async (_label, method) => {
    send.mockResolvedValueOnce({ data: null, error: { message: "The sender domain is not verified" } });
    const email = await import("@/server/reservations/confirmationEmail");
    const result = await email[method](props);
    expect(result).toMatchObject({ sent: false, reason: "The sender domain is not verified" });
  });

  it("reports a provider-accepted confirmation as sent", async () => {
    send.mockResolvedValueOnce({ data: { id: "email-1" }, error: null });
    const { sendReservationConfirmationEmail } = await import("@/server/reservations/confirmationEmail");
    await expect(sendReservationConfirmationEmail(props)).resolves.toMatchObject({ sent: true });
  });
});
