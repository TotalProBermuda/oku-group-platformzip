import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  transitionStatus: vi.fn(),
  requireSession: vi.fn(),
  getCurrentRoles: vi.fn(),
}));

vi.mock("@/server/auth/session", () => ({ requireSession: mocks.requireSession }));
vi.mock("@/server/auth/currentRoles", () => ({ getCurrentRoles: mocks.getCurrentRoles }));
vi.mock("@/lib/rbac", () => ({ requirePermission: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/server/host/hostService", () => ({ transitionStatus: mocks.transitionStatus }));

import { PATCH } from "@/app/api/v1/host/bookings/[id]/status/route";
import { EventOccupancyConflictError } from "@/server/events/eventOccupancyService";

describe("host status event conflicts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireSession.mockResolvedValue({ userId: "admin-1", roles: ["SUPERADMIN"] });
    mocks.getCurrentRoles.mockResolvedValue(["SUPERADMIN"]);
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
