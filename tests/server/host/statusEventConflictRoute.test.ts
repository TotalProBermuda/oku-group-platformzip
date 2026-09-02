import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  transitionStatus: vi.fn(),
  requireSession: vi.fn(),
  getCurrentRoles: vi.fn(),
  hostProfileFindUnique: vi.fn(),
  reservationFindUnique: vi.fn(),
}));

vi.mock("@/server/auth/session", () => ({ requireSession: mocks.requireSession }));
vi.mock("@/server/auth/currentRoles", () => ({ getCurrentRoles: mocks.getCurrentRoles }));
vi.mock("@/lib/rbac", () => ({ requirePermission: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    restaurantHostProfile: { findUnique: mocks.hostProfileFindUnique },
    reservation: { findUnique: mocks.reservationFindUnique },
  },
}));
vi.mock("@/server/host/hostService", () => ({ transitionStatus: mocks.transitionStatus }));

import { PATCH } from "@/app/api/v1/host/bookings/[id]/status/route";
import { EventOccupancyConflictError } from "@/server/events/eventOccupancyService";

describe("host status event conflicts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireSession.mockResolvedValue({ userId: "admin-1", roles: ["SUPERADMIN"] });
    mocks.getCurrentRoles.mockResolvedValue(["SUPERADMIN"]);
    mocks.transitionStatus.mockResolvedValue({ id: "res-1", status: "CONFIRMED" });
    mocks.hostProfileFindUnique.mockResolvedValue({ venueId: "venue-1" });
    mocks.reservationFindUnique.mockResolvedValue({ venueId: "venue-1" });
  });

  it("passes an explicit, reasoned capacity override for an F&B Director", async () => {
    mocks.getCurrentRoles.mockResolvedValue(["FB_DIRECTOR"]);

    const response = await PATCH(
      new NextRequest("http://localhost/api/v1/host/bookings/res-1/status", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "CONFIRMED",
          assignedSpaceId: "space-1",
          confirmedReservationDate: "2026-09-03T23:00:00.000Z",
          confirmCapacityOverride: true,
          capacityOverrideReason: "Joined layout approved by director",
        }),
      }),
      { params: Promise.resolve({ id: "res-1" }) },
    );

    expect(response.status).toBe(200);
    expect(mocks.transitionStatus).toHaveBeenCalledWith("res-1", "CONFIRMED", "admin-1", expect.objectContaining({
      confirmCapacityOverride: true,
      capacityOverrideReason: "Joined layout approved by director",
    }));
  });

  it("prevents a restaurant host from overriding capacity", async () => {
    mocks.getCurrentRoles.mockResolvedValue(["RESTAURANT_HOST"]);

    const response = await PATCH(
      new NextRequest("http://localhost/api/v1/host/bookings/res-1/status", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "CONFIRMED",
          assignedSpaceId: "space-1",
          confirmedReservationDate: "2026-09-03T23:00:00.000Z",
          confirmCapacityOverride: true,
          capacityOverrideReason: "Host attempted a manual overbook",
        }),
      }),
      { params: Promise.resolve({ id: "res-1" }) },
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ ok: false, error: "Only an F&B Director may override section capacity" });
    expect(mocks.transitionStatus).not.toHaveBeenCalled();
  });

  it("requires a useful reason before an F&B Director override", async () => {
    const response = await PATCH(
      new NextRequest("http://localhost/api/v1/host/bookings/res-1/status", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "CONFIRMED", confirmCapacityOverride: true, capacityOverrideReason: "short" }),
      }),
      { params: Promise.resolve({ id: "res-1" }) },
    );

    expect(response.status).toBe(400);
    expect(mocks.transitionStatus).not.toHaveBeenCalled();
  });

  it("preserves the safe event card when confirmation is blocked", async () => {
    const card = {
      kind: "PRIVATE_BLOCK" as const,
      message: "This space is reserved for a private event at the selected time.",
    };
    mocks.transitionStatus.mockRejectedValue(new EventOccupancyConflictError(card));

    const response = await PATCH(
      new NextRequest("http://localhost/api/v1/host/bookings/res-1/status", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "CONFIRMED",
          assignedSpaceId: "space-1",
          confirmedReservationDate: "2026-09-03T23:00:00.000Z",
        }),
      }),
      { params: Promise.resolve({ id: "res-1" }) },
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      code: "EVENT_UNAVAILABLE",
      error: card.message,
      eventConflict: card,
    });
  });
});
