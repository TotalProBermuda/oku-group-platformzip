import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  userFindUnique: vi.fn(),
  userFindUniqueOrThrow: vi.fn(),
  userUpsert: vi.fn(),
  userUpdate: vi.fn(),
  userRoleUpsert: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: mocks.userFindUnique,
      findUniqueOrThrow: mocks.userFindUniqueOrThrow,
      upsert: mocks.userUpsert,
      update: mocks.userUpdate,
    },
    userRole: { upsert: mocks.userRoleUpsert },
  },
}));

import {
  assertMayManageUser,
  authorizeProductionAccount,
  configuredPrimaryOwnerEmail,
} from "@/server/auth/productionAccount";

describe("production Google Workspace accounts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.PRIMARY_SUPERADMIN_EMAIL = "Denzil@OKUHospitalityGroup.com ";
  });

  it("normalizes the configured primary owner email", () => {
    expect(configuredPrimaryOwnerEmail()).toBe("denzil@okuhospitalitygroup.com");
  });

  it("rejects an unverified Google identity", async () => {
    await expect(authorizeProductionAccount({
      provider: "google",
      email: "denzil@okuhospitalitygroup.com",
      emailVerified: false,
    })).resolves.toBeNull();
    expect(mocks.userFindUnique).not.toHaveBeenCalled();
  });

  it("rejects an unknown non-owner instead of domain-auto-provisioning", async () => {
    mocks.userFindUnique.mockResolvedValueOnce(null);
    await expect(authorizeProductionAccount({
      provider: "google",
      email: "stranger@okuhospitalitygroup.com",
      emailVerified: true,
    })).resolves.toBeNull();
    expect(mocks.userUpsert).not.toHaveBeenCalled();
  });

  it("bootstraps only the configured owner and grants SUPERADMIN", async () => {
    const owner = {
      id: "owner-1",
      email: "denzil@okuhospitalitygroup.com",
      name: "Denzil Nelson",
      imageUrl: null,
      status: "ACTIVE",
      roles: [{ roleKey: "SUPERADMIN" }],
    };
    mocks.userFindUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(owner);
    mocks.userFindUniqueOrThrow.mockResolvedValueOnce(owner);
    mocks.userUpdate.mockResolvedValueOnce(owner);

    await expect(authorizeProductionAccount({
      provider: "google",
      email: "DENZIL@okuhospitalitygroup.com",
      name: "Denzil Nelson",
      emailVerified: true,
    })).resolves.toMatchObject({ id: "owner-1", roles: ["SUPERADMIN"] });

    expect(mocks.userRoleUpsert).toHaveBeenCalledWith(expect.objectContaining({
      create: { userId: "owner-1", roleKey: "SUPERADMIN" },
    }));
  });

  it("prevents another administrator from managing the primary owner", async () => {
    mocks.userFindUnique.mockResolvedValueOnce({ email: "denzil@okuhospitalitygroup.com" });
    await expect(assertMayManageUser("tonka-1", "owner-1")).rejects.toMatchObject({ status: 403 });
  });

  it("allows the primary owner to manage their own non-destructive profile fields", async () => {
    mocks.userFindUnique.mockResolvedValueOnce({ email: "denzil@okuhospitalitygroup.com" });
    await expect(assertMayManageUser("owner-1", "owner-1")).resolves.toEqual({ targetIsPrimaryOwner: true });
  });
});
