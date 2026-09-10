import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  profileFindUnique: vi.fn(),
  profileFindMany: vi.fn(),
}));

vi.mock("next-auth", () => ({ getServerSession: mocks.getServerSession }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    restaurantHostProfile: {
      findUnique: mocks.profileFindUnique,
      findMany: mocks.profileFindMany,
    },
  },
}));

import { GET } from "@/app/api/v1/host/streetside-team/route";

const member = {
  id: "profile-2",
  displayName: "Venue colleague",
  isActive: true,
  badgeColor: null,
  venue: { id: "venue-a", name: "Gold House", slug: "gold-house" },
  userId: "host-2",
  user: { id: "host-2", name: "Venue colleague", updatedAt: new Date("2026-09-10T12:00:00.000Z") },
};

describe("streetside team directory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getServerSession.mockResolvedValue({
      user: { id: "host-1", roles: ["RESTAURANT_HOST"] },
    });
    mocks.profileFindUnique.mockResolvedValue({ venueId: "venue-a" });
    mocks.profileFindMany.mockResolvedValue([member]);
  });

  it("limits an operational user to their own venue and does not return email", async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    expect(mocks.profileFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        venueId: "venue-a",
        user: { roles: { some: { roleKey: "STREETSIDE_HOST" } } },
      },
    }));
    await expect(response.json()).resolves.toEqual({
      ok: true,
      team: [expect.not.objectContaining({ userEmail: expect.anything() })],
    });
  });

  it("does not expose a directory when the caller has no assigned venue", async () => {
    mocks.profileFindUnique.mockResolvedValue(null);

    const response = await GET();

    expect(response.status).toBe(403);
    expect(mocks.profileFindMany).not.toHaveBeenCalled();
  });

  it("allows a superadmin to view the cross-venue directory", async () => {
    mocks.getServerSession.mockResolvedValue({ user: { id: "admin-1", roles: ["SUPERADMIN"] } });

    const response = await GET();

    expect(response.status).toBe(200);
    expect(mocks.profileFindUnique).not.toHaveBeenCalled();
    expect(mocks.profileFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { user: { roles: { some: { roleKey: "STREETSIDE_HOST" } } } },
    }));
  });
});
