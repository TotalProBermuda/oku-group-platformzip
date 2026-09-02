import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  requireSession: vi.fn(),
  getCurrentRoles: vi.fn(),
}));

vi.mock("@/server/auth/session", () => ({ requireSession: mocks.requireSession }));
vi.mock("@/server/auth/currentRoles", () => ({ getCurrentRoles: mocks.getCurrentRoles }));
vi.mock("@/lib/rbac", () => ({ requirePermission: vi.fn() }));

import { PATCH } from "@/app/api/v1/host/bookings/[id]/assign-space/route";

function request(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/v1/host/bookings/res-1/assign-space", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("assign-space capacity override authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireSession.mockResolvedValue({ userId: "host-1" });
  });

  it("rejects a restaurant host before any over-capacity write", async () => {
    mocks.getCurrentRoles.mockResolvedValue(["RESTAURANT_HOST"]);

    const response = await PATCH(request({
      spaceId: "space-1",
      confirmOverride: true,
      capacityOverrideReason: "Host tried to exceed capacity",
    }), { params: Promise.resolve({ id: "res-1" }) });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "Only an F&B Director may override section capacity",
    });
  });

  it("requires a useful reason from an F&B Director", async () => {
    mocks.getCurrentRoles.mockResolvedValue(["FB_DIRECTOR"]);

    const response = await PATCH(request({
      spaceId: "space-1",
      confirmOverride: true,
      capacityOverrideReason: "short",
    }), { params: Promise.resolve({ id: "res-1" }) });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "A capacity override reason of at least 8 characters is required",
    });
  });
});
