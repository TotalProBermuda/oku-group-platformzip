import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireSession: vi.fn(),
  userFind: vi.fn(),
  reservationFind: vi.fn(),
  ticketFind: vi.fn(),
}));

vi.mock("@/server/auth/session", () => ({ requireSession: mocks.requireSession }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: mocks.userFind },
    reservation: { findMany: mocks.reservationFind },
    ticket: { findMany: mocks.ticketFind },
  },
}));

import { GET } from "@/app/api/v1/me/bookings/route";

describe("customer booking isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireSession.mockResolvedValue({ userId: "verified-user" });
    mocks.userFind.mockResolvedValue({ email: " Guest@Example.com ", status: "ACTIVE" });
    mocks.reservationFind.mockResolvedValue([]);
    mocks.ticketFind.mockResolvedValue([]);
  });

  it("derives exact normalized filters from the verified session and allow-lists fields", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    expect(mocks.reservationFind).toHaveBeenCalledWith(expect.objectContaining({
      where: { contactEmailNormalized: "guest@example.com" },
      select: expect.not.objectContaining({
        notes: expect.anything(),
        contactPhone: expect.anything(),
        assignedTableLabel: expect.anything(),
        attributions: expect.anything(),
        commissions: expect.anything(),
      }),
    }));
    expect(mocks.ticketFind).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        attendeeEmailNormalized: "guest@example.com",
      }),
    }));
  });

  it("does not query bookings for a suspended session user", async () => {
    mocks.userFind.mockResolvedValue({ email: "guest@example.com", status: "SUSPENDED" });
    const response = await GET();
    expect(response.status).toBe(401);
    expect(mocks.reservationFind).not.toHaveBeenCalled();
    expect(mocks.ticketFind).not.toHaveBeenCalled();
  });
});