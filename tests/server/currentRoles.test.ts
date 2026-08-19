import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ findMany: vi.fn() }));

vi.mock("@/lib/prisma", () => ({
  prisma: { userRole: { findMany: mocks.findMany } },
}));

import { getCurrentRoles } from "@/server/auth/currentRoles";

describe("getCurrentRoles", () => {
  beforeEach(() => mocks.findMany.mockReset());

  it("uses the user-role rows as the current authorization source", async () => {
    mocks.findMany.mockResolvedValue([
      { roleKey: "RESTAURANT_SUPERVISOR" },
      { roleKey: "SUPERADMIN" },
    ]);

    await expect(getCurrentRoles("user-1")).resolves.toEqual([
      "RESTAURANT_SUPERVISOR",
      "SUPERADMIN",
    ]);
    expect(mocks.findMany).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      select: { roleKey: true },
    });
  });

  it("does not turn an empty authoritative lookup into a stale privilege", async () => {
    mocks.findMany.mockResolvedValue([]);
    await expect(getCurrentRoles("user-1")).resolves.toEqual([]);
  });

});
