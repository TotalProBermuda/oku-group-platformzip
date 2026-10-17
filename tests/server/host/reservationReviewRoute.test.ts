import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireSession: vi.fn(),
  getCurrentRoles: vi.fn(),
  profileFindUnique: vi.fn(),
  reservationFindUnique: vi.fn(),
  reservationFindMany: vi.fn(),
  archive: vi.fn(),
}));

vi.mock("@/server/auth/session", () => ({ requireSession: mocks.requireSession }));
vi.mock("@/server/auth/currentRoles", () => ({ getCurrentRoles: mocks.getCurrentRoles }));
vi.mock("@/lib/rbac", () => ({ requirePermission: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: {
  restaurantHostProfile: { findUnique: mocks.profileFindUnique },
  reservation: { findUnique: mocks.reservationFindUnique, findMany: mocks.reservationFindMany },
} }));
vi.mock("@/server/host/archiveTestReservation", () => ({ archiveTestReservationAsCancelled: mocks.archive }));

import { GET, POST } from "@/app/api/v1/host/reservation-review/route";

describe("host reservation review controls", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireSession.mockResolvedValue({ userId: "host-1", roles: ["RESTAURANT_HOST"] });
    mocks.getCurrentRoles.mockResolvedValue(["RESTAURANT_HOST"]);
    mocks.profileFindUnique.mockResolvedValue({ venueId: "venue-1" });
    mocks.reservationFindUnique.mockResolvedValue({ venueId: "venue-1" });
    mocks.reservationFindMany.mockResolvedValue([]);
    mocks.archive.mockResolvedValue({ id: "res-1", venueId: "venue-1", status: "CANCELLED" });
  });

  it("requires a useful search term before reading guest records", async () => {
    const response = await GET(new Request("https://example.test/api/v1/host/reservation-review?q=te"));
    expect(response.status).toBe(400);
    expect(mocks.reservationFindMany).not.toHaveBeenCalled();
  });

  it("searches only the signed-in host's venue", async () => {
    const response = await GET(new Request("https://example.test/api/v1/host/reservation-review?q=demo"));
    expect(response.status).toBe(200);
    expect(mocks.reservationFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ venueId: "venue-1" }), take: 50 }));
  });

  it("refuses cross-venue archive requests before calling the archive service", async () => {
    mocks.reservationFindUnique.mockResolvedValue({ venueId: "venue-2" });
    const response = await POST(new Request("https://example.test/api/v1/host/reservation-review", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reservationId: "res-1", reason: "Confirmed test fixture" }),
    }));
    expect(response.status).toBe(403);
    expect(mocks.archive).not.toHaveBeenCalled();
  });

  it("requires a per-record reason and delegates only a scoped, reviewed request", async () => {
    const response = await POST(new Request("https://example.test/api/v1/host/reservation-review", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reservationId: "res-1", reason: "Confirmed test fixture" }),
    }));
    expect(response.status).toBe(200);
    expect(mocks.archive).toHaveBeenCalledWith({ reservationId: "res-1", actorId: "host-1", reason: "Confirmed test fixture" });
  });
});
