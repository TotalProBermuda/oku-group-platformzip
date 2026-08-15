import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireSession: vi.fn(),
  findUnique: vi.fn(),
}));

vi.mock("@/server/auth/session", () => ({ requireSession: mocks.requireSession }));
vi.mock("@/lib/prisma", () => ({
  prisma: { restaurantHostProfile: { findUnique: mocks.findUnique } },
}));

import { assertHostChatVenue, requireHostChatAccess } from "@/server/auth/hostChatGuard";

describe("host chat access guard", () => {
  beforeEach(() => {
    mocks.requireSession.mockReset();
    mocks.findUnique.mockReset();
  });

  it("rejects an authenticated user without a restaurant-host role", async () => {
    mocks.requireSession.mockResolvedValue({ userId: "user-1", roles: ["ATTENDEE"] });
    await expect(requireHostChatAccess()).rejects.toMatchObject({ status: 403 });
  });

  it("requires a venue-bound profile for restaurant staff", async () => {
    mocks.requireSession.mockResolvedValue({ userId: "host-1", roles: ["RESTAURANT_HOST"] });
    mocks.findUnique.mockResolvedValue(null);
    await expect(requireHostChatAccess()).rejects.toMatchObject({ status: 403 });
  });

  it("returns the assigned venue and blocks cross-venue sessions", async () => {
    mocks.requireSession.mockResolvedValue({ userId: "host-1", roles: ["RESTAURANT_SUPERVISOR"] });
    mocks.findUnique.mockResolvedValue({ venueId: "venue-a" });
    const access = await requireHostChatAccess();
    expect(access).toMatchObject({ userId: "host-1", venueId: "venue-a", isSuperadmin: false });
    expect(() => assertHostChatVenue(access, "venue-b")).toThrow(/Forbidden/);
  });

  it("allows superadmins without a host profile", async () => {
    mocks.requireSession.mockResolvedValue({ userId: "admin-1", roles: ["SUPERADMIN"] });
    await expect(requireHostChatAccess()).resolves.toMatchObject({ isSuperadmin: true, venueId: null });
    expect(mocks.findUnique).not.toHaveBeenCalled();
  });
});
